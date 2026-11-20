import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function normalizePhoneNumber(raw: string): string {
  let cleaned = String(raw || '').replace(/[^\d]/g, '');
  // Nigerian local numbers starting with 080, 081, 070, 090, 091 (11 digits total)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '234' + cleaned.slice(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }
  return cleaned;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('MEDID_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(supabaseUrl, key || '', { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    const { data: auth, error: authError } = await db.auth.getUser(token || '');
    if (authError || !auth.user) return reply({ error: 'Sign in is required' }, 401);

    const { data: doctor } = await db
      .from('profiles')
      .select('id,role,status,full_name,hospital,license_no')
      .eq('id', auth.user.id)
      .single();

    if (doctor?.role !== 'doctor' || doctor.status !== 'active') {
      return reply({ error: 'Active doctor account required to dispatch emergency alerts.' }, 403);
    }

    const { patientId } = await req.json();
    if (!patientId) return reply({ error: 'Patient ID is required' }, 400);

    // Verify doctor has attended to or scanned this patient
    const { data: scan } = await db
      .from('biometric_scan_audits')
      .select('id')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId)
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!scan) {
      const { data: audit } = await db
        .from('audit_logs')
        .select('id')
        .eq('actor_id', doctor.id)
        .eq('target_id', patientId)
        .limit(1)
        .maybeSingle();

      if (!audit) {
        return reply({ error: 'Identify the patient via Face, Fingerprint, or Record Lookup before sending an emergency alert.' }, 403);
      }
    }

    // Retrieve patient & contact details
    const { data: patient, error: patientError } = await db
      .from('patients')
      .select('emerg_name,emerg_phone,emerg_whatsapp_opt_in')
      .eq('id', patientId)
      .single();

    const { data: profile } = await db
      .from('profiles')
      .select('full_name')
      .eq('id', patientId)
      .single();

    if (patientError || !patient) {
      return reply({ error: 'Patient record not found.' }, 404);
    }

    const rawPhones = String(patient.emerg_phone || '').split(/[;,\n]+/);
    const recipients = [...new Set(rawPhones.map(normalizePhoneNumber).filter((p: string) => p.length >= 8))];

    if (!recipients.length) {
      return reply({ error: 'No valid next-of-kin phone number is on file for this patient.' }, 400);
    }

    const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const templateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'medid_emergency_alert';
    const language = Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'en';
    const version = Deno.env.get('WHATSAPP_GRAPH_API_VERSION') || 'v23.0';

    if (!phoneId || !accessToken) {
      return reply({
        error: 'WhatsApp Cloud API secrets (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) are not yet set in Supabase. You can click "Open in WhatsApp" to dispatch the alert immediately.',
        code: 'WHATSAPP_CREDENTIALS_MISSING',
        recipients,
        suggestDirect: true
      }, 503);
    }

    const patientName = profile?.full_name || 'Patient';
    const hospitalName = doctor.hospital || 'Emergency Trauma Bay';
    const attendingName = `Dr. ${doctor.full_name || 'Physician'} (${doctor.license_no || 'MD-ON-DUTY'})`;
    const emergencyText = `🚨 EMERGENCY MEDICAL ALERT: Your family member ${patientName} is receiving emergency care at ${hospitalName}. Attending: ${attendingName}. Med-ID Biometric identification verified.`;

    const results = [];
    for (const to of recipients) {
      // 1. Try Template Message first if templateName exists
      let response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: patientName },
                  { type: 'text', text: hospitalName },
                  { type: 'text', text: attendingName }
                ]
              }
            ]
          }
        })
      });

      let payload = await response.json();

      // 2. If template failed, fall back to text message
      if (!response.ok) {
        response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: emergencyText }
          })
        });
        payload = await response.json();
      }

      results.push({
        to,
        status: response.status,
        ok: response.ok,
        messageId: payload?.messages?.[0]?.id || null,
        error: payload?.error?.message || null
      });
    }

    await db.from('audit_logs').insert({
      actor_id: doctor.id,
      actor_email: auth.user.email || '',
      action: 'WHATSAPP_EMERGENCY_ALERT',
      target_id: patientId,
      details: `WhatsApp API alert attempted for ${recipients.length} next-of-kin contact(s). Success: ${results.filter(x => x.ok).length}/${recipients.length}.`
    });

    const anyOk = results.some(x => x.ok);
    return reply({
      sent: results.filter(x => x.ok).length,
      total: results.length,
      results
    }, anyOk ? 200 : 502);

  } catch (error) {
    console.error('WhatsApp dispatch failed', error);
    return reply({
      error: error instanceof Error ? error.message : 'WhatsApp dispatch failed'
    }, 400);
  }
});
