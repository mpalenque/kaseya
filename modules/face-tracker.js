// Advanced face tracking functionality using MediaPipe FaceLandmarker
class FaceTracker {
  constructor() {
    // Core MediaPipe components
    this.faceLandmarker = null;
    this.lastVideoTime = -1;
    this.isInitialized = false;
    
    // Webcam reference
    this.webcam = null;
    
    // Scene and camera references for occlusion
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    
    // Face mesh occluder controls
    this.faceScaleX = 1.0;
    this.faceScaleY = 1.0;
    this.faceScaleZ = 1.0;
    this.facePosX = 0.0;
    this.facePosY = 0.2;
    this.facePosZ = 0.0;
    
    // Face landmark mesh (depth-only occluder)
    this.faceMesh = null;
    this.faceMeshGeom = null;
    this.facePositions = null;
    this.faceTargets = null;
    this.lastTriangulationFrame = -1;
    this.triFrameSkip = 3;
    
    // Head tracking state - initialized after THREE.js loads
    this.headPos = null;
    this.headPosSmoothed = null;
    this.mirrorVideoX = true;
    this.faceColliderCenter = null;
    this.faceColliderRadius = 0.9;
    this.faceColliderMargin = 0.1;
    this.facePlaneMargin = 0.08;
    this.meshRadialScale = 1.6 * 0.93 * 0.97;
    this.meshExtraPush = 0.0;
    this.meshHorizontalScale = 0.9 * 0.95;
    
    // FBX head occluder
    this.fbxLoader = null;
    this.headOccluderRoot = null;
    this.headOccluderMesh = null;
    this.headOccluderLoaded = false;
    this.baseOccluderWidth = 1;
    this.headOccScaleSmoothed = 1;
    this.headOccQuatSmoothed = null;
    this.headOccCorrection = null;
    this.occluderBackOffsetFactor = 0.3;
    this.occluderSizeAdjust = 1.0;
    this.occluderEnabled = true; // ACTIVADO POR DEFECTO
    
    // Smoothing variables for compatibility with existing system
    this.lastFacePosition = { x: 0.5, y: 0.5 }; // Normalized face center position (0..1)
    this.lastFaceCenterPx = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }; // Screen-space center
    this.lastFaceRadiusPx = Math.min(window.innerWidth, window.innerHeight) * 0.12; // Approx face radius in px
    this.faceMovementIntensity = 0; // Track how much the face is moving
    
    // Current face landmarks for compatibility
    this.currentFaces = [];
    this.lastLandmarks = null;
    
    // Callbacks for face detection events
    this.onFaceDetected = null;
    this.onFaceUpdated = null;
    this.onFaceLost = null;
    
    // Animation loop
    this.updateRAF = 0;
    
    // Camera setup for 3D positioning (compatible with existing interface)
    this.setupCamera();
  }
  
  setupCamera() {
    // Create a virtual camera for 3D positioning calculations - need to wait for THREE.js
    this.setupVirtualCamera();
  }
  
  setupVirtualCamera() {
    if (typeof THREE !== 'undefined') {
      // Initialize THREE.js components if not provided externally
      if (!this.camera) {
        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
        this.camera.position.set(0, 0, 6);
        this.camera.lookAt(0, 0, 0);
      }
      
      // Initialize vectors
      this.headPos = new THREE.Vector3();
      this.headPosSmoothed = new THREE.Vector3();
      this.faceColliderCenter = new THREE.Vector3();
      this.headOccQuatSmoothed = new THREE.Quaternion();
      this.headOccCorrection = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, Math.PI, 0));
      
      // Initialize FBX loader
      if (typeof THREE.FBXLoader !== 'undefined') {
        this.fbxLoader = new THREE.FBXLoader();
      }
      
      // Update camera aspect on resize
      window.addEventListener('resize', () => {
        if (this.camera) {
          this.camera.aspect = window.innerWidth / window.innerHeight;
          this.camera.updateProjectionMatrix();
        }
      });
    } else {
      // Set up a limited retry mechanism
      let retryCount = 0;
      const maxRetries = 50; // 5 seconds max
      
      const checkTHREE = () => {
        if (typeof THREE !== 'undefined') {
          this.setupVirtualCamera();
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkTHREE, 100);
        } else {
          console.error('THREE.js failed to load for face tracker after 5 seconds');
        }
      };
      
      setTimeout(checkTHREE, 100);
    }
  }

  // Set external THREE.js components for occlusion
  setThreeComponents(scene, camera, renderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    // Re-initialize vectors with the provided camera
    if (this.camera) {
      this.headPos = new THREE.Vector3();
      this.headPosSmoothed = new THREE.Vector3();
      this.faceColliderCenter = new THREE.Vector3();
      this.headOccQuatSmoothed = new THREE.Quaternion();
      this.headOccCorrection = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, Math.PI, 0));
    }
    
    // Load occluder if scene is available
    if (this.scene) {
      this.loadOccluder();
    }
  }

  async init(webcamElement) {
    try {
      this.webcam = webcamElement;
      
      // Initialize MediaPipe FaceLandmarker for advanced tracking
      const { FaceLandmarker, FilesetResolver } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest');
      
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
      
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrices: false,
        runningMode: 'VIDEO',
        numFaces: 1
      });
      
      this.isInitialized = true;
      console.log('Advanced face tracking initialized successfully');
    } catch (error) {
      console.error('Face tracking initialization failed:', error);
      throw error;
    }
  }

  startDetection() {
    if (!this.isInitialized) {
      console.error('Face tracker not initialized');
      return;
    }

    const updateLoop = () => {
      this.update();
      this.updateRAF = requestAnimationFrame(updateLoop);
    };

    updateLoop();
  }
  
  update() {
    if (this.faceLandmarker && this.webcam.readyState >= 2) {
      const videoTime = this.webcam.currentTime;
      if (videoTime !== this.lastVideoTime) {
        this.lastVideoTime = videoTime;
        
        try {
          const res = this.faceLandmarker.detectForVideo(this.webcam, performance.now());
          const prevFaceCount = this.currentFaces.length;
          
          if (res?.faceLandmarks?.length) {
            this.lastLandmarks = res.faceLandmarks[0];
            this.currentFaces = [{ landmarks: this.lastLandmarks }]; // Create compatible face object
            
            // Process landmarks for 3D head tracking
            this.processLandmarks(this.lastLandmarks);
            
            // Trigger callbacks
            if (prevFaceCount === 0) {
              this.onFaceDetected?.(this.currentFaces[0]);
            } else {
              this.onFaceUpdated?.(this.currentFaces[0]);
            }
          } else {
            this.currentFaces = [];
            if (this.headPosSmoothed && typeof THREE !== 'undefined') {
              this.headPosSmoothed.lerp(new THREE.Vector3(0, 0, 0), 0.02);
            }
            
            // Trigger callback
            if (prevFaceCount > 0) {
              this.onFaceLost?.();
            }
          }
          
          // Update face position for compatibility
          this.updateFacePosition();
        } catch (error) {
          // Silenciar errores intermitentes para mantener FPS
        }
      }
    }
  }

  stopDetection() {
    if (this.updateRAF) {
      cancelAnimationFrame(this.updateRAF);
      this.updateRAF = 0;
    }
  }
  
  processLandmarks(landmarks) {
    if (!this.camera || !this.headPos || !this.headPosSmoothed || !this.faceColliderCenter) {
      return; // THREE.js not yet initialized
    }
    
    // Calculate face center from landmarks
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < landmarks.length; i++) {
      const l = landmarks[i];
      sx += l.x;
      sy += l.y;
      sz += l.z;
    }
    const n = landmarks.length;
    const cx = sx / n, cy = sy / n, cz = sz / n;
    
    // Convert to NDC coordinates
    const ndc = this.normToNDC(cx, cy);
    
    // Project to 3D space
    const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera);
    const dirRay = p.sub(this.camera.position).normalize();
    const targetDistance = 3.0;
    
    this.headPos.copy(this.camera.position).add(dirRay.multiplyScalar(targetDistance));
    this.headPosSmoothed.lerp(this.headPos, 0.25);
    
    // Update face collider
    this.faceColliderCenter.copy(this.headPosSmoothed);
    
    // Calculate face width for collider radius
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < landmarks.length; i++) {
      const l = landmarks[i];
      const ndcP = this.normToNDC(l.x, l.y);
      const worldPos = new THREE.Vector3(ndcP.x, ndcP.y, 0.5).unproject(this.camera);
      if (worldPos.x < minX) minX = worldPos.x;
      if (worldPos.x > maxX) maxX = worldPos.x;
    }
    const faceWidth = Math.max(1e-3, maxX - minX);
    this.faceColliderRadius = (faceWidth * 0.5) * 1.08;
    
    // Update occlusion system if scene is available
    if (this.scene) {
      this.updateOcclusion();
    }
  }
  
  normToNDC(x, y) {
    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const vw = this.webcam.videoWidth || 1280;
    const vh = this.webcam.videoHeight || 720;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    
    let xNorm = x, yNorm = y;
    if (videoAspect > canvasAspect) {
      const displayedWidth = ch * videoAspect;
      const offsetX = (displayedWidth - cw) / 2;
      const xDisp = x * displayedWidth - offsetX;
      xNorm = xDisp / cw;
    } else {
      const displayedHeight = cw / videoAspect;
      const offsetY = (displayedHeight - ch) / 2;
      const yDisp = y * displayedHeight - offsetY;
      yNorm = yDisp / ch;
    }
    
    xNorm = Math.max(0, Math.min(1, xNorm)); // Clamp without THREE.js dependency
    yNorm = Math.max(0, Math.min(1, yNorm));
    
    if (this.mirrorVideoX) xNorm = 1 - xNorm;
    
    // Apply device-specific corrections for better alignment
    let xFinal = xNorm * 2 - 1;
    let yFinal = (1 - yNorm) * 2 - 1;
    
    // iPhone-specific Y offset correction for better occlusion alignment
    const isIPhone = /iPhone/i.test(navigator.userAgent);
    if (isIPhone) {
      yFinal += 0.15; // Adjust Y position downward for iPhone (positive moves down in NDC)
    }
    
    return { x: xFinal, y: yFinal };
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
    if (this.currentFaces.length > 0 && this.lastLandmarks) {
      // Calculate face center from landmarks for screen positioning
      let sx = 0, sy = 0;
      for (let i = 0; i < this.lastLandmarks.length; i++) {
        const l = this.lastLandmarks[i];
        sx += l.x;
        sy += l.y;
      }
      const n = this.lastLandmarks.length;
      const cx = sx / n, cy = sy / n;
      
      // Compute displayed video rect for object-fit: cover mapping
      const vw = this.webcam.videoWidth || 1280;
      const vh = this.webcam.videoHeight || 720;
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

      // Convert face center to screen coordinates
      const faceScreenX = (cx * displayW) + offsetX;
      const faceScreenY = (cy * displayH) + offsetY;
      
      // Calculate face width for radius estimation
      let minX = 1, maxX = 0;
      for (let i = 0; i < this.lastLandmarks.length; i++) {
        const l = this.lastLandmarks[i];
        minX = Math.min(minX, l.x);
        maxX = Math.max(maxX, l.x);
      }
      const faceWidthNorm = maxX - minX;
      const faceScreenW = faceWidthNorm * displayW;
      const approxRadius = faceScreenW * 0.6; // More accurate radius from landmarks
      
      // Normalize to 0-1 range for smoother interpolation
      const targetX = faceScreenX / cw;
      const targetY = faceScreenY / ch;
      
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
      this.lastFaceCenterPx.x = faceScreenX;
      this.lastFaceCenterPx.y = faceScreenY;
      
      // Smooth the radius a bit
      this.lastFaceRadiusPx = this.lastFaceRadiusPx * 0.9 + approxRadius * 0.1;
    } else {
      // No face detected - decay movement intensity
      this.faceMovementIntensity *= 0.95;
    }
  }

  // Helper method to get face bounding box in screen coordinates
  getFaceBoundingBox() {
    if (this.currentFaces.length === 0 || !this.lastLandmarks) {
      return null;
    }

    // Calculate bounding box from landmarks
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (let i = 0; i < this.lastLandmarks.length; i++) {
      const l = this.lastLandmarks[i];
      let x = l.x;
      let y = l.y;
      
      // Apply mirroring if enabled (consistent with other methods)
      if (this.mirrorVideoX) {
        x = 1 - x;
      }
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    // Map video coordinates to screen coordinates
    const vw = this.webcam.videoWidth || 1280;
    const vh = this.webcam.videoHeight || 720;
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

    const x = minX * displayW + offsetX;
    const y = minY * displayH + offsetY;
    const width = (maxX - minX) * displayW;
    const height = (maxY - minY) * displayH;

    return {
      x: x,
      y: y,
      width: width,
      height: height,
      centerX: x + width / 2,
      centerY: y + height / 2
    };
  }
  
  // Additional methods for 3D compatibility
  getHeadPosition() {
    if (!this.headPosSmoothed || !this.faceColliderCenter) {
      // Return default values if THREE.js not initialized
      return {
        world: { x: 0, y: 0, z: 3 },
        colliderCenter: { x: 0, y: 0, z: 3 },
        colliderRadius: this.faceColliderRadius,
        colliderMargin: this.faceColliderMargin
      };
    }
    
    return {
      world: this.headPosSmoothed.clone(),
      colliderCenter: this.faceColliderCenter.clone(),
      colliderRadius: this.faceColliderRadius,
      colliderMargin: this.faceColliderMargin
    };
  }

  // Occlusion system methods
  ensureFaceMesh(count) {
    if (this.faceMesh || !this.scene) return;
    
    this.facePositions = new Float32Array(count * 3);
    this.faceTargets = new Float32Array(count * 3);
    this.faceMeshGeom = new THREE.BufferGeometry();
    this.faceMeshGeom.setAttribute('position', new THREE.BufferAttribute(this.facePositions, 3));
    
    const faceMat = new THREE.MeshBasicMaterial({ 
      colorWrite: false, 
      depthWrite: true, 
      depthTest: true 
    });
    
    this.faceMesh = new THREE.Mesh(this.faceMeshGeom, faceMat);
    this.faceMesh.frustumCulled = false;
    this.faceMesh.visible = this.occluderEnabled;
    this.faceMesh.renderOrder = -1; // Render first for depth
    this.scene.add(this.faceMesh);
  }

  setDepthOnlyMaterial(root) {
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = new THREE.MeshBasicMaterial({ colorWrite: false });
      }
    });
  }

  loadOccluder() {
    if (!this.scene || !this.fbxLoader) return;
    
    this.fbxLoader.load('./occluder.fbx', (obj) => {
      this.headOccluderMesh = obj;
      this.setDepthOnlyMaterial(this.headOccluderMesh);
      
      const box = new THREE.Box3().setFromObject(this.headOccluderMesh);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      this.baseOccluderWidth = Math.max(1e-3, size.x);
      
      this.headOccluderMesh.position.sub(center);
      this.headOccluderRoot = new THREE.Group();
      this.headOccluderRoot.add(this.headOccluderMesh);
      this.headOccluderRoot.frustumCulled = false;
      this.headOccluderRoot.visible = this.occluderEnabled;
      this.scene.add(this.headOccluderRoot);
      this.headOccluderLoaded = true;
    }, undefined, (err) => {
      console.warn('Could not load occluder.fbx:', err);
    });
  }

  normToScreen(x, y) {
    if (!this.renderer) return { x: 0, y: 0 };
    
    const cw = this.renderer.domElement.clientWidth;
    const ch = this.renderer.domElement.clientHeight;
    const vw = this.webcam.videoWidth || 1280;
    const vh = this.webcam.videoHeight || 720;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    
    let xNorm = x, yNorm = y;
    if (videoAspect > canvasAspect) {
      const displayedWidth = ch * videoAspect;
      const offsetX = (displayedWidth - cw) / 2;
      const xDisp = x * displayedWidth - offsetX;
      xNorm = xDisp / cw;
    } else {
      const displayedHeight = cw / videoAspect;
      const offsetY = (displayedHeight - ch) / 2;
      const yDisp = y * displayedHeight - offsetY;
      yNorm = yDisp / ch;
    }
    
    xNorm = Math.max(0, Math.min(1, xNorm));
    yNorm = Math.max(0, Math.min(1, yNorm));
    
    if (this.mirrorVideoX) xNorm = 1 - xNorm;
    
    return { x: xNorm * cw, y: yNorm * ch };
  }

  updateOcclusion() {
    if (!this.lastLandmarks || !this.scene || !this.camera || !this.renderer) return;
    
    const landmarks = this.lastLandmarks;
    const count = landmarks.length;
    
    // Ensure face mesh exists
    this.ensureFaceMesh(count);
    
    // Calculate face center
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < count; i++) {
      const l = landmarks[i];
      sx += l.x; sy += l.y; sz += l.z;
    }
    const n = count;
    const cx = sx / n, cy = sy / n, cz = sz / n;
    
    // Update head position if not already done
    if (!this.headPosSmoothed.length()) {
      const ndc = this.normToNDC(cx, cy);
      const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera);
      const dirRay = p.sub(this.camera.position).normalize();
      const targetDistance = 3.0;
      this.headPos.copy(this.camera.position).add(dirRay.multiplyScalar(targetDistance));
      this.headPosSmoothed.lerp(this.headPos, 0.25);
    }

    // Project landmarks to 3D
    const zScale = 1.8;
    const targetDistance = 3.0;
    
    for (let i = 0; i < count; i++) {
      const l = landmarks[i];
      const ndcP = this.normToNDC(l.x, l.y);
      const proj = new THREE.Vector3(ndcP.x, ndcP.y, 0.5).unproject(this.camera);
      const ray = proj.sub(this.camera.position).normalize();
      const zOff = Math.max(-1.2, Math.min(1.2, (l.z - cz) * -zScale));
      const dist = targetDistance + zOff;
      const idx = i * 3;
      this.faceTargets[idx + 0] = this.camera.position.x + ray.x * dist;
      this.faceTargets[idx + 1] = this.camera.position.y + ray.y * dist;
      this.faceTargets[idx + 2] = this.camera.position.z + ray.z * dist;
    }

    // Apply scaling and transformations
    if (this.meshRadialScale !== 1.0 || this.meshExtraPush !== 0.0 || this.meshHorizontalScale !== 1.0) {
      const cxw = this.headPosSmoothed.x, cyw = this.headPosSmoothed.y, czw = this.headPosSmoothed.z;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        let x = this.faceTargets[idx + 0] - cxw;
        let y = this.faceTargets[idx + 1] - cyw;
        let z = this.faceTargets[idx + 2] - czw;
        const len = Math.hypot(x, y, z) || 1.0;
        x = x * this.meshRadialScale + (x / len) * this.meshExtraPush;
        y = y * this.meshRadialScale + (y / len) * this.meshExtraPush;
        z = z * this.meshRadialScale + (z / len) * this.meshExtraPush;
        x *= this.meshHorizontalScale;
        this.faceTargets[idx + 0] = cxw + x;
        this.faceTargets[idx + 1] = cyw + y;
        this.faceTargets[idx + 2] = czw + z;
      }
    }

    // Smooth interpolation to face positions
    if (this.facePositions && this.faceTargets) {
      const lerpF = 0.35;
      for (let i = 0; i < this.facePositions.length; i++) {
        const cur = this.facePositions[i];
        const to = this.faceTargets[i];
        this.facePositions[i] = cur + (to - cur) * lerpF;
      }
      this.faceMeshGeom.attributes.position.needsUpdate = true;
      this.faceMeshGeom.computeVertexNormals();
    }

    // Update triangulation periodically
    const frameNumber = Math.floor(performance.now() / (1000 / 60));
    if (frameNumber !== this.lastTriangulationFrame && (frameNumber % this.triFrameSkip === 0)) {
      this.lastTriangulationFrame = frameNumber;
      this.updateTriangulation(landmarks);
    }

    // Update face mesh visibility and transform
    if (this.faceMesh) {
      this.faceMesh.visible = this.occluderEnabled;
      this.faceMesh.scale.set(this.faceScaleX, this.faceScaleY, this.faceScaleZ);
      this.faceMesh.position.set(this.facePosX, this.facePosY, this.facePosZ);
    }

    // Update FBX occluder
    this.updateFBXOccluder(landmarks);
  }

  updateTriangulation(landmarks) {
    if (!window.Delaunator) {
      // Load Delaunator if not available
      this.loadDelaunator();
      return;
    }
    
    const count = landmarks.length;
    const pts2D = new Array(count);
    for (let i = 0; i < count; i++) {
      const l = landmarks[i];
      const s = this.normToScreen(l.x, l.y);
      pts2D[i] = [s.x, s.y];
    }
    
    try {
      const dela = window.Delaunator.from(pts2D);
      const tris = dela.triangles;
      const idxArr = new Uint16Array(tris);
      this.faceMeshGeom.setIndex(new THREE.BufferAttribute(idxArr, 1));
      this.faceMeshGeom.computeVertexNormals();
    } catch (e) {
      console.warn('Triangulation failed:', e);
    }
  }

  loadDelaunator() {
    if (window.Delaunator) return;
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/delaunator@5';
    script.onload = () => {
      console.log('Delaunator loaded for face mesh triangulation');
    };
    document.head.appendChild(script);
  }

  updateFBXOccluder(landmarks) {
    if (!this.occluderEnabled || !this.headOccluderLoaded || !this.headOccluderRoot || !this.facePositions) {
      return;
    }

    this.headOccluderRoot.visible = true;
    this.headOccluderRoot.position.copy(this.headPosSmoothed);

    try {
      const countPos = this.faceMeshGeom.attributes.position.count;
      if (countPos >= 3) {
        const pick = (i) => {
          const idx = i * 3;
          return new THREE.Vector3(
            this.facePositions[idx + 0], 
            this.facePositions[idx + 1], 
            this.facePositions[idx + 2]
          );
        };
        
        const noseIdx = Math.min(1, countPos - 1);
        const leftIdx = Math.min(234, countPos - 1);
        const rightIdx = Math.min(454, countPos - 1);
        const noseP = pick(noseIdx);
        const leftP = pick(leftIdx);
        const rightP = pick(rightIdx);
        
        const vRight = rightP.clone().sub(leftP).normalize();
        const mid = leftP.clone().add(rightP).multiplyScalar(0.5);
        const vForward = mid.clone().sub(noseP).normalize();
        const vUp = new THREE.Vector3().crossVectors(vForward, vRight).normalize();
        const vRightOrtho = new THREE.Vector3().crossVectors(vUp, vForward).normalize();
        
        const m = new THREE.Matrix4();
        m.makeBasis(vRightOrtho, vUp, vForward);
        let q = new THREE.Quaternion().setFromRotationMatrix(m);
        const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        
        if (this.mirrorVideoX) e.y = -e.y;
        e.x = -e.x;
        e.x *= 0.45;
        
        const qAdj = new THREE.Quaternion().setFromEuler(e, 'YXZ');
        this.headOccQuatSmoothed.slerp(qAdj, 0.25);
        const corrected = this.headOccQuatSmoothed.clone().multiply(this.headOccCorrection);
        this.headOccluderRoot.quaternion.copy(corrected);
        
        // Calculate face width and position offset
        let minXw = Infinity, maxXw = -Infinity;
        for (let i = 0; i < countPos; i++) {
          const idx = i * 3;
          const x = this.facePositions[idx + 0];
          if (x < minXw) minXw = x;
          if (x > maxXw) maxXw = x;
        }
        const faceWidthNow = Math.max(1e-3, maxXw - minXw);
        const forwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(corrected).normalize();
        const backOffset = -faceWidthNow * this.occluderBackOffsetFactor;
        this.headOccluderRoot.position.copy(this.headPosSmoothed).addScaledVector(forwardWorld, backOffset);
      } else {
        this.headOccluderRoot.lookAt(this.camera.position);
      }
    } catch (e) {
      this.headOccluderRoot.lookAt(this.camera.position);
    }

    // Update occluder scale
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < this.faceMeshGeom.attributes.position.count; i++) {
      const idx = i * 3;
      const x = this.facePositions[idx + 0];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    const faceWidth = Math.max(1e-3, maxX - minX);
    const targetScale = (faceWidth / this.baseOccluderWidth) * this.occluderSizeAdjust;
    this.headOccScaleSmoothed += (targetScale - this.headOccScaleSmoothed) * 0.25;
    this.headOccluderRoot.scale.setScalar(this.headOccScaleSmoothed);
    
    // Update collider
    this.faceColliderCenter.copy(this.headPosSmoothed);
    this.faceColliderRadius = (faceWidth * 0.5) * 1.08;
  }

  // Methods to control occlusion
  setOccluderEnabled(enabled) {
    this.occluderEnabled = enabled;
    if (this.headOccluderRoot) this.headOccluderRoot.visible = enabled;
    if (this.faceMesh) this.faceMesh.visible = enabled;
  }

  setFaceScale(x, y, z) {
    this.faceScaleX = x;
    this.faceScaleY = y;
    this.faceScaleZ = z;
  }

  setFacePosition(x, y, z) {
    this.facePosX = x;
    this.facePosY = y;
    this.facePosZ = z;
  }
}

// Export for use in other modules
window.FaceTracker = FaceTracker;