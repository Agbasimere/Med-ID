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

  // The auth trigger creates an empty patient row. Only the trusted medical team
  // can write clinical history; patients fill in identity and emergency contacts.

  // 4. Record audit log
  await logAuditEntry({
    action: 'USER_REGISTRATION',
    targetId: user.id,
    details: `Registered as ${role.toUpperCase()}: ${fullName} (${email})`
  });

  return { user, session };
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

export async function getPatientData(patientId) {
  const client = supabaseClient;
  if (!patientId) return null;

  const { data: patient, error: pError } = await client
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  const { data: profile } = await client
    .from('profiles')
    .select('full_name, email')
    .eq('id', patientId)
    .maybeSingle();

  if (pError) {
    console.warn('Error fetching patient data:', pError);
  }

  if (!patient && profile) {
    return {
      id: patientId,
      full_name: profile.full_name,
      email: profile.email,
      dob: '',
      blood_type: 'O+',
      allergies: '',
      conditions: '',
      medications: '',
      emerg_name: '',
      emerg_phone: '',
      emerg_email: '',
      descriptor: null
    };
  }

  return patient ? { ...patient, full_name: profile?.full_name || '', email: profile?.email || '' } : null;
}

export async function getPatientMedicalHistory(patientId) {
  if (!patientId) return [];
  const { data, error } = await supabaseClient
    .from('patient_medical_history')
    .select('*')
    .eq('patient_id', patientId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });
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

  if (updatePayload.full_name) {
    await client
      .from('profiles')
      .update({ full_name: updatePayload.full_name })
      .eq('id', patientId);
  }

  const patientRow = {
    id: patientId,
    dob: updatePayload.dob || null,
    emerg_name: updatePayload.emerg_name || '',
    emerg_phone: updatePayload.emerg_phone || '',
    emerg_email: updatePayload.emerg_email || '',
    updated_at: new Date().toISOString()
  };

  const { data, error } = await client
    .from('patients')
    .upsert(patientRow)
    .select()
    .single();

  if (error) {
    console.error('Update patient error:', error);
    throw error;
  }
  if (updatePayload.descriptor?.vector) {
    const { error: faceError } = await client.rpc('medid_save_biometrics', {
      p_patient_id: patientId,
      p_face: {
        vector: updatePayload.descriptor.vector,
        photo: updatePayload.descriptor.photo || null
      },
      p_fingerprint: null
    });
    if (faceError) throw faceError;
  }
  return data;
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
  const client = supabaseClient;

  const { data: patients, error } = await client
    .from('patients')
    .select('*')
    .not('descriptor', 'is', null);

  if (error) {
    console.error('Failed to load registered biometrics:', error);
    return [];
  }

  if (!patients || patients.length === 0) return [];

  const patientIds = patients.map(p => p.id);
  const { data: profiles } = await client
    .from('profiles')
    .select('id, full_name, email')
    .in('id', patientIds);

  const profileMap = new Map();
  (profiles || []).forEach(p => profileMap.set(p.id, p));

  return patients.map(p => {
    const prof = profileMap.get(p.id);
    return {
      ...p,
      full_name: prof?.full_name || 'Emergency Patient',
      email: prof?.email || ''
    };
  });
}

/**
 * Fallback search for doctors by Name, Blood Type, or Allergies
 */
export async function searchPatients(query) {
  const client = supabaseClient;
  if (!query) return [];

  const cleanQuery = query.trim().toLowerCase();

  const { data: profiles } = await client
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'patient')
    .ilike('full_name', `%${cleanQuery}%`);

  const profileIds = (profiles || []).map(p => p.id);

  const { data: patients } = await client
    .from('patients')
    .select('*')
    .or(`allergies.ilike.%${cleanQuery}%,emerg_name.ilike.%${cleanQuery}%,blood_type.ilike.%${cleanQuery}%`);

  const allPatientIds = Array.from(new Set([...profileIds, ...(patients || []).map(p => p.id)]));
  if (allPatientIds.length === 0) return [];

  const { data: finalPatients } = await client
    .from('patients')
    .select('*')
    .in('id', allPatientIds);

  const { data: finalProfiles } = await client
    .from('profiles')
    .select('id, full_name, email')
    .in('id', allPatientIds);

  const pMap = new Map();
  (finalProfiles || []).forEach(p => pMap.set(p.id, p));

  return (finalPatients || []).map(p => ({
    ...p,
    full_name: pMap.get(p.id)?.full_name || 'Emergency Patient',
    email: pMap.get(p.id)?.email || ''
  }));
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
    const [profilesRes, patientsRes, auditLogsRes, notificationsRes] = await Promise.all([
      client.from('profiles').select('*').order('created_at', { ascending: false }),
      client.from('patients').select('*').order('updated_at', { ascending: false }),
      client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(60),
      client.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
    ]);

    const profiles = profilesRes.data || [];
    const patients = patientsRes.data || [];
    const doctors = profiles.filter(p => p.role === 'doctor');

    return {
      profiles,
      patients,
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
