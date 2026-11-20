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
  UserCheck,
  User
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { extractFaceDescriptor, captureVideoFrame, loadFaceApiModels, detectFaceInFeed } from '../lib/faceRecognition';
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
  const [faceAligned, setFaceAligned] = useState(false);

  // Live face alignment tracker
  useEffect(() => {
    if (!isOpen || !streamActive || capturing || success) {
      setFaceAligned(false);
      return;
    }

    let isMounted = true;
    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || capturing) return;
      try {
        const check = await detectFaceInFeed(videoRef.current);
        if (isMounted) {
          setFaceAligned(Boolean(check?.detected));
        }
      } catch {
        // ignore live tracking errors
      }
    }, 450);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, streamActive, capturing, success]);

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
    setModelsReady(false);
    loadFaceApiModels().then(() => setModelsReady(true)).catch((err) => {
      console.error('Failed to init models for enrollment:', err);
      setErrorMsg('Failed to initialize biometric models: ' + err.message);
    });
    startCamera();
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
    if (!videoRef.current || !streamActive || !modelsReady) return;
    setErrorMsg('');
    setCapturing(true);

    try {
      // 1. Detect face and compute 128-d descriptor
      const detection = await extractFaceDescriptor(videoRef.current);
      if (!detection || !detection.descriptor) {
        throw new Error('No clear face detected in the frame. Please look directly at the camera with good lighting.');
      }

      // 2. Capture preview frame
      const photoBase64 = captureVideoFrame(videoRef.current, 0.72);
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
      <div className="corporate-card relative max-h-[92dvh] w-full max-w-lg overflow-y-auto border border-slate-200 p-4 shadow-2xl sm:p-8">
        
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

        {/* Live Camera Box with Biometric Oval Aperture */}
        <div className="relative w-full rounded-3xl bg-slate-950 min-h-[440px] sm:min-h-[500px] overflow-hidden border border-slate-800 flex flex-col justify-between p-4 mb-4 select-none">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 w-full h-full object-cover ${streamActive ? 'block' : 'hidden'}`}
          />

          {/* Top HUD Bar */}
          <div className="relative z-20 flex items-center justify-between w-full">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime-400 text-slate-950 font-black text-[11px] uppercase tracking-wider shadow-sm shadow-lime-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
              128-D BIOMETRIC ENGINE
            </span>
            <button 
              type="button" 
              onClick={switchCamera} 
              disabled={!streamActive || capturing} 
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-semibold backdrop-blur-md border border-slate-800 transition disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Flip</span>
            </button>
          </div>

          {!streamActive && (
            <div className="relative z-20 text-center p-8 text-slate-400 my-auto">
              <Camera className="w-10 h-10 mx-auto mb-2 text-lime-400 animate-pulse" />
              <p className="text-xs font-semibold text-slate-300">Initializing biometric camera…</p>
            </div>
          )}

          {/* Alignment Oval Aperture Mask */}
          {streamActive && (
            <div className="relative z-10 my-2 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Corner target reticles */}
                <div className="absolute -top-3.5 -left-3.5 w-6 h-6 border-t-2 border-l-2 border-lime-400/80 rounded-tl-lg" />
                <div className="absolute -top-3.5 -right-3.5 w-6 h-6 border-t-2 border-r-2 border-lime-400/80 rounded-tr-lg" />
                <div className="absolute -bottom-3.5 -left-3.5 w-6 h-6 border-b-2 border-l-2 border-lime-400/80 rounded-bl-lg" />
                <div className="absolute -bottom-3.5 -right-3.5 w-6 h-6 border-b-2 border-r-2 border-lime-400/80 rounded-br-lg" />

                {/* Oval Mask */}
                <div className={`w-64 h-80 sm:w-72 sm:h-92 rounded-[50%] overflow-hidden relative border-2 transition-all duration-300 biometric-oval-aperture ${
                  faceAligned ? 'border-lime-400 ring-4 ring-lime-400/25 active' : 'border-lime-400/60'
                }`}>
                  {capturing && (
                    <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-lime-400 to-transparent shadow-[0_0_15px_#a3e635] animate-biometric-laser z-20" />
                  )}

                  <div className="absolute inset-0 flex flex-col items-center justify-between p-5 opacity-30 pointer-events-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                    <div className="w-10 h-10 rounded-full border border-dashed border-lime-400" />
                    <div className="w-1.5 h-1.5 rounded-full bg-lime-400" />
                  </div>
                </div>
              </div>

              {/* Status Chip */}
              <div className="mt-3 pointer-events-auto">
                {capturing ? (
                  <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-950/90 text-cyan-300 border border-cyan-500/50 text-xs font-semibold backdrop-blur-md animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Extracting 128-D landmarks…</span>
                  </span>
                ) : faceAligned ? (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-lime-950/90 text-lime-300 border border-lime-500/60 text-xs font-semibold backdrop-blur-md">
                    <CheckCircle2 className="w-3.5 h-3.5 text-lime-400" />
                    <span>Full face detected — hold steady</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-slate-900/90 text-slate-300 border border-slate-700 text-xs font-medium backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span>Position face inside the oval</span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bottom Guidance */}
          <div className="relative z-20 text-center">
            <p className="text-[11px] text-slate-400">
              Look directly into the camera with good lighting so neural nets can map full facial contour.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleCaptureAndEnroll}
            disabled={capturing || !streamActive || !modelsReady || success}
            className="w-full py-3.5 px-6 rounded-2xl bg-lime-500 hover:bg-lime-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-lime-500/25 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {capturing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Extracting Biometrics & Saving...</span>
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                <span>Enrolled Successfully!</span>
              </>
            ) : (
              <>
                <Camera className="w-4 h-4 text-slate-950" />
                <span>{modelsReady ? 'Capture & Save Emergency Biometrics' : 'Preparing biometric engine…'}</span>
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
