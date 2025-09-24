// Face tracking functionality using MediaPipe
class FaceTracker {
  constructor() {
    this.faceDetector = null;
    this.currentFaces = [];
    this.detectionRAF = 0;
    this.lastDetectionTs = 0;
    this.isInitialized = false;
    
    // Performance constants
    this.DETECTION_INTERVAL_MS = 85; // ~11-12 FPS detection
    
    // Smoothing variables for face position tracking
    this.lastFacePosition = { x: 0.5, y: 0.5 }; // Normalized face center position (0..1)
    this.lastFaceCenterPx = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }; // Screen-space center
    this.lastFaceRadiusPx = Math.min(window.innerWidth, window.innerHeight) * 0.12; // Approx face radius in px
    this.faceMovementIntensity = 0; // Track how much the face is moving
    
    // Callbacks for face detection events
    this.onFaceDetected = null;
    this.onFaceUpdated = null;
    this.onFaceLost = null;
  }

  async init(webcamElement) {
    try {
      this.webcamEl = webcamElement;
      
      // Use MediaPipe Tasks Vision API
      const { FaceDetector, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0');
      
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );
      
      this.faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5
      });
      
      this.isInitialized = true;
      console.log('Face detection initialized successfully');
    } catch (error) {
      console.error('Face detection initialization failed:', error);
      throw error;
    }
  }

  startDetection() {
    if (!this.isInitialized) {
      console.error('Face tracker not initialized');
      return;
    }

    const detectFaces = async () => {
      const now = performance.now();
      if (this.webcamEl.videoWidth > 0 && 
          this.webcamEl.videoHeight > 0 && 
          (now - this.lastDetectionTs) >= this.DETECTION_INTERVAL_MS) {
        
        this.lastDetectionTs = now;
        try {
          const results = await this.faceDetector.detectForVideo(this.webcamEl, now);
          const prevFaceCount = this.currentFaces.length;
          this.currentFaces = results.detections || [];
          
          // Update face position for tracking
          this.updateFacePosition();
          
          // Trigger callbacks
          if (prevFaceCount === 0 && this.currentFaces.length > 0) {
            this.onFaceDetected?.(this.currentFaces[0]);
          } else if (prevFaceCount > 0 && this.currentFaces.length === 0) {
            this.onFaceLost?.();
          } else if (this.currentFaces.length > 0) {
            this.onFaceUpdated?.(this.currentFaces[0]);
          }
        } catch (error) {
          // Silenciar errores intermitentes para mantener FPS
        }
      }
      this.detectionRAF = requestAnimationFrame(detectFaces);
    };

    detectFaces();
  }

  stopDetection() {
    if (this.detectionRAF) {
      cancelAnimationFrame(this.detectionRAF);
      this.detectionRAF = 0;
    }
  }

  getCurrentFaces() {
    return this.currentFaces;
  }

  getFacePosition() {
    return {
      normalized: { ...this.lastFacePosition },
      pixels: { ...this.lastFaceCenterPx },
      radius: this.lastFaceRadiusPx,
      movementIntensity: this.faceMovementIntensity
    };
  }

  updateFacePosition() {
    if (this.currentFaces.length > 0 && this.webcamEl.videoWidth && this.webcamEl.videoHeight) {
      const face = this.currentFaces[0];
      const b = face.boundingBox;
      
      // Compute displayed video rect for object-fit: cover mapping
      const vw = this.webcamEl.videoWidth;
      const vh = this.webcamEl.videoHeight;
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
      const deltaX = Math.abs(targetX - this.lastFacePosition.x);
      const deltaY = Math.abs(targetY - this.lastFacePosition.y);
      const currentMovement = deltaX + deltaY;
      
      // Update movement intensity with decay
      this.faceMovementIntensity = Math.max(currentMovement * 50, this.faceMovementIntensity * 0.95);
      
      // Smooth interpolation to avoid jittery movement
      this.lastFacePosition.x += (targetX - this.lastFacePosition.x) * 0.1;
      this.lastFacePosition.y += (targetY - this.lastFacePosition.y) * 0.1;
      
      // Update pixel center/radius for particle avoidance and placement checks
      this.lastFaceCenterPx.x = centerX;
      this.lastFaceCenterPx.y = centerY;
      
      // Smooth the radius a bit
      this.lastFaceRadiusPx = this.lastFaceRadiusPx * 0.9 + approxRadius * 0.1;
    } else {
      // No face detected - decay movement intensity
      this.faceMovementIntensity *= 0.95;
    }
  }

  // Helper method to get face bounding box in screen coordinates
  getFaceBoundingBox() {
    if (this.currentFaces.length === 0 || !this.webcamEl.videoWidth) {
      return null;
    }

    const face = this.currentFaces[0];
    const b = face.boundingBox;
    
    // Map video coordinates to screen coordinates
    const vw = this.webcamEl.videoWidth;
    const vh = this.webcamEl.videoHeight;
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

    return {
      x: (b.originX / vw) * displayW + offsetX,
      y: (b.originY / vh) * displayH + offsetY,
      width: (b.width / vw) * displayW,
      height: (b.height / vh) * displayH,
      centerX: ((b.originX + b.width / 2) / vw) * displayW + offsetX,
      centerY: ((b.originY + b.height / 2) / vh) * displayH + offsetY
    };
  }
}

// Export for use in other modules
window.FaceTracker = FaceTracker;