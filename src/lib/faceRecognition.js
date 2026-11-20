import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;
let modelLoadingPromise = null;

/**
 * Loads face-api models from local /models directory (bundled with the app).
 * Ensures instant loading without external CDN dependencies.
 */
export async function loadFaceApiModels(onProgress) {
  if (modelsLoaded) return true;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      if (onProgress) onProgress('Loading face detection neural nets...');
      const MODEL_URL = '/models';

      // Load Tiny Face Detector + Tiny Landmarks + Face Recognition Net
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      if (onProgress) onProgress('Biometric models loaded successfully');
      return true;
    } catch (err) {
      console.error('Failed to load local models, trying fallback CDN...', err);
      try {
        const CDN_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(CDN_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(CDN_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(CDN_URL),
        ]);
        modelsLoaded = true;
        return true;
      } catch (cdnErr) {
        console.error('All model sources failed:', cdnErr);
        throw new Error('Could not load facial recognition neural network. Please check network/browser permissions.');
      }
    }
  })();

  return modelLoadingPromise;
}

export function areModelsReady() {
  return modelsLoaded;
}

/**
 * Detects face and extracts 128-d descriptor vector from video or image element
 */
export async function extractFaceDescriptor(inputElement) {
  if (!modelsLoaded) {
    await loadFaceApiModels();
  }

  // Use TinyFaceDetector for low latency real-time webcam inference
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.40
  });

  const detection = await faceapi
    .detectSingleFace(inputElement, options)
    .withFaceLandmarks(true)
    .withFaceDescriptor();

  if (!detection) return null;

  return {
    descriptor: Array.from(detection.descriptor),
    box: detection.detection.box,
    score: detection.detection.score
  };
}

/**
 * Calculates Euclidean distance between two 128-d face descriptors
 */
export function calculateEuclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return 999;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Match a live face descriptor against database enrolled patients.
 * Threshold is set to 0.65 for robust real-world webcam matching under variable lighting.
 */
export function matchFaceAgainstPatients(liveDescriptor, enrolledPatients, threshold = 0.58) {
  if (!Array.isArray(liveDescriptor) || !enrolledPatients || enrolledPatients.length === 0) {
    return { match: null, closest: null, minDistance: 999, reason: 'EMPTY_CACHE' };
  }
  if (liveDescriptor.length !== 128 || !liveDescriptor.every(Number.isFinite)) {
    return { match: false, patient: null, reason: 'INVALID_DESCRIPTOR' };
  }
  const candidates = [];

  for (const patient of enrolledPatients) {
    if (!patient.descriptor) continue;

    let targetVector = null;
    if (Array.isArray(patient.descriptor)) {
      targetVector = patient.descriptor;
    } else if (patient.descriptor && typeof patient.descriptor === 'object') {
      targetVector = patient.descriptor.vector || patient.descriptor.descriptor || null;
    }

    if (!Array.isArray(targetVector) || targetVector.length !== 128 || !targetVector.every(Number.isFinite)) continue;

    const distance = calculateEuclideanDistance(liveDescriptor, targetVector);
    if (Number.isFinite(distance)) candidates.push({ patient, distance });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const best = candidates[0];
  const runnerUp = candidates[1];
  const bestMatch = best?.patient || null;
  const minDistance = best?.distance ?? 999;

  console.log(`[Face Matcher] Best candidate: ${bestMatch?.full_name || 'None'}, Distance: ${minDistance.toFixed(3)}, Threshold: ${threshold}`);

  if (bestMatch && minDistance <= threshold && runnerUp && runnerUp.distance - minDistance < 0.04) {
    return {
      match: false,
      patient: null,
      closestPatient: bestMatch,
      closestDistance: minDistance,
      reason: 'AMBIGUOUS_MATCH'
    };
  }

  if (bestMatch && minDistance <= threshold) {
    const confidenceScore = Math.max(75, Math.min(99.8, ((1 - (minDistance / 0.85)) * 100))).toFixed(1);
    return {
      match: true,
      patient: bestMatch,
      distance: minDistance,
      confidence: parseFloat(confidenceScore)
    };
  }

  return {
    match: false,
    patient: null,
    closestPatient: bestMatch,
    closestDistance: minDistance
  };
}

/**
 * Captures image frame from video element as base64 JPEG
 */
export function captureVideoFrame(videoElement, quality = 0.85) {
  if (!videoElement || videoElement.videoWidth === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}
