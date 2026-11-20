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
  EyeOff,
  User,
  ArrowRight,
  PhoneCall,
  Calendar,
  Filter
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
  getDoctorPatientHistory,
  searchPatients,
  matchPatientFace,
  recordBiometricScan
} from '../lib/supabase';
import EmergencyDossierModal from './EmergencyDossierModal';
import WorkspaceSidebar from './WorkspaceSidebar';
import WorkspacePageHeader from './WorkspacePageHeader';
import { startCameraStream, stopCameraStream } from '../lib/camera';

function calculateAge(dob) {
  if (!dob) return 'N/A';
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return 'N/A';
  const diff = Date.now() - birthDate.getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970) + ' yrs';
}

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
  const [patientHistory, setPatientHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyFilterQuery, setHistoryFilterQuery] = useState('');
  const [historyModalityFilter, setHistoryModalityFilter] = useState('all');

  // Active Dossier Modal (ONLY opens on genuine biometric match or deliberate manual search selection)
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showDossier, setShowDossier] = useState(false);

  // Manual search fallback
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const isPending = userProfile?.status === 'pending';

  const addPatientToHistory = async (patient, modality = 'face') => {
    if (!patient || !patient.id) return;
    const doctorId = currentUser?.id || userProfile?.id;

    try {
      if (doctorId) {
        await recordBiometricScan(doctorId, patient.id, modality);
      }
    } catch (e) {
      console.warn('recordBiometricScan notice:', e.message);
    }

    try {
      await logAuditEntry({
        action: modality === 'face' ? 'ER_FACE_SCAN' : modality === 'fingerprint' ? 'ER_FINGERPRINT_SCAN' : 'MANUAL_PATIENT_LOOKUP',
        targetId: patient.id,
        details: `Identified patient ${patient.full_name} via ${modality}. Attending: Dr. ${userProfile?.full_name || 'Physician'}`
      });
    } catch (e) {
      console.warn('logAuditEntry notice:', e.message);
    }

    setPatientHistory(prev => {
      const existingIdx = prev.findIndex(p => (p.patient_id || p.id) === patient.id);
      const newEntry = {
        patient_id: patient.id,
        id: patient.id,
        patient_name: patient.full_name,
        full_name: patient.full_name,
        patient_email: patient.email || '',
        dob: patient.dob,
        sex: patient.sex,
        blood_type: patient.blood_type || patient.blood_group || 'O+',
        blood_group: patient.blood_type || patient.blood_group || 'O+',
        genotype: patient.genotype,
        nationality: patient.nationality,
        home_address: patient.home_address,
        emerg_name: patient.emerg_name,
        emerg_phone: patient.emerg_phone,
        emerg_email: patient.emerg_email,
        med_id_number: patient.med_id_number || `MED-${patient.id.slice(0, 8).toUpperCase()}`,
        last_scanned_at: new Date().toISOString(),
        scan_count: existingIdx >= 0 ? (prev[existingIdx].scan_count || 1) + 1 : 1,
        last_modality: modality === 'face' ? 'Face Scan' : modality === 'fingerprint' ? 'Device Authenticator' : 'Manual Lookup',
        report_status: 'granted',
        descriptor: patient.descriptor || null,
        allergies: patient.allergies,
        conditions: patient.conditions,
        medications: patient.medications,
        surgeries: patient.surgeries,
        medical_history: patient.medical_history,
        ...patient
      };

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated.splice(existingIdx, 1);
        return [newEntry, ...updated];
      }
      return [newEntry, ...prev];
    });

    loadPastAudits();
  };

  const handleOpenPatientDossier = (entry) => {
    const patientObj = {
      id: entry.patient_id || entry.id,
      full_name: entry.patient_name || entry.full_name || 'Patient',
      email: entry.patient_email || entry.email || '',
      dob: entry.dob,
      sex: entry.sex,
      blood_type: entry.blood_type || entry.blood_group || 'O+',
      blood_group: entry.blood_type || entry.blood_group || 'O+',
      genotype: entry.genotype,
      nationality: entry.nationality,
      home_address: entry.home_address,
      emerg_name: entry.emerg_name,
      emerg_phone: entry.emerg_phone,
      emerg_email: entry.emerg_email,
      med_id_number: entry.med_id_number || `MED-${(entry.patient_id || entry.id || '').slice(0, 8).toUpperCase()}`,
      descriptor: entry.descriptor || null,
      allergies: entry.allergies,
      conditions: entry.conditions,
      medications: entry.medications,
      surgeries: entry.surgeries,
      medical_history: entry.medical_history,
      _scan_verified: true
    };
    setSelectedPatient(patientObj);
    setShowDossier(true);
  };

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
    try {
      setPatientHistory(await getDoctorPatientHistory());
      setHistoryError('');
    } catch (error) {
      setHistoryError(error.message || 'Could not load your patient history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const recordSessionAudit = (entry) => {
    setSessionAudits(prev => [entry, ...prev]);
    loadPastAudits();
  };

  // Safe Scanner Cancellation and State Reset
  const handleCancelScan = () => {
    // 1. Reset hardware passkey verification state
    setIsScanningHw(false);
    setFpStatusMsg('BIOMETRIC SENSOR READY');
    setFpErrorMsg('');

    // 2. Cancel camera feed and facial recognition neural loop
    cameraRequestIdRef.current += 1;
    isFaceScanActiveRef.current = false;
    if (videoRef.current && videoRef.current.srcObject) {
      stopCameraStream(videoRef.current.srcObject);
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setIsAnalyzingFace(false);
    setIsContinuousFaceScan(false);
    setScannerStatusText('CAMERA STANDBY');
    setFaceAlert(null);
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

        await addPatientToHistory(matchResult.patient, 'face');

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

              await addPatientToHistory(matchResult.patient, 'face');

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

        await addPatientToHistory(result.patient, 'fingerprint');

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

    await addPatientToHistory(patient, 'lookup');

    setSelectedPatient({ ...patient, _scan_verified: false });
    setShowDossier(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:px-8 animate-fadeIn">
      <WorkspaceSidebar accountType="Doctor" userProfile={userProfile} currentUser={currentUser} activeKey={activePage} onNavigate={(page) => { if (page !== 'scanner' && streamActive) stopCamera(); setActivePage(page); }} groups={[
        { label: 'Clinical workspace', items: [{ key: 'overview', label: 'Overview', icon: Activity }, { key: 'scanner', label: 'Patient scanner', icon: Scan }, { key: 'lookup', label: 'Patient lookup', icon: Search }] },
        { label: 'Account', items: [{ key: 'history', label: 'Patient history', icon: Clock, badge: patientHistory.length }] }
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

      <WorkspacePageHeader accountType="Doctor workspace" section={userProfile?.hospital || 'Clinical operations'} title={activePage === 'overview' ? 'Clinical overview' : activePage === 'scanner' ? 'Emergency biometric scanner' : activePage === 'lookup' ? 'Patient record lookup' : 'Patient history'} description={activePage === 'scanner' ? 'Identify an unconscious patient using the available biometric methods.' : activePage === 'lookup' ? 'Search for an authorized patient record by name or emergency contact.' : activePage === 'history' ? 'Reopen basic details for patients you previously identified and track medical report access.' : 'Emergency identification tools and recent clinical activity.'} actions={<div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700"><Stethoscope className="h-4 w-4" /></div><div className="text-xs"><p className="font-bold text-slate-900">{userProfile?.full_name || currentUser?.email || 'ER Attending'}</p><p className="text-[10px] text-slate-500">{userProfile?.hospital || 'Hospital'} · {userProfile?.license_no || 'License pending'}</p></div></div>} />

      {activePage === 'overview' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="corporate-card p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider">Patients Attended</span>
                <Clock className="h-4 w-4 text-brand-600" />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{patientHistory.length}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Identified via Face or Fingerprint</p>
            </div>

            <div className="corporate-card p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider">Session Verifications</span>
                <Activity className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-black text-slate-900">{sessionAudits.length}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Audited biometric events</p>
            </div>

            <div className="corporate-card p-5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-wider">Scanner Bay Status</span>
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-base font-bold text-slate-900 capitalize flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{activeModality === 'fingerprint' ? 'Device Authenticator' : 'Facial Camera'}</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Client-side biometric matching ready</p>
            </div>
          </section>

          {/* Emergency Quick Action Banner */}
          <div className="corporate-card p-6 bg-gradient-to-r from-brand-50/60 via-white to-slate-50 border border-brand-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="corporate-badge-red text-[10px] font-bold uppercase tracking-wider">
                  Trauma Bay Ready
                </span>
                <span className="text-xs font-bold text-slate-800">Emergency Biometric Recognition</span>
              </div>
              <p className="text-xs text-slate-600 max-w-xl">
                Identify unconscious or critical patients instantly with face recognition or passkey device authenticator. Reopen any previously identified patient without re-scanning.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActivePage('scanner')}
                className="corporate-btn-emergency !py-2.5 !px-4 !text-xs gap-2 shadow-sm shadow-emergency-600/20"
              >
                <Scan className="w-4 h-4" />
                <span>Launch Scanner Bay</span>
              </button>
              <button
                type="button"
                onClick={() => setActivePage('history')}
                className="corporate-btn-secondary !py-2.5 !px-3.5 !text-xs gap-1.5"
              >
                <Clock className="w-4 h-4 text-slate-600" />
                <span>View Full History ({patientHistory.length})</span>
              </button>
            </div>
          </div>

          {/* Recently Attended Patients Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-600" />
                  <span>Recently Attended Patients</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Quick access to patients you have recently identified. Click "Open Patient Dossier" to view basic triage information or pull cross-hospital medical records.
                </p>
              </div>
              {patientHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActivePage('history')}
                  className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 transition-colors"
                >
                  <span>View All Attended Patients ({patientHistory.length})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {patientHistory.length === 0 ? (
              <div className="corporate-card p-8 text-center space-y-3 bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 mx-auto flex items-center justify-center">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">No Patients Attended Yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Patients will appear here immediately after you identify them using facial recognition or the device authenticator.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePage('scanner')}
                  className="corporate-btn-brand !py-2 !px-4 !text-xs gap-1.5 inline-flex"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>Open Scanner Bay</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {patientHistory.slice(0, 3).map((entry) => {
                  const photo = entry.descriptor?.photo || null;
                  const blood = entry.blood_type || entry.blood_group || 'O+';
                  const name = entry.patient_name || entry.full_name || 'Patient';
                  const medId = entry.med_id_number || `MED-${(entry.patient_id || entry.id || '').slice(0, 8).toUpperCase()}`;

                  return (
                    <div 
                      key={entry.patient_id || entry.id}
                      className="corporate-card p-4 border border-slate-200 hover:border-brand-300 hover:shadow-md transition-all flex flex-col justify-between space-y-3.5 bg-white"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-600 font-bold text-sm">
                            {photo ? (
                              <img src={photo} alt={name} className="w-full h-full object-cover" />
                            ) : (
                              name[0] || 'P'
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 truncate">{name}</h4>
                            <p className="text-[11px] font-mono text-brand-600 font-semibold">{medId}</p>
                          </div>
                        </div>

                        <span className="corporate-badge-red text-[11px] font-black px-2.5 py-0.5 flex-shrink-0">
                          {blood}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 space-y-1 border-t border-slate-100 pt-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Age / DOB:</span>
                          <span className="font-semibold text-slate-800">{calculateAge(entry.dob)} · {entry.dob || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Next of Kin:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[140px]">{entry.emerg_name || 'Not set'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Last Identified:</span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {entry.last_scanned_at ? new Date(entry.last_scanned_at).toLocaleDateString() : 'Recent'} · {entry.last_modality || 'Biometric'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenPatientDossier(entry)}
                        className="corporate-btn-brand !py-2 !px-3 !text-xs w-full justify-center gap-1.5 shadow-sm"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Open Patient Dossier</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
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

                  <div className="flex flex-wrap items-center justify-center gap-2">
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
                    {isScanningHw && (
                      <button
                        type="button"
                        onClick={handleCancelScan}
                        className="corporate-btn-secondary !py-3 !px-4 !text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                      >
                        Cancel Scan
                      </button>
                    )}
                  </div>

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
      {activePage === 'history' && (
        <section className="space-y-5">
          {/* Header Card */}
          <div className="corporate-card p-5 sm:p-6 bg-white border border-slate-200">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="corporate-badge-blue text-xs uppercase tracking-wider font-bold">
                    Clinical Archive
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {patientHistory.length} Verified Record{patientHistory.length === 1 ? '' : 's'}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mt-1 tracking-tight">
                  Attended Patient History
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-2xl leading-relaxed">
                  All patients personally verified by Dr. {userProfile?.full_name || 'Physician'}. Basic identification details are immediately accessible, and you can pull full multi-hospital medical records with zero manual admin intervention.
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={loadPastAudits} 
                  disabled={loadingHistory} 
                  className="corporate-btn-secondary !py-2.5 !px-3.5 !text-xs gap-2"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePage('scanner')}
                  className="corporate-btn-emergency !py-2.5 !px-4 !text-xs gap-2 shadow-sm"
                >
                  <Scan className="w-3.5 h-3.5" />
                  <span>New Scan</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter by name, blood type, MED-ID, next-of-kin..."
                  value={historyFilterQuery}
                  onChange={(e) => setHistoryFilterQuery(e.target.value)}
                  className="corporate-input !pl-9 !py-2 !text-xs w-full"
                />
                {historyFilterQuery && (
                  <button
                    type="button"
                    onClick={() => setHistoryFilterQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Modality Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setHistoryModalityFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    historyModalityFilter === 'all'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({patientHistory.length})
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryModalityFilter('face')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    historyModalityFilter === 'face'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Face Scan ({patientHistory.filter(e => (e.last_modality || '').toLowerCase().includes('face')).length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryModalityFilter('fingerprint')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                    historyModalityFilter === 'fingerprint'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Device Authenticator ({patientHistory.filter(e => {
                    const m = (e.last_modality || '').toLowerCase();
                    return m.includes('fingerprint') || m.includes('device') || m.includes('authenticator');
                  }).length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Error Notice */}
          {historyError && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Patient history could not be refreshed.</strong>
                <p className="mt-0.5">{historyError}</p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loadingHistory && (
            <div className="corporate-card p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
              <span>Querying verified patient history from Supabase…</span>
            </div>
          )}

          {/* Empty Patient History */}
          {!loadingHistory && !historyError && patientHistory.length === 0 && (
            <div className="corporate-card p-10 text-center space-y-4 bg-slate-50/50">
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-400 mx-auto flex items-center justify-center shadow-sm">
                <Clock className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-slate-800">No Attended Patients Recorded</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  When you identify an unconscious or emergency patient with a facial scan or device authenticator, their dossier will be preserved here so you can re-open their details instantly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePage('scanner')}
                className="corporate-btn-emergency !py-2.5 !px-5 !text-xs gap-2 inline-flex"
              >
                <Scan className="w-4 h-4" />
                <span>Go to Emergency Scanner</span>
              </button>
            </div>
          )}

          {/* Filtered Empty State */}
          {!loadingHistory && patientHistory.length > 0 && (() => {
            const filtered = patientHistory.filter((entry) => {
              if (historyModalityFilter === 'face') {
                const modality = (entry.last_modality || '').toLowerCase();
                if (!modality.includes('face')) return false;
              } else if (historyModalityFilter === 'fingerprint') {
                const modality = (entry.last_modality || '').toLowerCase();
                if (!modality.includes('fingerprint') && !modality.includes('device') && !modality.includes('authenticator')) return false;
              }

              if (!historyFilterQuery.trim()) return true;
              const q = historyFilterQuery.toLowerCase();
              const name = (entry.patient_name || entry.full_name || '').toLowerCase();
              const blood = (entry.blood_type || entry.blood_group || '').toLowerCase();
              const medId = (entry.med_id_number || '').toLowerCase();
              const emerg = (entry.emerg_name || '').toLowerCase();
              const phone = (entry.emerg_phone || '').toLowerCase();
              return name.includes(q) || blood.includes(q) || medId.includes(q) || emerg.includes(q) || phone.includes(q);
            });

            if (filtered.length === 0) {
              return (
                <div className="corporate-card p-8 text-center space-y-3 bg-white">
                  <Search className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-xs text-slate-600">
                    No attended patients matched your query <strong>"{historyFilterQuery}"</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setHistoryFilterQuery(''); setHistoryModalityFilter('all'); }}
                    className="corporate-btn-secondary !py-1.5 !px-3 !text-xs inline-flex"
                  >
                    Reset Filters
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((entry) => {
                  const photo = entry.descriptor?.photo || null;
                  const blood = entry.blood_type || entry.blood_group || 'O+';
                  const name = entry.patient_name || entry.full_name || 'Patient';
                  const medId = entry.med_id_number || `MED-${(entry.patient_id || entry.id || '').slice(0, 8).toUpperCase()}`;

                  return (
                    <article 
                      key={entry.patient_id || entry.id} 
                      className="corporate-card p-5 bg-white border border-slate-200 hover:border-brand-300 hover:shadow-lg transition-all flex flex-col justify-between space-y-4"
                    >
                      {/* Top Row: Avatar, Name, Blood Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-13 h-13 rounded-2xl bg-slate-100 border-2 border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-700 font-black text-base shadow-sm">
                            {photo ? (
                              <img src={photo} alt={name} className="w-full h-full object-cover" />
                            ) : (
                              name[0] || 'P'
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-base font-bold text-slate-900 truncate tracking-tight">{name}</h4>
                            <p className="text-xs font-mono font-bold text-brand-600">{medId}</p>
                          </div>
                        </div>

                        <span className="corporate-badge-red text-xs font-black px-3 py-1 flex-shrink-0 shadow-sm">
                          {blood}
                        </span>
                      </div>

                      {/* Detail Grid */}
                      <div className="text-xs text-slate-600 bg-slate-50/80 rounded-xl p-3 space-y-1.5 border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Age & DOB:</span>
                          <span className="font-semibold text-slate-800">{calculateAge(entry.dob)} · {entry.dob || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Sex / Genotype:</span>
                          <span className="font-semibold text-slate-800">{entry.sex || 'Not set'} · {entry.genotype || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Next of Kin:</span>
                          <span className="font-semibold text-slate-800 truncate max-w-[150px]">{entry.emerg_name || 'Not recorded'}</span>
                        </div>
                        {entry.emerg_phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Contact Phone:</span>
                            <span className="font-mono text-[11px] text-slate-800 font-bold">{entry.emerg_phone}</span>
                          </div>
                        )}
                      </div>

                      {/* Scan Metadata Badge */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span className="flex items-center gap-1 font-medium text-slate-700">
                          {entry.last_modality?.toLowerCase().includes('fingerprint') ? (
                            <Fingerprint className="w-3.5 h-3.5 text-brand-600" />
                          ) : (
                            <Camera className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          <span>{entry.last_modality || 'Biometric Verified'}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {entry.last_scanned_at ? new Date(entry.last_scanned_at).toLocaleDateString() : 'Recent'} · {entry.scan_count || 1} scan{(entry.scan_count || 1) === 1 ? '' : 's'}
                        </span>
                      </div>

                      {/* Action Button: Open Patient Dossier */}
                      <button
                        type="button"
                        onClick={() => handleOpenPatientDossier(entry)}
                        className="corporate-btn-brand !py-2.5 !px-4 !text-xs w-full justify-center gap-2 shadow-sm shadow-brand-600/20 active:scale-98"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Open Patient Dossier</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    </article>
                  );
                })}
              </div>
            );
          })()}
        </section>
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

