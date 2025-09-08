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
    if (webcamEl.videoWidth > 0 && webcamEl.videoHeight > 0) {
      try {
        const results = await faceDetector.detectForVideo(webcamEl, performance.now());
        currentFaces = results.detections || [];
        drawOverlay();
      } catch (error) {
        console.warn('Face detection error:', error);
      }
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
  const fps = 20;
  
  const draw = async () => {
    if (!isRecording) return;
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
    videoBitsPerSecond: 3000000
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
    particles.forEach(particleData => {
      const particle = particleData.element;
      const rect = particle.getBoundingClientRect();
      
      const x = rect.left * scaleX;
      const y = rect.top * scaleY;
      const diameter = rect.width * Math.min(scaleX, scaleY); // Use minimum scale to maintain aspect ratio
      
      // Get computed styles
      const styles = window.getComputedStyle(particle);
      const backgroundColor = styles.backgroundColor;
      const opacity = styles.opacity;
      
      // Draw particle as perfect circle
      ctx.save();
      ctx.globalAlpha = 1.0; // Always fully opaque
      ctx.fillStyle = backgroundColor;
      ctx.beginPath();
      ctx.arc(x + (rect.width * scaleX)/2, y + (rect.height * scaleY)/2, diameter/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
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
  // Colors from Figma particles group
  const figmaColors = [
    '#00FFFF', // Cian brillante
    '#C77DFF', // Morado claro
    '#3D348B', // Azul oscuro/morado
    '#7209B7'  // Morado medio
  ];
  
  const particleCount = 25;
  
  // Define button exclusion zones
  const buttonZones = [
    // Record button area (bottom center)
    { x: window.innerWidth/2 - 100, y: window.innerHeight - 200, width: 200, height: 150 },
    // Particles toggle button area (bottom left of center) 
    { x: window.innerWidth/2 - 200, y: window.innerHeight - 200, width: 100, height: 150 }
  ];
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    // Find a position that doesn't overlap with buttons or face area
    let x, y;
    let attempts = 0;
  do {
      x = Math.random() * window.innerWidth;
      y = Math.random() * window.innerHeight;
      attempts++;
  } while (attempts < 200 && (isInButtonZone(x, y, buttonZones) || isInFaceArea(x, y)));
    
    // Create particle data object with much more varied sizes
    const particleData = {
      element: particle,
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 0.8, // Slower, more gentle movement
      vy: (Math.random() - 0.5) * 0.8,
      baseSize: 15 + Math.random() * 80, // Much larger and more varied sizes (15-95px)
      currentSize: 15 + Math.random() * 80,
      targetSize: 15 + Math.random() * 80,
      inertia: 0.96 + Math.random() * 0.03, // Much higher inertia for slower movement (0.96-0.99)
      autonomousMovement: {
        amplitude: 30 + Math.random() * 50, // Larger floating movement
        frequency: 0.0005 + Math.random() * 0.001, // Much slower frequency
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2
      },
      faceInfluence: 0.00002 + Math.random() * 0.00008, // Much weaker influence
      repulsionRadius: 120 + Math.random() * 180, // Increased base repulsion radius
      colorIndex: Math.floor(Math.random() * figmaColors.length),
      sizePhase: Math.random() * Math.PI * 2,
      sizeSpeed: 0.002 + Math.random() * 0.003, // Much slower size changes
      originalOpacity: 1.0, // Completely opaque - no transparency
      time: 0,
      buttonZones: buttonZones // Store reference for later use
    };
    
    // Set visual properties
    const color = figmaColors[particleData.colorIndex];
    particle.style.backgroundColor = color;
    particle.style.opacity = particleData.originalOpacity;
    particle.style.width = particleData.currentSize + 'px';
    particle.style.height = particleData.currentSize + 'px';
    particle.style.left = particleData.x + 'px';
    particle.style.top = particleData.y + 'px';
    
    // Remove CSS animations as we'll handle movement manually
    particle.style.animation = 'none';
    
    document.body.appendChild(particle);
    particles.push(particleData);
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
  const animateParticles = () => {
    // Update face position for particle repulsion
    updateFacePosition();
    
    particles.forEach((particleData, index) => {
      const particle = particleData.element;
      
      // Increment internal time for autonomous movement
      particleData.time += 1;
      
      // Autonomous movement - each particle moves in its own pattern
      const autonomousX = Math.sin(particleData.time * particleData.autonomousMovement.frequency + particleData.autonomousMovement.phaseX) * particleData.autonomousMovement.amplitude;
      const autonomousY = Math.cos(particleData.time * particleData.autonomousMovement.frequency + particleData.autonomousMovement.phaseY) * particleData.autonomousMovement.amplitude;
      
      // Add much gentler autonomous movement to velocity
      particleData.vx += autonomousX * 0.00005; // Much gentler movement
      particleData.vy += autonomousY * 0.00005;
      
      // Face repulsion and organic movement based on face movement
      if (currentFaces.length > 0) {
        const faceX = lastFaceCenterPx.x;
        const faceY = lastFaceCenterPx.y;

        const dx = particleData.x - faceX;
        const dy = particleData.y - faceY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Strict inner exclusion: never allow particles inside this
        const innerRadius = Math.max(120, lastFaceRadiusPx * 0.9);
        const outerRadius = Math.max(220, lastFaceRadiusPx * 1.8);
        if (distance < innerRadius) {
          const normalizedDx = dx / (distance || 1);
          const normalizedDy = dy / (distance || 1);
          // Push out strongly
          particleData.vx += normalizedDx * 0.2;
          particleData.vy += normalizedDy * 0.2;
          // Clamp position just outside innerRadius to avoid jitter
          const safeDist = innerRadius + 2;
          particleData.x = faceX + normalizedDx * safeDist;
          particleData.y = faceY + normalizedDy * safeDist;
        } else if (distance < outerRadius) {
          // Soft repulsion within outer radius
          const repulsionForce = (outerRadius - distance) / outerRadius;
          const normalizedDx = dx / distance || 0;
          const normalizedDy = dy / distance || 0;
          particleData.vx += normalizedDx * repulsionForce * 0.06;
          particleData.vy += normalizedDy * repulsionForce * 0.06;
        }

        // Additional repulsion based on original particle radius for extra safety
        if (distance < particleData.repulsionRadius) {
          const repulsionForce = (particleData.repulsionRadius - distance) / particleData.repulsionRadius;
          const normalizedDx = dx / distance || 0;
          const normalizedDy = dy / distance || 0;
          particleData.vx += normalizedDx * repulsionForce * 0.03;
          particleData.vy += normalizedDy * repulsionForce * 0.03;
        }
        
        // More organic movement based on face movement intensity
        if (faceMovementIntensity > 0.1) {
          // Add swirling motion when face moves - but keep away from face
          const swirl = Math.sin(particleData.time * 0.01 + index) * faceMovementIntensity * 0.002;
          const wave = Math.cos(particleData.time * 0.008 + index * 0.5) * faceMovementIntensity * 0.001;
          
          // Apply swirl motion perpendicular to face direction
          const perpX = -dy / (distance || 1);
          const perpY = dx / (distance || 1);
          
          particleData.vx += perpX * swirl;
          particleData.vy += perpY * wave;
          
          // Add some random organic movement away from face
          particleData.vx += (Math.random() - 0.5) * faceMovementIntensity * 0.001;
          particleData.vy += (Math.random() - 0.5) * faceMovementIntensity * 0.001;
        }
        
        // Very subtle influence from face movement (not attraction)
        particleData.vx += (Math.random() - 0.5) * particleData.faceInfluence;
        particleData.vy += (Math.random() - 0.5) * particleData.faceInfluence;
      } else {
        // No face - more random movement
        particleData.vx += (Math.random() - 0.5) * 0.003;
        particleData.vy += (Math.random() - 0.5) * 0.003;
      }
      
      // Apply velocity
      particleData.x += particleData.vx;
      particleData.y += particleData.vy;
      
      // Apply inertia/friction
      particleData.vx *= particleData.inertia;
      particleData.vy *= particleData.inertia;
      
      // Button avoidance - push particles away from button zones
      if (particleData.buttonZones) {
        particleData.buttonZones.forEach(zone => {
          const zoneX = zone.x + zone.width/2;
          const zoneY = zone.y + zone.height/2;
          const dx = particleData.x - zoneX;
          const dy = particleData.y - zoneY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const avoidanceRadius = Math.max(zone.width, zone.height) * 0.8;
          
          if (distance < avoidanceRadius && distance > 0) {
            const repulsionForce = (avoidanceRadius - distance) / avoidanceRadius;
            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            
            particleData.vx += normalizedDx * repulsionForce * 0.02;
            particleData.vy += normalizedDy * repulsionForce * 0.02;
          }
        });
      }
      
      // Boundary wrapping with padding
      const padding = 100;
      if (particleData.x < -padding) particleData.x = window.innerWidth + padding;
      if (particleData.x > window.innerWidth + padding) particleData.x = -padding;
      if (particleData.y < -padding) particleData.y = window.innerHeight + padding;
      if (particleData.y > window.innerHeight + padding) particleData.y = -padding;
      
      // Autonomous size changes - each particle pulses at its own rate
      particleData.sizePhase += particleData.sizeSpeed;
      
      // Base size multiplier from autonomous pulsing - much more subtle
      let baseSizeMultiplier = 0.9 + Math.sin(particleData.sizePhase) * 0.15; // Size varies from 0.75x to 1.05x (much more subtle)
      
      // Add very gentle scaling based on face movement intensity
      let movementScaleMultiplier = 1.0;
      if (currentFaces.length > 0) {
        // Much more gentle scaling when face is moving
        const maxIntensity = 20; // Higher threshold for more gentle effect
        const normalizedIntensity = Math.min(faceMovementIntensity / maxIntensity, 1);
        
        // Scale varies very gently from 0.95x to 1.1x based on movement
        movementScaleMultiplier = 0.95 + normalizedIntensity * 0.15;
        
        // Different particles react very slightly differently to movement
        const particleReactivity = 0.8 + (index % 3) * 0.1; // Much more subtle reactivity
        movementScaleMultiplier = 1 + (movementScaleMultiplier - 1) * particleReactivity;
      }
      
      const finalSize = particleData.baseSize * baseSizeMultiplier * movementScaleMultiplier;
      
      // Apply visual changes
      particle.style.left = particleData.x + 'px';
      particle.style.top = particleData.y + 'px';
      particle.style.width = finalSize + 'px';
      particle.style.height = finalSize + 'px';
      
      // Opacity - completely opaque always
      particle.style.opacity = 1.0;
    });
    
    if (particlesMode) {
      particleAnimationId = requestAnimationFrame(animateParticles);
    }
  };
  
  animateParticles();
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
