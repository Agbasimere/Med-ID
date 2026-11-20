import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  PhoneCall, 
  ArrowRight, 
  ShieldCheck, 
  UserCheck, 
  Fingerprint
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { 
  loadFaceApiModels, 
  extractFaceDescriptor, 
  captureVideoFrame 
} from '../lib/faceRecognition';
import { 
  enrollHardwareFingerprint
} from '../lib/fingerprint';
import { saveInitialPatientIntake, updatePatientProfile, getPatientData } from '../lib/supabase';
import { startCameraStream, stopCameraStream } from '../lib/camera';

export default function PatientOnboardingWizard({ currentUser, onComplete, initialPatientDetails = null, intakeAlreadySaved = false }) {
  const [step, setStep] = useState(1); // 1 = Face, 2 = Fingerprint, 3 = Profile details
  
  // Step 1: Face capture state
  const videoRef = useRef(null);
  const cameraRequestIdRef = useRef(0);
  const [modelsReady, setModelsReady] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [capturing, setCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedDescriptor, setCapturedDescriptor] = useState(null);

  // Step 2: Device authenticator enrollment
  const [fpTemplate, setFpTemplate] = useState(null);
  const [fpStatusMsg, setFpStatusMsg] = useState('Verify with your device authenticator.');
  const [isScanningHw, setIsScanningHw] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Step 3: Basic profile fields pre-populated from initial signup
  const [fullName, setFullName] = useState(
    initialPatientDetails?.fullName || initialPatientDetails?.full_name || currentUser?.user_metadata?.full_name || ''
  );
  const [dob, setDob] = useState(initialPatientDetails?.dob || '');
  const [sex, setSex] = useState(initialPatientDetails?.sex || '');
  const [bloodType, setBloodType] = useState(
    initialPatientDetails?.bloodType || initialPatientDetails?.blood_type || initialPatientDetails?.blood_group || 'O+'
  );
  const [genotype, setGenotype] = useState(initialPatientDetails?.genotype || '');
  const [nationality, setNationality] = useState(initialPatientDetails?.nationality || '');
  const [homeAddress, setHomeAddress] = useState(
    initialPatientDetails?.homeAddress || initialPatientDetails?.home_address || ''
  );
  const [allergies, setAllergies] = useState(initialPatientDetails?.allergies || '');
  const [conditions, setConditions] = useState(initialPatientDetails?.conditions || '');
  const [medications, setMedications] = useState(initialPatientDetails?.medications || '');
  const [surgeries, setSurgeries] = useState(initialPatientDetails?.surgeries || '');
  const [medicalHistory, setMedicalHistory] = useState(
    initialPatientDetails?.medicalHistory || initialPatientDetails?.medical_history || ''
  );
  const [emergName, setEmergName] = useState(
    initialPatientDetails?.emergName || initialPatientDetails?.emerg_name || ''
  );
  const [emergPhone, setEmergPhone] = useState(
    initialPatientDetails?.emergPhone || initialPatientDetails?.emerg_phone || ''
  );
  const [emergEmail, setEmergEmail] = useState(
    initialPatientDetails?.emergEmail || initialPatientDetails?.emerg_email || ''
  );
  const [whatsappOptIn, setWhatsappOptIn] = useState(
    Boolean(initialPatientDetails?.whatsappOptIn || initialPatientDetails?.emerg_whatsapp_opt_in)
  );
  const [profileRetrieved, setProfileRetrieved] = useState(Boolean(initialPatientDetails));

  // Retrieve basic profile information entered during initial signup
  useEffect(() => {
    async function loadSignupData() {
      if (initialPatientDetails) {
        setFullName(prev => prev || initialPatientDetails.fullName || initialPatientDetails.full_name || '');
        setDob(prev => prev || initialPatientDetails.dob || '');
        setSex(prev => prev || initialPatientDetails.sex || '');
        setBloodType(prev => prev || initialPatientDetails.bloodType || initialPatientDetails.blood_type || initialPatientDetails.blood_group || 'O+');
        setGenotype(prev => prev || initialPatientDetails.genotype || '');
        setNationality(prev => prev || initialPatientDetails.nationality || '');
        setHomeAddress(prev => prev || initialPatientDetails.homeAddress || initialPatientDetails.home_address || '');
        setAllergies(prev => prev || initialPatientDetails.allergies || '');
        setConditions(prev => prev || initialPatientDetails.conditions || '');
        setMedications(prev => prev || initialPatientDetails.medications || '');
        setSurgeries(prev => prev || initialPatientDetails.surgeries || '');
        setMedicalHistory(prev => prev || initialPatientDetails.medicalHistory || initialPatientDetails.medical_history || '');
        setEmergName(prev => prev || initialPatientDetails.emergName || initialPatientDetails.emerg_name || '');
        setEmergPhone(prev => prev || initialPatientDetails.emergPhone || initialPatientDetails.emerg_phone || '');
        setEmergEmail(prev => prev || initialPatientDetails.emergEmail || initialPatientDetails.emerg_email || '');
        setWhatsappOptIn(prev => prev || Boolean(initialPatientDetails.whatsappOptIn || initialPatientDetails.emerg_whatsapp_opt_in));
        setProfileRetrieved(true);
      }

      // Also retrieve existing saved backend data for this patient
      if (currentUser?.id) {
        try {
          const dbData = await getPatientData(currentUser.id);
          if (dbData) {
            if (dbData.full_name) setFullName(dbData.full_name);
            if (dbData.dob) setDob(dbData.dob);
            if (dbData.sex) setSex(dbData.sex);
            if (dbData.blood_type || dbData.blood_group) setBloodType(dbData.blood_type || dbData.blood_group);
            if (dbData.genotype) setGenotype(dbData.genotype);
            if (dbData.nationality) setNationality(dbData.nationality);
            if (dbData.home_address) setHomeAddress(dbData.home_address);
            if (dbData.allergies) setAllergies(dbData.allergies);
            if (dbData.conditions) setConditions(dbData.conditions);
            if (dbData.medications) setMedications(dbData.medications);
            if (dbData.surgeries) setSurgeries(dbData.surgeries);
            if (dbData.medical_history) setMedicalHistory(dbData.medical_history);
            if (dbData.emerg_name) setEmergName(dbData.emerg_name);
            if (dbData.emerg_phone) setEmergPhone(dbData.emerg_phone);
            if (dbData.emerg_email) setEmergEmail(dbData.emerg_email);
            if (dbData.emerg_whatsapp_opt_in) setWhatsappOptIn(Boolean(dbData.emerg_whatsapp_opt_in));
            setProfileRetrieved(true);
          }
        } catch (err) {
          console.warn('Backend intake fetch error:', err.message);
        }
      }
    }

    loadSignupData();
  }, [currentUser?.id, initialPatientDetails]);

  useEffect(() => {
    if (step === 1) {
      initCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step]);

  const initCamera = async () => {
    const requestId = ++cameraRequestIdRef.current;
    let stream = null;
    setModelsReady(false);
    try {
      loadFaceApiModels().then(() => {
        if (requestId === cameraRequestIdRef.current) setModelsReady(true);
      }).catch((modelError) => {
        if (requestId === cameraRequestIdRef.current) setErrorMsg(modelError.message || 'Could not load face recognition models.');
      });
      stream = await startCameraStream(facingMode);
      if (requestId !== cameraRequestIdRef.current || step !== 1) {
        stopCameraStream(stream);
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err) {
      console.error('Camera init error:', err);
      stopCameraStream(stream);
      if (requestId !== cameraRequestIdRef.current || step !== 1) return;
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
      setStreamActive(false);
      setErrorMsg(err.message || 'Could not start the camera. Check browser and Windows camera permissions.');
    }
  };

  const switchCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    stopCamera();
    setFacingMode(nextMode);
    const requestId = ++cameraRequestIdRef.current;
    let stream = null;
    try {
      stream = await startCameraStream(nextMode);
      if (requestId !== cameraRequestIdRef.current || step !== 1) {
        stopCameraStream(stream);
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err) {
      stopCameraStream(stream);
      if (requestId !== cameraRequestIdRef.current || step !== 1) return;
      if (videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
      setStreamActive(false);
      setErrorMsg(err.message || 'Could not switch camera. Check camera permissions and try again.');
    }
  };

  const stopCamera = () => {
    cameraRequestIdRef.current += 1;
    if (videoRef.current && videoRef.current.srcObject) {
      stopCameraStream(videoRef.current.srcObject);
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  };

  const handleCaptureFace = async () => {
    if (!videoRef.current || !streamActive || !modelsReady) return;
    setErrorMsg('');
    setCapturing(true);

    try {
      const detection = await extractFaceDescriptor(videoRef.current);
      if (!detection || !detection.descriptor) {
        throw new Error('No clear face detected in the frame. Please look directly at the camera with good lighting.');
      }

      const photoBase64 = captureVideoFrame(videoRef.current, 0.72);
      if (!photoBase64) {
        throw new Error('Failed to capture frame snapshot.');
      }

      setCapturedDescriptor(detection.descriptor);
      setCapturedPhoto(photoBase64);
      confetti({ particleCount: 40, spread: 60 });
    } catch (err) {
      console.error('Face capture error:', err);
      setErrorMsg(err.message || 'Face detection failed.');
    } finally {
      setCapturing(false);
    }
  };

  // Step 2: Device biometric/passkey enrollment via WebAuthn
  const handleHardwareEnroll = async () => {
    if (fpTemplate || saving) return;
    setErrorMsg('');
    setIsScanningHw(true);
    setFpStatusMsg('Verify with your device authenticator...');

    try {
      const template = await enrollHardwareFingerprint(
        currentUser?.id,
        currentUser?.user_metadata?.full_name || 'Patient',
        currentUser?.email
      );
      setFpTemplate(template);
      setFpStatusMsg('Device credential registered.');
      confetti({ particleCount: 50, spread: 70 });
    } catch (err) {
      console.warn('Hardware enrollment error:', err);
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Authenticator check was cancelled. Try again and complete the device verification prompt.');
      } else {
        setErrorMsg(err.message || 'Platform authenticator not available on this device.');
      }
      setFpStatusMsg('Device verification did not complete. Check the authenticator and retry.');
    } finally {
      setIsScanningHw(false);
    }
  };

  const resetFpEnrollment = () => {
    setFpTemplate(null);
    setErrorMsg('');
    setFpStatusMsg('Verify with your device authenticator.');
  };

  // Step 3: Save to Supabase
  const handleSaveAll = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    setSaving(true);
    setErrorMsg('');

    try {
      // Patient setup saves identity/contact details and enrolled biometrics only.
      const descriptorPayload = {
        vector: capturedDescriptor,
        photo: capturedPhoto
      };

      // Save identity, medical history, emergency contact, and biometrics
      await updatePatientProfile(currentUser.id, {
        full_name: fullName || currentUser?.user_metadata?.full_name || '',
        dob,
        sex,
        blood_type: bloodType,
        genotype,
        nationality,
        home_address: homeAddress,
        allergies,
        conditions,
        medications,
        surgeries,
        medical_history: medicalHistory,
        emerg_name: emergName,
        emerg_phone: emergPhone,
        emerg_email: emergEmail,
        emerg_whatsapp_opt_in: whatsappOptIn,
        descriptor: descriptorPayload
      });

      confetti({ particleCount: 80, spread: 80 });
      onComplete();
    } catch (err) {
      console.error('Failed to save profile:', err);
      setErrorMsg(err.message || 'Failed to complete registration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="corporate-card relative max-h-[94dvh] w-full max-w-xl overflow-y-auto border border-slate-200 p-4 shadow-2xl sm:p-8">
        
        {/* Wizard Progress Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span>Patient Dual-Biometric Setup</span>
            <span>Step {step} of 3</span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-brand-600 h-full transition-all duration-300"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: FACE VERIFICATION & CAPTURE */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <span className="corporate-badge-blue text-xs uppercase tracking-wider mb-1.5">
                Step 1 of 3: Face ID Verification
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Register Emergency Face ID
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Align your face in the camera oval to extract a 128-dimensional neural vector for trauma bay emergency matching.
              </p>
            </div>

            {/* Camera Viewport */}
            <div className="relative aspect-video w-full rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center">
              {capturedPhoto ? (
                <img 
                  src={capturedPhoto} 
                  alt="Captured face" 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${streamActive ? 'block' : 'hidden'}`}
                />
              )}

              {streamActive && !capturedPhoto && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-48 h-60 border-2 border-dashed border-brand-400/80 rounded-[50%] shadow-[0_0_20px_rgba(2,132,199,0.3)] flex items-center justify-center">
                    <span className="text-[10px] font-mono font-bold text-brand-300 bg-slate-950/70 px-2 py-0.5 rounded">
                      ALIGN FACE HERE
                    </span>
                  </div>
                </div>
              )}

              {capturedPhoto && (
                <div className="absolute bottom-3 left-3 right-3 p-2 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between font-mono">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    FACE VERIFIED & EMBEDDED
                  </span>
                  <span className="text-emerald-400 font-bold">128-D VECTOR OK</span>
                </div>
              )}
            </div>

            {!capturedPhoto && (
              <button type="button" onClick={switchCamera} className="corporate-btn-secondary w-full !py-2 text-xs">
                Switch to {facingMode === 'user' ? 'rear' : 'front'} camera
              </button>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              {!capturedPhoto ? (
                <button
                  type="button"
                  onClick={handleCaptureFace}
                  disabled={capturing || !streamActive || !modelsReady}
                  className="w-full corporate-btn-brand !py-3 !text-sm gap-2 shadow-md shadow-brand-500/20"
                >
                  {capturing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Face Biometrics...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>{modelsReady ? 'Capture & Verify Face Biometrics' : 'Preparing face verification…'}</span>
                    </>
                  )}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCapturedPhoto(null);
                      setCapturedDescriptor(null);
                      initCamera();
                    }}
                    className="corporate-btn-secondary !py-2.5 !px-4 !text-xs"
                  >
                    Retake Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="flex-1 corporate-btn-brand !py-2.5 !text-xs gap-1.5"
                  >
                    <span>Next: Enroll Fingerprint</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: DEVICE AUTHENTICATOR ENROLLMENT */}
        {step === 2 && (
          <div className="space-y-5 animate-fadeIn">
            <div>
                <span className="corporate-badge-blue text-xs uppercase tracking-wider mb-1.5">
                Step 2 of 3: Device Authenticator
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Set up device biometrics
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Register this device's passkey authenticator. Android can use its fingerprint or screen lock; other devices may use their own biometric or PIN. The browser never reveals fingerprint data.
              </p>
            </div>

            {/* METHOD 1: PHYSICAL HARDWARE SENSOR */}
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-white border-2 border-slate-200 mx-auto flex items-center justify-center text-brand-600 shadow-sm">
                  <Fingerprint className={`w-9 h-9 ${isScanningHw ? 'text-brand-600 animate-pulse' : 'text-slate-400'}`} />
                </div>

                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">
                    Device Authenticator Registration
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Continue with your device's passkey prompt. On Android, Chrome can verify using fingerprint or screen lock.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleHardwareEnroll}
                  disabled={isScanningHw || Boolean(fpTemplate)}
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

                {fpTemplate && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-center gap-2 animate-fadeIn font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Device credential verified by the server</span>
                  </div>
                )}
              </div>
            {/* Step 2 Action Buttons */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="corporate-btn-secondary !py-2.5 !px-3 !text-xs"
                >
                  Back to Face
                </button>

                {fpTemplate ? (
                  <>
                    <button
                      type="button"
                      onClick={resetFpEnrollment}
                      className="corporate-btn-secondary !py-2.5 !px-3 !text-xs"
                    >
                      Rescan
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="flex-1 corporate-btn-brand !py-2.5 !text-xs gap-1.5"
                    >
                      <span>Next: Profile Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-between px-2 text-xs">
                    <span className="text-slate-500 italic text-[11px]">Fingerprint setup is optional.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFpTemplate(null);
                        setStep(3);
                      }}
                      className="text-slate-500 hover:text-slate-700 underline text-[11px]"
                    >
                      Skip fingerprint (Face ID only)
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* STEP 3: BASIC PROFILE INFORMATION */}
        {step === 3 && (
        <form onSubmit={handleSaveAll} className="space-y-4 animate-fadeIn">
            <div>
              <span className="corporate-badge-blue text-xs uppercase tracking-wider mb-1.5">
                Step 3 of 3: Profile Details
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Review & Confirm Profile Details
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Your basic registration details have been pre-filled below. Review and adjust any values before proceeding to your dashboard.
              </p>
            </div>

            {/* Pre-fill Notification Banner */}
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Basic profile information retrieved from your signup registration. All rows are pre-filled below.</span>
            </div>

            {/* Biometric Status Summary Pill */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-800">Enrolled Biometrics:</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="text-emerald-700 font-bold">Face ID Active</span>
                <span>•</span>
                {fpTemplate ? (
                  <span className="text-cyan-700 font-bold">Device Authenticator Registered</span>
                ) : (
                  <span className="text-slate-400">Fingerprint: Skipped</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="corporate-input !py-2"
                placeholder="Full Legal Name"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                required
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="corporate-input !py-2"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">Sex
                <select value={sex} onChange={(e) => setSex(e.target.value)} className="corporate-input mt-1 !py-2">
                  <option value="">Select if known</option><option value="Female">Female</option><option value="Male">Male</option><option value="Intersex">Intersex</option><option value="Prefer not to say">Prefer not to say</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">Blood group
                <select value={bloodType} onChange={(e) => setBloodType(e.target.value)} className="corporate-input mt-1 !py-2">
                  <option value="">Select if known</option>{['A+','A−','B+','B−','AB+','AB−','O+','O−','Unknown'].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">Genotype (optional)
                <input value={genotype} onChange={(e) => setGenotype(e.target.value)} maxLength={20} placeholder="e.g. AA, AS" className="corporate-input mt-1 !py-2" />
              </label>
              <label className="text-xs font-semibold text-slate-700">Nationality
                <input value={nationality} onChange={(e) => setNationality(e.target.value)} maxLength={100} className="corporate-input mt-1 !py-2" />
              </label>
            </div>
            <label className="block text-xs font-semibold text-slate-700">Home address
              <textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} maxLength={500} placeholder="Street, city, state/region, country" className="corporate-input mt-1 !py-2" />
            </label>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
              <div>
                <h3 className="text-xs font-bold text-slate-800">Medical information</h3>
                <p className="mt-1 text-[10px] text-slate-500">Optional. These are saved as self-reported details for clinician review and can’t be edited from the patient account later.</p>
              </div>
              {[
                ['Existing conditions', conditions, setConditions, 'e.g. diabetes, asthma, epilepsy'],
                ['Allergies and reactions', allergies, setAllergies, 'e.g. penicillin — rash; peanuts — swelling'],
                ['Current medications', medications, setMedications, 'Medication, dose, and frequency if known'],
                ['Previous surgeries and major treatments', surgeries, setSurgeries, 'Procedure, year, and hospital if known'],
                ['Important medical history', medicalHistory, setMedicalHistory, 'Admissions, serious injuries, seizures, fainting, transfusions, or other relevant history']
              ].map(([label, value, setter, placeholder]) => <label key={label} className="block text-[11px] font-semibold text-slate-600">{label}
                <textarea value={value} onChange={(e) => setter(e.target.value)} rows={2} maxLength={2000} placeholder={placeholder} className="corporate-input mt-1 !px-3 !py-2" />
              </label>)}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <PhoneCall className="w-4 h-4 text-emerald-600" />
                <span>Next of Kin (Emergency Contact)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Full Name (e.g. Mary Wright)"
                  value={emergName}
                  onChange={(e) => setEmergName(e.target.value)}
                  className="corporate-input !py-1.5 !text-xs"
                />
                <input
                  type="tel"
                  placeholder="Phone Number(s), use commas for multiple"
                  value={emergPhone}
                  onChange={(e) => setEmergPhone(e.target.value)}
                  className="corporate-input !py-1.5 !text-xs"
                />
              </div>
              <input
                type="email"
                placeholder="Contact Email (Optional)"
                value={emergEmail}
                onChange={(e) => setEmergEmail(e.target.value)}
                className="corporate-input !py-1.5 !text-xs"
              />
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
                <input type="checkbox" checked={whatsappOptIn} onChange={(e) => setWhatsappOptIn(e.target.checked)} className="mt-0.5 accent-brand-700" />
                <span>I confirm these emergency contacts have agreed to receive WhatsApp emergency alerts.</span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="corporate-btn-secondary !py-3 !px-4 !text-xs"
              >
                Back to Fingerprint
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 corporate-btn-brand !py-3 !text-sm gap-2 shadow-md shadow-brand-500/25"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Save & Proceed to Dashboard</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
