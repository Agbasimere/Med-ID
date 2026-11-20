import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const serviceKey = Deno.env.get('MEDID_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Sign in is required' }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Session is invalid' }, 401);
    const { data: doctor } = await admin.from('profiles').select('id,role,status,full_name').eq('id', auth.user.id).single();
    if (doctor?.role !== 'doctor' || doctor.status !== 'active') return json({ error: 'Active doctor account required' }, 403);
    const body = await req.json();
    const vector = body?.descriptor;
    if (!Array.isArray(vector) || vector.length !== 128 || vector.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) return json({ error: 'Invalid face descriptor' }, 400);

    const enrolled: { id: string; descriptor: { vector?: number[] } | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: batch, error } = await admin.from('patients').select('id,descriptor').not('descriptor', 'is', null).range(offset, offset + 999);
      if (error) throw error;
      enrolled.push(...(batch || []));
      if ((batch || []).length < 1000) break;
    }
    let best: { id: string; distance: number } | null = null;
    for (const row of enrolled || []) {
      const saved = row.descriptor?.vector;
      if (!Array.isArray(saved) || saved.length !== 128) continue;
      let sum = 0;
      for (let i = 0; i < 128; i += 1) sum += (vector[i] - Number(saved[i])) ** 2;
      const distance = Math.sqrt(sum);
      if (!best || distance < best.distance) best = { id: row.id, distance };
    }
    if (!best || best.distance > 0.58) return json({ match: false });
    const { data: patient, error: patientError } = await admin.from('patients').select('id,dob,sex,blood_type,nationality,home_address,emerg_name,emerg_phone,emerg_email,med_id_number').eq('id', best.id).single();
    const { data: profile, error: profileError } = await admin.from('profiles').select('full_name,email,role,status').eq('id', best.id).single();
    if (patientError || profileError || profile.role !== 'patient' || profile.status !== 'active') return json({ error: 'Patient record is unavailable' }, 404);
    const { error: auditError } = await admin.from('biometric_scan_audits').insert({ doctor_id: doctor.id, patient_id: patient.id, modality: 'face' });
    if (auditError) throw auditError;
    return json({ match: true, confidence: Math.max(0, Math.round((1 - best.distance / 0.58) * 100)), patient: { ...patient, full_name: profile.full_name, email: profile.email } });
  } catch (error) {
    console.error('Face match failed', error);
    return json({ error: error instanceof Error ? error.message : 'Face verification failed' }, 400);
  }
});
