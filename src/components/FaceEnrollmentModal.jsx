import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, 
  CameraOff, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Sparkles,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { extractFaceDescriptor, captureVideoFrame, loadFaceApiModels } from '../lib/faceRecognition';
import { savePatientBiometrics } from '../lib/supabase';
import { startCameraStream, stopCameraStream } from '../lib/camera';

export default function FaceEnrollmentModal({ 
  isOpen, 
  onClose, 
  patientId, 
  onEnrollmentSuccess 
}) {
  const videoRef = useRef(null);
  const cameraRequestIdRef = useRef(0);
  const [streamActive, setStreamActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [facingMode, setFacingMode] = useState('user');

  useEffect(() => {
    if (isOpen) {
      setSuccess(false);
      setErrorMsg('');
      initModelsAndCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const initModelsAndCamera = async () => {
    try {
      await loadFaceApiModels();
      setModelsReady(true);
      startCamera();
    } catch (err) {
      console.error('Failed to init models for enrollment:', err);
      setErrorMsg('Failed to initialize biometric models: ' + err.message);
    }
  };

  const startCamera = async () => {
    const requestId = ++cameraRequestIdRef.current;
    let stream = null;
    try {
      stream = await startCameraStream(facingMode);
      if (requestId !== cameraRequestIdRef.current || !isOpen) {
        stopCameraStream(stream);
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreamActive(true);
      }
    } catch (err) {
      console.error('Camera access error:', err);
      stopCameraStream(stream);
      if (requestId !== cameraRequestIdRef.current || !isOpen) return;
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
      if (requestId !== cameraRequestIdRef.current || !isOpen) {
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
      if (requestId !== cameraRequestIdRef.current || !isOpen) return;
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

  const handleCaptureAndEnroll = async () => {
    if (!videoRef.current || !streamActive) return;
    setErrorMsg('');
    setCapturing(true);

    try {
      // 1. Detect face and compute 128-d descriptor
      const detection = await extractFaceDescriptor(videoRef.current);
      if (!detection || !detection.descriptor) {
        throw new Error('No clear face detected in the frame. Please look directly at the camera with good lighting.');
      }

      // 2. Capture preview frame
      const photoBase64 = captureVideoFrame(videoRef.current, 0.85);
      if (!photoBase64) {
        throw new Error('Failed to capture frame snapshot.');
      }

      // 3. Save to Supabase
      const updatedPatient = await savePatientBiometrics(
        patientId,
        detection.descriptor,
        photoBase64
      );

      setSuccess(true);
      confetti({
        particleCount: 80,
        spread: 80,
        origin: { y: 0.6 }
      });

      stopCamera();
      if (onEnrollmentSuccess) {
        onEnrollmentSuccess(updatedPatient);
      }

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      console.error('Enrollment error:', err);
      setErrorMsg(err.message || 'Failed to enroll biometric face data.');
    } finally {
      setCapturing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="corporate-card max-w-lg w-full p-6 sm:p-8 relative shadow-2xl border border-slate-200">
        
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <span className="corporate-badge-blue text-xs uppercase tracking-wider mb-1.5">
            Biometric Enrollment Station
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Register Emergency Face ID
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Look into either camera. A 128-dimensional face representation and enrollment photo are stored in your patient record for emergency identification.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div className="font-medium">
              Biometric enrollment complete! Your emergency face ID is now active in the database.
            </div>
          </div>
        )}

        {/* Live Camera Box with Face Oval Guide */}
        <div className="relative aspect-video w-full rounded-2xl bg-slate-950 overflow-hidden border border-slate-800 flex items-center justify-center mb-5">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${streamActive ? 'block' : 'hidden'}`}
          />

          {!streamActive && (
            <div className="text-center p-6 text-slate-400">
              <Camera className="w-10 h-10 mx-auto mb-2 text-slate-500" />
              <p className="text-xs">Starting camera feed...</p>
            </div>
          )}

          {/* Alignment Oval Guide */}
          {streamActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-60 border-2 border-dashed border-brand-400/70 rounded-[50%] shadow-[0_0_20px_rgba(2,132,199,0.3)] flex items-center justify-center">
                <span className="text-[10px] font-mono font-bold text-brand-300 bg-slate-950/70 px-2 py-0.5 rounded">
                  ALIGN FACE HERE
                </span>
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={switchCamera} disabled={!streamActive || capturing} className="w-full mb-4 text-xs text-brand-700 hover:text-brand-900 disabled:opacity-50">
          Switch to {facingMode === 'user' ? 'rear' : 'front'} camera
        </button>

        {/* Action Controls */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCaptureAndEnroll}
            disabled={capturing || !streamActive || success}
            className="w-full corporate-btn-brand !py-3 !text-sm gap-2 disabled:opacity-50 shadow-md shadow-brand-500/20"
          >
            {capturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Extracting Biometrics & Saving...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Enrolled Successfully!</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4" />
                <span>Capture & Save Emergency Biometrics</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Face representation stored in your Supabase patient record.</span>
          </div>
        </div>

      </div>
    </div>
  );
}
