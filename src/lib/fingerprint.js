/**
 * Emergency Biometric Health System - Fingerprint Processing & Matching Engine
 * WebAuthn authenticates a device credential; browsers do not expose fingerprint data.
 */
import { supabaseClient } from './supabase.js';

async function invokeWebAuthn(body) {
  const { data, error } = await supabaseClient.functions.invoke('webauthn', { body });
  if (!error) return data;
  let message = error.message || 'WebAuthn request failed';
  try {
    const response = error.context;
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json();
      if (payload?.error) message = payload.error;
    }
  } catch {
    // Keep the SDK message when the response has no JSON error body.
  }
  throw new Error(message);
}

async function requestCredential(operation, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Device verification timed out. Retry and complete the fingerprint, face, or screen-lock prompt on your device.');
    }
    if (error?.name === 'InvalidStateError') {
      throw new Error('This device already has a MED-ID passkey for this account. Use the existing credential or remove its saved MED-ID passkey in your device or password-manager settings before registering again.');
    }
    if (error?.name === 'NotAllowedError') {
      const friendly = new Error('Device verification was cancelled or timed out. On Android, make sure a screen lock and fingerprint are set up, then retry in Chrome.');
      friendly.name = error.name;
      throw friendly;
    }
    if (error?.name === 'NotSupportedError') {
      const friendly = new Error('This browser did not find a supported passkey authenticator. On Android, use an up-to-date Chrome browser with a screen lock and fingerprint configured.');
      friendly.name = error.name;
      throw friendly;
    }
    if (error?.name === 'SecurityError') {
      const friendly = new Error('This site is not authorized for passkeys. Open the production HTTPS site and check the MED-ID relying-party domain configuration.');
      friendly.name = error.name;
      throw friendly;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Buffer to Base64 (URL safe)
 */
export function bufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64 (URL safe) to Buffer
 */
export function base64ToBuffer(base64) {
  if (!base64) return new ArrayBuffer(0);
  let str = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = window.atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Checks whether this browser reports a built-in user-verifying authenticator.
 */
export async function isHardwareBiometricAvailable() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false;
  }
  try {
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch (e) {
    console.warn('Hardware biometric availability check failed:', e);
    return false;
  }
}

export function isWebAuthnSupported() {
  return typeof window !== 'undefined' && Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
}

/**
 * Registers a device passkey with a server-issued and server-verified challenge.
 */
export async function enrollHardwareFingerprint(patientId, fullName = 'Patient', email = 'patient@medid.org', fingerName = 'Device authenticator') {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Hardware biometric authentication (WebAuthn) is not supported in this browser.');
  }

  // Prefer the built-in platform authenticator. If mobile/browser capability detection
  // reports a false negative, let the browser choose an available passkey authenticator.
  const platformAvailable = await isHardwareBiometricAvailable();
  let options = await invokeWebAuthn({
    action: 'registration-options', patientId, fullName, email,
    authenticator: platformAvailable ? 'platform' : 'any'
  });
  const toPublicKey = (value) => ({
    ...value,
    challenge: base64ToBuffer(value.challenge),
    user: { ...value.user, id: base64ToBuffer(value.user.id) },
    excludeCredentials: (value.excludeCredentials || []).map(c => ({ ...c, id: base64ToBuffer(c.id) }))
  });
  let credential;
  try {
    const publicKey = toPublicKey(options);
    credential = await requestCredential(signal => navigator.credentials.create({ publicKey, signal }));
  } catch (error) {
    if (!platformAvailable || error?.name !== 'NotSupportedError') throw error;
    options = await invokeWebAuthn({ action: 'registration-options', authenticator: 'any' });
    const publicKey = toPublicKey(options);
    credential = await requestCredential(signal => navigator.credentials.create({ publicKey, signal }));
  }
  if (!credential) {
    throw new Error('Biometric enrollment cancelled or not recognized.');
  }
  const response = credential.response;
  const serialized = {
    id: credential.id,
    rawId: bufferToBase64(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    response: {
      clientDataJSON: bufferToBase64(response.clientDataJSON),
      attestationObject: bufferToBase64(response.attestationObject),
      transports: response.getTransports?.() || []
    },
    clientExtensionResults: credential.getClientExtensionResults()
  };
  const verified = await invokeWebAuthn({ action: 'registration-verify', credential: serialized });
  return {
    template_id: `FP-HW-${verified.credential_id.slice(0, 10).toUpperCase()}`,
    credential_id: verified.credential_id,
    type: 'webauthn_platform_credential',
    finger: fingerName,
    pattern: 'Verified device authenticator',
    device_type: verified.device_type,
    enrolled_at: new Date().toISOString()
  };
}

/**
 * Verifies a WebAuthn assertion on the backend and returns the linked patient only after signature verification.
 */
export async function verifyHardwareFingerprint() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    throw new Error('Hardware biometric authentication is not supported in this browser.');
  }

  const options = await invokeWebAuthn({ action: 'authentication-options' });
  const publicKey = {
    ...options,
    challenge: base64ToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: base64ToBuffer(c.id) }))
  };
  const assertion = await requestCredential(signal => navigator.credentials.get({ publicKey, signal }));

  if (!assertion) {
    throw new Error('Biometric verification cancelled: Physical sensor was not touched.');
  }

  const response = assertion.response;
  const serialized = {
    id: assertion.id,
    rawId: bufferToBase64(assertion.rawId),
    type: assertion.type,
    authenticatorAttachment: assertion.authenticatorAttachment,
    response: {
      clientDataJSON: bufferToBase64(response.clientDataJSON),
      authenticatorData: bufferToBase64(response.authenticatorData),
      signature: bufferToBase64(response.signature),
      userHandle: response.userHandle ? bufferToBase64(response.userHandle) : null
    },
    clientExtensionResults: assertion.getClientExtensionResults()
  };
  const verified = await invokeWebAuthn({ action: 'authentication-verify', credential: serialized });
  if (!verified?.verified || !verified.patient) throw new Error('The server did not verify this device credential.');

  return {
    match: true,
    patient: verified.patient,
    confidence: null,
    message: `Device authenticator verified. Patient: ${verified.patient.full_name}`
  };
}

