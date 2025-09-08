// MediaPipe Face Detection with Word Roulette
// Using MediaPipe Tasks Vision for face detection

// DOM elements
const webcamEl = document.getElementById('webcam');
const canvas = document.getElementById('overlay-canvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loading-overlay');
const tapOverlay = document.getElementById('tap-to-start');
const recorderButton = document.getElementById('recorder-button');
const recorderContainer = document.querySelector('.recorder-container');
const progressBar = document.querySelector('.progress-bar');
const flashElement = document.querySelector('.flash-element');
const previewContainer = document.getElementById('preview-container');
const previewVideo = document.getElementById('preview-video');
const previewImage = document.getElementById('preview-image');
const previewClose = document.getElementById('preview-close');
const previewShare = document.getElementById('preview-share');
const previewDownload = document.getElementById('preview-download');
const wordDisplay = document.getElementById('word-display');
const particlesToggle = document.getElementById('particles-toggle');

// State variables
let faceDetector;
let currentFaces = [];
let currentWord = 'Debugging Wizard 🧙'; // Palabra por defecto
let isSpinning = false;
let recorder, recordedChunks = [], isRecording = false, recordStartTs = 0;
let progressInterval, recordRAF = 0;
let currentFile = null;
let animationId;
let permanentWordElement = null;
// Long-press / freeze recording behavior
let pressTimer; // existing usage
let freezeActive = false; // when true, we stop updating dynamic content and keep last frame
let freezeFrame = null; // canvas holding frozen frame
let compositeCanvasRef = null; // reference to composite recording canvas
let stopTimeoutId = null; // scheduled delayed stop after release
// Tail recording (cola de 3s después de soltar)
const TAIL_RECORDING_MS = 3000; // duración extra tras soltar (+1s pedido)
let freezeStartTime = 0; // timestamp de cuando se congela el frame
let tailStopScheduled = false; // indica si la parada está programada pero aún no ejecutada

// Particles system state
let particlesMode = false;
let particles = [];
let particleAnimationId = null;
let lastFacePosition = { x: 0.5, y: 0.5 }; // Normalized face center position (0..1)
let lastFaceCenterPx = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }; // Screen-space center
let lastFaceRadiusPx = Math.min(window.innerWidth, window.innerHeight) * 0.12; // Approx face radius in px
let faceMovementIntensity = 0; // Track how much the face is moving

// Performance / tuning constants
const TARGET_RECORD_FPS = 30; // Aumentar fluidez de salida
const DETECTION_INTERVAL_MS = 66; // ~15 FPS detección para reducir carga
let lastDetectionTs = 0;
let lastCompositeFrameTs = 0;

// Word pool for the roulette
const words = [
  'Debugging Wizard 🧙',
  'Captain Stack Overflow 🧠',
  'Deadline Denier ⏳',
  'Sir Talks-a-Lot (in Meetings) 🎙️',
  'CSS Sorcerer 🎨',
  'Network Ninja ⚡',
  'Tab Hoarder 🧾',
  'Mad Dev Scientist 🧪',
  'The Code Poet 🖋️',
  'WiFi Wizard 📶',
  'Cloud Prophet ☁️',
  'Meme Lord 👑',
  'Tech Legend 🤘',
  'Ticket Slayer 🏴‍☠️'
];

// Initialize the application
async function init() {
  try {
    await initCamera();
    await initFaceDetection();
    setupEventListeners();
    createPermanentWordElement();
    startDetectionLoop();
    hideLoadingOverlay();
  } catch (error) {
    console.error('Initialization failed:', error);
    showError(error.message);
  }
}

async function initCamera() {
  try {
    // Check for HTTPS requirement
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('HTTPS required for camera access');
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not supported');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    
    webcamEl.srcObject = stream;
    await webcamEl.play();
    
    // Set canvas size to match video
    canvas.width = webcamEl.videoWidth || 1280;
    canvas.height = webcamEl.videoHeight || 720;
    
    console.log('Camera initialized successfully');
  } catch (error) {
    console.error('Camera initialization failed:', error);
    throw error;
  }
}

async function initFaceDetection() {
  try {
    // Use MediaPipe Tasks Vision API
    const { FaceDetector, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0');
    
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
    );
    
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5
    });
    
    console.log('Face detection initialized successfully');
  } catch (error) {
    console.error('Face detection initialization failed:', error);
    throw error;
  }
}

function startDetectionLoop() {
  async function detectFaces() {
    const now = performance.now();
    if (webcamEl.videoWidth > 0 && webcamEl.videoHeight > 0 && (now - lastDetectionTs) >= DETECTION_INTERVAL_MS) {
      lastDetectionTs = now;
      try {
        const results = await faceDetector.detectForVideo(webcamEl, now);
        currentFaces = results.detections || [];
      } catch (error) {
        // Silenciar errores intermitentes para mantener FPS
      }
      drawOverlay();
    }
    animationId = requestAnimationFrame(detectFaces);
  }
  
  detectFaces();
}

function createPermanentWordElement() {
  // Create a permanent word element that's always visible
  permanentWordElement = document.createElement('div');
  permanentWordElement.className = 'word-text';
  const inner = document.createElement('span');
  inner.className = 'word-inner';
  inner.textContent = currentWord;
  permanentWordElement.appendChild(inner);
  permanentWordElement.style.position = 'fixed';
  permanentWordElement.style.left = '50%';
  permanentWordElement.style.top = '20%';
  permanentWordElement.style.transform = 'translateX(-50%)';
  permanentWordElement.style.zIndex = '15';
  document.body.appendChild(permanentWordElement);
}

function updateWordPosition() {
  if (!permanentWordElement || particlesMode) return;

  if (currentFaces.length > 0 && webcamEl.videoWidth && webcamEl.videoHeight) {
    const face = currentFaces[0];
    const b = face.boundingBox;

    // Compute displayed video rect for object-fit: cover mapping
    const vw = webcamEl.videoWidth;
    const vh = webcamEl.videoHeight;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const videoAspect = vw / vh;
    const containerAspect = cw / ch;

    let displayW, displayH, offsetX, offsetY;
    if (videoAspect > containerAspect) {
      // video is wider than container: height matches, width cropped
      displayH = ch;
      displayW = ch * videoAspect;
      offsetX = (cw - displayW) / 2;
      offsetY = 0;
    } else {
      // video is taller: width matches, height cropped
      displayW = cw;
      displayH = cw / videoAspect;
      offsetX = 0;
      offsetY = (ch - displayH) / 2;
    }

    // Face bbox is in video pixel coordinates. Map to screen space.
    const faceCenterX = (b.originX + b.width / 2);
    const faceTopY = b.originY; // top of face in video px

    const screenX = offsetX + (faceCenterX / vw) * displayW;
    const screenTopY = offsetY + (faceTopY / vh) * displayH;

  // Place word well above eyes: use 0.6 of face height above top, clamp to min margin
  const faceHeightScreen = (b.height / vh) * displayH;
  const desiredY = screenTopY - faceHeightScreen * 0.6; // 60% of face height above top

    const marginTop = 10; // px from top to avoid leaving the screen
    const clampedY = Math.max(marginTop, desiredY);

    permanentWordElement.style.left = `${screenX}px`;
    permanentWordElement.style.top = `${clampedY}px`;
    permanentWordElement.style.transform = 'translateX(-50%)';
    permanentWordElement.style.opacity = '1';
  } else {
    // No face: keep near top-center
    permanentWordElement.style.left = '50%';
    permanentWordElement.style.top = '10%';
    permanentWordElement.style.transform = 'translateX(-50%)';
    permanentWordElement.style.opacity = '0.8';
  }
}

function stopDetectionLoop() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function drawOverlay() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Skip drawing if in particles mode
  if (particlesMode) {
    return;
  }
  
  // Update word position and draw rings for detected faces
  if (currentFaces.length > 0) {
  // Update word position based on current face
    updateWordPosition();
  } else {
    // Update word to center position if no face
    updateWordPosition();
  }
}

function drawWord(x, y) {
  // This function is now handled by HTML elements positioned above faces
  // The word positioning is managed in startWordRoulette function
  return;
}

function setupEventListeners() {
  // Particles toggle button
  particlesToggle.addEventListener('click', toggleParticlesMode);
  
  // Recorder button (hace ruleta Y graba automáticamente)
  recorderButton.addEventListener('pointerdown', startPress);
  recorderButton.addEventListener('pointerup', endPress);
  recorderButton.addEventListener('pointerleave', endPress);
  
  // Prevent context menu on long press
  recorderButton.addEventListener('contextmenu', e => e.preventDefault());
  
  // Preview controls
  previewClose.addEventListener('click', hidePreview);
  previewShare.addEventListener('click', () => {
    if (currentFile) {
      tryShareOrDownload(currentFile, currentFile.name);
    }
  });
  previewDownload.addEventListener('click', () => {
    if (currentFile) {
      tryShareOrDownload(currentFile, currentFile.name, true);
    }
  });
}

function hideLoadingOverlay() {
  loadingOverlay.style.display = 'none';
}

function showError(message) {
  const errorMsg = document.createElement('div');
  errorMsg.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(255,0,0,0.9); color: white; padding: 20px; border-radius: 10px;
    text-align: center; z-index: 1000; max-width: 90vw;
  `;
  
  if (message.includes('getUserMedia')) {
    errorMsg.innerHTML = 'Camera access denied.<br>Please allow camera permissions and refresh.';
  } else if (message.includes('HTTPS')) {
    errorMsg.innerHTML = 'Camera requires HTTPS.<br>Please visit the HTTPS version of this page.';
  } else {
    errorMsg.innerHTML = `Error: ${message}<br>Please check browser compatibility.`;
  }
  
  document.body.appendChild(errorMsg);
}

// Word roulette functionality
async function startWordRoulette(shouldRecord = false) {
  if (isSpinning || !permanentWordElement) return; // Removido particlesMode de aquí
  
  isSpinning = true;
  
  if (shouldRecord) {
    beginVideoRecording();
  }
  
  // Use the permanent word element for spinning
  permanentWordElement.className = 'word-text spinning';
  
  // Spin for 2 seconds
  const spinDuration = 2000;
  const spinInterval = 100;
  let spinTime = 0;
  
  const spinInterval_id = setInterval(() => {
    const randomWord = words[Math.floor(Math.random() * words.length)];
    currentWord = randomWord;
  const inner = permanentWordElement.querySelector('.word-inner');
  if (inner) inner.textContent = randomWord;
    
    spinTime += spinInterval;
    
    if (spinTime >= spinDuration) {
      clearInterval(spinInterval_id);
      finalizeRoulette();
    }
  }, spinInterval);
}

function finalizeRoulette() {
  if (!permanentWordElement) return;
  
  // Final word selection
  const finalWord = words[Math.floor(Math.random() * words.length)];
  currentWord = finalWord;
  const inner = permanentWordElement.querySelector('.word-inner');
  if (inner) inner.textContent = finalWord;
  permanentWordElement.className = 'word-text final';
  if (inner) inner.classList.add('final');
  
  // Keep the final effect for a bit, then return to normal
  setTimeout(() => {
    if (permanentWordElement) {
      permanentWordElement.className = 'word-text';
    }
    isSpinning = false;
  // Nota: ya no detenemos la grabación aquí; se detiene 3s después de soltar el botón.
  }, 3000);
}

// Recording functionality (long-press only)
function startPress() {
  if (isRecording || isSpinning) return;
  recorderContainer.classList.add('active');
  // Start a timer; only when it elapses we begin recording
  pressTimer = setTimeout(() => {
    pressTimer = null;
    // Start recording ONLY (no roulette now per new requirement)
    beginVideoRecording();
    // Lanzar ruleta (visual draw) mientras graba, sin que pare la grabación automáticamente
    if (!particlesMode) {
      startWordRoulette(false); // false => no intenta iniciar grabación de nuevo
    }
  }, 350); // long press threshold
}

function endPress() {
  recorderContainer.classList.remove('active');
  // Short tap: cancelar intención
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
    return;
  }
  // Long press activo: mantener grabación en vivo (sin freeze) por cola extra
  if (isRecording) {
    freezeActive = false; // asegurar draw continuo
    freezeFrame = null;
    freezeStartTime = performance.now();
    tailStopScheduled = true;
    if (stopTimeoutId) clearTimeout(stopTimeoutId);
    stopTimeoutId = setTimeout(() => {
      stopTimeoutId = null;
      tailStopScheduled = false;
      stopVideoRecording();
    }, TAIL_RECORDING_MS);
  }
}

// Capture and freeze last composite frame (stop dynamic overlays immediately)
function requestFreezeFrame() {
  freezeActive = true;
  if (compositeCanvasRef) {
    freezeFrame = document.createElement('canvas');
    freezeFrame.width = compositeCanvasRef.width;
    freezeFrame.height = compositeCanvasRef.height;
    const fctx = freezeFrame.getContext('2d');
    fctx.drawImage(compositeCanvasRef, 0, 0);
  }
  console.log('[Freeze] Frame congelado. Manteniendo grabación otros', TAIL_RECORDING_MS, 'ms');
}

function takePhoto() {
  // Flash effect
  flashElement.classList.add('flashing');
  setTimeout(() => flashElement.classList.remove('flashing'), 200);
  
  const composite = composeFrame();
  composite.toBlob(async blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
    showPreview(file, 'image');
  }, 'image/png');
}

function composeFrame() {
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = canvas.width;
  compositeCanvas.height = canvas.height;
  const compositeCtx = compositeCanvas.getContext('2d');
  
  // Draw webcam video
  if (webcamEl.videoWidth) {
    drawWebcamCover(compositeCtx, webcamEl, compositeCanvas.width, compositeCanvas.height);
  }
  
  // Draw overlay (face detection + words)
  compositeCtx.drawImage(canvas, 0, 0);
  
  return compositeCanvas;
}

function drawWebcamCover(ctx, video, dw, dh) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  
  const scale = Math.max(dw / vw, dh / vh);
  const sw = Math.floor(dw / scale);
  const sh = Math.floor(dh / scale);
  const sx = Math.floor((vw - sw) / 2);
  const sy = Math.floor((vh - sh) / 2);
  
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
}

function beginVideoRecording() {
  isRecording = true;
  recorderContainer.classList.add('recording');
  recordStartTs = performance.now();
  startProgressLoop();
  recordedChunks = [];
  // Reset freeze state for new session
  freezeActive = false;
  freezeFrame = null;
  if (stopTimeoutId) { clearTimeout(stopTimeoutId); stopTimeoutId = null; }
  tailStopScheduled = false;
  freezeStartTime = 0;
  
  // Auto-stop after 8 seconds max
  setTimeout(() => {
    if (isRecording) {
      tailStopScheduled = false; // Forzar parada inmediata al límite
      stopVideoRecording();
    }
  }, 8000);
  
  beginCompositeRecording();
}

function beginCompositeRecording() {
  const composed = document.createElement('canvas');
  const { width: cw, height: ch } = computeCompositeDimensions();
  composed.width = cw;
  composed.height = ch;
  const ctx = composed.getContext('2d');
  compositeCanvasRef = composed; // store reference
  const fps = TARGET_RECORD_FPS; // subir a 30fps para fluidez
  // NOTE Performance rationale:
  // - Antes: detection y composite cada RAF (~60) causando CPU alta + MediaRecorder 20fps => stutter
  // - Ahora: face detection throttled (~15fps) suficiente para UX, libera main thread
  // - Composite canvas limitado a 30fps target estable (frame pacing manual)
  // - Partículas: se evita getBoundingClientRect por partícula en cada frame de captura
  
  const draw = async () => {
    if (!isRecording) return;
    const now = performance.now();
    const frameInterval = 1000 / fps;
    if (now - lastCompositeFrameTs < frameInterval) {
      recordRAF = requestAnimationFrame(draw);
      return;
    }
    lastCompositeFrameTs = now;
    ctx.clearRect(0, 0, composed.width, composed.height);
    if (freezeActive) {
      // Draw stored frozen frame and continue until stop timeout
      if (freezeFrame) ctx.drawImage(freezeFrame, 0, 0);
    } else {
      // Normal dynamic drawing
      if (webcamEl.videoWidth) {
        drawWebcamCover(ctx, webcamEl, composed.width, composed.height);
      }
      await captureHTMLElements(ctx, composed.width, composed.height);
      // After drawing dynamic content, if freeze was requested mid-loop ensure we capture once
      if (freezeActive && !freezeFrame) {
        freezeFrame = document.createElement('canvas');
        freezeFrame.width = composed.width;
        freezeFrame.height = composed.height;
        freezeFrame.getContext('2d').drawImage(composed, 0, 0);
      }
    }
    
    recordRAF = requestAnimationFrame(draw);
  };
  
  const stream = composed.captureStream(fps);
  recorder = new MediaRecorder(stream, { 
    mimeType: pickSupportedMime(),
  videoBitsPerSecond: 4500000 // un poco más alto para suavizar compresión a 30fps
  });
  
  recorder.ondataavailable = e => { 
    if (e.data && e.data.size > 0) recordedChunks.push(e.data); 
  };
  recorder.onstop = onRecordingStop;
  recorder.start(500);
  draw();
}

// Compute responsive composite size matching current viewport aspect
function computeCompositeDimensions() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Target max dimension to balance quality & size
  const MAX_W = 1280;
  const MAX_H = 1280;
  let w = vw;
  let h = vh;
  // Scale down uniformly if exceeding max constraints
  const scale = Math.min(MAX_W / w, MAX_H / h, 1);
  w = Math.round(w * scale);
  h = Math.round(h * scale);
  // Ensure even numbers (some encoders favor even dimensions)
  if (w % 2) w -= 1;
  if (h % 2) h -= 1;
  return { width: Math.max(2, w), height: Math.max(2, h) };
}

async function captureHTMLElements(ctx, canvasWidth, canvasHeight) {
  const scaleX = canvasWidth / window.innerWidth;
  const scaleY = canvasHeight / window.innerHeight;
  
  // Draw particles if in particles mode
  if (particlesMode && particles.length > 0) {
    // Draw dot assets respecting depth (farther (more negative) first)
    const ordered = [...particles].sort((a,b) => a.depth - b.depth);
    for (const p of ordered) {
      const drawX = p.x * scaleX;
      const drawY = p.y * scaleY;
      const size = p.baseSize * scaleX; // uniform scale
      ctx.save();
      // Depth-based subtle alpha & blur hint (simulate atmospheric depth)
      const depthFactor = (p.depth + 400) / 400; // 0..1
      const alpha = 0.55 + depthFactor * 0.45; // near => more opaque
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.element.style.backgroundColor || '#ffffff';
      ctx.beginPath();
      ctx.arc(drawX - size/2, drawY - size/2, size/2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
  
  // Draw rings
  const ringsContainer = document.querySelector('.face-rings');
  if (ringsContainer && ringsContainer.style.display !== 'none') {
    const ringsRect = ringsContainer.getBoundingClientRect();
    const rings = ringsContainer.querySelectorAll('.ring');
    
    rings.forEach(ring => {
      const ringRect = ring.getBoundingClientRect();
      const x = ringRect.left * scaleX;
      const y = ringRect.top * scaleY;
      const width = ringRect.width * scaleX;
      const height = ringRect.height * scaleY;
      
      // Get computed styles
      const styles = window.getComputedStyle(ring);
      const borderColor = styles.borderColor;
      const borderWidth = parseInt(styles.borderWidth) * Math.min(scaleX, scaleY);
      
      // Draw ring
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      ctx.ellipse(x + width/2, y + height/2, width/2 - borderWidth/2, height/2 - borderWidth/2, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  
  // Draw text (only if not in particles mode)
  if (!particlesMode && permanentWordElement && permanentWordElement.style.opacity !== '0') {
    const textRect = permanentWordElement.getBoundingClientRect();
    const textX = (textRect.left + textRect.width/2) * scaleX;
    const textY = (textRect.top + textRect.height/2) * scaleY;
    
    // Get computed styles
    const styles = window.getComputedStyle(permanentWordElement);
    const fontSize = parseInt(styles.fontSize) * Math.min(scaleX, scaleY);
    const text = permanentWordElement.textContent;
    
    // Draw text background
    ctx.font = `bold ${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const padding = 20 * Math.min(scaleX, scaleY);
    
    // Background
    const bgGradient = ctx.createLinearGradient(textX - textWidth/2, textY - textHeight/2, textX + textWidth/2, textY + textHeight/2);
    bgGradient.addColorStop(0, 'rgba(138, 43, 226, 0.95)');
    bgGradient.addColorStop(1, 'rgba(75, 0, 130, 0.95)');
    
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.roundRect(textX - textWidth/2 - padding, textY - textHeight/2 - padding, textWidth + padding*2, textHeight + padding*2, 30);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 3 * Math.min(scaleX, scaleY);
    ctx.stroke();
    
    // Text
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, textX, textY);
  }
}

function stopVideoRecording() {
  // Guard para evitar parar antes de terminar la cola de 2s si está programada
  if (tailStopScheduled) {
    const elapsedTail = performance.now() - freezeStartTime;
    if (elapsedTail < TAIL_RECORDING_MS) {
      return; // aún no terminó la cola
    }
    tailStopScheduled = false; // permitir parada
  }
  if (!isRecording) return;
  isRecording = false;
  recorderContainer.classList.remove('recording');
  stopProgressLoop();
  
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  
  if (recordRAF) {
    cancelAnimationFrame(recordRAF);
    recordRAF = 0;
  }
}

function onRecordingStop() {
  if (recordedChunks.length === 0) {
    console.warn('No recorded data available');
    return;
  }
  
  const mimeType = recorder.mimeType || 'video/mp4';
  const blob = new Blob(recordedChunks, { type: mimeType });
  console.log(`Recording saved: ${(blob.size/1024/1024).toFixed(2)}MB, type: ${mimeType}`);
  
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `roulette_video_${Date.now()}.${extension}`, { type: mimeType });
  
  showPreview(file, 'video');
}

function pickSupportedMime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.420014', 
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8', 
    'video/webm'
  ];
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/mp4';
}

// Progress bar for recording
function startProgressLoop() {
  const circumference = 100.531; // 2*PI*16 for r=16
  progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
  progressBar.style.strokeDashoffset = circumference;
  
  progressInterval = setInterval(() => {
    if (!isRecording) return;
    
    const elapsed = performance.now() - recordStartTs;
    const maxDuration = 8000; // 8 seconds max
    const progress = Math.min(elapsed / maxDuration, 1);
    const offset = circumference - (progress * circumference);
    
    progressBar.style.strokeDashoffset = offset;
    
    if (progress >= 1) {
      stopProgressLoop();
    }
  }, 50);
}

function stopProgressLoop() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  // Reset progress bar
  progressBar.style.strokeDashoffset = 100.531;
}

// Preview functionality
function showPreview(file, type) {
  currentFile = file;
  const url = URL.createObjectURL(file);
  
  if (type === 'video') {
    previewVideo.src = url;
    previewVideo.style.display = 'block';
    previewImage.style.display = 'none';
  } else {
    previewImage.src = url;
    previewImage.style.display = 'block';
    previewVideo.style.display = 'none';
  }
  
  previewContainer.classList.add('visible');
  
  // Clean up URL after 30 seconds
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function hidePreview() {
  previewContainer.classList.remove('visible');
  previewVideo.src = '';
  previewImage.src = '';
  currentFile = null;
}

async function tryShareOrDownload(file, filename, forceDownload = false) {
  const download = () => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  if (!forceDownload && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      console.warn('Share canceled or failed:', err);
    }
  }
  download();
}

// Particles system functions
function toggleParticlesMode() {
  particlesMode = !particlesMode;
  
  if (particlesMode) {
    // Enable particles mode
    particlesToggle.classList.add('active');
    document.body.classList.add('particles-mode');
    createParticles();
    startParticlesAnimation();
  } else {
    // Disable particles mode
    particlesToggle.classList.remove('active');
    document.body.classList.remove('particles-mode');
    clearParticles();
    stopParticlesAnimation();
  }
}

function createParticles() {
  // === Figma Dots Assets implementation ===
  // Layout extracted relative to frame (width 630, height 926)
  // Columns: Large (294) at x=0 (y:0,316,632) | Medium (156) at x=346 (y:77,393,709) | Small (72) at x=558 (y:119,435,751)
  // Depth strategy: smaller / brighter dots appear nearer (higher z), large farther (lower z)
  clearParticles();
  const layoutWidth = 630;
  const layoutHeight = 926;
  // Colors placeholder (update with exact Figma palette if different)
  const DOT_COLORS = [
    '#00FFFF', '#C77DFF', '#3D348B', // large column (top->bottom)
    '#7209B7', '#5E2EA7', '#A45CFF', // medium column
    '#36E5FF', '#8A2BE2', '#B794F4'  // small column
  ];
  const specs = [
    { size:294, x:0,   y:0,   depth:-400, color:DOT_COLORS[0] },
    { size:294, x:0,   y:316, depth:-380, color:DOT_COLORS[1] },
    { size:294, x:0,   y:632, depth:-360, color:DOT_COLORS[2] },
    { size:156, x:346, y:77,  depth:-220, color:DOT_COLORS[3] },
    { size:156, x:346, y:393, depth:-200, color:DOT_COLORS[4] },
    { size:156, x:346, y:709, depth:-180, color:DOT_COLORS[5] },
    { size:72,  x:558, y:119, depth:-80,  color:DOT_COLORS[6] },
    { size:72,  x:558, y:435, depth:-60,  color:DOT_COLORS[7] },
    { size:72,  x:558, y:751, depth:-40,  color:DOT_COLORS[8] }
  ];
  // Scale group relative to viewport (shrink if too big)
  const baseScale = Math.min(window.innerWidth / (layoutWidth * 2.2), window.innerHeight / (layoutHeight * 1.8));
  const groupScale = Math.max(0.28, Math.min(0.55, baseScale));
  // Create container for 3D perspective
  let dotsContainer = document.getElementById('dots-assets-container');
  if (!dotsContainer) {
    dotsContainer = document.createElement('div');
    dotsContainer.id = 'dots-assets-container';
    dotsContainer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;perspective:1400px;z-index:12;';
    document.body.appendChild(dotsContainer);
  }
  specs.forEach((spec, idx) => {
    const el = document.createElement('div');
    el.className = 'particle dot-asset';
    el.style.position = 'absolute';
    el.style.width = spec.size * groupScale + 'px';
    el.style.height = spec.size * groupScale + 'px';
    el.style.borderRadius = '50%';
    el.style.background = spec.color;
    el.style.boxShadow = '0 0 25px -5px rgba(0,0,0,0.35)';
    el.style.willChange = 'transform';
    el.dataset.depth = spec.depth;
    dotsContainer.appendChild(el);
    particles.push({
      element: el,
      layoutX: spec.x,
      layoutY: spec.y,
      baseSize: spec.size * groupScale,
      depth: spec.depth,
      floatPhase: Math.random() * Math.PI * 2,
      floatSpeed: 0.004 + Math.random() * 0.003,
      floatAmp: 10 + Math.random() * 12,
      x: 0,
      y: 0
    });
  });
}

// Helper function to check if a position is in a button zone
function isInButtonZone(x, y, buttonZones) {
  return buttonZones.some(zone => {
    return x >= zone.x && x <= zone.x + zone.width && 
           y >= zone.y && y <= zone.y + zone.height;
  });
}

// Helper function to check if a position is in the face area
function isInFaceArea(x, y) {
  if (currentFaces.length === 0) return false;

  const dx = x - lastFaceCenterPx.x;
  const dy = y - lastFaceCenterPx.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const exclusion = Math.max(150, lastFaceRadiusPx * 1.2); // Buffer around face
  return distance < exclusion;
}

function clearParticles() {
  particles.forEach(particleData => {
    if (particleData.element && particleData.element.parentNode) {
      particleData.element.parentNode.removeChild(particleData.element);
    }
  });
  particles = [];
}

function startParticlesAnimation() {
  const animate = (ts) => {
    updateFacePosition();
    const faceX = lastFaceCenterPx.x;
    const faceY = lastFaceCenterPx.y;
    const faceR = lastFaceRadiusPx * 0.9; // exclusion radius
    particles.forEach((p, idx) => {
      // Base target from layout (center layout around face)
      const layoutWidth = 630; const layoutHeight = 926;
      const relX = p.layoutX - layoutWidth / 2;
      const relY = p.layoutY - layoutHeight / 2;
      // Parallax factor from depth (farther => smaller movement)
      const depthNorm = (p.depth + 400) / 400; // 0 (far) .. 1 (near)
      const parallax = 0.35 + 0.25 * depthNorm;
      let targetX = faceX + relX * (p.baseSize / 294) * 0.55 * parallax;
      let targetY = faceY + relY * (p.baseSize / 294) * 0.55 * parallax;
      // Floating motion
      p.floatPhase += p.floatSpeed;
      const floatY = Math.sin(p.floatPhase + idx) * p.floatAmp;
      const floatX = Math.cos(p.floatPhase * 0.8 + idx * 0.5) * p.floatAmp * 0.6;
      targetX += floatX;
      targetY += floatY;
      // Collision avoidance with face circle
      const dx = targetX - faceX;
      const dy = targetY - faceY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const minDist = faceR + p.baseSize/2 + 24; // margin
      if (dist < minDist) {
        const push = (minDist - dist);
        const nx = (dx || 0.0001)/ (dist || 1);
        const ny = (dy || 0.0001)/ (dist || 1);
        targetX += nx * push;
        targetY += ny * push;
      }
      p.x = targetX;
      p.y = targetY;
      // Depth scaling (slight) for perspective
      const depthScale = 1 + (depthNorm * 0.25);
      p.element.style.transform = `translate3d(${p.x - p.baseSize/2}px, ${p.y - p.baseSize/2}px, ${p.depth}px) scale(${depthScale})`;
    });
    if (particlesMode) particleAnimationId = requestAnimationFrame(animate);
  };
  animate();
}

function updateFacePosition() {
  if (currentFaces.length > 0 && webcamEl.videoWidth && webcamEl.videoHeight) {
    const face = currentFaces[0];
    const b = face.boundingBox;
    
    // Compute displayed video rect for object-fit: cover mapping
    const vw = webcamEl.videoWidth;
    const vh = webcamEl.videoHeight;
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const videoAspect = vw / vh;
    const containerAspect = cw / ch;

    let displayW, displayH, offsetX, offsetY;
    if (videoAspect > containerAspect) {
      displayH = ch;
      displayW = ch * videoAspect;
      offsetX = (cw - displayW) / 2;
      offsetY = 0;
    } else {
      displayW = cw;
      displayH = cw / videoAspect;
      offsetX = 0;
      offsetY = (ch - displayH) / 2;
    }

  // Convert face bbox to screen coordinates
  const faceScreenX = (b.originX / vw) * displayW + offsetX;
  const faceScreenY = (b.originY / vh) * displayH + offsetY;
  const faceScreenW = (b.width / vw) * displayW;
  const faceScreenH = (b.height / vh) * displayH;
  const centerX = faceScreenX + faceScreenW / 2;
  const centerY = faceScreenY + faceScreenH / 2;
  const approxRadius = Math.max(faceScreenW, faceScreenH) * 0.5;
    
    // Normalize to 0-1 range for smoother interpolation
  const targetX = centerX / cw;
  const targetY = centerY / ch;
    
    // Calculate movement intensity before updating position
    const deltaX = Math.abs(targetX - lastFacePosition.x);
    const deltaY = Math.abs(targetY - lastFacePosition.y);
    const currentMovement = deltaX + deltaY;
    
    // Update movement intensity with decay - much more gentle
    faceMovementIntensity = Math.max(currentMovement * 50, faceMovementIntensity * 0.95); // Reduced from 100 to 50
    
    // Smooth interpolation to avoid jittery movement
  lastFacePosition.x += (targetX - lastFacePosition.x) * 0.1;
  lastFacePosition.y += (targetY - lastFacePosition.y) * 0.1;
  // Update pixel center/radius for particle avoidance and placement checks
  lastFaceCenterPx.x = centerX;
  lastFaceCenterPx.y = centerY;
  // Smooth the radius a bit
  lastFaceRadiusPx = lastFaceRadiusPx * 0.9 + approxRadius * 0.1;
  } else {
    // No face detected - decay movement intensity
    faceMovementIntensity *= 0.95;
  }
}

function stopParticlesAnimation() {
  if (particleAnimationId) {
    cancelAnimationFrame(particleAnimationId);
    particleAnimationId = null;
  }
}

// Start the application
init();
