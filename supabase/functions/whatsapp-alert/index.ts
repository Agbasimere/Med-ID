import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type':'application/json', 'Cache-Control':'no-store' } });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('MEDID_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(supabaseUrl, key || '', { auth: { persistSession:false } });
Deno.serve(async (req) => {
  if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if (req.method!=='POST') return reply({error:'Method not allowed'},405);
  try {
    const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    const {data:auth,error:authError}=await db.auth.getUser(token || '');
    if(authError||!auth.user) return reply({error:'Sign in is required'},401);
    const {data:doctor}=await db.from('profiles').select('id,role,status,full_name,hospital,license_no').eq('id',auth.user.id).single();
    if(doctor?.role!=='doctor'||doctor.status!=='active') return reply({error:'Active doctor account required'},403);
    const {patientId}=await req.json();
    const {data:scan}=await db.from('biometric_scan_audits').select('id').eq('doctor_id',doctor.id).eq('patient_id',patientId).gt('verified_at',new Date(Date.now()-30*60_000).toISOString()).order('verified_at',{ascending:false}).limit(1).maybeSingle();
    if(!scan) return reply({error:'Complete a biometric scan before sending an emergency alert'},403);
    const [phoneId,accessToken,templateName]=['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_TEMPLATE_NAME'].map(k=>Deno.env.get(k));
    const language=Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE')||'en';
    const version=Deno.env.get('WHATSAPP_GRAPH_API_VERSION')||'v23.0';
    if(!phoneId||!accessToken||!templateName) return reply({error:'WhatsApp Cloud API is not configured. Set its Supabase function secrets.'},503);
    const {data:patient,error}=await db.from('patients').select('emerg_phone,emerg_whatsapp_opt_in').eq('id',patientId).single();
    const {data:profile}=await db.from('profiles').select('full_name').eq('id',patientId).single();
    if(error) throw error;
    if(!patient.emerg_whatsapp_opt_in) return reply({error:'The patient has not confirmed WhatsApp emergency-contact consent'},403);
    const recipients=[...new Set(String(patient.emerg_phone||'').split(/[;,\n]+/).map((p:string)=>p.replace(/[^\d+]/g,'').replace(/^\+/,'')).filter((p:string)=>p.length>=8))];
    if(!recipients.length) return reply({error:'No valid next-of-kin phone numbers are saved'},400);
    const results=[];
    for(const to of recipients){
      const response=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{
        method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:templateName,language:{code:language},components:[{type:'body',parameters:[{type:'text',text:profile?.full_name||'Patient'},{type:'text',text:doctor.hospital||'Emergency Department'},{type:'text',text:`Dr. ${doctor.full_name||'ER Physician'} (License ${doctor.license_no||'not provided'})`}] }]}})
      });
      const payload=await response.json();
      results.push({to,status:response.status,ok:response.ok,messageId:payload?.messages?.[0]?.id||null});
    }
    await db.from('audit_logs').insert({actor_id:doctor.id,actor_email:auth.user.email||'',action:'WHATSAPP_EMERGENCY_ALERT',target_id:patientId,details:`WhatsApp API delivery requested for ${recipients.length} next-of-kin contact(s).`});
    return reply({sent:results.filter(x=>x.ok).length,total:results.length,results},results.some(x=>x.ok)?200:502);
  } catch(error) { console.error('WhatsApp dispatch failed',error); return reply({error:error instanceof Error?error.message:'WhatsApp dispatch failed'},400); }
});
