import React, { useState, useEffect } from 'react';
import { 
  Fingerprint, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  ShieldCheck, 
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  enrollHardwareFingerprint,
  isHardwareBiometricAvailable,
  isWebAuthnSupported
} from '../lib/fingerprint';

export default function FingerprintEnrollmentModal({ 
  isOpen, 
  onClose, 
  patientId, 
  patientName = 'Patient',
  patientEmail = 'patient@medid.org',
  onSuccess 
}) {
  const [hasHardwareBiometrics, setHasHardwareBiometrics] = useState(true);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const [scannedTemplate, setScannedTemplate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isScanningHw, setIsScanningHw] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready for device authenticator enrollment.');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Check WebAuthn platform authenticator availability on mount
  useEffect(() => {
    setWebAuthnSupported(isWebAuthnSupported());
    isHardwareBiometricAvailable().then(setHasHardwareBiometrics).catch(() => setHasHardwareBiometrics(false));
  }, []);

  // 1. Device biometric/passkey enrollment via WebAuthn.
  const handleHardwareEnroll = async () => {
    setErrorMsg('');
    setIsScanningHw(true);
    setStatusMessage('Verify with your device authenticator...');

    try {
      const template = await enrollHardwareFingerprint(patientId, patientName, patientEmail);
      setScannedTemplate(template);
      setStatusMessage('Device credential verified by server.');
      confetti({ particleCount: 50, spread: 70 });
    } catch (err) {
      console.warn('Hardware enrollment error:', err);
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Authenticator check was cancelled. Complete the device verification prompt and retry.');
      } else {
        setErrorMsg(err.message || 'Physical biometric sensor error.');
      }
      setStatusMessage('Device verification did not complete. Check your authenticator and retry.');
    } finally {
      setIsScanningHw(false);
    }
  };

  const resetEnrollment = () => {
    setScannedTemplate(null);
    setErrorMsg('');
    setStatusMessage('Ready for device authenticator enrollment.');
  };

  const handleSaveToDatabase = async () => {
    if (!scannedTemplate) return;
    setSaving(true);
    setErrorMsg('');
    if (scannedTemplate.type !== 'webauthn_platform_credential') {
      setErrorMsg('Only a server-verified device credential can be saved. Please enroll again with a platform authenticator.');
      setSaving(false);
      return;
    }
    confetti({ particleCount: 70, spread: 80 });
    if (onSuccess) onSuccess(scannedTemplate);
    setSaving(false);
    setTimeout(() => onClose(), 700);
  };

  useEffect(() => {
    if (!isOpen) {
      setScannedTemplate(null);
      setErrorMsg('');
      setIsScanningHw(false);
        setStatusMessage('Ready for device authenticator enrollment.');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="corporate-card relative max-h-[92dvh] w-full max-w-lg overflow-y-auto border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:p-8">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 border border-brand-200 text-brand-600 mx-auto flex items-center justify-center mb-3">
            <Fingerprint className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Set Up Device Biometrics
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Register this device's passkey authenticator. Android can use its fingerprint or screen lock; other devices may use their own biometric or PIN. The browser verifies the credential and never reveals fingerprint data.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* DEVICE AUTHENTICATOR (WEBAUTHN) */}
          <div className="mb-4 p-5 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 mx-auto flex items-center justify-center text-brand-600 shadow-sm">
              <Fingerprint className={`w-9 h-9 ${isScanningHw ? 'text-brand-600 animate-pulse' : 'text-slate-400'}`} />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800">
                Device Authenticator
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Continue with your device's passkey authenticator. Android phones can verify with fingerprint or screen lock; the prompt depends on the device and browser.
              </p>
            </div>

            <button
              type="button"
              onClick={handleHardwareEnroll}
              disabled={!webAuthnSupported || isScanningHw || scannedTemplate}
              className="corporate-btn-emergency !py-3 !px-6 !text-xs gap-2 mx-auto shadow-md shadow-emergency-600/20 active:scale-95"
            >
              {isScanningHw ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Waiting for device verification...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4" />
                  <span>Verify with device authenticator</span>
                </>
              )}
            </button>

            <p className="text-xs text-slate-500">{statusMessage}</p>

            {!hasHardwareBiometrics && webAuthnSupported && <p className="mx-auto max-w-sm text-xs text-amber-800">The browser did not detect a built-in sensor. You can still try; it may offer a saved passkey or another authenticator. On Android, use current Chrome with a screen lock and fingerprint enrolled.</p>}
            {!webAuthnSupported && <p className="mx-auto max-w-sm text-xs text-amber-800">Passkeys require a supported browser on this secure HTTPS site. Open MED-ID in Chrome on Android or Safari on iPhone.</p>}

            {scannedTemplate && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-center gap-2 animate-fadeIn font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Device credential verified</span>
              </div>
            )}
          </div>

        {/* Action Button */}
        <div className="space-y-2">
          {scannedTemplate ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetEnrollment}
                className="corporate-btn-secondary !py-2.5 !px-3 !text-xs"
              >
                Rescan
              </button>
              <button
                type="button"
                onClick={handleSaveToDatabase}
                disabled={saving}
                className="flex-1 corporate-btn-brand !py-2.5 !text-xs gap-1.5"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving to Supabase...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Save device credential</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <Info className="w-4 h-4 text-brand-600 flex-shrink-0" />
              <span>Verify with your device authenticator to register this account credential.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
