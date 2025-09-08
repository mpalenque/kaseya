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
// New filter buttons logic
const filtersBar = document.getElementById('filters-bar');
let currentMode = 'none'; // none | draw | circles

// State variables
let faceDetector;
let currentFaces = [];
let currentWord = "What's my tech alter-ego?"; // Texto inicial antes del draw
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
// Rotación grupal en función de la posición de la cara (yaw y pitch simulados)
let groupYaw = 0;   // rotación Y (giro izquierda/derecha)
let groupPitch = 0; // rotación X (inclinación arriba/abajo)

// Smoothing variables for word tracking
let smoothWordX = window.innerWidth * 0.5; // Smoothed X position
let smoothWordY = window.innerHeight * 0.1; // Smoothed Y position
const WORD_SMOOTHING_FACTOR = 0.15; // Lower = more smooth, higher = more responsive
// Even smaller font sizes (fixed banner appearance in recording)
const WORD_BANNER_MIN_FONT = 6; // px
const WORD_BANNER_MAX_FONT = 14; // px
const WORD_BANNER_LINE_HEIGHT = 1.15;

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

// Add footer image preloading
let footerImage = null;

// Initialize the application
async function init() {
  try {
    await initCamera();
    await initFaceDetection();
    await preloadFooterImage(); // Preload footer for recording
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

async function preloadFooterImage() {
  return new Promise((resolve, reject) => {
    footerImage = new Image();
    footerImage.onload = () => resolve();
    footerImage.onerror = () => {
      console.warn('Footer image failed to load, recording will continue without footer');
      resolve(); // Continue even if footer fails
    };
    footerImage.src = 'footer.png';
  });
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
  autoFitWordBanner();
}

function updateWordPosition() {
  if (!permanentWordElement || particlesMode) return;

  let targetX = window.innerWidth * 0.5; // Default center
  let targetY = window.innerHeight * 0.1; // Default top

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

    // Set target positions
    targetX = screenX;
    targetY = clampedY;
    permanentWordElement.style.opacity = '1';
  } else {
    // No face: target default position
    targetX = window.innerWidth * 0.5;
    targetY = window.innerHeight * 0.1;
    permanentWordElement.style.opacity = '0.8';
  }

  // Apply smooth interpolation
  smoothWordX += (targetX - smoothWordX) * WORD_SMOOTHING_FACTOR;
  smoothWordY += (targetY - smoothWordY) * WORD_SMOOTHING_FACTOR;

  // Update element position with smoothed values
  permanentWordElement.style.left = `${smoothWordX}px`;
  permanentWordElement.style.top = `${smoothWordY}px`;
  permanentWordElement.style.transform = 'translateX(-50%)';
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
  // Filter buttons (delegation)
  filtersBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    selectFilterMode(mode);
  });
  
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
  if (inner) autoFitWordBanner();
    
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
  if (inner) autoFitWordBanner();
  
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
    // Según modo
    if (currentMode === 'draw') {
      startWordRoulette(false);
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
  // Create canvas with full viewport dimensions to include footer
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = window.innerWidth;
  compositeCanvas.height = window.innerHeight;
  const compositeCtx = compositeCanvas.getContext('2d');
  
  console.log(`Composing frame with canvas size: ${compositeCanvas.width}x${compositeCanvas.height}`);
  
  // Draw webcam video covering the full viewport
  if (webcamEl.videoWidth) {
    drawWebcamCover(compositeCtx, webcamEl, compositeCanvas.width, compositeCanvas.height);
  }
  
  // Scale and draw overlay to match full viewport
  const overlayScaleX = window.innerWidth / canvas.width;
  const overlayScaleY = window.innerHeight / canvas.height;
  compositeCtx.save();
  compositeCtx.scale(overlayScaleX, overlayScaleY);
  compositeCtx.drawImage(canvas, 0, 0);
  compositeCtx.restore();
  
  // Draw word text if visible and not in particles mode
  if (permanentWordElement && !particlesMode && permanentWordElement.style.opacity !== '0') {
    drawWordOnCanvas(compositeCtx, compositeCanvas.width, compositeCanvas.height);
  }
  
  // ALWAYS draw footer at bottom - this is critical
  console.log('Drawing footer on canvas...');
  drawFooterOnCanvas(compositeCtx, compositeCanvas.width, compositeCanvas.height);
  
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

function drawFooterOnCanvas(ctx, canvasWidth, canvasHeight) {
  // Use preloaded footer image
  if (!footerImage || !footerImage.complete) {
    console.warn('Footer image not loaded, skipping footer in recording');
    return;
  }
  
  // Calculate footer position (bottom center)
  const footerWidth = footerImage.naturalWidth || footerImage.width;
  const footerHeight = footerImage.naturalHeight || footerImage.height;
  
  if (!footerWidth || !footerHeight) {
    console.warn('Footer image dimensions not available');
    return;
  }
  
  // Scale footer proportionally to canvas size - doubled (was 40%, now 80%)
  const maxFooterWidth = canvasWidth * 0.8;
  const scale = Math.min(maxFooterWidth / footerWidth, 1);
  const scaledWidth = footerWidth * scale;
  const scaledHeight = footerHeight * scale;
  
  // Position at bottom center with some margin
  const x = (canvasWidth - scaledWidth) / 2;
  const y = canvasHeight - scaledHeight - 30; // 30px margin from bottom
  
  console.log(`Drawing footer at ${x}, ${y} with size ${scaledWidth}x${scaledHeight}`);
  ctx.drawImage(footerImage, x, y, scaledWidth, scaledHeight);
}

function drawWordOnCanvas(ctx, canvasWidth, canvasHeight) {
  if (!permanentWordElement) return;
  const rect = permanentWordElement.getBoundingClientRect();
  const inner = permanentWordElement.querySelector('.word-inner');
  const text = inner ? inner.textContent : permanentWordElement.textContent;
  const bannerX = rect.left;
  const bannerY = rect.top;
  const bannerW = rect.width;
  const bannerH = rect.height;
  const radius = 30;
  // Background gradient approximation
  const grad = ctx.createLinearGradient(bannerX, bannerY, bannerX + bannerW, bannerY + bannerH);
  grad.addColorStop(0, 'rgba(138,43,226,0.95)');
  grad.addColorStop(1, 'rgba(75,0,130,0.95)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRectPath(ctx, bannerX, bannerY, bannerW, bannerH, radius);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  // Text
  const computed = window.getComputedStyle(inner || permanentWordElement);
  ctx.font = `bold ${parseInt(computed.fontSize)}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, bannerX + bannerW / 2, bannerY + bannerH / 2);
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
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
    const rect = permanentWordElement.getBoundingClientRect();
    const inner = permanentWordElement.querySelector('.word-inner');
    const text = inner ? inner.textContent : permanentWordElement.textContent;
    const bannerX = rect.left * scaleX;
    const bannerY = rect.top * scaleY;
    const bannerW = rect.width * scaleX;
    const bannerH = rect.height * scaleY;
    const radius = 30 * Math.min(scaleX, scaleY);
    // Gradient background
    const bgGradient = ctx.createLinearGradient(bannerX, bannerY, bannerX + bannerW, bannerY + bannerH);
    bgGradient.addColorStop(0, 'rgba(138,43,226,0.95)');
    bgGradient.addColorStop(1, 'rgba(75,0,130,0.95)');
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    roundRectPath(ctx, bannerX, bannerY, bannerW, bannerH, radius);
    ctx.fill();
    ctx.lineWidth = 3 * Math.min(scaleX, scaleY);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
    // Text
    const computed = window.getComputedStyle(inner || permanentWordElement);
    const fontSize = parseInt(computed.fontSize) * Math.min(scaleX, scaleY);
    ctx.font = `bold ${fontSize}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bannerX + bannerW/2, bannerY + bannerH/2);
  }

  // Draw footer image (always include in recording) – mirrors composeFrame()
  // We draw it last so it appears over the video just like in the live UI.
  try {
    drawFooterOnCanvas(ctx, canvasWidth, canvasHeight);
  } catch (e) {
    console.warn('Footer draw failed in captureHTMLElements:', e);
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
    document.body.classList.add('particles-mode');
    createParticles();
    startParticlesAnimation();
  } else {
    document.body.classList.remove('particles-mode');
    clearParticles();
    stopParticlesAnimation();
  }
}

function selectFilterMode(mode) {
  if (!['none','draw','circles'].includes(mode)) return;
  if (currentMode === mode) return;
  currentMode = mode;
  const wrappers = Array.from(document.querySelectorAll('#filters-bar .filter-wrapper'));
  const order = ['none','circles','draw'];
  // Normalize active
  wrappers.forEach(w => w.classList.remove('active'));
  const centerWrapper = wrappers.find(w => w.dataset.mode === mode);
  if (!centerWrapper) return;
  centerWrapper.classList.add('active');
  // Ensure recorder container is appended inside active wrapper for proper pointer events
  const rc = document.querySelector('#filters-bar .recorder-container');
  if (rc && centerWrapper && rc.parentElement !== centerWrapper) {
    centerWrapper.appendChild(rc);
  }
  // Always show all: assign left/right cyclically
  const centerIndex = order.indexOf(mode);
  const leftIndex = (centerIndex - 1 + order.length) % order.length;
  const rightIndex = (centerIndex + 1) % order.length;
  wrappers.forEach(w => {
    if (w.dataset.mode === mode) w.dataset.pos = 'center';
    else if (w.dataset.mode === order[leftIndex]) w.dataset.pos = 'left';
    else if (w.dataset.mode === order[rightIndex]) w.dataset.pos = 'right';
  });
  if (permanentWordElement) {
    permanentWordElement.style.display = mode === 'draw' ? 'flex' : 'none';
  }
  // Particles only on circles
  if (mode === 'circles') { if (!particlesMode) toggleParticlesMode(); }
  else if (particlesMode) { toggleParticlesMode(); }
  if (mode !== 'draw') isSpinning = false;
}

document.addEventListener('DOMContentLoaded', () => { selectFilterMode('circles'); });

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
  const allSpecs = [...specs, ...specs.map(s => ({...s}))]; // duplicate for double amount
  let megaCount = 0;
  const MAX_MEGA = 2; // límite de mega círculos
  allSpecs.forEach((spec, idx) => {
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
  // Factor de escala heterogéneo (más variedad de tamaños grandes/pequeños)
  const sizeFactor = 0.45 + Math.random() * 1.8; // 0.45x a 2.25x
  // Nueva dispersión radial y diferentes inercias
  const inertia = 0.04 + Math.random() * 0.22; // rango más amplio
  const dispersion = 1.20 + Math.random() * 0.9; // mayor separación potencial
    const scatterAngle = Math.random() * Math.PI * 2;
  // Reducimos ligeramente radios para acercar un poco los laterales
  const scatterRadius = (spec.size > 200 ? 110 : spec.size > 100 ? 150 : 195) * (0.4 + Math.random()*0.75);
    const scatterOffsetX = Math.cos(scatterAngle) * scatterRadius;
    const scatterOffsetY = Math.sin(scatterAngle) * scatterRadius;
    // Tamaño base inicial
    let baseSize = spec.size * groupScale * sizeFactor;
    let isMega = false;
    // Mega círculos: 2x del más grande actual (que ya habíamos llevado a 1.4x) => 2.8x del original 294
    if (spec.size === 294 && megaCount < MAX_MEGA && Math.random() < 0.22) {
      baseSize = 294 * 1.4 * 2 * groupScale * (0.9 + Math.random()*0.2); // ~2.8x con ligera variación
      isMega = true;
      megaCount++;
    } else if (spec.size === 294 && Math.random() < 0.38) {
      // Super círculos (1.4x) cuando no son mega
      baseSize = 294 * 1.4 * groupScale * (0.9 + Math.random()*0.2);
    }
    particles.push({
      element: el,
      layoutX: spec.x,
      layoutY: spec.y,
  baseSize,
  isMega,
      depth: spec.depth,
      currentDepth: spec.depth,
      floatPhase: Math.random() * Math.PI * 2,
      floatSpeed: 0.004 + Math.random() * 0.003,
      floatAmp: 14 + Math.random() * 18,
      driftPhaseX: Math.random() * Math.PI * 2,
      driftPhaseY: Math.random() * Math.PI * 2,
      driftSpeedX: 0.0006 + Math.random() * 0.0009,
      driftSpeedY: 0.0006 + Math.random() * 0.0009,
      driftAmpX: 35 + Math.random() * 55,
      driftAmpY: 35 + Math.random() * 55,
      depthPhase: Math.random() * Math.PI * 2,
  depthSpeed: 0.0006 + Math.random() * 0.0018,
  depthAmp: (spec.size > 200 ? 120 : spec.size > 100 ? 160 : 210),
      x: 0,
      y: 0,
      smoothedX: 0,
      smoothedY: 0,
      inertia,
      dispersion,
      scatterOffsetX,
      scatterOffsetY,
      // Nueva variación radial (distancia base del centro)
      radialFactor: (spec.size > 200 ? 0.75 : spec.size > 100 ? 1.0 : 1.35) * (0.7 + Math.random()*1.2),
      radialPhase: Math.random()*Math.PI*2,
      radialOscAmp: 0.15 + Math.random()*0.35,
  radialOscSpeed: 0.0005 + Math.random()*0.0014,
  vx: 0,
  vy: 0,
  vz: 0,
  springK: 0.012 + Math.random()*0.018,
  damping: 0.80 + Math.random()*0.12,
  zPhase: Math.random()*Math.PI*2,
  zSpeed: 0.0004 + Math.random()*0.0009,
  zAmp: 60 + Math.random()*90,
  tiltPhase: Math.random()*Math.PI*2,
  tiltSpeed: 0.0005 + Math.random()*0.0012
    });
  });
  // Después de crear todos: tomar 3 más frontales (mayor depth, es decir menos negativo) y duplicar su tamaño
  // Filtramos evitando alterar mega ya extremadamente grandes para no romper composición
  const frontMost = [...particles]
    .sort((a,b)=> b.depth - a.depth) // depth -40 se vuelve primero
    .filter(p=> !p.isMega)
    .slice(0,3);
  frontMost.forEach(p => { p.baseSize *= 2; });
  // Ultra círculo: uno que sea el doble del más grande actual (post duplicaciones frontales)
  if (particles.length) {
    let largest = particles.reduce((m,p)=> p.baseSize>m.baseSize? p : m, particles[0]);
    // Evitar re-doblar si ya fue muy grande (limitar) usando factor máximo ~6x del original 294
    const ORIGINAL_MAX = 294;
    if (largest.baseSize < ORIGINAL_MAX * groupScale * 5.5) {
      largest.baseSize *= 2; // duplicar
      largest.isUltra = true;
    }
  }
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
    const faceR = lastFaceRadiusPx * 0.9;
    // Objetivos de rotación según la posición normalizada (más desplazamiento lateral => más yaw)
    const targetYaw = (lastFacePosition.x - 0.5) * 0.9;   // ~±0.9 rad (~±51°)
    const targetPitch = (lastFacePosition.y - 0.5) * 0.6; // ~±0.6 rad (~±34°)
    // Suavizado
    groupYaw += (targetYaw - groupYaw) * 0.07;
    groupPitch += (targetPitch - groupPitch) * 0.07;
    const cosY = Math.cos(groupYaw), sinY = Math.sin(groupYaw);
    const cosX = Math.cos(groupPitch), sinX = Math.sin(groupPitch);
    particles.forEach((p, idx) => {
      const layoutWidth = 630; const layoutHeight = 926;
      const relX = (p.layoutX - layoutWidth / 2);
      const relY = (p.layoutY - layoutHeight / 2);
      const relZ = p.depth * 0.5; // base Z comprimido
      // Profundidad dinámica
      p.depthPhase += p.depthSpeed;
      p.currentDepth = p.depth + Math.sin(p.depthPhase) * p.depthAmp;
      const depthNorm = (p.currentDepth + 600) / 600; // normalización extendida
  const parallax = 0.38 + 0.42 * depthNorm; // mayor rango de parallax
  const baseSpread = 1.05; // reducido para acercar un poco
      // Variación radial dinámica
      p.radialPhase += p.radialOscSpeed;
      const dynamicRadial = p.radialFactor + Math.sin(p.radialPhase)*p.radialOscAmp;
      // Rotación grupal (primero yaw Y luego pitch X)
      let x1 = relX * cosY + relZ * sinY;
      let z1 = -relX * sinY + relZ * cosY;
      let y1 = relY * cosX - z1 * sinX;
      let z2 = relY * sinX + z1 * cosX; // z final tras pitch
      const depthPerspective = 1 + (z2 / 1800); // ligera perspectiva
      let targetX = faceX + (x1 * (p.baseSize / 294) * baseSpread * p.dispersion * parallax * dynamicRadial * depthPerspective) + p.scatterOffsetX;
      let targetY = faceY + (y1 * (p.baseSize / 294) * baseSpread * p.dispersion * parallax * dynamicRadial * depthPerspective) + p.scatterOffsetY;
      // Movimiento flotante
      p.floatPhase += p.floatSpeed;
      targetX += Math.cos(p.floatPhase * 0.85 + idx * 0.4) * p.floatAmp * 0.55;
      targetY += Math.sin(p.floatPhase + idx) * p.floatAmp;
      // Drift independiente
      p.driftPhaseX += p.driftSpeedX;
      p.driftPhaseY += p.driftSpeedY;
      targetX += Math.sin(p.driftPhaseX) * p.driftAmpX;
      targetY += Math.cos(p.driftPhaseY) * p.driftAmpY;
      // Empuje mínimo para alejar de la cara (radio objetivo mayor)
      const dx = targetX - faceX;
      const dy = targetY - faceY;
      let dist = Math.sqrt(dx*dx + dy*dy);
      // Min dinámico (acercamos un poco globalmente reduciendo constantes)
  const desiredMin = faceR + p.baseSize * (0.32 + p.radialFactor*0.26) + 55 + (p.radialFactor*38); // menos buffer
      if (dist < desiredMin) {
        const nx = (dx || 0.0001) / (dist || 1);
        const ny = (dy || 0.0001) / (dist || 1);
        const push = (desiredMin - dist) * 1.1;
        targetX += nx * push;
        targetY += ny * push;
        dist = desiredMin;
      }
      // Física elástica (resorte + amortiguación) hacia target
      if (p.x === 0 && p.y === 0 && p.smoothedX === 0 && p.smoothedY === 0) {
        p.x = targetX; p.y = targetY;
      }
      const ex = targetX - p.x;
      const ey = targetY - p.y;
      p.vx += ex * p.springK;
      p.vy += ey * p.springK;
      p.vx *= p.damping;
      p.vy *= p.damping;
      p.x += p.vx;
      p.y += p.vy;
      // Movimiento Z extra suave
      p.zPhase += p.zSpeed;
      const zOffset = Math.sin(p.zPhase) * p.zAmp; // oscilación adicional
      const elasticDepth = p.currentDepth + zOffset + z2; // sumar rotación grupal
      // Escala según profundidad e inercia (más lejanos un poco más chicos)
      const depthScale = 0.55 + (depthNorm * 0.75);
      // Pequeña inclinación simulada según velocidad
      p.tiltPhase += p.tiltSpeed;
      const tiltX = (p.vy * 0.002) + Math.sin(p.tiltPhase)*2;
      const tiltY = (p.vx * -0.002) + Math.cos(p.tiltPhase*0.7)*2;
      p.element.style.transform = `translate3d(${(p.x - p.baseSize/2)}px, ${(p.y - p.baseSize/2)}px, ${elasticDepth}px) scale(${depthScale}) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
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

// Auto-fit logic: shrink font-size inside fixed banner until it fits height & width
function autoFitWordBanner() {
  if (!permanentWordElement) return;
  const inner = permanentWordElement.querySelector('.word-inner');
  if (!inner) return;
  // Reset to max
  inner.style.fontSize = WORD_BANNER_MAX_FONT + 'px';
  const containerW = permanentWordElement.clientWidth - 8; // subtract small padding
  const containerH = permanentWordElement.clientHeight - 8;
  let current = WORD_BANNER_MAX_FONT;
  // Iteratively reduce until fits
  while (current > WORD_BANNER_MIN_FONT) {
    const { scrollWidth, scrollHeight } = inner;
    if (scrollWidth <= containerW && scrollHeight <= containerH) break;
    current -= 2;
    inner.style.fontSize = current + 'px';
  }
}

// Re-fit on resize/orientation change
window.addEventListener('resize', () => {
  autoFitWordBanner();
});
