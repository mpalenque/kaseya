// Video capture and recording functionality
class VideoCapture {
  constructor() {
    this.recorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordStartTs = 0;
    this.progressInterval = null;
    this.recordRAF = 0;
    this.currentFile = null;
    
    // Freeze recording behavior
    this.freezeActive = false;
    this.freezeFrame = null;
    this.compositeCanvasRef = null;
    this.stopTimeoutId = null;
    this.freezeStartTime = 0;
    this.tailStopScheduled = false;
    
    // Tail recording (cola de 3s después de soltar)
    this.TAIL_RECORDING_MS = 3000;
    
    // Performance constants
    this.TARGET_RECORD_FPS = 30;
    this.lastCompositeFrameTs = 0;
    
    // Footer image for recording
    this.footerImage = null;
    
    // DOM elements
    this.progressBar = null;
    this.flashElement = null;
    this.previewContainer = null;
    this.previewVideo = null;
    this.previewImage = null;
    
    // Dependencies
    this.webcamEl = null;
    this.drawGame = null;
    this.sphereGame = null;
    this.faceTracker = null;
  }

  async init(webcamElement, drawGame, sphereGame, faceTracker) {
    this.webcamEl = webcamElement;
    this.drawGame = drawGame;
    this.sphereGame = sphereGame;
    this.faceTracker = faceTracker;
    
    // Get DOM elements
    this.progressBar = document.querySelector('.progress-bar');
    this.flashElement = document.querySelector('.flash-element');
    this.previewContainer = document.getElementById('preview-container');
    this.previewVideo = document.getElementById('preview-video');
    this.previewImage = document.getElementById('preview-image');
    
    // Preload footer image
    await this.preloadFooterImage();
  }

  async preloadFooterImage() {
    return new Promise((resolve, reject) => {
      this.footerImage = new Image();
      this.footerImage.onload = () => resolve();
      this.footerImage.onerror = () => {
        console.warn('Footer image failed to load, recording will continue without footer');
        resolve(); // Continue even if footer fails
      };
      this.footerImage.src = 'footer.png';
    });
  }

  takePhoto() {
    // Flash effect
    this.flashElement.classList.add('flashing');
    setTimeout(() => this.flashElement.classList.remove('flashing'), 200);
    
    const composite = this.composeFrame();
    composite.toBlob(async blob => {
      const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
      this.showPreview(file, 'image');
    }, 'image/png');
  }

  beginVideoRecording() {
    this.isRecording = true;
    this.recordStartTs = performance.now();
    this.startProgressLoop();
    this.recordedChunks = [];
    
    // Reset freeze state for new session
    this.freezeActive = false;
    this.freezeFrame = null;
    if (this.stopTimeoutId) { 
      clearTimeout(this.stopTimeoutId); 
      this.stopTimeoutId = null; 
    }
    this.tailStopScheduled = false;
    this.freezeStartTime = 0;
    
    // Auto-stop after 8 seconds max
    setTimeout(() => {
      if (this.isRecording) {
        this.tailStopScheduled = false; // Force immediate stop at limit
        this.stopVideoRecording();
      }
    }, 8000);
    
    this.beginCompositeRecording();
  }

  beginCompositeRecording() {
    const composed = document.createElement('canvas');
    const { width: cw, height: ch } = this.computeCompositeDimensions();
    composed.width = cw;
    composed.height = ch;
    const ctx = composed.getContext('2d');
    this.compositeCanvasRef = composed; // store reference
    
    const fps = this.TARGET_RECORD_FPS;
    
    const draw = async () => {
      if (!this.isRecording) return;
      const now = performance.now();
      const frameInterval = 1000 / fps;
      if (now - this.lastCompositeFrameTs < frameInterval) {
        this.recordRAF = requestAnimationFrame(draw);
        return;
      }
      this.lastCompositeFrameTs = now;
      
      ctx.clearRect(0, 0, composed.width, composed.height);
      
      if (this.freezeActive) {
        // Draw stored frozen frame and continue until stop timeout
        if (this.freezeFrame) ctx.drawImage(this.freezeFrame, 0, 0);
      } else {
        // Normal dynamic drawing
        if (this.webcamEl.videoWidth) {
          // Mirror horizontally to match live selfie view
          ctx.save();
          ctx.translate(composed.width, 0);
          ctx.scale(-1, 1);
          this.drawWebcamCover(ctx, this.webcamEl, composed.width, composed.height);
          ctx.restore();
        }
        await this.captureHTMLElements(ctx, composed.width, composed.height);
        
        // After drawing dynamic content, if freeze was requested mid-loop ensure we capture once
        if (this.freezeActive && !this.freezeFrame) {
          this.freezeFrame = document.createElement('canvas');
          this.freezeFrame.width = composed.width;
          this.freezeFrame.height = composed.height;
          this.freezeFrame.getContext('2d').drawImage(composed, 0, 0);
        }
      }
      
      this.recordRAF = requestAnimationFrame(draw);
    };
    
    const stream = composed.captureStream(fps);
    this.recorder = new MediaRecorder(stream, { 
      mimeType: this.pickSupportedMime(),
      videoBitsPerSecond: 4500000 // Higher bitrate for smooth 30fps
    });
    
    this.recorder.ondataavailable = e => { 
      if (e.data && e.data.size > 0) this.recordedChunks.push(e.data); 
    };
    this.recorder.onstop = () => this.onRecordingStop();
    this.recorder.start(500);
    draw();
  }

  // Compute responsive composite size matching current viewport aspect
  computeCompositeDimensions() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
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

  async captureHTMLElements(ctx, canvasWidth, canvasHeight) {
    const scaleX = canvasWidth / window.innerWidth;
    const scaleY = canvasHeight / window.innerHeight;
    const inDrawMode = document.body.classList.contains('draw-mode');
    const inSphereMode = document.body.classList.contains('sphere-mode');
    
    // Apply top gradient each frame to composite stream
    this.drawTopGradient(ctx, canvasWidth, canvasHeight);
    
  // Draw spheres if in sphere mode - capture 3D renderer output
  if (inSphereMode && this.sphereGame && this.sphereGame.renderer) {
      // Draw the 3D sphere renderer output onto the recording canvas
      const sphereCanvas = this.sphereGame.renderer.domElement;
      if (sphereCanvas) {
        // Draw 3D content without mirroring to match real-time orientation
        ctx.drawImage(sphereCanvas, 0, 0, canvasWidth, canvasHeight);
      }
    }
    
    // Draw rings only in draw mode; render the THREE.js scene (no 2D fallback)
    if (this.drawGame && inDrawMode) {
      if (this.sphereGame && this.sphereGame.spheresGroup) {
        this.sphereGame.spheresGroup.visible = false;
      }
      if (this.faceTracker && this.faceTracker.renderer && this.faceTracker.scene && this.faceTracker.camera) {
        try {
          // Draw the last rendered frame from the existing renderer canvas
          const off = this.faceTracker.renderer.domElement;
          if (off) {
            // Draw 3D content without mirroring to match real-time orientation
            ctx.drawImage(off, 0, 0, canvasWidth, canvasHeight);
          }
        } catch (e) {
          // If 3D draw fails, skip drawing rings to avoid old 2D artifacts
        }
      } else {
        // If 3D renderer not available, do not draw old 2D rings
      }
    }
    
    // Draw text only in draw mode
    if (inDrawMode && this.drawGame && this.drawGame.permanentWordElement && this.drawGame.permanentWordElement.style.opacity !== '0') {
      this.drawWordOnCanvas(ctx, canvasWidth, canvasHeight);
    }

    // Draw footer image
    this.drawFooterOnCanvas(ctx, canvasWidth, canvasHeight);
  }

  drawWebcamCover(ctx, video, dw, dh) {
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

  drawTopGradient(ctx, w, h) {
    const gradientHeight = h * 0.33;
    const grad = ctx.createLinearGradient(0, 0, 0, gradientHeight);
    // Color #3E3CFF with varying opacities similar to CSS overlay
    grad.addColorStop(0.0, 'rgba(62,60,255,0.78)');
    grad.addColorStop(0.18, 'rgba(62,60,255,0.55)');
    grad.addColorStop(0.48, 'rgba(62,60,255,0.28)');
    grad.addColorStop(0.70, 'rgba(62,60,255,0.10)');
    grad.addColorStop(1.0, 'rgba(62,60,255,0.0)');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, gradientHeight);
    ctx.restore();
  }

  drawFooterOnCanvas(ctx, canvasWidth, canvasHeight) {
    // Try to use DOM footer first for perfect parity
    try {
      const footerImg = document.querySelector('#kaseya-footer img');
      if (footerImg && (footerImg.complete || footerImg.naturalWidth)) {
        const rect = footerImg.getBoundingClientRect();
        const scaleX = canvasWidth / window.innerWidth;
        const scaleY = canvasHeight / window.innerHeight;
        const rx = rect.left * scaleX;
        const ry = rect.top * scaleY;
        const rw = rect.width * scaleX;
        const rh = rect.height * scaleY;
        const iw = footerImg.naturalWidth || footerImg.width;
        const ih = footerImg.naturalHeight || footerImg.height;
        
        if (iw && ih && rw && rh) {
          // Emulate CSS: width:100%; height:auto; bottom aligned inside its rect
          const dw = rw;
          const dh = (ih / iw) * dw;
          const dx = rx;
          const dy = ry + (rh - dh); // align image bottom with rect bottom
          ctx.drawImage(footerImg, dx, Math.round(dy), Math.round(dw), Math.round(dh));
        }
        return;
      }
    } catch (e) {
      console.warn('DOM footer draw failed, falling back to preloaded image:', e);
    }
    
    // Fallback to preloaded footer image
    if (!this.footerImage || !this.footerImage.complete) {
      console.warn('Footer image not loaded, skipping footer in recording');
      return;
    }
    
    const footerWidth = this.footerImage.naturalWidth || this.footerImage.width;
    const footerHeight = this.footerImage.naturalHeight || this.footerImage.height;
    
    if (!footerWidth || !footerHeight) {
      console.warn('Footer image dimensions not available');
      return;
    }
    
    // Scale footer to full canvas width
    const maxFooterWidth = canvasWidth;
    const scale = Math.min(maxFooterWidth / footerWidth, 1);
    const scaledWidth = footerWidth * scale;
    const scaledHeight = footerHeight * scale;
    
    // Position at bottom center with some margin
    const x = (canvasWidth - scaledWidth) / 2;
    const y = canvasHeight - scaledHeight - 30; // 30px margin from bottom
    
    ctx.drawImage(this.footerImage, x, y, scaledWidth, scaledHeight);
  }

  drawWordOnCanvas(ctx, canvasWidth, canvasHeight) {
    if (!this.drawGame || !this.drawGame.permanentWordElement) return;
    
    const rect = this.drawGame.permanentWordElement.getBoundingClientRect();
    const inner = this.drawGame.permanentWordElement.querySelector('.word-inner');
    const text = inner ? inner.textContent : this.drawGame.permanentWordElement.textContent;
    
    const scaleX = canvasWidth / window.innerWidth;
    const scaleY = canvasHeight / window.innerHeight;
    
    const bannerX = rect.left * scaleX;
    const bannerY = rect.top * scaleY;
    const bannerW = rect.width * scaleX;
    const bannerH = rect.height * scaleY;
    const radius = 30 * Math.min(scaleX, scaleY);
    
  // Solid background to match live banner
  ctx.fillStyle = '#2A127F';
    ctx.beginPath();
    this.roundRectPath(ctx, bannerX, bannerY, bannerW, bannerH, radius);
    ctx.fill();
  ctx.lineWidth = 3 * Math.min(scaleX, scaleY);
  ctx.strokeStyle = '#A44BFF';
    ctx.stroke();
    
    // Text
    const computed = window.getComputedStyle(inner || this.drawGame.permanentWordElement);
    const fontSize = parseInt(computed.fontSize) * Math.min(scaleX, scaleY);
  ctx.font = `bold ${fontSize}px 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bannerX + bannerW/2, bannerY + bannerH/2);
  }

  roundRectPath(ctx, x, y, w, h, r) {
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

  composeFrame() {
    // Create canvas with full viewport dimensions to include footer
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = window.innerWidth;
    compositeCanvas.height = window.innerHeight;
    const compositeCtx = compositeCanvas.getContext('2d');
    
    // Draw webcam video covering the full viewport
    if (this.webcamEl.videoWidth) {
      this.drawWebcamCover(compositeCtx, this.webcamEl, compositeCanvas.width, compositeCanvas.height);
    }
    
    // Draw violet top gradient
    this.drawTopGradient(compositeCtx, compositeCanvas.width, compositeCanvas.height);
    
    // Draw word text if visible and not in sphere mode
    if (this.drawGame && (!this.sphereGame || !this.sphereGame.isActive) && this.drawGame.permanentWordElement && this.drawGame.permanentWordElement.style.opacity !== '0') {
      this.drawWordOnCanvas(compositeCtx, compositeCanvas.width, compositeCanvas.height);
    }
    
    // Draw footer
    this.drawFooterOnCanvas(compositeCtx, compositeCanvas.width, compositeCanvas.height);
    
    return compositeCanvas;
  }

  stopVideoRecording() {
    // Guard para evitar parar antes de terminar la cola de 3s si está programada
    if (this.tailStopScheduled) {
      const elapsedTail = performance.now() - this.freezeStartTime;
      if (elapsedTail < this.TAIL_RECORDING_MS) {
        return; // aún no terminó la cola
      }
      this.tailStopScheduled = false; // permitir parada
    }
    
    if (!this.isRecording) return;
    
    this.isRecording = false;
    this.stopProgressLoop();
    
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    
    if (this.recordRAF) {
      cancelAnimationFrame(this.recordRAF);
      this.recordRAF = 0;
    }
    
    // Restore sphere visibility that was hidden during draw mode recording
    if (this.sphereGame && this.sphereGame.spheresGroup) {
      this.sphereGame.spheresGroup.visible = true;
    }
  }

  onRecordingStop() {
    if (this.recordedChunks.length === 0) {
      console.warn('No recorded data available');
      return;
    }
    
    const mimeType = this.recorder.mimeType || 'video/mp4';
    const blob = new Blob(this.recordedChunks, { type: mimeType });
    console.log(`Recording saved: ${(blob.size/1024/1024).toFixed(2)}MB, type: ${mimeType}`);
    
    const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `roulette_video_${Date.now()}.${extension}`, { type: mimeType });
    
    this.showPreview(file, 'video');
  }

  pickSupportedMime() {
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
  startProgressLoop() {
    const circumference = 100.531; // 2*PI*16 for r=16
    this.progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
    this.progressBar.style.strokeDashoffset = circumference;
    
    this.progressInterval = setInterval(() => {
      if (!this.isRecording) return;
      
      const elapsed = performance.now() - this.recordStartTs;
      const maxDuration = 8000; // 8 seconds max
      const progress = Math.min(elapsed / maxDuration, 1);
      const offset = circumference - (progress * circumference);
      
      this.progressBar.style.strokeDashoffset = offset;
      
      if (progress >= 1) {
        this.stopProgressLoop();
      }
    }, 50);
  }

  stopProgressLoop() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    // Reset progress bar
    this.progressBar.style.strokeDashoffset = 100.531;
  }

  // Preview functionality
  showPreview(file, type) {
    this.currentFile = file;
    const url = URL.createObjectURL(file);
    
    if (type === 'video') {
      this.previewVideo.src = url;
      this.previewVideo.style.display = 'block';
      this.previewImage.style.display = 'none';
    } else {
      this.previewImage.src = url;
      this.previewImage.style.display = 'block';
      this.previewVideo.style.display = 'none';
    }
    
    this.previewContainer.classList.add('visible');
    
    // Ensure preview wrapper uses exact screen aspect
    try {
      document.documentElement.style.setProperty('--screen-ar', (window.innerWidth / window.innerHeight).toString());
    } catch(e){}
    
    // Clean up URL after 30 seconds
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  hidePreview() {
    this.previewContainer.classList.remove('visible');
    this.previewVideo.src = '';
    this.previewImage.src = '';
    this.currentFile = null;
    
    // Restore sphere visibility that was hidden during draw mode recording
    if (this.sphereGame && this.sphereGame.spheresGroup) {
      this.sphereGame.spheresGroup.visible = true;
    }
  }

  async shareOrDownload(forceDownload = false) {
    if (!this.currentFile) return;
    
    const download = () => {
      const url = URL.createObjectURL(this.currentFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.currentFile.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    
    if (!forceDownload && navigator.canShare && navigator.canShare({ files: [this.currentFile] })) {
      try {
        await navigator.share({ files: [this.currentFile], title: this.currentFile.name });
        return;
      } catch (err) {
        console.warn('Share canceled or failed:', err);
      }
    }
    download();
  }

  // Freeze recording methods
  requestFreezeFrame() {
    this.freezeActive = true;
    if (this.compositeCanvasRef) {
      this.freezeFrame = document.createElement('canvas');
      this.freezeFrame.width = this.compositeCanvasRef.width;
      this.freezeFrame.height = this.compositeCanvasRef.height;
      const fctx = this.freezeFrame.getContext('2d');
      fctx.drawImage(this.compositeCanvasRef, 0, 0);
    }
    console.log('[Freeze] Frame congelado. Manteniendo grabación otros', this.TAIL_RECORDING_MS, 'ms');
  }

  scheduleDelayedStop() {
    if (this.isRecording) {
      this.freezeActive = false; // asegurar draw continuo
      this.freezeFrame = null;
      this.freezeStartTime = performance.now();
      this.tailStopScheduled = true;
      
      if (this.stopTimeoutId) clearTimeout(this.stopTimeoutId);
      this.stopTimeoutId = setTimeout(() => {
        this.stopTimeoutId = null;
        this.tailStopScheduled = false;
        this.stopVideoRecording();
      }, this.TAIL_RECORDING_MS);
    }
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      freezeActive: this.freezeActive,
      tailStopScheduled: this.tailStopScheduled
    };
  }
}

// Export for use in other modules
window.VideoCapture = VideoCapture;