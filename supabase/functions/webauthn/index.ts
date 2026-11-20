import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'jsr:@simplewebauthn/server@12.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const configuredSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const serviceKey = Deno.env.get('MEDID_SERVICE_ROLE_KEY') ||
  (configuredSecretKeys ? Object.values(JSON.parse(configuredSecretKeys) as Record<string, string>)[0] : null) ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const rpID = Deno.env.get('MEDID_RP_ID')!;
const expectedOrigin = Deno.env.get('MEDID_ORIGIN')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!supabaseUrl || !serviceKey || !rpID || !expectedOrigin) return json({ error: 'WebAuthn server configuration is incomplete' }, 500);

  try {
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return json({ error: 'Sign in is required' }, 401);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    const user = authData.user;
    if (authError || !user) return json({ error: 'Invalid or expired session' }, 401);

    const { data: profile, error: profileError } = await admin
      .from('profiles').select('id,email,full_name,role,status').eq('id', user.id).single();
    if (profileError || !profile) return json({ error: 'Account profile not found' }, 403);

    const body = await req.json();
    const action = body.action;

    if (action === 'registration-options' || action === 'registration-verify') {
      if (profile.role !== 'patient' || profile.status !== 'active') return json({ error: 'Active patient account required' }, 403);
      const { data: existing } = await admin.from('webauthn_credentials').select('credential_id').eq('patient_id', user.id);

      if (action === 'registration-options') {
        const options = await generateRegistrationOptions({
          rpName: 'MED-ID', rpID,
          userID: new TextEncoder().encode(user.id),
          userName: profile.email || user.id,
          userDisplayName: profile.full_name || 'MED-ID Patient',
          attestationType: 'none',
          excludeCredentials: (existing || []).map(row => ({ id: row.credential_id })),
          authenticatorSelection: {
            ...(body.authenticator === 'any' ? {} : { authenticatorAttachment: 'platform' as const }),
            residentKey: 'preferred',
            userVerification: 'required',
          },
          supportedAlgorithmIDs: [-7, -257],
        });
        await admin.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString());
        const { error } = await admin.from('webauthn_challenges').upsert({ challenge: options.challenge, user_id: user.id, purpose: 'registration', created_at: new Date().toISOString() }, { onConflict: 'user_id,purpose' });
        if (error) throw error;
        return json(options);
      }

      const credential = body.credential;
      if (!credential?.id) return json({ error: 'Missing authenticator response' }, 400);
      const { data: challenge } = await admin.from('webauthn_challenges').delete()
        .eq('user_id', user.id).eq('purpose', 'registration').gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
        .select('challenge').maybeSingle();
      if (!challenge) return json({ error: 'Registration challenge expired or already used' }, 400);
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verification.verified || !verification.registrationInfo) return json({ error: 'Authenticator registration could not be verified' }, 400);

      const { credential: registered, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const transports = registered.transports || [];
      const { error: saveError } = await admin.from('webauthn_credentials').insert({
        credential_id: registered.id,
        patient_id: user.id,
        public_key: bytesToBase64Url(registered.publicKey),
        sign_count: registered.counter,
        transports,
        device_type: credentialDeviceType,
        backed_up: credentialBackedUp,
      });
      if (saveError) throw saveError;
      const { data: patient, error: patientError } = await admin.from('patients').select('descriptor').eq('id', user.id).single();
      if (patientError) throw patientError;
      const { error: updateError } = await admin.from('patients').update({
        descriptor: {
          ...(patient.descriptor || {}),
          fingerprint: {
            credential_id: registered.id,
            type: 'webauthn_platform_credential',
            finger: 'Device authenticator',
            enrolled_at: new Date().toISOString(),
            device_type: credentialDeviceType,
            backed_up: credentialBackedUp,
          },
        },
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (updateError) throw updateError;
      return json({ verified: true, credential_id: registered.id, device_type: credentialDeviceType });
    }

    if (action === 'authentication-options' || action === 'authentication-verify') {
      if (profile.role !== 'doctor' || profile.status !== 'active') return json({ error: 'Active doctor account required' }, 403);
      if (action === 'authentication-options') {
        const { data: credentials, error } = await admin.from('webauthn_credentials')
          .select('credential_id,transports').limit(500);
        if (error) throw error;
        if (!credentials?.length) return json({ error: 'No enrolled hardware credentials found' }, 404);
        const options = await generateAuthenticationOptions({
          rpID,
          allowCredentials: credentials.map(row => ({ id: row.credential_id, transports: row.transports })),
          userVerification: 'required',
        });
        await admin.from('webauthn_challenges').delete().lt('created_at', new Date(Date.now() - 5 * 60_000).toISOString());
        const { error: saveError } = await admin.from('webauthn_challenges').upsert({ challenge: options.challenge, user_id: user.id, purpose: 'authentication', created_at: new Date().toISOString() }, { onConflict: 'user_id,purpose' });
        if (saveError) throw saveError;
        return json(options);
      }

      const assertion = body.credential;
      if (!assertion?.id) return json({ error: 'Missing authenticator response' }, 400);
      const { data: challenge } = await admin.from('webauthn_challenges').delete()
        .eq('user_id', user.id).eq('purpose', 'authentication').gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
        .select('challenge').maybeSingle();
      if (!challenge) return json({ error: 'Authentication challenge expired or already used' }, 400);
      const { data: credential, error: credentialError } = await admin.from('webauthn_credentials')
        .select('*').eq('credential_id', assertion.id).single();
      if (credentialError || !credential) return json({ error: 'Credential is not registered' }, 404);
      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: challenge.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credential_id,
          publicKey: base64UrlToBytes(credential.public_key),
          counter: Number(credential.sign_count),
          transports: credential.transports,
        },
      });
      if (!verification.verified || !verification.authenticationInfo.userVerified) return json({ error: 'Authenticator assertion was not verified' }, 401);
      const { error: counterError } = await admin.from('webauthn_credentials').update({
        sign_count: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      }).eq('credential_id', credential.credential_id);
      if (counterError) throw counterError;
      const { data: patientProfile, error: patientProfileError } = await admin.from('profiles')
        .select('full_name,email,role,status').eq('id', credential.patient_id).single();
      if (patientProfileError || patientProfile.role !== 'patient' || patientProfile.status !== 'active') return json({ error: 'Patient account is not active' }, 403);
      const { data: patient, error: patientError } = await admin.from('patients').select('*').eq('id', credential.patient_id).single();
      if (patientError) throw patientError;
      const { error: scanAuditError } = await admin.from('biometric_scan_audits').insert({ doctor_id: user.id, patient_id: credential.patient_id, modality: 'fingerprint' });
      if (scanAuditError) throw scanAuditError;
      return json({ verified: true, patient: {
        id: patient.id, full_name: patientProfile.full_name, email: patientProfile.email,
        dob: patient.dob, sex: patient.sex, blood_type: patient.blood_type, nationality: patient.nationality,
        home_address: patient.home_address, emerg_name: patient.emerg_name,
        emerg_phone: patient.emerg_phone, emerg_email: patient.emerg_email,
        med_id_number: patient.med_id_number
      } });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('WebAuthn request failed', error);
    return json({ error: error instanceof Error ? error.message : 'WebAuthn request failed' }, 400);
  }
});
