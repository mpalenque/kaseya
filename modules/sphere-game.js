// 3D Sphere game functionality - replaces color circles
class SphereGame {
  constructor() {
    this.isActive = false;
    this.faceTracker = null;
    // Simple mobile detection to adapt motion tuning
    this.isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    
    // 3D Scene setup
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = null;
    
    // Sphere system
  this.followerCount = 22; // Exact total spheres required
    this.followers = [];
  this.sphereColliders = [];
  // Increase initial exclusion so spheres don't spawn too close to the face
  this.faceExclusionRadius = 1.35;
  this.minGap = 0.05;
  // Keep spheres slightly further in front of the face plane
  this.facePlaneMargin = 0.12;
  // Extra safety margin so spheres never intersect the occluder volume
  this.faceOccluderInflate = 1.12; // inflate collider radius by 12%
  this.faceColliderExtraMargin = 0.06; // absolute extra margin (world units)
    this.tmp = null;
    
    // Configuration system
    this.configPanel = null;
    this.sphereConfigs = null; // Will hold custom positions/sizes
    this.defaultConfig = true; // Whether to use default or custom positions
    
    // Animation
    this.renderRAF = 0;
  this.transition = { active: false, mode: null, start: 0, duration: 600, from: { opacity: 1, z: 0 }, to: { opacity: 1, z: 0 } };
  this.currentOpacity = 1;
    // WebGL context state
    this.glLost = false;
    
    // Container element
    this.sphereContainer = null;
    this.spheresGroup = null;
  }

  async init(faceTracker, videoCapture = null) {
    this.faceTracker = faceTracker;
    this.videoCapture = videoCapture;
    this.createSphereContainer();
    this.setup3DScene();
    await this.setupConfigSystem();
    this.setupPhotoCapture();
  }

  createSphereContainer() {
    this.sphereContainer = document.getElementById('sphere-game-container');
    if (!this.sphereContainer) {
      this.sphereContainer = document.createElement('div');
      this.sphereContainer.id = 'sphere-game-container';
      this.sphereContainer.style.cssText = `
        position: fixed; left: 0; top: 0; width: 100%; height: 100%; 
        pointer-events: none; z-index: 12; display: none;
      `;
      document.body.appendChild(this.sphereContainer);
    }
  }

  setup3DScene() {
    if (typeof THREE === 'undefined') {
      console.warn('THREE.js not loaded yet, waiting...');
      // Set up a limited retry mechanism
      let retryCount = 0;
      const maxRetries = 50; // 5 seconds max
      
      const checkTHREE = () => {
        if (typeof THREE !== 'undefined') {
          this.setup3DScene();
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkTHREE, 100);
        } else {
          console.error('THREE.js failed to load after 5 seconds');
        }
      };
      
      setTimeout(checkTHREE, 100);
      return;
    }

    // Initialize THREE.js components
    this.clock = new THREE.Clock();
    this.tmp = new THREE.Vector3();

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;
    this.sphereContainer.appendChild(this.renderer.domElement);
    // Handle WebGL context loss/restoration (can happen after MediaRecorder/preview)
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.glLost = true;
      console.warn('[SphereGame] WebGL context lost');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.glLost = false;
      console.warn('[SphereGame] WebGL context restored');
      try { this.onContextRestored(); } catch (e) { console.warn('onContextRestored failed', e); }
    }, { once: false });
    
    Object.assign(this.renderer.domElement.style, { 
      position: 'fixed', 
      inset: '0', 
      zIndex: '11', 
      pointerEvents: 'none' 
    });

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = null;
  this.spheresGroup = new THREE.Group();
  this.spheresGroup.name = 'spheres-root';
  this.scene.add(this.spheresGroup);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 6, 8);
    this.scene.add(dir);
    
    // Configure face tracker with THREE.js components for occlusion
    if (this.faceTracker) {
      this.faceTracker.setThreeComponents(this.scene, this.camera, this.renderer);
    }
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(4, 6, 8);
    this.scene.add(directionalLight);

    // Setup resize handler
    this.setupResize();
  }

  // Ensure renderer is healthy; if context is lost, try to recreate renderer
  ensureRendererReady() {
    if (!this.renderer) return;
    try {
      const gl = this.renderer.getContext && this.renderer.getContext();
      const lost = this.glLost || (gl && typeof gl.isContextLost === 'function' && gl.isContextLost());
      if (lost) {
        this.recreateRenderer();
      }
    } catch (_) {
      // If getContext fails, try to recreate renderer
      this.recreateRenderer();
    }
  }

  recreateRenderer() {
    if (typeof THREE === 'undefined') return;
    try {
      // Dispose old renderer and canvas
      if (this.renderer) {
        try { this.renderer.dispose(); } catch(_) {}
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }
      // Create new renderer
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      r.setSize(window.innerWidth, window.innerHeight);
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.sortObjects = true;
      this.renderer = r;
      if (this.sphereContainer) this.sphereContainer.appendChild(this.renderer.domElement);
      // Re-bind context loss handlers
      this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.glLost = true; console.warn('[SphereGame] WebGL context lost'); });
      this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.glLost = false; console.warn('[SphereGame] WebGL context restored'); try { this.onContextRestored(); } catch(e){} });
      // Reconnect to face tracker for occlusion
      if (this.faceTracker) {
        try { this.faceTracker.setThreeComponents(this.scene, this.camera, this.renderer); } catch(_) {}
      }
    } catch (e) {
      console.warn('Failed to recreate WebGLRenderer:', e);
    }
  }

  onContextRestored() {
    // Re-apply sizing and reconnect occluder
    try {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    } catch(_) {}
    if (this.faceTracker) {
      try { this.faceTracker.setThreeComponents(this.scene, this.camera, this.renderer); } catch(_) {}
    }
    // Ensure spheres exist and are visible
    if (!this.followers || this.followers.length === 0) {
      this.createSpheres();
    } else if (this.spheresGroup) {
      for (const s of this.followers) {
        if (!s.parent) this.spheresGroup.add(s);
      }
    }
    if (this.isActive) {
      if (this.sphereContainer) this.sphereContainer.style.display = 'block';
      if (this.spheresGroup) this.spheresGroup.visible = true;
      this.startAnimation();
    }
  }

  setupResize() {
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
  }

  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    document.body.classList.add('sphere-mode');
    this.sphereContainer.style.display = 'block';
    this.sphereContainer.style.pointerEvents = 'auto'; // Enable clicks for photo capture
    // Make sure renderer is ready (recover if WebGL context was lost)
    this.ensureRendererReady();
    
    // Ensure face tracker is properly reinitialized
    if (this.faceTracker) {
      this.faceTracker.setThreeComponents(this.scene, this.camera, this.renderer);
      // Force occlusion refresh
      if (this.faceTracker.setOccluderEnabled) {
        this.faceTracker.setOccluderEnabled(true);
      }
    }
    
    // Wait for THREE.js and scene to be ready
    if (this.scene && this.renderer && this.clock) {
      this.currentOpacity = 0;
      if (this.spheresGroup) this.spheresGroup.position.z = 3;
      this.createSpheres();
      this.startAnimation();
      this.startEnterTransition();
    } else {
      // Retry activation after a short delay
      setTimeout(() => {
        if (this.isActive) {
          this.checkAndActivate();
        }
      }, 100);
    }
  }
  
  checkAndActivate() {
    if (this.scene && this.renderer && this.clock) {
      this.currentOpacity = 0;
      if (this.spheresGroup) this.spheresGroup.position.z = 3;
      this.createSpheres();
      this.startAnimation();
      this.startEnterTransition();
    } else {
      setTimeout(() => {
        if (this.isActive) {
          this.checkAndActivate();
        }
      }, 100);
    }
  }

  // Request smooth exit; finalize after transition
  deactivate() {
    if (!this.isActive) return;
    this.exitAndDeactivate();
  }

  exitAndDeactivate() {
    this.startExitTransition();
  }

  finalizeDeactivate() {
    this.isActive = false;
    document.body.classList.remove('sphere-mode');
    this.sphereContainer.style.display = 'none';
    this.sphereContainer.style.pointerEvents = 'none'; // Disable clicks
    this.clearSpheres();
    this.stopAnimation();
    this.currentOpacity = 1;
    if (this.spheresGroup) this.spheresGroup.position.z = 0;
  }

  // Pause spheres when switching to draw mode without destroying them
  pauseForDrawMode() {
    // Cancel any ongoing transition and ensure materials are fully opaque
    this.transition.active = false;
    this.currentOpacity = 1;
    for (const sphere of this.followers) {
      if (sphere.material) {
        sphere.material.opacity = 1;
        sphere.material.needsUpdate = true;
      }
    }
    // Hide spheres but keep renderer visible for draw mode (rings use same renderer)
    if (this.spheresGroup) this.spheresGroup.visible = false;
    this.stopAnimation();
    // Keep isActive true so we can resume quickly when returning to spheres
  }

  // Resume spheres with an enter animation when coming back from draw mode
  resumeFromDrawMode() {
    if (!this.scene || !this.renderer) return;
    this.ensureRendererReady();
    // Ensure container is visible
    if (this.sphereContainer) this.sphereContainer.style.display = 'block';
    // If somehow cleared, recreate spheres
    if (this.followers.length === 0) {
      this.createSpheres();
    }
    // Prepare for enter transition
    this.currentOpacity = 0;
    if (this.spheresGroup) {
      this.spheresGroup.visible = true;
      this.spheresGroup.position.z = 3;
    }
    // Kick animation and transition
    this.startAnimation();
    this.startEnterTransition();
  }

  // Force spheres to be visible and animation running (used when returning from preview/cancel)
  ensureVisibleAndRunning() {
    try {
      this.ensureRendererReady();
      if (this.sphereContainer) this.sphereContainer.style.display = 'block';
      if (!this.isActive) {
        // If previously deactivated, fully activate
        this.activate();
        return;
      }
      if (!this.spheresGroup) {
        this.spheresGroup = new THREE.Group();
        this.spheresGroup.name = 'spheres-root';
        this.scene.add(this.spheresGroup);
      }
      if (!this.followers || this.followers.length === 0) {
        this.createSpheres();
      }
      if (this.spheresGroup) this.spheresGroup.visible = true;
      // Kick animation if stopped
      if (!this.renderRAF) this.startAnimation();
    } catch (e) {
      console.warn('ensureVisibleAndRunning failed:', e);
    }
  }

  createSpheres() {
    if (!this.scene || typeof THREE === 'undefined') {
      console.error('[SphereGame] THREE.js scene not ready');
      return;
    }
    
    console.log('[SphereGame] Creating spheres - defaultConfig:', this.defaultConfig, 'hasConfig:', !!this.sphereConfigs);
    
    this.clearSpheres();
    
    // Check if we should use custom config or generate defaults
    if (!this.defaultConfig && this.sphereConfigs && this.sphereConfigs.spheres) {
      console.log('[SphereGame] Using configuration file with', this.sphereConfigs.spheres.length, 'spheres');
      this.createSpheresFromConfig();
      return;
    }
    
    console.log('[SphereGame] Using algorithmic sphere generation (default mode)');
    
    // Default sphere generation (original logic)
    // Color palette matching the original design
    const DOT_COLORS = [
      '#00FFFF', '#C77DFF', '#3D348B', '#7209B7', '#5E2EA7', 
      '#A45CFF', '#36E5FF', '#8A2BE2', '#B794F4'
    ];
    
    // Create color distribution array to ensure equal color distribution
    const createColorDistribution = (totalSpheres, colors) => {
      const distribution = [];
      const colorsPerSphere = Math.floor(totalSpheres / colors.length);
      const remainder = totalSpheres % colors.length;
      
      // Add equal amounts of each color
      for (let i = 0; i < colors.length; i++) {
        for (let j = 0; j < colorsPerSphere; j++) {
          distribution.push(colors[i]);
        }
      }
      
      // Add remaining colors from the beginning of the array
      for (let i = 0; i < remainder; i++) {
        distribution.push(colors[i]);
      }
      
      // Shuffle the distribution array
      for (let i = distribution.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
      }
      
      return distribution;
    };
    
    const colorDistribution = createColorDistribution(this.followerCount, DOT_COLORS);
    let colorIndex = 0;
    let successfulPlacements = 0;
    
    // Keep trying placements until we reach the requested count (with a safe cap)
    let attempts = 0;
    const maxAttempts = this.followerCount * 20;
    while (successfulPlacements < this.followerCount && attempts < maxAttempts) {
      attempts++;
      let radius, zone, position;
      // Distribution similar to original
      const distribution = Math.random();
      if (distribution < 0.4) {
        zone = 'behind';
        radius = this.rand(0.06, 0.15);
      } else if (distribution < 0.65) {
        zone = 'sides';
        radius = this.rand(0.12, 0.25);
      } else if (distribution < 0.85) {
        zone = 'front-corners';
        radius = this.rand(0.18, 0.32);
      } else {
        zone = 'top';
        radius = this.rand(0.15, 0.28);
      }

      position = this.findValidPosition(radius, zone);
      if (!position.success) {
        radius *= 0.7;
        position = this.findValidPosition(radius, zone);
      }
      if (!position.success) {
        radius *= 0.7;
        position = this.findValidPosition(radius, zone);
      }
      if (!position.success) continue;

      let { x, y, z } = position;
      
      // iPhone/mobile-specific position correction: spheres appear too high
      const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
      if (isMobile) {
        y -= 0.6; // Stronger downward adjustment for mobile devices
      }
      
      this.sphereColliders.push({ x, y, z, radius });
      
      // Create sphere geometry and material
      const geometry = new THREE.SphereGeometry(radius, 24, 24);
      const colorHex = colorDistribution[colorIndex % colorDistribution.length];
      colorIndex++;
      const color = new THREE.Color(colorHex);
  // Increase emissive intensity by ~20%
  const emissiveColor = new THREE.Color(colorHex).multiplyScalar(0.48);
      
      const material = new THREE.MeshStandardMaterial({ 
        color, 
        emissive: emissiveColor, 
        roughness: 0.6, 
        metalness: 0.1, 
        transparent: true,
        opacity: this.currentOpacity
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      
      // Orbital behavior data
      const orbit = { 
        baseRadius: Math.sqrt(x*x + y*y + z*z), 
        theta: Math.atan2(z, x), 
        phi: Math.acos(y / Math.sqrt(x*x + y*y + z*z)), 
        dTheta: this.rand(-0.15, 0.15) * 0.25, 
        dPhi: this.rand(-0.15, 0.15) * 0.25, 
        followLerp: this.rand(0.01, 0.03), // Much smoother movement 
        zMul: this.rand(1.3, 2.2), 
        zBias: -this.rand(0.3, 1.0) 
      };
      
      mesh.userData.orbit = orbit; 
      mesh.userData.radius = radius;
      mesh.userData.basePosition = { x, y, z }; // Store original base position
      mesh.renderOrder = 1; 
      
  this.followers.push(mesh);
  if (this.spheresGroup) this.spheresGroup.add(mesh); else this.scene.add(mesh);
      successfulPlacements++;
    }

    console.log(`Successfully placed ${successfulPlacements} spheres`);
  }

  clearSpheres() {
    this.followers.forEach(sphere => {
      if (this.spheresGroup) this.spheresGroup.remove(sphere); else this.scene.remove(sphere);
      sphere.geometry.dispose();
      sphere.material.dispose();
    });
    this.followers = [];
    this.sphereColliders = [];
  }

  rand(a, b) {
    return a + Math.random() * (b - a);
  }

  checkSphereCollision(x, y, z, radius) {
    // Check collision with face area
    const distanceFromFaceCenter = Math.sqrt(x*x + y*y + (z > 0 ? z*z : 0));
    if (z > -0.3 && distanceFromFaceCenter < this.faceExclusionRadius + radius) {
      return { collision: true, type: 'face' };
    }
    
    // Check collision with other spheres
    for (let i = 0; i < this.sphereColliders.length; i++) {
      const other = this.sphereColliders[i];
      const dx = x - other.x;
      const dy = y - other.y;
      const dz = z - other.z;
      const centerDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const requiredDistance = radius + other.radius + this.minGap;
      
      if (centerDistance < requiredDistance) {
        return { 
          collision: true, 
          type: 'sphere', 
          distance: centerDistance, 
          required: requiredDistance, 
          overlap: requiredDistance - centerDistance 
        };
      }
    }
    
    return { collision: false };
  }

  findValidPosition(targetRadius, zone, maxAttempts = 200) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x, y, z;
      
      switch (zone) {
        case 'behind':
          x = (Math.random() - 0.5) * 4.0; 
          y = (Math.random() - 0.5) * 4.0; 
          z = -Math.abs(Math.random() * 3.0 + 0.3); 
          break;
        case 'sides': {
          const isLeft = Math.random() < 0.5; 
          const sideDistance = this.rand(2.0, 4.0);
          x = isLeft ? -sideDistance : sideDistance; 
          y = (Math.random() - 0.5) * 3.0; 
          z = (Math.random() - 0.5) * 5.0; 
          break; 
        }
        case 'front-corners': {
          const isLeftCorner = Math.random() < 0.5; 
          x = isLeftCorner ? this.rand(-4.0, -2.0) : this.rand(2.0, 4.0);
          y = (Math.random() - 0.5) * 2.5; 
          z = this.rand(1.0, 3.0); 
          break; 
        }
        case 'top':
          x = (Math.random() - 0.5) * 2.5; 
          y = this.rand(2.0, 4.0); 
          z = (Math.random() - 0.5) * 2.0; 
          break;
      }
      
      const collision = this.checkSphereCollision(x, y, z, targetRadius);
      if (!collision.collision) {
        return { x, y, z, success: true };
      }
    }
    
    return { success: false };
  }

  startAnimation() {
    if (!this.faceTracker) {
      console.warn('Face tracker not available for sphere animation');
      return;
    }
    
    if (!this.clock || !this.renderer || !this.scene) {
      console.warn('THREE.js components not ready for animation');
      return;
    }

    const animate = () => {
      if (!this.isActive || !this.clock) return;
      
  const dt = Math.min(this.clock.getDelta(), 0.033);
  this.updateSpheres(dt);
  this.updateTransition();
  this.renderer.render(this.scene, this.camera);
      
      this.renderRAF = requestAnimationFrame(animate);
    };
    
    animate();
  }

  stopAnimation() {
    if (this.renderRAF) {
      cancelAnimationFrame(this.renderRAF);
      this.renderRAF = 0;
    }
  }

  updateSpheres(dt) {
    if (!this.tmp || !this.faceTracker) return; // Not initialized yet
    
    const headData = this.faceTracker.getHeadPosition();
    const headPosSmoothed = headData.world;
    const faceColliderCenter = headData.colliderCenter;
    const faceColliderRadius = headData.colliderRadius;
    const faceColliderMargin = headData.colliderMargin;
    
    // Update sphere positions with orbital motion
    for (const sphere of this.followers) {
      const orbit = sphere.userData.orbit; 
      const basePos = sphere.userData.basePosition;
      
      orbit.theta += orbit.dTheta * dt; 
      orbit.phi += orbit.dPhi * dt; 
      
      // Use smaller orbital radius for more subtle movement around configured positions
      const r = Math.min(orbit.baseRadius * 0.15, 0.08); // Reduce orbital motion significantly
      const ox = r * Math.sin(orbit.phi) * Math.cos(orbit.theta); 
      const oy = r * Math.cos(orbit.phi); 
      let oz = r * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      oz = oz * orbit.zMul + orbit.zBias; 
      
      // Calculate target position: base position + head offset + small orbital motion
      if (basePos) {
        // Use configured base position with head tracking offset and subtle orbital motion
        this.tmp.set(
          basePos.x + headPosSmoothed.x * 0.3 + ox, 
          basePos.y + headPosSmoothed.y * 0.3 + oy, 
          basePos.z + headPosSmoothed.z * 0.2 + oz
        );
      } else {
        // Fallback to original behavior if no base position configured
        this.tmp.set(ox, oy, oz).add(headPosSmoothed);
      }
      
      // Collision avoidance with face - improved smoothness
      const dxh = this.tmp.x - faceColliderCenter.x; 
      const dyh = this.tmp.y - faceColliderCenter.y; 
      const dzh = this.tmp.z - faceColliderCenter.z; 
      const distHeadSq = dxh*dxh + dyh*dyh + dzh*dzh; 
  const minHeadDist = (faceColliderRadius * this.faceOccluderInflate) + sphere.userData.radius + faceColliderMargin + this.faceColliderExtraMargin;
      
      if (distHeadSq > 0.0001) { 
        const distHead = Math.sqrt(distHeadSq); 
        if (distHead < minHeadDist) { 
          const overlap = minHeadDist - distHead;
          const pushStrength = Math.min(overlap / minHeadDist, 1.0); // Normalize push strength
          const smoothFactor = 0.55; // Stronger push to stay outside occluder
          const scale = pushStrength * smoothFactor / distHead;
          this.tmp.x += dxh * scale; 
          this.tmp.y += dyh * scale; 
          this.tmp.z += dzh * scale; 
        } 
      }
      
      // Face plane constraint - removed to allow spheres to move further forward
      // Spheres can now move freely in Z direction based on slider configuration
      
      // Make following speed time-based and slightly faster on mobile
      let alpha = orbit.followLerp;
      // Convert per-frame alpha to time-scaled alpha targeting ~60 FPS behavior
      const frames = Math.max(1, dt / (1/60));
      alpha = 1 - Math.pow(1 - alpha, frames);
      if (this.isMobile) {
        alpha = Math.min(0.25, alpha * 1.15); // small boost on mobile
      }
      sphere.position.lerp(this.tmp, alpha);
    }

  // Inter-sphere collision resolution - improved for smooth movement
    for (let iter = 0; iter < 5; iter++) { // More iterations for smoother resolution
      for (let i = 0; i < this.followers.length; i++) {
        const sphereA = this.followers[i]; 
        const radiusA = sphereA.userData.radius;
        
        for (let j = i + 1; j < this.followers.length; j++) {
          const sphereB = this.followers[j]; 
          const radiusB = sphereB.userData.radius; 
          
          const dx = sphereB.position.x - sphereA.position.x; 
          const dy = sphereB.position.y - sphereA.position.y; 
          const dz = sphereB.position.z - sphereA.position.z; 
          const distSq = dx*dx + dy*dy + dz*dz; 
          const minDist = radiusA + radiusB + 0.02; // Slightly more padding
          
          if (distSq > 0) { 
            const dist = Math.sqrt(distSq); 
            if (dist < minDist) { 
              const overlap = (minDist - dist); 
              const nx = dx / dist; 
              const ny = dy / dist; 
              const nz = dz / dist; 
              
              // Much softer stiffness with gradual reduction
              const baseStiffness = 0.15; // Much softer base stiffness
              const factor = baseStiffness * (1.0 - iter * 0.15); // More gradual reduction
              const push = overlap * 0.5 * Math.max(0.05, factor); 
              
              const pushAx = -nx * push; 
              const pushAy = -ny * push; 
              const pushAz = -nz * push; 
              const pushBx = nx * push; 
              const pushBy = ny * push; 
              const pushBz = nz * push; 
              
              // Corrected smooth interpolation with damping
              const damping = 0.3; // Much gentler movement
              sphereA.position.x += pushAx * damping; 
              sphereA.position.y += pushAy * damping; 
              sphereA.position.z += pushAz * damping; 
              sphereB.position.x += pushBx * damping; 
              sphereB.position.y += pushBy * damping; 
              sphereB.position.z += pushBz * damping; 
              
              // Face plane constraint - removed to allow spheres to move further forward
              // const faceZ = headPosSmoothed.z + this.facePlaneMargin; 
              // if (sphereA.position.z > faceZ) sphereA.position.z = faceZ; 
              // if (sphereB.position.z > faceZ) sphereB.position.z = faceZ; 
            } 
          }
        }
      }
    }

    // Final enforcement: ensure spheres are outside the face occluder radius with added margin
    // const faceZ = headPosSmoothed.z + this.facePlaneMargin; // Removed to allow forward movement
    for (const sphere of this.followers) {
      const dx = sphere.position.x - faceColliderCenter.x;
      const dy = sphere.position.y - faceColliderCenter.y;
      const dz = sphere.position.z - faceColliderCenter.z;
      let dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const minDist = (faceColliderRadius * this.faceOccluderInflate) + sphere.userData.radius + faceColliderMargin + this.faceColliderExtraMargin;
      if (dist < minDist) {
        // If very close to center, pick a fallback direction
        let nx, ny, nz;
        if (dist > 1e-4) { nx = dx / dist; ny = dy / dist; nz = dz / dist; }
        else { nx = 0; ny = 1; nz = 0; dist = 1; }
        const targetX = faceColliderCenter.x + nx * minDist;
        const targetY = faceColliderCenter.y + ny * minDist;
        const targetZ = faceColliderCenter.z + nz * minDist;
        // Snap a bit towards the safe position (not full snap to avoid popping)
        const k = 0.85;
        sphere.position.x = sphere.position.x + (targetX - sphere.position.x) * k;
        sphere.position.y = sphere.position.y + (targetY - sphere.position.y) * k;
        sphere.position.z = sphere.position.z + (targetZ - sphere.position.z) * k;
      }
      // Keep in front of face plane - removed to allow spheres to move further forward
      // if (sphere.position.z > faceZ) sphere.position.z = faceZ;
    }
  }

  // Transition helpers
  startEnterTransition() {
    this.transition.active = true;
    this.transition.mode = 'in';
    this.transition.start = performance.now();
    this.transition.duration = 600;
    this.transition.from = { opacity: 0, z: 3 };
    this.transition.to = { opacity: 1, z: 0 };
    this.applyTransitionValues(0);
  }

  startExitTransition() {
    this.transition.active = true;
    this.transition.mode = 'out';
    this.transition.start = performance.now();
    this.transition.duration = 500;
    this.transition.from = { opacity: this.currentOpacity, z: this.spheresGroup ? this.spheresGroup.position.z : 0 };
    this.transition.to = { opacity: 0, z: 3.5 };
  }

  updateTransition() {
    if (!this.transition.active) return;
    const now = performance.now();
    const t = Math.min(1, (now - this.transition.start) / this.transition.duration);
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
    this.applyTransitionValues(ease);
    if (t >= 1) {
      this.transition.active = false;
      if (this.transition.mode === 'out') {
        this.finalizeDeactivate();
      }
    }
  }

  applyTransitionValues(alpha) {
    const from = this.transition.from;
    const to = this.transition.to;
    const o = from.opacity + (to.opacity - from.opacity) * alpha;
    const z = from.z + (to.z - from.z) * alpha;
    this.currentOpacity = o;
    if (this.spheresGroup) this.spheresGroup.position.z = z;
    for (const sphere of this.followers) {
      if (sphere.material) {
        sphere.material.opacity = o;
        sphere.material.needsUpdate = true;
      }
    }
  }

  // Compatibility methods
  getSpheres() {
    return this.followers;
  }

  // Helper methods for collision detection (compatibility)
  isInFaceArea(x, y) {
    if (!this.faceTracker) return false;
    
    const facePos = this.faceTracker.getFacePosition();
    const dx = x - facePos.pixels.x;
    const dy = y - facePos.pixels.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const exclusion = Math.max(150, facePos.radius * 1.2);
    return distance < exclusion;
  }

  isInButtonZone(x, y, buttonZones) {
    return buttonZones.some(zone => {
      return x >= zone.x && x <= zone.x + zone.width && 
             y >= zone.y && y <= zone.y + zone.height;
    });
  }

  cleanup() {
    this.deactivate();
    if (this.sphereContainer && this.sphereContainer.parentNode) {
      this.sphereContainer.parentNode.removeChild(this.sphereContainer);
    }
    if (this.configPanel && this.configPanel.parentNode) {
      this.configPanel.parentNode.removeChild(this.configPanel);
    }
  }

  // Configuration System
  async setupConfigSystem() {
    // Load existing config on startup
    await this.loadSphereConfig();
    
    // Setup Ctrl+S hotkey
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's' && this.isActive) {
        e.preventDefault();
        this.toggleConfigPanel();
      }
    });
  }

  async loadSphereConfig() {
    console.log('[SphereGame] Loading sphere configuration...');
    
    try {
      // Force server load for GitHub Pages or when explicitly requested
      const isGitHubPages = window.location.hostname.includes('github.io') || 
                           window.location.hostname.includes('githubusercontent.com');
      const forceServerLoad = new URLSearchParams(window.location.search).has('forceServer') || isGitHubPages;
      
      console.log('[SphereGame] Environment check:', {
        hostname: window.location.hostname,
        isGitHubPages: isGitHubPages,
        forceServerLoad: forceServerLoad
      });
      
      if (!forceServerLoad) {
        // Try to load from localStorage first (for immediate use)
        const localConfig = localStorage.getItem('sphereConfig');
        if (localConfig) {
          try {
            this.sphereConfigs = JSON.parse(localConfig);
            // Validate that it has spheres
            if (this.sphereConfigs.spheres && this.sphereConfigs.spheres.length > 0) {
              this.defaultConfig = false;
              console.log('[SphereGame] ✅ Loaded from localStorage:', this.sphereConfigs.spheres.length, 'spheres');
              return;
            }
          } catch (e) {
            console.warn('[SphereGame] Invalid localStorage config, trying server:', e);
            localStorage.removeItem('sphereConfig'); // Clear corrupted data
          }
        }
      } else {
        console.log('[SphereGame] Forcing server load (GitHub Pages or ?forceServer)');
      }

      // Try to fetch from server (GitHub Pages serves this as static file)
      const cacheBuster = Date.now();
      const configUrl = `sphere-config.json?v=${cacheBuster}`;
      console.log('[SphereGame] Fetching static config file:', configUrl);
      
      const response = await fetch(configUrl);
      
      console.log('[SphereGame] Static file response status:', response.status, response.statusText);
      
      if (response.ok) {
        const configText = await response.text();
        console.log('[SphereGame] Raw config received (first 100 chars):', configText.substring(0, 100));
        
        const serverConfig = JSON.parse(configText);
        console.log('[SphereGame] Parsed config:', serverConfig);
        
        // Validate server config
        if (serverConfig.spheres && serverConfig.spheres.length > 0) {
          this.sphereConfigs = serverConfig;
          this.defaultConfig = false;
          
          // Only cache in localStorage if not on GitHub Pages (to avoid override issues)
          if (!isGitHubPages) {
            localStorage.setItem('sphereConfig', JSON.stringify(this.sphereConfigs));
          }
          
          console.log('[SphereGame] ✅ Loaded from server:', serverConfig.spheres.length, 'spheres');
          console.log('[SphereGame] First sphere position:', serverConfig.spheres[0]?.position);
          return;
        } else {
          console.warn('[SphereGame] Server config invalid - no spheres array or empty');
        }
      } else {
        console.warn('[SphereGame] Server fetch failed:', response.status, response.statusText);
      }
      
      // If we get here, use embedded config as last resort
      console.log('[SphereGame] ⚠️ No valid sphere config found, using embedded default config');
      this.sphereConfigs = this.getEmbeddedConfig();
      this.defaultConfig = false;
    } catch (e) {
      console.error('[SphereGame] Error loading sphere config:', e);
      console.log('[SphereGame] ⚠️ Using embedded config due to error');
      this.sphereConfigs = this.getEmbeddedConfig();
      this.defaultConfig = false;
    }
  }

  // Get embedded configuration (fallback for GitHub Pages)
  getEmbeddedConfig() {
    return {
      "spheres": [
        {"id": 0, "position": {"x": -0.8, "y": -0.8, "z": 0.15}, "radius": 0.15, "baseRadius": 1.13, "color": "#00FFFF"},
        {"id": 1, "position": {"x": -0.4, "y": -0.8, "z": -0.15}, "radius": 0.15, "baseRadius": 0.89, "color": "#C77DFF"},
        {"id": 2, "position": {"x": 0.0, "y": -0.8, "z": 0.0}, "radius": 0.15, "baseRadius": 0.8, "color": "#3D348B"},
        {"id": 3, "position": {"x": 0.4, "y": -0.8, "z": 0.12}, "radius": 0.15, "baseRadius": 0.89, "color": "#7209B7"},
        {"id": 4, "position": {"x": 0.8, "y": -0.8, "z": -0.18}, "radius": 0.15, "baseRadius": 1.13, "color": "#5E2EA7"},
        {"id": 5, "position": {"x": -0.8, "y": -0.4, "z": 0.18}, "radius": 0.15, "baseRadius": 0.89, "color": "#A45CFF"},
        {"id": 6, "position": {"x": -0.4, "y": -0.4, "z": -0.12}, "radius": 0.15, "baseRadius": 0.57, "color": "#36E5FF"},
        {"id": 7, "position": {"x": 0.0, "y": -0.4, "z": 0.24}, "radius": 0.15, "baseRadius": 0.47, "color": "#8A2BE2"},
        {"id": 8, "position": {"x": 0.4, "y": -0.4, "z": -0.06}, "radius": 0.15, "baseRadius": 0.57, "color": "#B794F4"},
        {"id": 9, "position": {"x": 0.8, "y": -0.4, "z": 0.21}, "radius": 0.15, "baseRadius": 0.89, "color": "#00FFFF"},
        {"id": 10, "position": {"x": -0.8, "y": 0.0, "z": -0.09}, "radius": 0.15, "baseRadius": 0.8, "color": "#C77DFF"},
        {"id": 11, "position": {"x": -0.4, "y": 0.0, "z": 0.15}, "radius": 0.15, "baseRadius": 0.43, "color": "#3D348B"},
        {"id": 12, "position": {"x": 0.0, "y": 0.0, "z": -0.21}, "radius": 0.15, "baseRadius": 0.21, "color": "#7209B7"},
        {"id": 13, "position": {"x": 0.4, "y": 0.0, "z": 0.09}, "radius": 0.15, "baseRadius": 0.43, "color": "#5E2EA7"},
        {"id": 14, "position": {"x": 0.8, "y": 0.0, "z": -0.18}, "radius": 0.15, "baseRadius": 0.8, "color": "#A45CFF"},
        {"id": 15, "position": {"x": -0.8, "y": 0.4, "z": 0.12}, "radius": 0.15, "baseRadius": 0.89, "color": "#36E5FF"},
        {"id": 16, "position": {"x": -0.4, "y": 0.4, "z": -0.03}, "radius": 0.15, "baseRadius": 0.57, "color": "#8A2BE2"},
        {"id": 17, "position": {"x": 0.0, "y": 0.4, "z": 0.18}, "radius": 0.15, "baseRadius": 0.47, "color": "#B794F4"},
        {"id": 18, "position": {"x": 0.4, "y": 0.4, "z": -0.15}, "radius": 0.15, "baseRadius": 0.57, "color": "#00FFFF"},
        {"id": 19, "position": {"x": 0.8, "y": 0.4, "z": 0.06}, "radius": 0.15, "baseRadius": 0.89, "color": "#C77DFF"},
        {"id": 20, "position": {"x": -0.4, "y": 0.8, "z": -0.09}, "radius": 0.15, "baseRadius": 0.89, "color": "#3D348B"},
        {"id": 21, "position": {"x": 0.4, "y": 0.8, "z": 0.21}, "radius": 0.15, "baseRadius": 0.89, "color": "#7209B7"}
      ],
      "timestamp": 1695456000000
    };
  }

  // Force reload configuration from server (useful for GitHub Pages)
  async forceReloadConfig() {
    console.log('[SphereGame] Force reloading configuration from server...');
    // Clear localStorage to force server fetch
    localStorage.removeItem('sphereConfig');
    this.defaultConfig = true;
    this.sphereConfigs = null;
    
    await this.loadSphereConfig();
    
    // Recreate spheres if we're active
    if (this.isActive) {
      this.createSpheres();
    }
  }

  async saveSphereConfig() {
    if (!this.sphereConfigs) return;

    try {
      // Save to localStorage immediately
      localStorage.setItem('sphereConfig', JSON.stringify(this.sphereConfigs));
      
      // Try to save to server (POST to save endpoint)
      const response = await fetch('save-sphere-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.sphereConfigs)
      });
      
      if (!response.ok) {
        console.warn('Failed to save config to server, saved locally');
      }
    } catch (e) {
      console.warn('Failed to save config:', e);
    }
  }

  toggleConfigPanel() {
    if (this.configPanel && this.configPanel.style.display !== 'none') {
      this.hideConfigPanel();
    } else {
      this.showConfigPanel();
    }
  }

  showConfigPanel() {
    if (!this.configPanel) {
      this.createConfigPanel();
    }
    
    // Capture current sphere positions as starting config
    this.captureCurrentPositions();
    this.updateConfigPanelValues();
    this.configPanel.style.display = 'block';
  }

  hideConfigPanel() {
    if (this.configPanel) {
      this.configPanel.style.display = 'none';
    }
  }

  createConfigPanel() {
    this.configPanel = document.createElement('div');
    this.configPanel.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 380px; max-height: 85vh;
      background: rgba(0,0,0,0.1); color: white; padding: 12px; border-radius: 8px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 12px; line-height: 1.2; 
      border: 1px solid rgba(255,255,255,0.4); z-index: 2000; display: none;
      overflow-y: auto; box-shadow: none;
      user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;
      -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
    `;

    const headerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.5); padding-bottom: 6px;">
        <h3 style="margin: 0; color: #A44BFF; font-size: 13px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,1);">Spheres</h3>
        <button id="close-config" style="background: none; border: none; color: white; font-size: 16px; cursor: pointer; padding: 4px; text-shadow: 0 2px 4px rgba(0,0,0,1);">✕</button>
      </div>
      <div style="margin-bottom: 8px; text-align: center;">
        <button id="capture-positions" style="background: rgba(42,18,127,0.7); color: white; border: 1px solid #A44BFF; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; margin: 0 4px; text-shadow: 0 1px 3px rgba(0,0,0,1);">Capture</button>
        <button id="reset-default" style="background: rgba(68,68,68,0.7); color: white; border: 1px solid #999; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; margin: 0 4px; text-shadow: 0 1px 3px rgba(0,0,0,1);">Reset</button>
        <button id="save-config" style="background: rgba(10,107,71,0.7); color: white; border: 1px solid #0F7B52; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 10px; margin: 0 4px; text-shadow: 0 1px 3px rgba(0,0,0,1);">Save</button>
      </div>
      <div id="spheres-list" style="max-height: 50vh; overflow-y: auto;"></div>
    `;

    this.configPanel.innerHTML = headerHTML;
    document.body.appendChild(this.configPanel);

    // Add CSS for custom slider styling
    const style = document.createElement('style');
    style.textContent = `
      .sphere-pos-slider::-webkit-slider-thumb,
      .sphere-radius-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        border: 1px solid rgba(0,0,0,0.3);
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
      
      .sphere-pos-slider::-webkit-slider-track,
      .sphere-radius-slider::-webkit-slider-track {
        height: 4px;
        border-radius: 2px;
        border: none;
      }
      
      .sphere-pos-slider::-moz-range-thumb,
      .sphere-radius-slider::-moz-range-thumb {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        border: 1px solid rgba(0,0,0,0.3);
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
    `;
    document.head.appendChild(style);

    // Event listeners
    this.configPanel.querySelector('#close-config').onclick = () => this.hideConfigPanel();
    this.configPanel.querySelector('#capture-positions').onclick = () => this.captureCurrentPositions();
    this.configPanel.querySelector('#reset-default').onclick = () => this.resetToDefault();
    this.configPanel.querySelector('#save-config').onclick = () => this.saveConfiguration();
    
    // Prevent context menu on the entire panel
    this.configPanel.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    // Prevent long press menu on mobile for the entire panel
    this.configPanel.addEventListener('touchstart', (e) => {
      // Only prevent if target is a slider or part of the panel background
      if (e.target.type === 'range' || e.target === this.configPanel) {
        e.stopPropagation();
      }
    }, { passive: true });
  }

  captureCurrentPositions() {
    if (!this.followers || this.followers.length === 0) return;

    this.sphereConfigs = {
      spheres: [],
      timestamp: Date.now()
    };

    this.followers.forEach((sphere, index) => {
      const pos = sphere.position;
      const userData = sphere.userData;
      this.sphereConfigs.spheres.push({
        id: index,
        position: { x: pos.x, y: pos.y, z: pos.z },
        radius: userData.radius || 0.1,
        baseRadius: userData.orbit?.baseRadius || Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z),
        color: sphere.material ? `#${sphere.material.color.getHexString()}` : '#00FFFF'
      });
    });

    this.defaultConfig = false;
    this.updateConfigPanelValues();
  }

  updateConfigPanelValues() {
    const spheresList = this.configPanel?.querySelector('#spheres-list');
    if (!spheresList || !this.sphereConfigs) return;

    let html = '';
    this.sphereConfigs.spheres.forEach((config, index) => {
      html += `
        <div style="display: grid; grid-template-columns: 14px 1fr 1fr 1fr 1fr; gap: 3px; margin-bottom: 1px; padding: 2px 4px; background: rgba(255,255,255,0.05); border-radius: 2px; align-items: center;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${config.color}; margin: auto; box-shadow: 0 0 4px ${config.color}88;"></div>
          <input type="range" min="-5.6" max="5.6" step="0.05" value="${config.position.x.toFixed(2)}" 
                 data-sphere="${index}" data-axis="x" class="sphere-pos-slider"
                 style="width: 100%; height: 14px; background: rgba(255,0,0,0.3); border-radius: 7px; outline: none; -webkit-appearance: none;">
          <input type="range" min="-5.6" max="5.6" step="0.05" value="${config.position.y.toFixed(2)}" 
                 data-sphere="${index}" data-axis="y" class="sphere-pos-slider"
                 style="width: 100%; height: 14px; background: rgba(0,255,0,0.3); border-radius: 7px; outline: none; -webkit-appearance: none;">
          <input type="range" min="-8" max="12" step="0.05" value="${config.position.z.toFixed(2)}" 
                 data-sphere="${index}" data-axis="z" class="sphere-pos-slider"
                 style="width: 100%; height: 14px; background: rgba(0,0,255,0.3); border-radius: 7px; outline: none; -webkit-appearance: none;">
          <input type="range" min="0.02" max="0.4" step="0.01" value="${config.radius.toFixed(2)}" 
                 data-sphere="${index}" data-prop="radius" class="sphere-radius-slider"
                 style="width: 100%; height: 14px; background: rgba(255,255,0,0.3); border-radius: 7px; outline: none; -webkit-appearance: none;">
        </div>
      `;
    });

    spheresList.innerHTML = html;

    // Add event listeners for real-time updates
    spheresList.querySelectorAll('.sphere-pos-slider').forEach(slider => {
      // Prevent context menu on sliders
      slider.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      // Prevent text selection during drag
      slider.addEventListener('selectstart', (e) => {
        e.preventDefault();
      });
      
      // Prevent long press context menu on mobile
      slider.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: true });
      
      slider.addEventListener('touchmove', (e) => {
        e.stopPropagation();
      }, { passive: true });
      
      slider.addEventListener('input', (e) => {
        this.updateSpherePosition(e);
      });
    });
    
    spheresList.querySelectorAll('.sphere-radius-slider').forEach(slider => {
      // Prevent context menu on sliders
      slider.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      // Prevent text selection during drag
      slider.addEventListener('selectstart', (e) => {
        e.preventDefault();
      });
      
      // Prevent long press context menu on mobile
      slider.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: true });
      
      slider.addEventListener('touchmove', (e) => {
        e.stopPropagation();
      }, { passive: true });
      
      slider.addEventListener('input', (e) => {
        this.updateSphereRadius(e);
      });
    });
  }

  updateSpherePosition(e) {
    const sphereIndex = parseInt(e.target.dataset.sphere);
    const axis = e.target.dataset.axis;
    const value = parseFloat(e.target.value) || 0;

    if (this.sphereConfigs && this.sphereConfigs.spheres[sphereIndex]) {
      this.sphereConfigs.spheres[sphereIndex].position[axis] = value;
      
      // Update the actual sphere if it exists
      if (this.followers[sphereIndex]) {
        // Store the new base position
        this.followers[sphereIndex].userData.basePosition = { ...this.sphereConfigs.spheres[sphereIndex].position };
      }
    }
  }

  updateSphereRadius(e) {
    const sphereIndex = parseInt(e.target.dataset.sphere);
    const value = parseFloat(e.target.value) || 0.1;

    if (this.sphereConfigs && this.sphereConfigs.spheres[sphereIndex]) {
      this.sphereConfigs.spheres[sphereIndex].radius = value;
      
      // Update the actual sphere if it exists
      if (this.followers[sphereIndex]) {
        // Create new geometry with the new radius
        const oldGeometry = this.followers[sphereIndex].geometry;
        this.followers[sphereIndex].geometry = new THREE.SphereGeometry(value, 24, 24);
        oldGeometry.dispose();
        
        // Update the userData radius
        this.followers[sphereIndex].userData.radius = value;
        
        // Update collider
        if (this.sphereColliders[sphereIndex]) {
          this.sphereColliders[sphereIndex].radius = value;
        }
      }
    }
  }

  resetToDefault() {
    // Create a centered configuration with all spheres at (0,0,0) with medium size
    const DOT_COLORS = [
      '#00FFFF', '#C77DFF', '#3D348B', '#7209B7', '#5E2EA7', 
      '#A45CFF', '#36E5FF', '#8A2BE2', '#B794F4'
    ];
    
    // Create color distribution for equal representation
    const createColorDistribution = (totalSpheres, colors) => {
      const distribution = [];
      const colorsPerSphere = Math.floor(totalSpheres / colors.length);
      const remainder = totalSpheres % colors.length;
      
      for (let i = 0; i < colors.length; i++) {
        for (let j = 0; j < colorsPerSphere; j++) {
          distribution.push(colors[i]);
        }
      }
      
      for (let i = 0; i < remainder; i++) {
        distribution.push(colors[i]);
      }
      
      // Shuffle the distribution array
      for (let i = distribution.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [distribution[i], distribution[j]] = [distribution[j], distribution[i]];
      }
      
      return distribution;
    };
    
    const colorDistribution = createColorDistribution(this.followerCount, DOT_COLORS);
    const mediumRadius = 0.15; // Medium size for all spheres
    
    // Create centered configuration
    this.sphereConfigs = {
      spheres: [],
      timestamp: Date.now()
    };
    
    for (let i = 0; i < this.followerCount; i++) {
      // Create a small grid-like distribution around center so spheres are visible
      const gridSize = Math.ceil(Math.sqrt(this.followerCount)); // Create a rough grid
      const spacing = 0.4; // Small spacing between spheres
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      
      // Center the grid around (0,0,0)
      const offsetX = (col - (gridSize - 1) / 2) * spacing;
      const offsetY = (row - (gridSize - 1) / 2) * spacing;
      const offsetZ = Math.sin(i * 0.5) * 0.3; // Small Z variation for depth
      
      this.sphereConfigs.spheres.push({
        id: i,
        position: { x: offsetX, y: offsetY, z: offsetZ },
        radius: mediumRadius,
        baseRadius: Math.sqrt(offsetX*offsetX + offsetY*offsetY + offsetZ*offsetZ),
        color: colorDistribution[i % colorDistribution.length]
      });
    }
    
    this.defaultConfig = false;
    localStorage.setItem('sphereConfig', JSON.stringify(this.sphereConfigs));
    
    // Recreate spheres with centered positions
    this.clearSpheres();
    this.createSpheres();
    this.updateConfigPanelValues();
  }

  createSpheresFromConfig() {
    if (!this.sphereConfigs || !this.sphereConfigs.spheres) return;
    
    console.log('Creating spheres from config:', this.sphereConfigs.spheres.length, 'spheres');

    this.sphereConfigs.spheres.forEach((config, index) => {
      const { position, radius, color } = config;
      
      // Create sphere geometry and material
      const geometry = new THREE.SphereGeometry(radius, 24, 24);
      const sphereColor = new THREE.Color(color);
      const emissiveColor = new THREE.Color(color).multiplyScalar(0.48);
      
      const material = new THREE.MeshStandardMaterial({ 
        color: sphereColor, 
        emissive: emissiveColor, 
        roughness: 0.6, 
        metalness: 0.1, 
        transparent: true,
        opacity: this.currentOpacity
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      
      // Orbital behavior data - use configured position as base
      const baseRadius = Math.sqrt(position.x*position.x + position.y*position.y + position.z*position.z);
      const orbit = { 
        baseRadius: baseRadius, 
        theta: Math.atan2(position.z, position.x), 
        phi: Math.acos(position.y / baseRadius), 
        dTheta: this.rand(-0.15, 0.15) * 0.25, 
        dPhi: this.rand(-0.15, 0.15) * 0.25, 
        followLerp: this.rand(0.01, 0.03), 
        zMul: this.rand(1.3, 2.2), 
        zBias: -this.rand(0.3, 1.0) 
      };
      
      mesh.userData.orbit = orbit; 
      mesh.userData.radius = radius;
      mesh.userData.basePosition = { ...position }; // Store configured base position
      mesh.renderOrder = 1;
      
      this.followers.push(mesh);
      if (this.spheresGroup) {
        this.spheresGroup.add(mesh);
      }
      
      // Update colliders for face avoidance
      this.sphereColliders.push({ 
        x: position.x, 
        y: position.y, 
        z: position.z, 
        radius 
      });
    });
  }

  saveConfiguration() {
    if (this.sphereConfigs) {
      this.saveSphereConfig();
      this.hideConfigPanel();
      
      // Show confirmation
      const msg = document.createElement('div');
      msg.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 3000;
        background: #0A6B47; color: white; padding: 8px 16px; border-radius: 6px;
        font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px;
        border: 1px solid #0F7B52; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      msg.textContent = 'Configuration saved!';
      document.body.appendChild(msg);
      
      setTimeout(() => {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
      }, 2000);
    }
  }

  setupPhotoCapture() {
    // Photo capture is now handled by the UI manager system
    // This method is kept for compatibility but doesn't add conflicting listeners
  }
}

// Export for use in other modules
window.SphereGame = SphereGame;

// Debug function for GitHub Pages testing
window.debugSphereConfig = () => {
  if (window.sphereGameInstance) {
    console.log('Current config state:', {
      defaultConfig: window.sphereGameInstance.defaultConfig,
      hasConfig: !!window.sphereGameInstance.sphereConfigs,
      sphereCount: window.sphereGameInstance.sphereConfigs?.spheres?.length || 0
    });
  }
};

// Force reload function for GitHub Pages testing
window.forceReloadSphereConfig = async () => {
  if (window.sphereGameInstance) {
    await window.sphereGameInstance.forceReloadConfig();
    console.log('Configuration reloaded!');
  }
};