import React, { useState, useEffect, useRef } from 'react';
import { 
  Scan, 
  Stethoscope, 
  Camera, 
  CameraOff, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Hospital, 
  Droplet,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Activity,
  Fingerprint,
  Info,
  Eye,
  EyeOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  loadFaceApiModels, 
  extractFaceDescriptor
} from '../lib/faceRecognition';
import { 
  verifyHardwareFingerprint, 
  isHardwareBiometricAvailable,
  isWebAuthnSupported
} from '../lib/fingerprint';
import { 
  logAuditEntry, 
  getDoctorAuditTrail, 
  searchPatients,
  matchPatientFace
} from '../lib/supabase';
import EmergencyDossierModal from './EmergencyDossierModal';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspacePageHeader from './WorkspacePageHeader';
import { startCameraStream, stopCameraStream } from '../lib/camera';

export default function DoctorDashboard({ currentUser, userProfile, onOpenAuth }) {
  const [activePage, setActivePage] = useState('overview');
  // Biometric Mode: 'fingerprint' or 'face'
  const [activeModality, setActiveModality] = useState('fingerprint');

  // Scanner state (Face)
  const videoRef = useRef(null);
  const isFaceScanActiveRef = useRef(false);
  const cameraRequestIdRef = useRef(0);
  const [streamActive, setStreamActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelStatus, setModelStatus] = useState('Initializing biometric neural nets...');
  const [scannerStatusText, setScannerStatusText] = useState('CAMERA STANDBY');
  const [isContinuousFaceScan, setIsContinuousFaceScan] = useState(false);
  const [isAnalyzingFace, setIsAnalyzingFace] = useState(false);
  const [faceAlert, setFaceAlert] = useState(null);

  // Scanner state (device authenticator)
  const [hasHardwareBiometrics, setHasHardwareBiometrics] = useState(true);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const [isScanningHw, setIsScanningHw] = useState(false);
  const [fpStatusMsg, setFpStatusMsg] = useState('BIOMETRIC SENSOR READY');
  const [fpErrorMsg, setFpErrorMsg] = useState('');
  const [fpSuccessMsg, setFpSuccessMsg] = useState('');

  // Database State (Kept strictly in memory for neural/fingerprint matching, NEVER displayed as a pre-loaded list)
  const [sessionAudits, setSessionAudits] = useState([]);
  const [auditHistory, setAuditHistory] = useState([]);
  const [showHistoryArchive, setShowHistoryArchive] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Active Dossier Modal (ONLY opens on genuine biometric match or deliberate manual search selection)
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDossier, setShowDossier] = useState(false);

  // Manual search fallback
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const isPending = userProfile?.status === 'pending';

  // 1. Initialize Neural Models, Hardware Checks & Load Enrolled Biometrics from Supabase
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        setWebAuthnSupported(isWebAuthnSupported());
        setLoadingModels(true);
        isHardwareBiometricAvailable().then((avail) => {
          if (isMounted) {
            setHasHardwareBiometrics(avail);
          }
        });

        await loadFaceApiModels((status) => {
          if (isMounted) setModelStatus(status);
        });

        if (isMounted) {
          setModelStatus('Biometric engine active. Enrolled database loaded.');
          setLoadingModels(false);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        if (isMounted) {
          setModelStatus('Error loading models: ' + err.message);
          setLoadingModels(false);
        }
      }
    }

    init();
    loadPastAudits();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, []);

  const loadPastAudits = async () => {
    setLoadingHistory(true);
    const history = await getDoctorAuditTrail(currentUser?.id);
    setAuditHistory(history);
    setLoadingHistory(false);
  };

  const recordSessionAudit = (entry) => {
    setSessionAudits(prev => [entry, ...prev]);
    loadPastAudits();
  };

  // 2. Camera Controls (Face Biometric)
  const startCamera = async (requestedFacingMode = facingMode) => {
    const requestId = ++cameraRequestIdRef.current;
    let stream = null;
    try {
      setScannerStatusText('STARTING CAMERA...');
      setFaceAlert(null);
      stream = await startCameraStream(requestedFacingMode);
      if (requestId !== cameraRequestIdRef.current) {
        stopCameraStream(stream);
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        isFaceScanActiveRef.current = true;
        setStreamActive(true);
        setScannerStatusText('CAMERA ACTIVE - POSITION PATIENT FACE');
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      stopCameraStream(stream);
      if (requestId !== cameraRequestIdRef.current) return;
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
      setStreamActive(false);
      isFaceScanActiveRef.current = false;
      setScannerStatusText('CAMERA STANDBY');
      setFaceAlert({ type: 'error', title: 'Camera unavailable', text: err.message || 'Check camera permissions and retry.' });
    }
  };

  const stopCamera = () => {
    cameraRequestIdRef.current += 1;
    isFaceScanActiveRef.current = false;
    if (videoRef.current && videoRef.current.srcObject) {
      stopCameraStream(videoRef.current.srcObject);
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setScannerStatusText('CAMERA STANDBY');
  };

  const toggleCameraFacing = async () => {
    stopCamera();
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    await startCamera(nextMode);
  };

  // Switch Modality with Complete Resource Cleanup
  const handleSwitchModality = (modality) => {
    if (modality === activeModality) return;
    
    stopCamera();
    setIsScanningHw(false);
    setFpErrorMsg('');
    setFpSuccessMsg('');
    setFaceAlert(null);
    setFpStatusMsg('BIOMETRIC SENSOR READY');

    setActiveModality(modality);
  };

  // 3. Face Identification: EXPLICIT MANUAL TRIGGER (Default) & Optional Continuous Loop
  const handleManualFaceScan = async () => {
    if (!videoRef.current || !streamActive) return;
    setIsAnalyzingFace(true);
    setScannerStatusText('ANALYZING BIOMETRIC FACIAL LANDMARKS...');
    setFaceAlert(null);

    try {
      const result = await extractFaceDescriptor(videoRef.current);
      if (!result || !result.descriptor) {
        setScannerStatusText('NO CLEAR FACE DETECTED');
        setFaceAlert({
          type: 'warning',
          title: 'No Clear Face Detected',
          text: 'Ensure the patient is facing the camera directly in trauma lighting.'
        });
        return;
      }

      const matchResult = await matchPatientFace(Array.from(result.descriptor));
      if (matchResult?.match && matchResult.patient) {
        setScannerStatusText(`PATIENT IDENTIFIED: ${matchResult.patient.full_name} (${matchResult.confidence}%)`);
        confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });

        const auditData = { action: 'ER_FACE_SCAN', targetId: matchResult.patient.id, details: `Identified patient ${matchResult.patient.full_name} (${matchResult.confidence}% match). Attending: Dr. ${userProfile?.full_name || 'Physician'}` };
        recordSessionAudit({
          id: Date.now(),
          created_at: new Date().toISOString(),
          actor_email: currentUser?.email,
          action: 'ER_FACE_SCAN',
          details: auditData.details
        });

        stopCamera();
        setSelectedPatient({ ...matchResult.patient, _scan_verified: true });
        setShowDossier(true);
      } else {
        setScannerStatusText('NO ENROLLED RECORD MATCHED');
        setFaceAlert({
          type: 'error',
          title: 'No Enrolled Patient Matched',
          text: 'Biometric vector does not match any enrolled patient in the Supabase trauma database.'
        });
      }
    } catch (e) {
      console.error('Face scan error:', e);
      setScannerStatusText('ERROR DURING SCAN');
      setFaceAlert({
        type: 'error',
        title: 'Neural Inference Error',
        text: e.message
      });
    } finally {
      setIsAnalyzingFace(false);
    }
  };

  // Optional Continuous Face Recognition (ONLY runs if doctor explicitly checked "Continuous Auto-Scan")
  useEffect(() => {
    let animationFrameId;
    let isProcessing = false;

    const runRecognitionCycle = async () => {
      if (!isContinuousFaceScan || !isFaceScanActiveRef.current || !streamActive || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        return;
      }

      if (isProcessing) {
        if (isFaceScanActiveRef.current && isContinuousFaceScan) {
          animationFrameId = requestAnimationFrame(runRecognitionCycle);
        }
        return;
      }

      isProcessing = true;

      try {
        if (videoRef.current.readyState === 4 && isFaceScanActiveRef.current) {
          const result = await extractFaceDescriptor(videoRef.current);
          if (!isFaceScanActiveRef.current || !isContinuousFaceScan) return;

          if (result && result.descriptor) {
            const matchResult = await matchPatientFace(Array.from(result.descriptor));
            if (!isFaceScanActiveRef.current || !isContinuousFaceScan) return;

            if (matchResult && matchResult.match && matchResult.patient) {
              setScannerStatusText(`PATIENT IDENTIFIED: ${matchResult.patient.full_name} (${matchResult.confidence}%)`);
              confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });

              const auditData = { action: 'ER_FACE_SCAN', targetId: matchResult.patient.id, details: `Identified patient ${matchResult.patient.full_name} (${matchResult.confidence}% match). Attending: Dr. ${userProfile?.full_name || 'Physician'}` };
              recordSessionAudit({
                id: Date.now(),
                created_at: new Date().toISOString(),
                actor_email: currentUser?.email,
                action: 'ER_FACE_SCAN',
                details: auditData.details
              });

              stopCamera();
              setSelectedPatient({ ...matchResult.patient, _scan_verified: true });
              setShowDossier(true);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Inference error:', e);
      } finally {
        isProcessing = false;
        if (isFaceScanActiveRef.current && isContinuousFaceScan && streamActive) {
          setTimeout(() => {
            if (isFaceScanActiveRef.current && isContinuousFaceScan) {
              animationFrameId = requestAnimationFrame(runRecognitionCycle);
            }
          }, 350);
        }
      }
    };

    if (streamActive && activeModality === 'face' && isContinuousFaceScan) {
      isFaceScanActiveRef.current = true;
      animationFrameId = requestAnimationFrame(runRecognitionCycle);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [streamActive, activeModality, isContinuousFaceScan]);

  // 4. Server-verified platform authenticator lookup (WebAuthn)
  const handleScanHardwareFingerprint = async () => {
    if (isScanningHw) return;
    setIsScanningHw(true);
    setFpErrorMsg('');
    setFpSuccessMsg('');
    setFpStatusMsg('WAITING FOR WINDOWS HELLO DEVICE VERIFICATION...');

    try {
      const result = await verifyHardwareFingerprint();
      if (result && result.match && result.patient) {
        setFpSuccessMsg(`VERIFIED: Identified ${result.patient.full_name} via device authenticator`);
        setFpStatusMsg(`MATCH CONFIRMED: ${result.patient.full_name}`);
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });

        const auditData = {
          action: 'ER_FINGERPRINT_SCAN',
          targetId: result.patient.id,
          details: `Server-verified WebAuthn device credential for ${result.patient.full_name}. Attending: Dr. ${userProfile?.full_name || 'Physician'}`
        };
        await logAuditEntry(auditData);
        recordSessionAudit({
          id: Date.now(),
          created_at: new Date().toISOString(),
          actor_email: currentUser?.email,
          action: 'ER_FINGERPRINT_SCAN',
          details: auditData.details
        });

        setSelectedPatient({ ...result.patient, _scan_verified: true });
        setShowDossier(true);
      } else {
        setFpErrorMsg('Biometric verification failed: No matching enrolled record found.');
        setFpStatusMsg('DEVICE AUTHENTICATOR - NO MATCH FOUND');
      }
    } catch (err) {
      console.warn('Hardware verification error:', err);
      if (err.name === 'NotAllowedError') {
        setFpErrorMsg('Device verification was cancelled or timed out. Complete the fingerprint, face, or screen-lock prompt and retry.');
        setFpStatusMsg('DEVICE AUTHENTICATOR READY');
      } else {
        setFpErrorMsg(err.message || 'Physical biometric verification error.');
        setFpStatusMsg('DEVICE AUTHENTICATOR ERROR');
      }
    } finally {
      setIsScanningHw(false);
    }
  };

  // 6. Manual Fallback Search
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    const results = await searchPatients(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSelectPatientManually = async (patient) => {
    const auditData = {
      action: 'MANUAL_PATIENT_LOOKUP',
      targetId: patient.id,
      details: `Manual ER record access for ${patient.full_name}`
    };
    await logAuditEntry(auditData);
    recordSessionAudit({
      id: Date.now(),
      created_at: new Date().toISOString(),
      actor_email: currentUser?.email,
      action: 'MANUAL_PATIENT_LOOKUP',
      details: auditData.details
    });

    setSelectedPatient({ ...patient, _scan_verified: false });
    setShowDossier(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:px-8 animate-fadeIn">
      <WorkspaceSidebar accountType="Doctor" userProfile={userProfile} currentUser={currentUser} activeKey={activePage} onNavigate={(page) => { if (page !== 'scanner' && streamActive) stopCamera(); setActivePage(page); }} groups={[
        { label: 'Clinical workspace', items: [{ key: 'overview', label: 'Overview', icon: Activity }, { key: 'scanner', label: 'Patient scanner', icon: Scan }, { key: 'lookup', label: 'Patient lookup', icon: Search }] },
        { label: 'Account', items: [{ key: 'activity', label: 'Audit activity', icon: Clock, badge: sessionAudits.length }] }
      ]} />
      <div className="min-w-0 flex-1 space-y-7">
      
      {/* Pending Clearance Warning if doctor status is 'pending' */}
      {isPending && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <p className="font-bold text-sm text-amber-900">
                Doctor Verification Pending
              </p>
              <p className="text-amber-800 leading-relaxed">
                Your medical account is currently pending activation in Supabase. Run <code>UPDATE public.profiles SET status = 'active' WHERE role = 'doctor';</code> in your Supabase SQL editor to ensure full clearance.
              </p>
            </div>
          </div>
        </div>
      )}

      <WorkspacePageHeader accountType="Doctor workspace" section={userProfile?.hospital || 'Clinical operations'} title={activePage === 'overview' ? 'Clinical overview' : activePage === 'scanner' ? 'Emergency biometric scanner' : activePage === 'lookup' ? 'Patient record lookup' : 'Audit activity'} description={activePage === 'scanner' ? 'Identify an unconscious patient using the available biometric methods.' : activePage === 'lookup' ? 'Search for an authorized patient record by name or emergency contact.' : activePage === 'activity' ? 'Review the lookup and scan activity for this session.' : 'Emergency identification tools and recent clinical activity.'} actions={<div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><Stethoscope className="h-4 w-4" /></div><div className="text-xs"><p className="font-bold text-slate-900">{userProfile?.full_name || currentUser?.email || 'ER Attending'}</p><p className="text-[10px] text-slate-500">{userProfile?.hospital || 'Hospital'} · {userProfile?.license_no || 'License pending'}</p></div></div>} />

      {activePage === 'overview' && (
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Session lookups</span><Activity className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-lg font-bold text-slate-900">{sessionAudits.length}</p><p className="text-[11px] text-slate-500">Scans and manual searches</p></div>
      <div className="corporate-card p-4"><div className="flex items-center justify-between text-xs text-slate-500"><span>Active method</span><Fingerprint className="h-4 w-4 text-brand-600" /></div><p className="mt-2 text-lg font-bold capitalize text-slate-900">{activeModality === 'fingerprint' ? 'Device authenticator' : 'Face scan'}</p><p className="text-[11px] text-slate-500">Switch between authenticator and face scan</p></div>
      </section>
      )}

      {/* Biometric Modality Switcher (Fingerprint vs Face) */}
      {activePage === 'scanner' && (
      <div id="doctor-scanner" className="flex max-w-md flex-col rounded-2xl bg-slate-200/80 p-1 sm:flex-row">
        <button
          type="button"
          onClick={() => handleSwitchModality('fingerprint')}
          className={`flex-1 rounded-xl px-3 py-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-2 sm:px-4 sm:text-xs ${
            activeModality === 'fingerprint'
              ? 'bg-emergency-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-emergency-600'
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          <span>Device Authenticator</span>
        </button>

        <button
          type="button"
          onClick={() => handleSwitchModality('face')}
          className={`flex-1 rounded-xl px-3 py-2.5 text-[11px] font-bold transition-all flex items-center justify-center gap-2 sm:px-4 sm:text-xs ${
            activeModality === 'face'
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Camera className="w-4 h-4 text-brand-600" />
          <span>Facial Camera Scan</span>
        </button>
      </div>

      )}
      {/* Main Grid: Biometric Scanner HUD & Trauma Fallback Lookup */}
      {(activePage === 'scanner' || activePage === 'lookup') && (
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12 lg:gap-8">
        
        {/* Left Column: Biometric HUD (8 Cols) */}
        {activePage === 'scanner' && (
        <div className="lg:col-span-12 space-y-4">
          
          {/* MODALITY 1: DEVICE AUTHENTICATOR */}
          {activeModality === 'fingerprint' && (
            <div className="corporate-card p-6 bg-white border border-slate-200/90 shadow-sm space-y-5">
              
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${isScanningHw ? 'bg-cyan-500 animate-ping' : 'bg-emerald-500'}`} />
                  <span className="font-semibold text-slate-800">
                    DEVICE AUTHENTICATOR: READY
                  </span>
                </div>
                <span className="text-[11px] font-mono text-brand-600 font-bold">
                  BIOMETRIC ENCRYPTED
                </span>
              </div>

              {/* Forensic Status Alerts */}
              {fpErrorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-rose-900">Biometric Verification Notice:</span>
                    <p className="text-[11px] leading-relaxed text-rose-800">{fpErrorMsg}</p>
                  </div>
                </div>
              )}

              {fpSuccessMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold">{fpSuccessMsg}</span>
                </div>
              )}

              {/* Device Authenticator (WebAuthn) */}
                <div className="aspect-video w-full rounded-2xl bg-gradient-to-b from-slate-50 to-slate-100/90 border border-slate-200 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="w-20 h-20 rounded-3xl bg-white border-2 border-slate-200 flex items-center justify-center text-brand-600 shadow-md">
                    <Fingerprint className={`w-12 h-12 transition-all ${isScanningHw ? 'text-brand-600 animate-pulse scale-110' : 'text-slate-400'}`} />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-800">
                      Device Authenticator
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Continue with the device authenticator. Depending on your device, it may request a fingerprint, face, or PIN.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleScanHardwareFingerprint}
                    disabled={isScanningHw || !webAuthnSupported}
                    className="corporate-btn-emergency !py-3 !px-7 !text-xs gap-2 shadow-lg shadow-emergency-600/30 active:scale-95"
                  >
                    {isScanningHw ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Prompting device authenticator...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-4 h-4" />
        <span>Verify Device Authenticator</span>
                      </>
                    )}
                  </button>

                  {!hasHardwareBiometrics && webAuthnSupported && <p className="mx-auto max-w-sm text-center text-xs text-amber-800">A built-in sensor was not detected, but you can still try the available passkey options. Android phones can use fingerprint or screen lock.</p>}
                  {!webAuthnSupported && <p className="mx-auto max-w-sm text-center text-xs text-amber-800">Use a supported browser on the secure HTTPS site to scan with a device passkey.</p>}

                  <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 text-[11px] font-mono text-slate-600 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>STATUS: {fpStatusMsg}</span>
                  </div>
                </div>
            </div>
          )}

          {/* MODALITY 2: FACE SCANNER (With Manual Trigger by Default) */}
          {activeModality === 'face' && (
            <div className="corporate-card p-6 bg-white border border-slate-200/90 shadow-sm space-y-4">
              
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${streamActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  <span className="font-semibold text-slate-700">
                    {streamActive ? 'LIVE VIDEO FEED ACTIVE' : 'CAMERA STANDBY'}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                  <span>128-D CLIENT-SIDE NEURAL MATCHER</span>
                </div>
              </div>

              {faceAlert && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 animate-fadeIn ${
                  faceAlert.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">{faceAlert.title}</span>
                    <p className="text-[11px] mt-0.5">{faceAlert.text}</p>
                  </div>
                </div>
              )}

              {/* Video Viewport */}
              <div className="relative aspect-video w-full rounded-2xl bg-slate-100/80 border-2 border-slate-200 overflow-hidden flex items-center justify-center">
                
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${streamActive ? 'block' : 'hidden'}`}
                />

                {!streamActive && (
                  <div className="text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm mx-auto flex items-center justify-center text-brand-600">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Face Scanner Standby</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                        Click "Start Camera Feed" to preview patient, then click "Scan Patient Face" to verify.
                      </p>
                    </div>
                  </div>
                )}

                {streamActive && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-12 sm:inset-16 border-2 border-brand-500/50 rounded-2xl scan-reticle flex items-center justify-center">
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-brand-500 to-transparent shadow-[0_0_8px_#0284c7] animate-scan-line" />
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono bg-slate-900/90 text-white backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700">
                      <span className="truncate max-w-[75%] font-semibold">
                        STATUS: {scannerStatusText}
                      </span>
                      <span className="text-brand-400 font-bold">MED-ID FACE</span>
                    </div>
                  </div>
                )}

              </div>

              {/* Camera Control Toolbar */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!streamActive ? (
                    <button
                      type="button"
                      onClick={startCamera}
                      disabled={loadingModels}
                      className="corporate-btn-primary !py-2.5 !px-5 !text-xs gap-1.5"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Start Camera Feed</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleManualFaceScan}
                        disabled={isAnalyzingFace}
                        className="corporate-btn-emergency !py-2.5 !px-5 !text-xs gap-2 shadow-md shadow-emergency-600/30"
                      >
                        {isAnalyzingFace ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Analyzing Face...</span>
                          </>
                        ) : (
                          <>
                            <Scan className="w-4 h-4" />
                            <span>Scan & Identify Patient Face</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={stopCamera}
                        className="corporate-btn-secondary !py-2.5 !px-3.5 !text-xs gap-1.5"
                      >
                        <CameraOff className="w-4 h-4 text-slate-600" />
                        <span>Stop</span>
                      </button>

                      <button
                        type="button"
                        onClick={toggleCameraFacing}
                        className="corporate-btn-secondary !py-2.5 !px-3.5 !text-xs gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Flip</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Continuous Mode Toggle */}
                {streamActive && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isContinuousFaceScan}
                      onChange={(e) => setIsContinuousFaceScan(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span>Continuous Auto-Identify Mode</span>
                  </label>
                )}
              </div>

            </div>
          )}

        </div>
        )}

        {/* Right Column: Trauma Fallback Manual Search (4 Cols) */}
        {activePage === 'lookup' && (
        <div className="lg:col-span-12 space-y-6">
          
          <div id="doctor-search" className="corporate-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Trauma Fallback Search
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              If the patient's face is obscured or the device authenticator is unavailable, search by name or emergency contact.
            </p>

            <form onSubmit={handleSearch} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Patient Name or Phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="corporate-input text-xs"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="corporate-btn-primary !py-2 !px-3.5 !text-xs flex-shrink-0"
                >
                  {searching ? 'Searching...' : 'Lookup'}
                </button>
              </div>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Matches Found ({searchResults.length})
                </span>
                {searchResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPatientManually(p)}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-300 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{p.full_name}</span>
                        <span className="corporate-badge-red text-[10px] font-bold">
                          {p.blood_type || 'Blood N/A'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        DOB: {p.dob || 'Unknown'} • Allergies: {p.allergies || 'None'}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clinical Instructions Card */}
          <div className="corporate-card p-6 bg-gradient-to-br from-brand-50/50 via-white to-slate-50 border border-brand-100 text-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-brand-700 uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Trauma Identification Protocol</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900">1. Device Authenticator:</strong> Verify using the patient's registered passkey (the device may request a PIN or biometric).<br />
              <strong className="text-slate-900">2. Facial Camera:</strong> Frame the patient and scan their face.<br />
              <strong className="text-slate-900">3. Emergency Dispatch:</strong> Notify the patient's next of kin.
            </p>
          </div>

        </div>
        )}

      </div>
      )}
      {/* Active Session Triage Log */}
      {activePage === 'activity' && (
      <div id="doctor-audit" className="corporate-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Current Session Triage Log</h3>
            <p className="text-xs text-slate-500">
              Emergency scans performed during this active session. Records are cleared on logout.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistoryArchive(prev => !prev)}
              className="corporate-btn-secondary !py-1 !px-2.5 !text-xs gap-1.5"
            >
              {showHistoryArchive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showHistoryArchive ? 'Hide Archive' : `Historical Log Archive (${auditHistory.length})`}</span>
            </button>
          </div>
        </div>

        {/* Current Active Session Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold text-[10px] border-y border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Physician</th>
                <th className="py-2.5 px-3">Modality / Action</th>
                <th className="py-2.5 px-3">Triage Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessionAudits.length > 0 ? (
                sessionAudits.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(item.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800">
                      {item.actor_email}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.action?.includes('FINGERPRINT')
                          ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
                          : 'bg-brand-50 text-brand-800 border border-brand-200'
                      }`}>
                        {item.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-[11px]">
                      {item.details}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                    No emergency scans performed in this current session. Perform a Fingerprint or Face scan to triage an incoming patient.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Historical Archive (Collapsible) */}
        {showHistoryArchive && (
          <div className="mt-6 pt-4 border-t border-slate-200 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Historical Audit Archive ({auditHistory.length} total events)
              </span>
              <button
                onClick={loadPastAudits}
                className="text-[11px] text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Archive</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Date & Time</th>
                    <th className="py-2 px-3">Physician</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditHistory.map((item) => (
                    <tr key={item.id} className="text-slate-600 text-[11px]">
                      <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-700">
                        {item.actor_email}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-mono text-[10px] text-slate-600">{item.action}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {item.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Emergency Dossier Modal */}
      <EmergencyDossierModal
        isOpen={showDossier}
        onClose={() => setShowDossier(false)}
        patient={selectedPatient}
        doctorProfile={userProfile}
        biometricallyVerified={Boolean(selectedPatient?._scan_verified)}
      />
      </div>
    </div>
  );
}

