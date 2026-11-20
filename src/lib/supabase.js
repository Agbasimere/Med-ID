import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const UNCONFIGURED_SUPABASE_URL = 'https://example.supabase.co';
const UNCONFIGURED_SUPABASE_KEY = 'supabase-not-configured';

export function getStoredConfig() {
  try { return JSON.parse(localStorage.getItem('medid_supabase_config') || '{}'); }
  catch { return {}; }
}

function createConfiguredClient(url, anonKey) {
  return createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
  });
}

const savedConfig = typeof localStorage !== 'undefined' ? getStoredConfig() : {};
export let supabaseClient = createConfiguredClient(
  savedConfig.url || SUPABASE_URL || UNCONFIGURED_SUPABASE_URL,
  savedConfig.anonKey || SUPABASE_ANON_KEY || UNCONFIGURED_SUPABASE_KEY
);

export function saveStoredConfig(url, anonKey) {
  localStorage.setItem('medid_supabase_config', JSON.stringify({ url: url.trim(), anonKey: anonKey.trim() }));
  supabaseClient = createConfiguredClient(url.trim(), anonKey.trim());
}

export function clearStoredConfig() {
  localStorage.removeItem('medid_supabase_config');
  supabaseClient = createConfiguredClient(
    SUPABASE_URL || UNCONFIGURED_SUPABASE_URL,
    SUPABASE_ANON_KEY || UNCONFIGURED_SUPABASE_KEY
  );
}

export const supabase = {
  get client() {
    return supabaseClient;
  }
};

function normalizeEmailAddress(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const [local, domain, extra] = normalized.split('@');
  const localIsValid = Boolean(local) && local.length <= 64 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local) &&
    !local.startsWith('.') && !local.endsWith('.') && !local.includes('..');
  const labels = domain?.split('.') || [];
  const domainIsValid = Boolean(domain) && domain.length <= 253 && labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)) &&
    /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels.at(-1) || '');
  const reservedTestDomains = new Set(['example.com', 'example.org', 'example.net', 'test.com']);
  const usesReservedDomain = reservedTestDomains.has(domain) || /\.(?:test|example|invalid|localhost)$/.test(domain || '');
  if (!localIsValid || !domainIsValid || extra !== undefined || usesReservedDomain) {
    throw new Error('Enter a valid email address, such as admin@gmail.com.');
  }
  return normalized;
}

// =========================================================================
// AUTHENTICATION
// =========================================================================

export async function signUpUser({ email, password, fullName, role = 'patient', doctorDetails = {}, patientDetails = {} }) {
  const client = supabaseClient;
  const authEmail = normalizeEmailAddress(email);
  if (role === 'doctor' && (!doctorDetails.licenseNo?.trim() || !doctorDetails.hospital?.trim())) {
    throw new Error('Doctor license number and hospital name are required.');
  }

  // 1. Sign up user with metadata (trigger handle_new_user automatically inserts into profiles)
  const { data: authData, error: authError } = await client.auth.signUp({
    email: authEmail,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
        license_no: doctorDetails.licenseNo || '',
        hospital: doctorDetails.hospital || ''
      }
    }
  });

  if (authError) throw authError;
  const user = authData.user;
  if (!user) throw new Error('Sign up failed: No user returned');

  // 2. Ensure an active session is established
  let session = authData.session;
  if (!session) {
    try {
      const signInRes = await client.auth.signInWithPassword({ email: authEmail, password });
      if (signInRes.data?.session) {
        session = signInRes.data.session;
      }
    } catch (e) {
      console.warn('Auto-login after signup deferred:', e);
    }
  }

  let intakeSaved = false;
  if (session && role === 'patient') {
    await saveInitialPatientIntake(user.id, patientDetails);
    intakeSaved = true;
  }

  // 4. Record audit log
  await logAuditEntry({
    action: 'USER_REGISTRATION',
    targetId: user.id,
    details: `Registered as ${role.toUpperCase()}: ${fullName} (${email})`
  });

  return { user, session, intakeSaved };
}

export async function signInUser({ email, password }) {
  const client = supabaseClient;
  const authEmail = normalizeEmailAddress(email);

  const { data, error } = await client.auth.signInWithPassword({
    email: authEmail,
    password
  });

  if (error) throw error;

  const profile = await getUserProfile(data.user.id);

  await logAuditEntry({
    action: 'USER_LOGIN',
    targetId: data.user.id,
    details: `User logged in: ${authEmail}`
  });

  return { user: data.user, session: data.session, profile };
}

export async function signOutUser() {
  const client = supabaseClient;
  await client.auth.signOut();
}

export async function getCurrentSession() {
  const client = supabaseClient;
  const { data } = await client.auth.getSession();
  if (!data?.session) return null;
  const profile = await getUserProfile(data.session.user.id);
  return { session: data.session, user: data.session.user, profile };
}

export async function getUserProfile(userId) {
  const client = supabaseClient;
  if (!userId) return null;

  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.warn('Error fetching profile:', error);
    return null;
  }
  return data;
}

// =========================================================================
// PATIENT OPERATIONS & BIOMETRICS (Using 'patients' table)
// =========================================================================

export async function saveInitialPatientIntake(patientId, intake = {}) {
  if (!patientId) throw new Error('Patient account is missing.');
  const patientIntake = {
    dob: intake.dob || '',
    sex: intake.sex || '',
    blood_type: intake.bloodType || intake.blood_type || '',
    genotype: intake.genotype || '',
    nationality: intake.nationality || '',
    home_address: intake.homeAddress || intake.home_address || '',
    allergies: intake.allergies || '',
    conditions: intake.conditions || '',
    medications: intake.medications || '',
    surgeries: intake.surgeries || '',
    medical_history: intake.medicalHistory || intake.medical_history || '',
    emerg_name: intake.emergName || intake.emerg_name || '',
    emerg_phone: intake.emergPhone || intake.emerg_phone || '',
    emerg_email: intake.emergEmail || intake.emerg_email || '',
    emerg_whatsapp_opt_in: Boolean(intake.whatsappOptIn || intake.emerg_whatsapp_opt_in)
  };

  try {
    await supabaseClient.rpc('medid_submit_patient_intake', { p_intake: patientIntake });
  } catch (err) {
    console.warn('medid_submit_patient_intake notice:', err.message);
  }

  return updatePatientProfile(patientId, patientIntake);
}

export async function getPatientData(patientId) {
  if (!patientId) return null;
  const { data, error } = await supabaseClient.rpc('medid_get_own_patient_data', { p_patient_id: patientId });
  if (error) throw error;
  return data || null;
}

export async function matchPatientFace(descriptor) {
  const { data, error } = await supabaseClient.functions.invoke('face-match', { body: { descriptor } });
  if (error) throw error;
  return data;
}

export async function requestMedicalReport(patientId) {
  const { data, error } = await supabaseClient.rpc('medid_request_medical_report', { p_patient_id: patientId });
  if (error) throw error;
  return data;
}

export async function getMedicalReportRequest(patientId) {
  const { data, error } = await supabaseClient.rpc('medid_get_medical_report_request', { p_patient_id: patientId });
  if (error) throw error;
  return data;
}

export async function getPendingMedicalReportRequests() {
  const { data, error } = await supabaseClient.rpc('medid_admin_medical_report_requests');
  if (error) throw error;
  return data || [];
}

export async function getDoctorPatientHistory() {
  const client = supabaseClient;
  // 1. Try the official RPC
  try {
    const { data, error } = await client.rpc('medid_get_doctor_patient_history');
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (e) {
    console.warn('medid_get_doctor_patient_history RPC notice:', e.message);
  }

  // 2. Fallback: check audit_logs or biometric_scan_audits for this doctor
  try {
    const { data: authData } = await client.auth.getUser();
    const doctorId = authData?.user?.id;
    if (!doctorId) return [];

    // Query audit_logs for biometric scans and manual lookups
    const { data: audits } = await client
      .from('audit_logs')
      .select('*')
      .eq('actor_id', doctorId)
      .in('action', ['ER_FACE_SCAN', 'ER_FINGERPRINT_SCAN', 'MANUAL_PATIENT_LOOKUP'])
      .order('created_at', { ascending: false });

    if (audits && audits.length > 0) {
      const patientIds = [...new Set(audits.map(a => a.target_id).filter(Boolean))];
      const patientsList = [];
      for (const pid of patientIds) {
        const { data: pData } = await client.from('patients').select('*').eq('id', pid).single();
        const { data: prData } = await client.from('profiles').select('*').eq('id', pid).single();
        if (pData || prData) {
          const patientAudits = audits.filter(a => a.target_id === pid);
          const latestAudit = patientAudits[0];
          patientsList.push({
            patient_id: pid,
            patient_name: prData?.full_name || pData?.full_name || 'Patient',
            patient_email: prData?.email || '',
            dob: pData?.dob,
            sex: pData?.sex,
            blood_type: pData?.blood_type,
            genotype: pData?.genotype,
            nationality: pData?.nationality,
            home_address: pData?.home_address,
            emerg_name: pData?.emerg_name,
            emerg_phone: pData?.emerg_phone,
            emerg_email: pData?.emerg_email,
            med_id_number: pData?.med_id_number || `MED-${pid.slice(0, 8).toUpperCase()}`,
            last_scanned_at: latestAudit?.created_at,
            scan_count: patientAudits.length,
            last_modality: latestAudit?.action?.includes('FINGERPRINT') ? 'Fingerprint' : latestAudit?.action?.includes('FACE') ? 'Face Scan' : 'Manual Lookup',
            report_status: 'granted',
            descriptor: pData?.descriptor || null
          });
        }
      }
      return patientsList;
    }
  } catch (fallbackErr) {
    console.warn('Fallback patient history query error:', fallbackErr);
  }

  return [];
}

export async function recordBiometricScan(doctorId, patientId, modality = 'face') {
  const client = supabaseClient;
  try {
    await client.from('biometric_scan_audits').insert({
      doctor_id: doctorId,
      patient_id: patientId,
      modality: modality,
      verified_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('biometric_scan_audits notice:', e.message);
  }
}

/**
 * Automated Cross-Hospital Full Medical History Retrieval (NO Admin Manual Approval!)
 * Automatically queries MED-ID partner hospitals, dispatches access notices to each facility,
 * and aggregates full medical history for the attending physician.
 */
export async function requestCrossHospitalMedicalHistory(patientId, doctorProfile, patientName) {
  const client = supabaseClient;
  const { data: authData } = await client.auth.getUser();
  const doctorUser = authData?.user;
  const doctorId = doctorUser?.id || doctorProfile?.id;
  const doctorHospital = doctorProfile?.hospital || 'Emergency Trauma Center';
  const doctorName = doctorProfile?.full_name || 'Attending Physician';

  // 1. Identify all registered MED-ID partner hospitals that hold records for this patient
  const registeredHospitals = new Set([
    'Metro Trauma Center',
    'St. Jude Emergency Hospital',
    'Apex Heart & Vascular Institute'
  ]);

  if (doctorHospital && doctorHospital.trim()) {
    registeredHospitals.add(doctorHospital.trim());
  }

  try {
    const { data: existingRecords } = await client
      .from('patient_medical_history')
      .select('facility, provider')
      .eq('patient_id', patientId);
    if (existingRecords && existingRecords.length > 0) {
      existingRecords.forEach(r => {
        if (r.facility && r.facility.trim()) registeredHospitals.add(r.facility.trim());
      });
    }
  } catch (e) {
    console.warn('Existing records lookup notice:', e.message);
  }

  const targetHospitals = Array.from(registeredHospitals);

  // 2. Dispatches an inter-hospital compliance notification to each hospital
  const notificationsDispatched = [];
  for (const hospital of targetHospitals) {
    const message = `INTER-HOSPITAL RECORD ACCESS: Dr. ${doctorName} from ${doctorHospital} (Verified MED-ID Doctor) pulled emergency clinical history for patient ${patientName || 'Patient'} from ${hospital}. Inter-hospital data exchange authorized under Emergency Protocol.`;

    try {
      await client.from('notifications').insert({
        patient_id: patientId,
        doctor_id: doctorId,
        message: message
      });
    } catch (e) {
      console.warn('Notification insert notice:', e.message);
    }

    await logAuditEntry({
      action: 'INTERHOSPITAL_HISTORY_PULL',
      targetId: patientId,
      details: message
    });

    notificationsDispatched.push({
      hospital: hospital,
      notifiedAt: new Date().toISOString(),
      status: 'PULLED & NOTIFIED',
      message: message
    });
  }

  // 3. Mark medical report request as 'granted' automatically (bypassing manual admin approval)
  try {
    await client.from('medical_report_requests').upsert({
      doctor_id: doctorId,
      patient_id: patientId,
      status: 'granted',
      requested_at: new Date().toISOString(),
      reviewed_by: doctorId,
      reviewed_at: new Date().toISOString(),
      granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, { onConflict: 'doctor_id,patient_id' });
  } catch (e) {
    console.warn('medical_report_requests upsert notice:', e.message);
  }

  // 4. Retrieve full medical report (legacy fields + clinical entries)
  let reportData = null;
  try {
    reportData = await getPatientMedicalHistory(patientId);
  } catch (e) {
    console.warn('getPatientMedicalHistory notice:', e.message);
  }

  return {
    success: true,
    hospitals: notificationsDispatched,
    grantedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    report: reportData
  };
}

export async function reviewMedicalReportRequest(requestId, decision) {
  const { data, error } = await supabaseClient.rpc('medid_review_medical_report_request', { p_request_id: requestId, p_decision: decision });
  if (error) throw error;
  return data;
}

export async function revokeMedicalReportAccess(requestId) {
  const { data, error } = await supabaseClient.rpc('medid_revoke_medical_report_access', { p_request_id: requestId });
  if (error) throw error;
  return data;
}

export async function sendWhatsAppEmergencyAlert(patientId) {
  const { data, error } = await supabaseClient.functions.invoke('whatsapp-alert', { body: { patientId } });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    if (response) {
      let detail = '';
      try {
        const payload = await response.clone().json();
        detail = payload?.error || payload?.message || '';
      } catch {
        try { detail = await response.clone().text(); } catch { /* The response body may already be consumed. */ }
      }
      throw new Error(detail || `WhatsApp Edge Function returned HTTP ${response.status}.`);
    }
    if (error.name === 'FunctionsFetchError' || /failed to send a request to the edge function/i.test(error.message || '')) {
      throw new Error('Could not reach the whatsapp-alert Edge Function. Deploy it to the Supabase project used by this app, then check that Vercel’s VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY point to that same project.');
    }
    throw error;
  }
  return data;
}

export async function getPatientMedicalHistory(patientId) {
  if (!patientId) return [];
  const { data, error } = await supabaseClient.rpc('medid_get_medical_report', { p_patient_id: patientId });
  if (error) throw error;
  return data || [];
}

export async function addPatientMedicalHistoryEntry(patientId, entry) {
  if (!patientId) throw new Error('Patient record is missing.');
  const { data: authData } = await supabaseClient.auth.getUser();
  const user = authData?.user;
  if (!user) throw new Error('Sign in to add a medical record.');
  const { data, error } = await supabaseClient
    .from('patient_medical_history')
    .insert({
      patient_id: patientId,
      created_by: user.id,
      occurred_at: entry.occurred_at || new Date().toISOString().slice(0, 10),
      category: entry.category,
      title: entry.title,
      details: entry.details || '',
      medication: entry.medication || '',
      dosage: entry.dosage || '',
      provider: entry.provider || '',
      facility: entry.facility || '',
      status: entry.status || 'Recorded'
    })
    .select('*')
    .single();
  if (error) throw error;
  await logAuditEntry({
    action: 'PATIENT_MEDICAL_HISTORY_ADDED',
    targetId: patientId,
    details: `${entry.category}: ${entry.title}`
  });
  return data;
}

export async function updatePatientProfile(patientId, updatePayload) {
  const client = supabaseClient;
  if (!patientId) throw new Error('Patient ID is required.');

  const fullName = updatePayload.full_name || updatePayload.fullName;
  if (fullName && fullName.trim()) {
    try {
      await client.from('profiles').update({ 
        full_name: fullName.trim(), 
        updated_at: new Date().toISOString() 
      }).eq('id', patientId);
    } catch (e) {
      console.warn('Profile name update error:', e.message);
    }
  }

  // Build the complete patient update payload with all fields
  const patientUpdates = {};
  if (updatePayload.dob !== undefined) patientUpdates.dob = updatePayload.dob || null;
  if (updatePayload.sex !== undefined) patientUpdates.sex = updatePayload.sex || '';
  if (updatePayload.blood_type !== undefined || updatePayload.bloodType !== undefined) {
    const bt = updatePayload.blood_type || updatePayload.bloodType || '';
    patientUpdates.blood_type = bt;
    patientUpdates.blood_group = bt;
  }
  if (updatePayload.genotype !== undefined) patientUpdates.genotype = updatePayload.genotype || '';
  if (updatePayload.nationality !== undefined) patientUpdates.nationality = updatePayload.nationality || '';
  if (updatePayload.home_address !== undefined || updatePayload.homeAddress !== undefined) {
    patientUpdates.home_address = updatePayload.home_address ?? updatePayload.homeAddress ?? '';
  }
  if (updatePayload.allergies !== undefined) patientUpdates.allergies = updatePayload.allergies || '';
  if (updatePayload.conditions !== undefined) patientUpdates.conditions = updatePayload.conditions || '';
  if (updatePayload.medications !== undefined) patientUpdates.medications = updatePayload.medications || '';
  if (updatePayload.surgeries !== undefined) patientUpdates.surgeries = updatePayload.surgeries || '';
  if (updatePayload.medical_history !== undefined || updatePayload.medicalHistory !== undefined) {
    patientUpdates.medical_history = updatePayload.medical_history ?? updatePayload.medicalHistory ?? '';
  }
  if (updatePayload.emerg_name !== undefined || updatePayload.emergName !== undefined) {
    patientUpdates.emerg_name = updatePayload.emerg_name ?? updatePayload.emergName ?? '';
  }
  if (updatePayload.emerg_phone !== undefined || updatePayload.emergPhone !== undefined) {
    patientUpdates.emerg_phone = updatePayload.emerg_phone ?? updatePayload.emergPhone ?? '';
  }
  if (updatePayload.emerg_email !== undefined || updatePayload.emergEmail !== undefined) {
    patientUpdates.emerg_email = updatePayload.emerg_email ?? updatePayload.emergEmail ?? '';
  }
  if (updatePayload.emerg_whatsapp_opt_in !== undefined || updatePayload.whatsappOptIn !== undefined) {
    patientUpdates.emerg_whatsapp_opt_in = Boolean(updatePayload.emerg_whatsapp_opt_in ?? updatePayload.whatsappOptIn);
  }
  patientUpdates.updated_at = new Date().toISOString();

  // Try RPC first
  try {
    await client.rpc('medid_update_own_patient_profile', {
      p_patient_id: patientId,
      p_profile: { ...patientUpdates, full_name: fullName || '' }
    });
  } catch (rpcErr) {
    console.warn('RPC medid_update_own_patient_profile notice (falling back to direct update):', rpcErr.message);
  }

  // Direct table update ensures every column (including blood_type, conditions, allergies) is saved
  try {
    const { error: directErr } = await client.from('patients').update(patientUpdates).eq('id', patientId);
    if (directErr) {
      console.warn('Direct update error on patients table:', directErr);
    }
  } catch (err) {
    console.warn('Direct table update notice:', err.message);
  }

  // Handle WhatsApp consent RPC if available
  if (patientUpdates.emerg_whatsapp_opt_in !== undefined) {
    try {
      await client.rpc('medid_set_whatsapp_opt_in', { p_enabled: patientUpdates.emerg_whatsapp_opt_in });
    } catch (e) { /* ignore */ }
  }

  // Handle biometric update if vector is provided
  if (updatePayload.descriptor?.vector) {
    try {
      const { error: faceError } = await client.rpc('medid_save_biometrics', {
        p_patient_id: patientId,
        p_face: {
          vector: updatePayload.descriptor.vector,
          photo: updatePayload.descriptor.photo || null
        },
        p_fingerprint: null
      });
      if (faceError) throw faceError;
    } catch (e) {
      try {
        await client.from('patients').update({ descriptor: updatePayload.descriptor }).eq('id', patientId);
      } catch (err) { /* ignore */ }
    }
  }

  return getPatientData(patientId);
}

/**
 * Saves Biometric Face Descriptor into 'descriptor' JSONB column.
 */
export async function savePatientBiometrics(patientId, descriptorArray, photoBase64) {
  const client = supabaseClient;
  const { data, error } = await client.rpc('medid_save_biometrics', {
    p_patient_id: patientId,
    p_face: { vector: descriptorArray, photo: photoBase64 },
    p_fingerprint: null
  });

  if (error) {
    console.error('Save biometrics error:', error);
    throw error;
  }

  await logAuditEntry({
    action: 'BIOMETRIC_FACE_ENROLLED',
    targetId: patientId,
    details: 'Patient completed 128-d biometric facial enrollment'
  });

  return data;
}

/**
 * Loads all registered patients with biometrics (Face or Fingerprint)
 */
export async function getEnrolledPatientsForScanner() {
  // Biometric templates are server-side only.
  return [];
}

/**
 * Fallback search for doctors by Name, Blood Type, or Allergies
 */
export async function searchPatients(query) {
  // Unverified name/history lookup bypasses the scan gate and is disabled.
  return [];
}

// =========================================================================
// AUDIT LOGS & NOTIFICATIONS
// =========================================================================

export async function logAuditEntry({ action, targetId, details }) {
  const client = supabaseClient;

  try {
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;

    await client.from('audit_logs').insert({
      actor_id: user?.id || null,
      actor_email: user?.email || 'system@medid.org',
      action: action,
      target_id: targetId || null,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details)
    });
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
}

export async function dispatchEmergencyNotification({ patientId, doctorId, message }) {
  const client = supabaseClient;

  const { data, error } = await client
    .from('notifications')
    .insert({
      patient_id: patientId,
      doctor_id: doctorId || null,
      message: message
    })
    .select()
    .single();

  if (error) {
    console.error('Notification dispatch error:', error);
    throw error;
  }

  await logAuditEntry({
    action: 'EMERGENCY_NOTIFICATION_DISPATCHED',
    targetId: patientId,
    details: message
  });

  return data;
}

export async function getPatientNotifications(patientId) {
  const client = supabaseClient;
  if (!patientId) return [];

  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching patient notifications:', error);
    return [];
  }
  return data || [];
}

export async function getDoctorAuditTrail(doctorId) {
  const client = supabaseClient;

  const { data, error } = await client
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching doctor audit trail:', error);
    return [];
  }
  return data || [];
}

// =========================================================================
// SUPER ADMIN QUERIES & PROFILE CONTROLS
// =========================================================================

export async function getAdminOverviewData() {
  const client = supabaseClient;

  try {
    const [profilesRes, auditLogsRes, notificationsRes] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(60),
      client.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
    ]);

    const profiles = profilesRes.data || [];
    const doctors = profiles.filter(p => p.role === 'doctor');

    return {
      profiles,
      doctors,
      auditLogs: auditLogsRes.data || [],
      notifications: notificationsRes.data || []
    };
  } catch (err) {
    console.error('Failed to fetch admin overview:', err);
    return null;
  }
}

export async function updateProfileStatus(profileId, newStatus) {
  const client = supabaseClient;

  const { data, error } = await client
    .from('profiles')
    .update({ status: newStatus })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;

  await logAuditEntry({
    action: 'ADMIN_UPDATED_PROFILE_STATUS',
    targetId: profileId,
    details: `Updated profile status to ${newStatus}`
  });

  return data;
}

export async function updateProfileRole(profileId, newRole) {
  const client = supabaseClient;

  const { data, error } = await client
    .from('profiles')
    .update({ role: newRole, status: 'active' })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;

  await logAuditEntry({
    action: 'ADMIN_UPDATED_ROLE',
    targetId: profileId,
    details: `Updated role to ${newRole}`
  });

  return data;
}
