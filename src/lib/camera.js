function explainCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera access was blocked. Allow camera access for localhost in your browser, then enable Camera access and desktop app access in Windows Privacy & security settings.';
    case 'NotFoundError':
      return 'No camera was found. Connect or enable a camera, then try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The browser detected a camera but Windows would not open its video stream (NotReadableError). Close Camera, Teams, Zoom, and other browser tabs using the camera. Check the privacy shutter and Windows camera access settings, then retry.';
    case 'SecurityError':
      return 'Camera access requires localhost or a secure HTTPS site. Open MED-ID at http://localhost or its HTTPS address.';
    case 'OverconstrainedError':
      return 'The selected camera does not support the requested settings. Choose another camera and retry.';
    default:
      return error?.message || 'The browser could not start a camera. Check browser and Windows camera permissions.';
  }
}

export async function startCameraStream(facingMode = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not provide camera access. Use a current browser at localhost or an HTTPS site.');
  }

  const preferred = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferred);
  } catch (firstError) {
    if (!['OverconstrainedError', 'NotReadableError', 'AbortError'].includes(firstError?.name)) {
      throw new Error(explainCameraError(firstError));
    }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    } catch (fallbackError) {
      if (['NotReadableError', 'OverconstrainedError', 'AbortError'].includes(fallbackError?.name)) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices.filter(device => device.kind === 'videoinput');
          for (const camera of cameras) {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { deviceId: { exact: camera.deviceId } }
              });
            } catch {
              // Continue to the next camera source.
            }
          }
          if (cameras.length > 1) {
            throw new Error(`Windows found ${cameras.length} cameras, but could not open any. Close apps using them and check Windows camera permissions.`);
          }
        } catch (deviceError) {
          if (deviceError instanceof Error && deviceError.message.startsWith('Windows found')) throw deviceError;
        }
      }
      throw new Error(explainCameraError(fallbackError));
    }
  }
}

export function stopCameraStream(stream) {
  stream?.getTracks?.().forEach(track => track.stop());
}
