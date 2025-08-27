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
  if (!permanentWordElement) return;

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
  if (isSpinning || !permanentWordElement) return;
  
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
    
    // If we were recording, stop after word is finalized
    if (isRecording) {
      setTimeout(() => {
        stopVideoRecording();
      }, 1000); // Give 1 second to see the final result
    }
  }, 3000);
}

// Recording functionality (adapted from reference)
let pressTimer;

function startPress() {
  if (isRecording || isSpinning) return;
  recorderContainer.classList.add('active');
  pressTimer = setTimeout(() => {
    pressTimer = null;
    startWordRoulette(true); // Siempre hace ruleta con grabación
  }, 350); // long press threshold
}

function endPress() {
  recorderContainer.classList.remove('active');
  if (pressTimer) {
    // Short press - también hace ruleta con grabación
    clearTimeout(pressTimer);
    pressTimer = null;
    if (!isRecording && !isSpinning) {
      startWordRoulette(true); // Ruleta con grabación en short press también
    }
  }
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
  
  // Auto-stop after 8 seconds max
  setTimeout(() => {
    if (isRecording) {
      stopVideoRecording();
    }
  }, 8000);
  
  beginCompositeRecording();
}

function beginCompositeRecording() {
  const composed = document.createElement('canvas');
  composed.width = Math.min(canvas.width, 1280);
  composed.height = Math.min(canvas.height, 720);
  const ctx = composed.getContext('2d');
  const fps = 20;
  
  const draw = async () => {
    if (!isRecording) return;
    
    ctx.clearRect(0, 0, composed.width, composed.height);
    
    // 1. Draw webcam background
    if (webcamEl.videoWidth) {
      drawWebcamCover(ctx, webcamEl, composed.width, composed.height);
    }
    
    // 2. Capture HTML elements (rings and text) using html2canvas-like approach
    await captureHTMLElements(ctx, composed.width, composed.height);
    
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

async function captureHTMLElements(ctx, canvasWidth, canvasHeight) {
  const scaleX = canvasWidth / window.innerWidth;
  const scaleY = canvasHeight / window.innerHeight;
  
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
  
  // Draw text
  if (permanentWordElement && permanentWordElement.style.opacity !== '0') {
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
  
  // Try to share first, then fallback to download
  if (!forceDownload && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (err) {
      console.warn('Share canceled or failed:', err);
      download();
    }
  } else {
    download();
  }
}

// Start the application
init();
