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
  // Extra tuning to avoid visual overlap with facemesh
  this.facePlaneOffsetZ = 0.06; // push spheres slightly towards the camera relative to face mesh
  this.faceCollisionExtra = 0.035; // extra radial clearance so the sphere volume never intersects
  // Face box debug/collider scales (relative to radius)
  // Defaults changed to larger, user-tunable values (units are multipliers applied to face radius)
  this.faceBoxScaleX = 112; // width multiplier (requested 112)
  this.faceBoxScaleY = 210; // height multiplier (requested 210)
  this.faceBoxScaleZ = 1.0; // depth multiplier
  this.faceBoxOffsetY = 0.1; // shift box up 10% in world units (positive = up)
  // Debug box visibility (collision still works even if hidden)
  this.showFaceDebug = false;
    this.tmp = null;

    // small reusable quaternion to avoid allocations in the render loop
    this._tmpQuat = new (typeof THREE !== 'undefined' ? THREE.Quaternion : function() {})();
    
    // Configuration system
    this.configPanel = null;
    this.sphereConfigs = null; // Will hold custom positions/sizes
    this.defaultConfig = true; // Whether to use default or custom positions
  this.configLoaded = false; // Marks when config load finished (for static hosting gating)
    
    // Animation
    this.renderRAF = 0;
  this.transition = { active: false, mode: null, start: 0, duration: 600, from: { opacity: 1, z: 0 }, to: { opacity: 1, z: 0 } };
  this.currentOpacity = 1;
    // WebGL context state
    this.glLost = false;
    
    // Container element
    this.sphereContainer = null;
    this.spheresGroup = null;
  // Desired extra gap between spheres so they don't appear stuck together
  this.interSpherePadding = 0.06; // was ~0.03 previously
  // Bring side spheres vertically closer to center so they are visible on edges
  this.SIDE_Y_COMPRESS_START = 1.6; // start compressing Y beyond this |x-cx|
  this.SIDE_Y_COMPRESS_MAX = 0.7;   // when far on X, scale Y delta by this factor (0.7 = 30% closer)
    // Bring all spheres 10% closer to the face center (applied in update)
    // 1.0 = no change, 0.9 = 10% closer relative to face center each frame
    this.SPHERES_CLOSENESS_FACTOR = 0.9;
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

    // Debug cube to visualize face collision volume - now sized like face box
    try {
      const cubeGeo = new THREE.BoxGeometry(1, 1, 0.2);
      const cubeMat = new THREE.MeshBasicMaterial({ color: 0xFFCC00, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
      this.faceDebugCube = new THREE.Mesh(cubeGeo, cubeMat);
      this.faceDebugCube.visible = this.showFaceDebug; // hidden by default
      this.faceDebugCube.renderOrder = 2;
      this.scene.add(this.faceDebugCube);
    } catch(_) { this.faceDebugCube = null; }

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 6, 8);
    this.scene.add(dir);
    
    // Face tracker 3D wiring for occlusion removed per request
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
      // Occlusion reconnection removed per request
    } catch (e) {
      console.warn('Failed to recreate WebGLRenderer:', e);
    }
  }

  onContextRestored() {
    // Re-apply sizing
    try {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    } catch(_) {}
    // Occluder reconnection removed per request
    // Ensure spheres exist and are visible
    if (!this.followers || this.followers.length === 0) {
      // Wait for config to load before creating spheres
      if (this.configPromise) {
        this.configPromise.then(() => {
          if (this.isActive && (!this.followers || this.followers.length === 0)) {
            this.createSpheres();
          }
        });
      } else {
        this.createSpheres();
      }
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
    
  // Ensure occlusion is disabled in sphere mode; UI manager also enforces this
  try { this.faceTracker?.setOccluderEnabled && this.faceTracker.setOccluderEnabled(false); } catch(_) {}
    
    // Wait for THREE.js and scene to be ready
    if (this.scene && this.renderer && this.clock) {
      this.currentOpacity = 0;
      if (this.spheresGroup) this.spheresGroup.position.z = 3;
      
      // Wait for config to load before creating spheres
      if (this.configPromise) {
        this.configPromise.then(() => {
          if (this.isActive) {
            this.createSpheres();
            this.startAnimation();
            this.startEnterTransition();
          }
        });
      } else {
        this.createSpheres();
        this.startAnimation();
        this.startEnterTransition();
      }
    } else {
      // Retry activation after a short delay
      setTimeout(() => {
        if (this.isActive) {
          this.checkAndActivate();
        }
      }, 100);
    }
  }
  
  async checkAndActivate() {
    if (this.scene && this.renderer && this.clock) {
      this.currentOpacity = 0;
      if (this.spheresGroup) this.spheresGroup.position.z = 3;
      
      // Wait for config to load before creating spheres
      if (this.configPromise) {
        await this.configPromise;
      }
      
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
    
    // On GitHub Pages (or when forceServer is set), wait for config to load to avoid showing the default grid
    try {
      const isGitHubPages = window.location.hostname.includes('github.io') || 
                            window.location.hostname.includes('githubusercontent.com');
      const forceServerLoad = new URLSearchParams(window.location.search).has('forceServer') || isGitHubPages;
      if (forceServerLoad && !this.configLoaded) {
        console.log('[SphereGame] ⏳ Waiting for config to load before creating spheres (static hosting)');
        if (this.configPromise && typeof this.configPromise.then === 'function') {
          this.configPromise.then(() => {
            if (this.isActive) {
              console.log('[SphereGame] ✅ Config loaded; creating spheres now');
              this.createSpheres();
            }
          });
        }
        return;
      }
    } catch (_) {}

    console.log('[SphereGame] Creating spheres - defaultConfig:', this.defaultConfig, 'hasConfig:', !!this.sphereConfigs);
    
    this.clearSpheres();
    
    // Check if we should use custom config or generate defaults
    if (!this.defaultConfig && this.sphereConfigs && this.sphereConfigs.spheres) {
      console.log('[SphereGame] Using configuration file with', this.sphereConfigs.spheres.length, 'spheres');
      console.log('[DEBUG] Sphere 9 config:', this.sphereConfigs.spheres.find(s => s.id === 9));
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
      
      // Increase emissive intensity, more for cyan colors
      let emissiveMultiplier = 0.48;
      if (colorHex === '#00FFFF') {
        emissiveMultiplier = 0.7; // Make cyan much brighter
      }
      const emissiveColor = new THREE.Color(colorHex).multiplyScalar(emissiveMultiplier);
      
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

  // Deterministic small jitter per sphere to avoid perfect alignment on boundaries
  getBoundaryJitter(sphere) {
    if (sphere.userData._bj) return sphere.userData._bj;
    const seed = (sphere.userData?.id ?? sphere.userData?.uid ?? 0) + 1;
    const prng = (salt) => {
      const x = Math.sin(seed * 9283 + salt * 199) * 43758.5453;
      return x - Math.floor(x);
    };
    const amp = 0.12; // world units jitter amplitude
    const jx = (prng(1) - 0.5) * amp;
    const jy = (prng(2) - 0.5) * amp;
    sphere.userData._bj = { jx, jy };
    return sphere.userData._bj;
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
    // Lock all spheres to the face mesh Z plane
  const facePlaneZ = faceColliderCenter.z + (this.facePlaneOffsetZ || 0); // slight offset towards camera
  
  // Apply Y offset to raise the face box collider
  const faceColliderCenterY = faceColliderCenter.y + (this.faceBoxOffsetY || 0);

  // Face orientation quaternion (corrected) and its inverse for OBB tests
  let faceQuat = null;
  let invFaceQuat = null;
  try {
    if (this.faceTracker && this.faceTracker.headOccQuatSmoothed) {
      faceQuat = this.faceTracker.headOccQuatSmoothed.clone().multiply(this.faceTracker.headOccCorrection || new THREE.Quaternion());
      invFaceQuat = faceQuat.clone().invert();
    }
  } catch(_) {}

  // Precompute box extents (half sizes) for this frame
  const faceBoxWidth = (faceColliderRadius * this.faceOccluderInflate * this.faceBoxScaleX) + faceColliderMargin + this.faceColliderExtraMargin + (this.faceCollisionExtra || 0);
  const faceBoxHeight = (faceColliderRadius * this.faceOccluderInflate * this.faceBoxScaleY) + faceColliderMargin + this.faceColliderExtraMargin + (this.faceCollisionExtra || 0);
  const hx = faceBoxWidth * 0.5;
  const hy = faceBoxHeight * 0.5;

  const now = performance.now();
  let collidedThisFrame = false;
  // Prepare per-sphere flags and capture previous positions for smoothing
  const prevPositions = new Array(this.followers.length);
  for (let i = 0; i < this.followers.length; i++) {
    const s = this.followers[i];
    prevPositions[i] = { x: s.position.x, y: s.position.y };
    s.userData.bumped = false; // inter-sphere collision this frame
    s.userData.clampedFace = false; // clamped to face box this frame
  }
    // Update sphere positions with orbital motion
    for (const sphere of this.followers) {
      const orbit = sphere.userData.orbit; 
      const basePos = sphere.userData.basePosition;
      
      orbit.theta += orbit.dTheta * dt; 
      orbit.phi += orbit.dPhi * dt; 
      
      // Use smaller orbital radius for more subtle movement around configured positions
  const rOrbit = Math.min(orbit.baseRadius * 0.15, 0.08); // Reduce orbital motion significantly
  const ox = rOrbit * Math.sin(orbit.phi) * Math.cos(orbit.theta); 
  const oy = rOrbit * Math.cos(orbit.phi); 
      // Z orbital component is ignored because we lock Z to the face plane
      let oz = 0;
      
      // Calculate target position: base position + head offset + small orbital motion
      if (basePos) {
        // If sphere is permanently displaced, stay at displaced position
        if (sphere.userData.isDisplaced && sphere.userData.displacedPosition) {
          const dispPos = sphere.userData.displacedPosition;
          this.tmp.set(
            dispPos.x + ox * 0.3, // small orbital motion around displaced position
            dispPos.y + oy * 0.3,
            facePlaneZ
          );
        }
        // When sphere was repelled recently, stick to the boundary anchor instead of trying to re-enter
  else if (now < (sphere.userData.repelUntil || 0) && sphere.userData.lastBoundary) {
          const anc = sphere.userData.lastBoundary;
          this.tmp.set(
            anc.x + ox * 0.6, // smaller orbital motion around boundary
            anc.y + oy * 0.6,
            facePlaneZ
          );
        } else {
          // Use configured base position with head tracking offset and subtle orbital motion
          this.tmp.set(
            basePos.x + headPosSmoothed.x * 0.3 + ox, 
            basePos.y + headPosSmoothed.y * 0.3 + oy, 
            facePlaneZ
          );
        }
      } else {
        // Fallback to original behavior if no base position configured
        this.tmp.set(ox + headPosSmoothed.x, oy + headPosSmoothed.y, facePlaneZ);
      }

      // REMOVED: No longer pull toward face center. Spheres must orbit and return
      // to their static basePosition, NOT seek the face center.
      // Skip closeness attraction entirely—only apply side Y-compression for visibility.
      try {
        const repelUntil = sphere.userData.repelUntil || 0;
        const isRepelled = now < repelUntil || sphere.userData.isDisplaced;
        if (!isRepelled) {
          const cx = faceColliderCenter.x;
          const cy = faceColliderCenterY; // use adjusted Y with offset
          // REMOVED: SPHERES_CLOSENESS_FACTOR pull to center (was lines 807-813)
          // Spheres stay at their orbital position around basePosition.
          
          // Additional Y compression for spheres far on X (sides) to keep them visible
          const start = this.SIDE_Y_COMPRESS_START ?? 1.6;
          const maxScale = this.SIDE_Y_COMPRESS_MAX ?? 0.7;
          const sideX = Math.abs(this.tmp.x - cx);
          if (sideX > start) {
            const t = Math.max(0, Math.min(1, (sideX - start) / start));
            const scale = 1 - t * (1 - maxScale);
            this.tmp.y = cy + (this.tmp.y - cy) * scale;
          }
        }
      } catch(_) {}
      
      // Face OBB collision detection (rotate into face local space if available)
      const desiredX = this.tmp.x;
      const desiredY = this.tmp.y;
      const sphereRadius = sphere.userData.radius;
      let hitFace = false;
      if (faceQuat && invFaceQuat) {
        const local = new THREE.Vector3(desiredX - faceColliderCenter.x, desiredY - faceColliderCenterY, 0).applyQuaternion(invFaceQuat);
        const inX = (local.x > -hx - sphereRadius) && (local.x < hx + sphereRadius);
        const inY = (local.y > -hy - sphereRadius) && (local.y < hy + sphereRadius);
        hitFace = inX && inY;
        if (hitFace) {
          sphere.userData.isDisplaced = true;
          sphere.userData.displacedPosition ||= { x: sphere.position.x, y: sphere.position.y, z: facePlaneZ };
          const margin = 0.04;
          const gapX = hx - Math.abs(local.x);
          const gapY = hy - Math.abs(local.y);
          const targetLocal = local.clone();
          const jitter = this.getBoundaryJitter(sphere);
          if (gapX < gapY) {
            targetLocal.x = (local.x >= 0 ? hx + sphereRadius + margin : -hx - sphereRadius - margin);
            targetLocal.y += jitter.jy; // add tangential jitter to avoid alignment
          } else {
            targetLocal.y = (local.y >= 0 ? hy + sphereRadius + margin : -hy - sphereRadius - margin);
            targetLocal.x += jitter.jx;
          }
          const worldTarget = targetLocal.applyQuaternion(faceQuat).add(new THREE.Vector3(faceColliderCenter.x, faceColliderCenterY, 0));
          const resolveAlpha = 0.03; // reduced from 0.06 for smoother push-back
          this.tmp.x = desiredX + (worldTarget.x - desiredX) * resolveAlpha;
          this.tmp.y = desiredY + (worldTarget.y - desiredY) * resolveAlpha;
          this.tmp.z = facePlaneZ;
          const mem = sphere.userData.displacedPosition;
          mem.x = mem.x + (this.tmp.x - mem.x) * 0.03; // reduced from 0.06 for smoother transition
          mem.y = mem.y + (this.tmp.y - mem.y) * 0.03;
          mem.z = facePlaneZ;
          // Anchor to boundary and extend repel cooldown to prevent immediate re-entry
          sphere.userData.lastBoundary = { x: worldTarget.x, y: worldTarget.y, z: facePlaneZ };
          const until = performance.now() + 400; // reduced from 600ms for faster return
          sphere.userData.repelUntil = Math.max(sphere.userData.repelUntil || 0, until);
          collidedThisFrame = true;
        }
      } else {
        // Fallback: axis-aligned box
        const boxLeft = faceColliderCenter.x - hx;
        const boxRight = faceColliderCenter.x + hx;
        const boxTop = faceColliderCenterY + hy;
        const boxBottom = faceColliderCenterY - hy;
        const sphereLeft = desiredX - sphereRadius;
        const sphereRight = desiredX + sphereRadius;
        const sphereTop = desiredY + sphereRadius;
        const sphereBottom = desiredY - sphereRadius;
        const isCollidingWithFaceBox = !(sphereRight < boxLeft || sphereLeft > boxRight || sphereBottom > boxTop || sphereTop < boxBottom);
        if (isCollidingWithFaceBox) {
          sphere.userData.isDisplaced = true;
          sphere.userData.displacedPosition ||= { x: sphere.position.x, y: sphere.position.y, z: facePlaneZ };
          const distToLeft = Math.abs(desiredX - boxLeft);
          const distToRight = Math.abs(desiredX - boxRight);
          const distToTop = Math.abs(desiredY - boxTop);
          const distToBottom = Math.abs(desiredY - boxBottom);
          const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
          let targetX = desiredX;
          let targetY = desiredY;
          const margin = 0.04;
          const jitter = this.getBoundaryJitter(sphere);
          if (minDist === distToLeft) { targetX = boxLeft - sphereRadius - margin; targetY += jitter.jy; }
          else if (minDist === distToRight) { targetX = boxRight + sphereRadius + margin; targetY += jitter.jy; }
          if (minDist === distToTop) { targetY = boxTop + sphereRadius + margin; targetX += jitter.jx; }
          else if (minDist === distToBottom) { targetY = boxBottom - sphereRadius - margin; targetX += jitter.jx; }
          const resolveAlpha = 0.03; // reduced from 0.06 for smoother push-back
          this.tmp.x = desiredX + (targetX - desiredX) * resolveAlpha;
          this.tmp.y = desiredY + (targetY - desiredY) * resolveAlpha;
          this.tmp.z = facePlaneZ;
          const mem = sphere.userData.displacedPosition;
          mem.x = mem.x + (this.tmp.x - mem.x) * 0.03; // reduced from 0.06 for smoother transition
          mem.y = mem.y + (this.tmp.y - mem.y) * 0.03;
          mem.z = facePlaneZ;
          // Anchor to boundary and extend repel cooldown to prevent immediate re-entry
          sphere.userData.lastBoundary = { x: targetX, y: targetY, z: facePlaneZ };
          const until = performance.now() + 400; // reduced from 600ms for faster return
          sphere.userData.repelUntil = Math.max(sphere.userData.repelUntil || 0, until);
          collidedThisFrame = true;
        }
      }
      
      // Face plane constraint: all spheres share the same Z as the face mesh
      this.tmp.z = facePlaneZ;

      // If this sphere has a displacedPosition from a push/collision, and it's no longer
      // actively being repelled, slowly nudge the stored displacedPosition back towards
      // the configured basePosition. We do this very slowly to achieve a gentle return.
      if (sphere.userData.displacedPosition && basePos) {
        const mem = sphere.userData.displacedPosition;
        // Ensure we have a timestamp marker for when the displacement was first observed
        sphere.userData.displacedAt ||= now;
        const repelUntil = sphere.userData.repelUntil || 0;
        // Only start the slow return once any explicit repel period has elapsed
        if (now > repelUntil) {
          // Distance-aware gentle return: faster when far, smooth when near
          const dx0 = mem.x - basePos.x;
          const dy0 = mem.y - basePos.y;
          const dist0 = Math.hypot(dx0, dy0);
          // Smoothstep factor in [0,1] using a 0.6 world-units window
          const t = Math.max(0, Math.min(1, dist0 / 0.6));
          const smooth = t * t * (3 - 2 * t);
          const returnAlpha = 0.01 + 0.09 * smooth; // 0.01..0.10 depending on distance (much faster)
          mem.x += (basePos.x - mem.x) * returnAlpha;
          mem.y += (basePos.y - mem.y) * returnAlpha;
          // Re-center this.tmp around the gradually-moving displaced memory so the
          // regular lerp logic picks it up and the visible sphere moves slowly back.
          this.tmp.x = mem.x + ox * 0.3;
          this.tmp.y = mem.y + oy * 0.3;
          // Add a small, decaying per-sphere wobble during the return so spheres don't align
          // on the same X/Y lines. This does not change the final base position.
          const elapsed = (now - (sphere.userData.displacedAt || now)) * 0.001; // seconds
          const wobbleDuration = 1.2; // seconds until fully gone
          if (elapsed >= 0 && elapsed < wobbleDuration) {
            const k = 1 - (elapsed / wobbleDuration);
            const amp = 0.024 * k; // max ~2.4cm in world units, decays to 0
            const sid = sphere.userData.id ?? 0;
            const f1 = 3.3 + (sid % 5) * 0.41;
            const f2 = 4.1 + (sid % 7) * 0.37;
            const ph1 = sid * 0.92 + 0.37;
            const ph2 = sid * 1.23 + 1.11;
            this.tmp.x += amp * Math.sin(ph1 + elapsed * f1);
            this.tmp.y += amp * Math.cos(ph2 + elapsed * f2);
          }
          this.tmp.z = facePlaneZ;

          // If the displaced memory is very close to base, clear the displaced flag
          const dx = mem.x - basePos.x;
          const dy = mem.y - basePos.y;
          if (Math.hypot(dx, dy) < 0.02) {
            sphere.userData.isDisplaced = false;
            sphere.userData.displacedPosition = null;
            sphere.userData.displacedAt = 0;
          }
        }
      }
      
      // Make following speed time-based and slightly faster on mobile
      let alpha = orbit.followLerp;
      // Convert per-frame alpha to time-scaled alpha targeting ~60 FPS behavior
      const frames = Math.max(1, dt / (1/60));
      alpha = 1 - Math.pow(1 - alpha, frames);
      if (this.isMobile) {
        alpha = Math.min(0.25, alpha * 1.15); // small boost on mobile
      }
  // Interpolate towards target
      const prevX = sphere.position.x;
      const prevY = sphere.position.y;
  // If displaced, blend much slower for extra smoothness
  const alphaAdjusted = (sphere.userData.isDisplaced ? Math.min(alpha * 1.5, 0.12) : alpha);
  sphere.position.lerp(this.tmp, alphaAdjusted);
      // Gentle damping post-collision to reduce jitter/violence - increased smoothing
      if (collidedThisFrame) {
        sphere.position.x = prevX + (sphere.position.x - prevX) * 0.65; // reduced from 0.85 for softer bounce
        sphere.position.y = prevY + (sphere.position.y - prevY) * 0.65;
      }
  // Ensure Z stays locked exactly on the plane after interpolation
  sphere.position.z = facePlaneZ;
    }

    // Update debug cube showing the face collision volume - now as face-sized box
    if (this.faceDebugCube) {
      // Make the cube bigger in X and Y to match face dimensions, not just a circle
      const faceBoxWidth = (faceColliderRadius * this.faceOccluderInflate * this.faceBoxScaleX) + faceColliderMargin + this.faceColliderExtraMargin + (this.faceCollisionExtra || 0);
      const faceBoxHeight = (faceColliderRadius * this.faceOccluderInflate * this.faceBoxScaleY) + faceColliderMargin + this.faceColliderExtraMargin + (this.faceCollisionExtra || 0); // Taller for face shape
      this.faceDebugCube.position.set(faceColliderCenter.x, faceColliderCenterY, facePlaneZ);
  const depth = (this.meshZThick || 0.12) * (this.faceBoxScaleZ || 1.0);
  this.faceDebugCube.scale.set(faceBoxWidth, faceBoxHeight, depth);
  this.faceDebugCube.visible = this.showFaceDebug;
      // Apply face rotation if available (use faceTracker's smoothed occlusion quaternion + correction)
      try {
        if (this.faceTracker && this.faceTracker.headOccQuatSmoothed) {
          // Use cloned corrected quaternion to avoid mutating faceTracker internals
          const corrected = this.faceTracker.headOccQuatSmoothed.clone().multiply(this.faceTracker.headOccCorrection || new THREE.Quaternion());
          this.faceDebugCube.quaternion.copy(corrected);
        }
      } catch (e) {
        // ignore if quaternion not available or THREE not ready
      }
      if (this.faceDebugCube.material && this.faceDebugCube.material.color) {
        this.faceDebugCube.material.color.setHex(collidedThisFrame ? 0xFF3333 : 0xFFCC00);
        this.faceDebugCube.material.opacity = collidedThisFrame ? 0.5 : 0.3;
      }
    }

  // Inter-sphere collision resolution - soft and smooth
  for (let iter = 0; iter < 3; iter++) { // Iterative soft separation
      for (let i = 0; i < this.followers.length; i++) {
        const sphereA = this.followers[i]; 
        const radiusA = sphereA.userData.radius;
        
        for (let j = i + 1; j < this.followers.length; j++) {
          const sphereB = this.followers[j]; 
          const radiusB = sphereB.userData.radius; 
          
          const dx = sphereB.position.x - sphereA.position.x; 
          const dy = sphereB.position.y - sphereA.position.y; 
          // With Z locked, use XY distance only
          const distSq = dx*dx + dy*dy; 
          const minDist = radiusA + radiusB + (this.interSpherePadding || 0.06); // Visible gap
          
          if (distSq > 0) { 
            const dist = Math.sqrt(distSq); 
            if (dist < minDist) { 
              const overlap = (minDist - dist); 
              const nx = dx / (dist || 1); 
              const ny = dy / (dist || 1); 
              
              // Softer resolution with moderate damping
              const baseStiffness = 0.08;
              const factor = baseStiffness * (1.0 - iter * 0.25);
              const push = overlap * 0.5 * Math.max(0.04, factor); 
              
              const pushAx = -nx * push; 
              const pushAy = -ny * push; 
              const pushBx = nx * push; 
              const pushBy = ny * push; 
              
              // Moderate damping for smooth separation
              const damping = 0.35;
              sphereA.position.x += pushAx * damping; 
              sphereA.position.y += pushAy * damping; 
              // Keep Z fixed
              sphereA.position.z = facePlaneZ; 
              sphereB.position.x += pushBx * damping; 
              sphereB.position.y += pushBy * damping; 
              sphereB.position.z = facePlaneZ; 
              // Mark as bumped for smoothing pass
              sphereA.userData.bumped = true;
              sphereB.userData.bumped = true;
              
              // Face plane constraint - removed to allow spheres to move further forward
              // const faceZ = headPosSmoothed.z + this.facePlaneMargin; 
              // if (sphereA.position.z > faceZ) sphereA.position.z = faceZ; 
              // if (sphereB.position.z > faceZ) sphereB.position.z = faceZ; 
            } 
          }
        }
      }
    }

  // Final hard clamp to ensure no touching: enforce minimum gap but soften correction
    for (let i = 0; i < this.followers.length; i++) {
      const sphereA = this.followers[i];
      const radiusA = sphereA.userData.radius;
      for (let j = i + 1; j < this.followers.length; j++) {
        const sphereB = this.followers[j];
        const radiusB = sphereB.userData.radius;
        const dx = sphereB.position.x - sphereA.position.x;
        const dy = sphereB.position.y - sphereA.position.y;
        const distSq = dx*dx + dy*dy;
        if (distSq <= 0) continue;
        const dist = Math.sqrt(distSq);
        const minDistHard = radiusA + radiusB + (this.interSpherePadding || 0.06); // keep a visible gap
        if (dist < minDistHard) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          const correction = (minDistHard - dist) * 0.4; // a bit softer
          // Move both spheres instantly away to satisfy the constraint
          sphereA.position.x -= nx * correction;
          sphereA.position.y -= ny * correction;
          sphereA.position.z = facePlaneZ;
          sphereB.position.x += nx * correction;
          sphereB.position.y += ny * correction;
          sphereB.position.z = facePlaneZ;
          // Mark as bumped for smoothing pass
          sphereA.userData.bumped = true;
          sphereB.userData.bumped = true;
        }
      }
    }

    // Gentle proximity spread: discourage clustering even when not strictly overlapping
    // Applies a small symmetrical push when spheres are within padding + extra margin
    const extraMargin = 0.10;
    for (let i = 0; i < this.followers.length; i++) {
      const sphereA = this.followers[i];
      const radiusA = sphereA.userData.radius;
      for (let j = i + 1; j < this.followers.length; j++) {
        const sphereB = this.followers[j];
        const radiusB = sphereB.userData.radius;
        const dx = sphereB.position.x - sphereA.position.x;
        const dy = sphereB.position.y - sphereA.position.y;
        const distSq = dx*dx + dy*dy;
        if (distSq <= 0) continue;
        const dist = Math.sqrt(distSq);
        const desired = radiusA + radiusB + (this.interSpherePadding || 0.06) + extraMargin;
        if (dist < desired) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          const overlap = (desired - dist);
          // Very gentle push to spread, fps-normalized and reduced to avoid jitter
          const dtNorm = Math.min(2, (dt || 0.016) * 60);
          const push = overlap * 0.04 * dtNorm;
          sphereA.position.x -= nx * push;
          sphereA.position.y -= ny * push;
          sphereA.position.z = facePlaneZ;
          sphereB.position.x += nx * push;
          sphereB.position.y += ny * push;
          sphereB.position.z = facePlaneZ;
        }
      }
    }

    // Final enforcement: ensure spheres are strictly outside the face box/OBB with added margin (hard clamp)
    for (const sphere of this.followers) {
      const sphereRadius = sphere.userData.radius;
      if (faceQuat && invFaceQuat) {
        const local = new THREE.Vector3(sphere.position.x - faceColliderCenter.x, sphere.position.y - faceColliderCenterY, 0).applyQuaternion(invFaceQuat);
        const inX = (local.x > -hx - sphereRadius) && (local.x < hx + sphereRadius);
        const inY = (local.y > -hy - sphereRadius) && (local.y < hy + sphereRadius);
        if (inX && inY) {
          const margin = 0.05;
          const gapX = hx - Math.abs(local.x);
          const gapY = hy - Math.abs(local.y);
          const jitter = this.getBoundaryJitter(sphere);
          if (gapX < gapY) {
            local.x = (local.x >= 0 ? hx + sphereRadius + margin : -hx - sphereRadius - margin);
            local.y += jitter.jy;
          } else {
            local.y = (local.y >= 0 ? hy + sphereRadius + margin : -hy - sphereRadius - margin);
            local.x += jitter.jx;
          }
          const world = local.applyQuaternion(faceQuat).add(new THREE.Vector3(faceColliderCenter.x, faceColliderCenterY, 0));
          // Hard clamp instantly outside the face OBB
          sphere.position.x = world.x;
          sphere.position.y = world.y;
          sphere.position.z = facePlaneZ;
          sphere.userData.isDisplaced = true;
          sphere.userData.lastBoundary = { x: world.x, y: world.y, z: facePlaneZ };
          sphere.userData.repelUntil = performance.now() + 600; // longer cooldown to avoid immediate return
          const mem = (sphere.userData.displacedPosition ||= { x: sphere.position.x, y: sphere.position.y, z: facePlaneZ });
          mem.x = world.x;
          mem.y = world.y;
          mem.z = facePlaneZ;
          sphere.userData.clampedFace = true;
        }
      } else {
        const boxLeft = faceColliderCenter.x - hx;
        const boxRight = faceColliderCenter.x + hx;
        const boxTop = faceColliderCenterY + hy;
        const boxBottom = faceColliderCenterY - hy;
        const inAABB = !( (sphere.position.x + sphereRadius) < boxLeft || (sphere.position.x - sphereRadius) > boxRight || (sphere.position.y - sphereRadius) > boxTop || (sphere.position.y + sphereRadius) < boxBottom );
        if (inAABB) {
          const distToLeft = Math.abs(sphere.position.x - boxLeft);
          const distToRight = Math.abs(sphere.position.x - boxRight);
          const distToTop = Math.abs(sphere.position.y - boxTop);
          const distToBottom = Math.abs(sphere.position.y - boxBottom);
          const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
          const margin = 0.05;
          let targetX = sphere.position.x;
          let targetY = sphere.position.y;
          const jitter = this.getBoundaryJitter(sphere);
          if (minDist === distToLeft) { targetX = boxLeft - sphereRadius - margin; targetY += jitter.jy; }
          else if (minDist === distToRight) { targetX = boxRight + sphereRadius + margin; targetY += jitter.jy; }
          if (minDist === distToTop) { targetY = boxTop + sphereRadius + margin; targetX += jitter.jx; }
          else if (minDist === distToBottom) { targetY = boxBottom - sphereRadius - margin; targetX += jitter.jx; }
          // Hard clamp instantly outside the AABB
          sphere.position.x = targetX;
          sphere.position.y = targetY;
          sphere.position.z = facePlaneZ;
          sphere.userData.isDisplaced = true;
          sphere.userData.lastBoundary = { x: targetX, y: targetY, z: facePlaneZ };
          sphere.userData.repelUntil = performance.now() + 600;
          const mem = (sphere.userData.displacedPosition ||= { x: sphere.position.x, y: sphere.position.y, z: facePlaneZ });
          mem.x = targetX;
          mem.y = targetY;
          mem.z = facePlaneZ;
          sphere.userData.clampedFace = true;
        }
      }
      
      // Finally, enforce exact plane lock
      sphere.position.z = facePlaneZ;
    }

    // Final dt-based low-pass smoothing to eliminate stutter (skip face-clamped)
    for (let i = 0; i < this.followers.length; i++) {
      const s = this.followers[i];
      if (s.userData.clampedFace) continue;
      const prev = prevPositions[i];
      // Use lower rate when bumped (heavier smoothing), higher otherwise
      const rate = s.userData.bumped ? 8 : 18; // Hz
      const k = 1 - Math.exp(-(rate) * Math.max(0.001, dt || 0.016));
      s.position.x = prev.x + (s.position.x - prev.x) * k;
      s.position.y = prev.y + (s.position.y - prev.y) * k;
      s.position.z = facePlaneZ;
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
    // Kick off config load and keep a handle to the promise
    this.configPromise = this.loadSphereConfig();
    await this.configPromise;
    
    // Setup Ctrl+S hotkey
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's' && this.isActive) {
        e.preventDefault();
        this.toggleConfigPanel();
      }
      // Toggle face box collider debug with 'b'
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        this.showFaceDebug = !this.showFaceDebug;
        if (this.faceDebugCube) this.faceDebugCube.visible = this.showFaceDebug;
      }
    });
  }

  async loadSphereConfig() {
    console.log('[SphereGame] Loading sphere configuration...');
    
    try {
      // Use embedded static configuration directly for consistent deployment
      console.log('[SphereGame] Using embedded static configuration with captured positions');
      this.sphereConfigs = this.getEmbeddedConfig();
      // Normalize colors according to business rule: sphere 9 must match sphere 11
      this.normalizeConfigColors?.();
      this.defaultConfig = false;
      this.applyConfigIfActive();
      this.configLoaded = true;
      console.log('[SphereGame] ✅ Loaded static config:', this.sphereConfigs.spheres.length, 'spheres');
      console.log('[SphereGame] First sphere position:', this.sphereConfigs.spheres[0]?.position);
      console.log('[DEBUG] defaultConfig after loading:', this.defaultConfig);
      console.log('[DEBUG] Sphere 9 from loaded config:', this.sphereConfigs.spheres.find(s => s.id === 9));
    } catch (e) {
      console.error('[SphereGame] Error loading sphere config:', e);
      // Use embedded config as final fallback
      this.sphereConfigs = this.getEmbeddedConfig();
      // Normalize colors according to business rule: sphere 9 must match sphere 11
      this.normalizeConfigColors?.();
      this.defaultConfig = false;
      this.applyConfigIfActive();
      this.configLoaded = true;
    }
  }

  // If the game is active, recreate spheres from the latest loaded config
  applyConfigIfActive() {
    if (this.isActive) {
      console.log('[SphereGame] Applying loaded config to active scene');
      this.clearSpheres();
      this.createSpheres();
      this.updateConfigPanelValues?.();
    }
  }

  // Get embedded configuration (fallback for GitHub Pages)
  getEmbeddedConfig() {
    return {
      "spheres": [
        { "id": 0, "position": { "x": -0.88, "y": -0.69, "z": 3.07 }, "radius": 0.14, "baseRadius": 3.27, "color": "#5E2EA7" },
        { "id": 1, "position": { "x": 0.26, "y": 0.71, "z": 3.07 }, "radius": 0.06, "baseRadius": 3.16, "color": "#00FFFF" },
        { "id": 2, "position": { "x": 0.04, "y": -1.22, "z": 3.07 }, "radius": 0.26, "baseRadius": 3.3, "color": "#3D348B" },
        { "id": 3, "position": { "x": 0.58, "y": 0.81, "z": 3.07 }, "radius": 0.15, "baseRadius": 3.23, "color": "#7209B7" },
        { "id": 4, "position": { "x": 0.62, "y": -0.55, "z": 3.07 }, "radius": 0.06, "baseRadius": 3.18, "color": "#7209B7" },
        { "id": 5, "position": { "x": -0.65, "y": -0.5, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.18, "color": "#26147A" },
        { "id": 6, "position": { "x": -0.42, "y": 0.83, "z": 3.07 }, "radius": 0.14, "baseRadius": 3.21, "color": "#8A2BE2" },
        { "id": 7, "position": { "x": -1.81, "y": -0.61, "z": 3.07 }, "radius": 0.05, "baseRadius": 3.61, "color": "#B794F4" },
        { "id": 8, "position": { "x": 0.75, "y": -0.36, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.18, "color": "#B794F4" },
        { "id": 9, "position": { "x": 1.05, "y": -0.51, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.28, "color": "#B794F4" },
        { "id": 10, "position": { "x": -0.91, "y": 0.89, "z": 3.07 }, "radius": 0.21, "baseRadius": 3.32, "color": "#00FFFF" },
        { "id": 11, "position": { "x": 1.03, "y": 0.58, "z": 3.07 }, "radius": 0.23, "baseRadius": 3.29, "color": "#B794F4" },
        { "id": 12, "position": { "x": -0.82, "y": -0.07, "z": 3.07 }, "radius": 0.15, "baseRadius": 3.18, "color": "#00FFFF" },
        { "id": 13, "position": { "x": 0.48, "y": 0.12, "z": 3.07 }, "radius": 0.15, "baseRadius": 3.11, "color": "#26147A" },
        { "id": 14, "position": { "x": 0.38, "y": 1.05, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.26, "color": "#36E5FF" },
        { "id": 15, "position": { "x": -1.1, "y": 0.15, "z": 3.07 }, "radius": 0.06, "baseRadius": 3.26, "color": "#C77DFF" },
        { "id": 16, "position": { "x": -0.57, "y": 0.65, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.19, "color": "#A45CFF" },
        { "id": 17, "position": { "x": -1.78, "y": -1.04, "z": 3.07 }, "radius": 0.15, "baseRadius": 3.7, "color": "#C77DFF" },
        { "id": 18, "position": { "x": -2.06, "y": 0.34, "z": 3.07 }, "radius": 0.15, "baseRadius": 3.71, "color": "#C77DFF" },
        { "id": 19, "position": { "x": -0.73, "y": 0.53, "z": 3.07 }, "radius": 0.03, "baseRadius": 3.2, "color": "#00FFFF" },
        { "id": 20, "position": { "x": -1.27, "y": 0.48, "z": 3.07 }, "radius": 0.17, "baseRadius": 3.35, "color": "#26147A" },
        { "id": 21, "position": { "x": 0, "y": 1.02, "z": 3.07 }, "radius": 0.23, "baseRadius": 3.23, "color": "#26147A" }
      ],
      "timestamp": 1759322578242
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
          <input type="range" min="0.03" max="0.4" step="0.01" value="${config.radius.toFixed(2)}" 
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
      
      // Debug logging for sphere 9
      if (config.id === 9) {
        console.log(`[DEBUG] Creating sphere 9 with color: ${color}, config ID: ${config.id}, array index: ${index}`);
      }
      
      // Create sphere geometry and material
      const geometry = new THREE.SphereGeometry(radius, 24, 24);
      const sphereColor = new THREE.Color(color);
      
      // Increase emissive intensity for cyan colors to make them brighter
      let emissiveMultiplier = 0.48;
      if (color === '#00FFFF') {
        emissiveMultiplier = 0.7; // Make cyan much brighter
      }
      const emissiveColor = new THREE.Color(color).multiplyScalar(emissiveMultiplier);
      
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
      // Keep original id for debugging/selection
      mesh.userData.id = config.id;
      
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

    // Post-creation debug: verify colors of spheres 9 and 11
    try {
      const nine = this.followers.find(m => m.userData?.id === 9);
      const eleven = this.followers.find(m => m.userData?.id === 11);
      if (nine && eleven) {
        console.log('[DEBUG] Material colors -> s9:', '#' + nine.material.color.getHexString().toUpperCase(), ' s11:', '#' + eleven.material.color.getHexString().toUpperCase());
      }
    } catch (_) {}
  }

  // Ensure business rule: sphere 9 color must equal sphere 11 color
  normalizeConfigColors() {
    try {
      if (!this.sphereConfigs || !Array.isArray(this.sphereConfigs.spheres)) return;
      // New rule (user): make sphere 21 the same color as 22
      // Handle both numbering interpretations:
      // - 0-based ids (if an id 22 exists): set id 21 to id 22
      // - 1-based wording (21->22): map id 20 to id 21 as a practical fallback
      const s21_0based = this.sphereConfigs.spheres.find(s => s.id === 21);
      const s22_0based = this.sphereConfigs.spheres.find(s => s.id === 22);
      if (s21_0based && s22_0based && s22_0based.color && s21_0based.color !== s22_0based.color) {
        console.log('[SphereGame] Normalizing colors: setting sphere id 21 color to match id 22:', s22_0based.color);
        s21_0based.color = s22_0based.color;
      }
      const s20_0based = this.sphereConfigs.spheres.find(s => s.id === 20);
      if (s20_0based && s21_0based && s21_0based.color && s20_0based.color !== s21_0based.color) {
        console.log('[SphereGame] Normalizing colors: setting sphere id 20 (1-based #21) color to match id 21 (1-based #22):', s21_0based.color);
        s20_0based.color = s21_0based.color;
      }
      const s9 = this.sphereConfigs.spheres.find(s => s.id === 9);
      const s11 = this.sphereConfigs.spheres.find(s => s.id === 11);
      if (s9 && s11 && s11.color && s9.color !== s11.color) {
        console.log('[SphereGame] Normalizing colors: setting sphere 9 color to match sphere 11:', s11.color);
        s9.color = s11.color;
      }

      // Also enforce: sphere 8 color must equal sphere 7 color
      const s8 = this.sphereConfigs.spheres.find(s => s.id === 8);
      const s7 = this.sphereConfigs.spheres.find(s => s.id === 7);
      if (s8 && s7 && s7.color && s8.color !== s7.color) {
        console.log('[SphereGame] Normalizing colors: setting sphere 8 color to match sphere 7:', s7.color);
        s8.color = s7.color;
      }

      // Enforce: sphere 12 must be cyan (#00FFFF)
      const s12 = this.sphereConfigs.spheres.find(s => s.id === 12);
      if (s12 && s12.color !== '#00FFFF') {
        console.log('[SphereGame] Normalizing colors: forcing sphere 12 color to cyan (#00FFFF)');
        s12.color = '#00FFFF';
      }

      // New rule: sphere 13 color must equal sphere 21 color
      const s13 = this.sphereConfigs.spheres.find(s => s.id === 13);
      const s21 = this.sphereConfigs.spheres.find(s => s.id === 21);
      if (s13 && s21 && s21.color && s13.color !== s21.color) {
        console.log('[SphereGame] Normalizing colors: setting sphere 13 color to match sphere 21:', s21.color);
        s13.color = s21.color;
      }
    } catch (e) {
      console.warn('[SphereGame] normalizeConfigColors failed:', e);
    }
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