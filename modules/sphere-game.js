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
    this.followerCount = 120; // Reduced for better performance
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

  init(faceTracker) {
    this.faceTracker = faceTracker;
    this.createSphereContainer();
    this.setup3DScene();
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
      console.error('THREE.js scene not ready');
      return;
    }
    
    this.clearSpheres();
    
    // Color palette matching the original design
    const DOT_COLORS = [
      '#00FFFF', '#C77DFF', '#3D348B', '#7209B7', '#5E2EA7', 
      '#A45CFF', '#36E5FF', '#8A2BE2', '#B794F4'
    ];
    
    let successfulPlacements = 0;
    
    for (let i = 0; i < this.followerCount && successfulPlacements < this.followerCount; i++) {
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
      const colorHex = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
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
      orbit.theta += orbit.dTheta * dt; 
      orbit.phi += orbit.dPhi * dt; 
      
      const r = orbit.baseRadius;
      const ox = r * Math.sin(orbit.phi) * Math.cos(orbit.theta); 
      const oy = r * Math.cos(orbit.phi); 
      let oz = r * Math.sin(orbit.phi) * Math.sin(orbit.theta);
      oz = oz * orbit.zMul + orbit.zBias; 
      
      this.tmp.set(ox, oy, oz).add(headPosSmoothed);
      
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
      
      // Face plane constraint
      const sideAllowance = Math.abs(ox) > r * 0.6; 
      if (!sideAllowance && this.tmp.z > headPosSmoothed.z + this.facePlaneMargin) { 
        this.tmp.z = headPosSmoothed.z + this.facePlaneMargin; 
      }
      
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
              
              // Face plane constraint
              const faceZ = headPosSmoothed.z + this.facePlaneMargin; 
              if (sphereA.position.z > faceZ) sphereA.position.z = faceZ; 
              if (sphereB.position.z > faceZ) sphereB.position.z = faceZ; 
            } 
          }
        }
      }
    }

    // Final enforcement: ensure spheres are outside the face occluder radius with added margin
    const faceZ = headPosSmoothed.z + this.facePlaneMargin;
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
      // Keep in front of face plane
      if (sphere.position.z > faceZ) sphere.position.z = faceZ;
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
  }
}

// Export for use in other modules
window.SphereGame = SphereGame;