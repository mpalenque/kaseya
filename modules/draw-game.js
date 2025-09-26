// Draw game functionality with word roulette and animated rings
class DrawGame {
  constructor() {
    this.currentWord = "What's my tech alter-ego?"; // Texto inicial
    this.isSpinning = false;
    this.permanentWordElement = null;
  // 3D rings
  this.ring3DGroup = null;
  this.ring3DPurple = null;
  this.ring3DCyan = null;
    this.faceTracker = null;
    
    // Smoothing variables for word tracking
    this.smoothWordX = window.innerWidth * 0.5;
    this.smoothWordY = window.innerHeight * 0.1;
    this.WORD_SMOOTHING_FACTOR = 0.25;
    
    // Font limits
    this.WORD_BANNER_MIN_FONT = 12;
    this.WORD_BANNER_MAX_FONT = 36;
    this.WORD_BANNER_LINE_HEIGHT = 1.15;
    
    // Ring tuning parameters
    this.RING_WIDTH_SCALE = 0.83;         // Width: 83%
    this.RING_HEIGHT_SCALE = 1.5;         // Height: 150%
    this.RING_ANGLE_BASE = -3;            // Rotation: -3.0°
  this.RING_ANGLE_DELTA = 20.0;           // Delta rotation: 20.0°
    this.RING_Y_OFFSET = -14;
  // 3D ring advanced tuning
  this.RING_SCALE_MULT = 2.65;           // 3D Size: 265%
  // 3-axis rotation in radians (apply after head alignment)
  this.RING_ROT_X_RAD = 25 * Math.PI / 180;  // Rot X: 25°
  this.RING_ROT_Y_RAD = 0.0;                  // Rot Y: 0°
  this.RING_ROT_Z_RAD = 0.0;                  // Rot Z: 0°
  this.RING_UP_OFFSET_FACTOR = 1.51;          // Base Height: 151%
  this.RING_UP_EXTRA_PX = 380;                // Extra Height: 380px
  this.RING_LOCAL_Y_OFFSET_FACTOR = 0.0;     // extra vertical offset in units of face radius (applied along local Y)
  this.RING_BEHIND_OFFSET_FACTOR = 0.80;     // Depth: 80%
  this.RING_Z_SEPARATION = 0.35;             // Z Separation: 35% (more separation)
  this.RING_CYAN_ROT_Z_OFFSET = 0.6;         // extra z-rotation offset for cyan ring (radians)
  this.RING_INDIVIDUAL_ROT_OFFSET = 180 * Math.PI / 180; // Individual Rotation Offset: 180°
  this.RING_LFO_AMPLITUDE = 10 * Math.PI / 180;          // LFO Amplitude: 10° (reduced for subtlety)
  this.RING_LFO_FREQUENCY = 1.5;                         // LFO Frequency: 1.5Hz (slower)
  this.RING_LFO_PHASE_OFFSET = 360 * Math.PI / 180;      // LFO Phase: 360°
  this.RING_PURPLE_ROTATION_SPEED = 0.1;                 // Purple Rot: 0.1x (slow smooth rotation)
  this.RING_CYAN_ROTATION_SPEED = -0.15;                 // Cyan Rot: -0.15x (opposite direction, slightly faster)
  // Extra: independent gentle rocking around Z for each ring
  this.RING_ROCK_Z_AMP = 3 * Math.PI / 180;              // 3 degrees
  this.RING_ROCK_Z_FREQ_PURPLE = 0.35;                   // Hz
  this.RING_ROCK_Z_FREQ_CYAN = 0.47;                     // Hz (slightly different)
  // Auto-animate the same Z rotation you tweak in the tuner
  this.RING_AUTO_ROT_Z_ENABLED = true;                   // enable continuous Z rotation
  // Oscillation (back-and-forth) in Z around base value
  this.RING_AUTO_ROT_Z_AMP_DEG = 7;                      // amplitude: 7 degrees
  this.RING_AUTO_ROT_Z_FREQ = 0.35;                      // Hz (speed of oscillation)
  this.RING_AUTO_ROT_Z_PHASE = Math.PI / 3;              // cyan phase offset vs purple
  // Keep a base (slider) value separate; we'll animate RING_ROT_Z_RAD from this base
  this.RING_ROT_Z_BASE_RAD = this.RING_ROT_Z_RAD;
    
    // Ring animation
    this.ringAnimRAF = 0;
  this.ringsTunerPanel = null; // UI panel for adjusting ring params
  // Smoothing buffers for ring group to reduce live-view jitter
  this._ringPosSmoothed = null;
  this._ringQuatSmoothed = null;
    
    // Word pool for the roulette
    this.words = [
      'Devops Alchemist ⚗️',
      'SaaS Sensei ✨',
      'Patch Master 🛠️',
      'Firewall Defender 🔥',
      'The Authenticator ✅',
      'Debugging Wizard 🧙‍♂️',
      'CSS Sorcerer 🎨',
      'Network Ninja ⚡',
      'Mad Dev Scientist 🧪',
      'The Code Poet 🖋️',
      'WiFi Wizard 📶',
      'Cloud Prophet ☁️',
      'Tech Legend 🤘',
      'Ticket Slayer 🏴‍☠️'
    ];
  }

  init(faceTracker) {
    this.faceTracker = faceTracker;
    this.createPermanentWordElement();
    this.createDrawEllipses();
    this.createRingsTuner();
    this.startRingAnimation();

    // Keyboard shortcut to toggle rings tuner (Ctrl+I / Cmd+I)
    window.addEventListener('keydown', (e) => {
      // Ignore if typing in inputs/contenteditable
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      const isTyping = tag === 'input' || tag === 'textarea' || (t && t.isContentEditable);
      if (isTyping) return;

      const isToggle = (e.key === 'i' || e.key === 'I') && (e.ctrlKey || e.metaKey);
      if (isToggle) {
        e.preventDefault();
        this.toggleRingsTuner();
      }
    });

    // Try to create 3D rings immediately if scene is already available on faceTracker
    try {
      this.create3DRings(this.faceTracker);
    } catch (e) {}
    
    // Setup resize handler
    window.addEventListener('resize', () => {
      this.autoFitWordBanner();
    });
  }

  createPermanentWordElement() {
    // Create a permanent word element that's always visible
    this.permanentWordElement = document.createElement('div');
    this.permanentWordElement.className = 'word-text';
    const inner = document.createElement('span');
    inner.className = 'word-inner';
    inner.textContent = this.currentWord;
    this.permanentWordElement.appendChild(inner);
    this.permanentWordElement.style.position = 'fixed';
    this.permanentWordElement.style.left = '50%';
    this.permanentWordElement.style.top = '16%';
    this.permanentWordElement.style.transform = 'translateX(-50%)';
    this.permanentWordElement.style.zIndex = '15';
    this.permanentWordElement.style.width = '380px';
    this.permanentWordElement.style.height = '130px';
    document.body.appendChild(this.permanentWordElement);
    this.autoFitWordBanner();
  }

  createDrawEllipses() {
    // No DOM ellipses anymore - we create 3D rings in the THREE.js scene so they can be occluded by the face occluder.
    // Creation of the 3D rings is deferred until THREE.js scene is available (see create3DRings).
  }

  updateWordPositionForMode(isDrawMode) {
    if (!this.permanentWordElement) return;

    let targetX = window.innerWidth * 0.5; // Default center
    let targetY = window.innerHeight * 0.1; // Default top

    if (this.faceTracker && this.faceTracker.getCurrentFaces().length > 0) {
      const faceBounds = this.faceTracker.getFaceBoundingBox();
      if (faceBounds) {
        // Place word well above eyes
        const faceHeightScreen = faceBounds.height;
        const desiredY = faceBounds.y - faceHeightScreen * 0.8;
        const marginTop = 22;
        const clampedY = Math.max(marginTop, desiredY);

        targetX = faceBounds.centerX;
        targetY = clampedY;
        this.permanentWordElement.style.opacity = '1';
      }
    } else {
      // No face: target default position
      targetX = window.innerWidth * 0.5;
      targetY = window.innerHeight * 0.1;
      this.permanentWordElement.style.opacity = '0.8';
    }

    // Apply smooth interpolation
  const dx = targetX - this.smoothWordX;
  const dy = targetY - this.smoothWordY;
  const dist = Math.hypot(dx, dy);
  // Slightly reduce max snap and add ease-out to avoid micro jitter when text updates
  let factor = Math.min(0.35, this.WORD_SMOOTHING_FACTOR + (dist / 500) * 0.12);
  // Small deadzone to ignore sub-pixel noise
  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) factor *= 0.5;
  this.smoothWordX += dx * factor;
  this.smoothWordY += dy * factor;

    // Update element position with smoothed values
    this.permanentWordElement.style.left = `${this.smoothWordX}px`;
    this.permanentWordElement.style.top = `${this.smoothWordY}px`;
    this.permanentWordElement.style.transform = 'translateX(-50%)';

    // Update 3D rings behind the banner (only in draw mode). Rings follow face tracking.
    if (!isDrawMode) {
      this.set3DRingsVisible(false);
    } else {
      this.update3DRingsPosition();
    }
  }

  updateEllipsesPosition() {
    // Deprecated - 3D rings will be positioned via update3DRingsPosition
  }

  // Create 3D rings in the faceTracker THREE.js scene so they are occluded by the face occluder.
  create3DRings(faceTracker) {
    if (!faceTracker || !faceTracker.scene || !window.THREE) return;
    if (this.ring3DGroup) return; // already created

    const THREE = window.THREE;
    this.ring3DGroup = new THREE.Group();
    this.ring3DGroup.name = 'draw-game-rings';

    // Función para crear un anillo con efecto de "glow" usando capas múltiples
    const createGlowingRing = (radius, tubeThickness, color, name, inclination) => {
      const ringGroup = new THREE.Group();
      ringGroup.name = name;

      // Capas para el efecto de "glow" - similar a refearing.ts
      const layers = [
        { thickness: tubeThickness, opacity: 0.8 },      // Núcleo brillante
        { thickness: tubeThickness * 3, opacity: 0.3 },   // Resplandor medio
        { thickness: tubeThickness * 6, opacity: 0.1 }    // Resplandor exterior
      ];

      layers.forEach((layer, index) => {
        const geometry = new THREE.TorusGeometry(radius, layer.thickness, 16, 200);
        
        // Crear shader personalizado para gradient + glow
        const material = new THREE.ShaderMaterial({
          uniforms: {
            baseColor: { value: new THREE.Color(color) },
            glowColor: { value: new THREE.Color(0xffffff) }, // Blanco para el glow
            opacity: { value: layer.opacity },
            time: { value: 0.0 }
          },
          vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
              vUv = uv;
              vPosition = position;
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 baseColor;
            uniform vec3 glowColor;
            uniform float opacity;
            uniform float time;
            
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
              // Crear gradient radial desde el centro del tubo hacia afuera
              vec2 center = vec2(0.5, 0.5);
              float dist = distance(vUv, center);
              
              // Gradient desde el color base hacia blanco en el centro
              float gradientFactor = smoothstep(0.0, 0.5, dist);
              vec3 finalColor = mix(glowColor, baseColor, gradientFactor);
              
              // Añadir pulsación sutil
              float pulse = sin(time * 2.0) * 0.1 + 0.9;
              finalColor *= pulse;
              
              // Intensidad basada en la normal para simular iluminación
              float intensity = dot(vNormal, vec3(0.0, 0.0, 1.0)) * 0.3 + 0.7;
              finalColor *= intensity;
              
              gl_FragColor = vec4(finalColor, opacity);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        });
        
        const ring = new THREE.Mesh(geometry, material);
        
        // Orient the torus so the ring stands vertically (wraps around the head) + inclination
        ring.rotation.x = inclination;
        
        // Guardar referencia al material para actualizar el tiempo
        ring.userData.shaderMaterial = material;
        
        ringGroup.add(ring);
      });

      return ringGroup;
    };

    // Crear los anillos con colores similares a refearing.ts
    // Grosor reducido al 10% (0.03 * 0.1 = 0.003) y con inclinaciones como en refearing.ts
    this.ring3DPurple = createGlowingRing(1.0, 0.003, 0xcc66ff, 'purple-ring', Math.PI / 2.2); // Magenta
    this.ring3DCyan = createGlowingRing(1.02, 0.003, 0x66ccff, 'cyan-ring', Math.PI / 2.5);     // Azul cian

    // Render order: keep them after occluder (occluder uses renderOrder -1/0), so set > 0
    this.ring3DPurple.children.forEach(mesh => mesh.renderOrder = 1);
    this.ring3DCyan.children.forEach(mesh => mesh.renderOrder = 1);

    this.ring3DGroup.add(this.ring3DPurple);
    this.ring3DGroup.add(this.ring3DCyan);

    // Default hidden until positioned near a detected face
    this.ring3DGroup.visible = false;

    faceTracker.scene.add(this.ring3DGroup);
  }

  set3DRingsVisible(visible) {
    if (this.ring3DGroup) this.ring3DGroup.visible = !!visible;
  }

  update3DRingsPosition() {
    if (!this.faceTracker || !this.permanentWordElement) return;
    const ft = this.faceTracker;
    // Ensure rings created when scene becomes available
    if (!this.ring3DGroup && ft.scene && window.THREE) {
      this.create3DRings(ft);
    }

    if (!this.ring3DGroup) return;

    const hasFace = ft.getCurrentFaces && ft.getCurrentFaces().length > 0;
    if (!hasFace) {
      this.set3DRingsVisible(false);
      return;
    }

    // Use face tracking for ring positioning (more stable)
    const center = ft.faceColliderCenter ? ft.faceColliderCenter.clone() : (ft.getHeadPosition ? ft.getHeadPosition().world : new THREE.Vector3(0,0,3));
    const radius = ft.faceColliderRadius || (ft.getHeadPosition ? ft.getHeadPosition().colliderRadius : 0.8);

    // Calculate upward offset that follows face tracking exactly
    // Use actual face radius for proper proportional scaling
    let upOffset = radius * this.RING_UP_OFFSET_FACTOR;
    
    // Add extra vertical offset that scales appropriately with face tracking
    // Use a scaling that makes the offset meaningful but still proportional to face size
    const pixelToWorldScale = radius * 0.5; // MUCH stronger scaling for dramatic offset control
    upOffset += (this.RING_UP_EXTRA_PX || 0) * pixelToWorldScale;
    
    // Mobile-specific correction: rings appear too high, adjust downward
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    if (isMobile) {
      upOffset -= radius * 0.25; // Stronger downward adjustment for mobile devices
    }

  // Position rings based on face tracking
    if (ft.headOccluderRoot) {
      try {
        const root = ft.headOccluderRoot;
        const pos = center.clone();
        const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion).normalize();
        const forwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).normalize();
        
        // Apply offsets
        const behindOffset = radius * this.RING_BEHIND_OFFSET_FACTOR;
        pos.addScaledVector(forwardWorld, -behindOffset);
        pos.addScaledVector(upWorld, upOffset);
        
  this.ring3DGroup.position.copy(pos);
        
        // Align the ring group's normal (Z) to forwardWorld so the ring stands vertically around the head
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), forwardWorld);
  this.ring3DGroup.quaternion.copy(q);
        // Apply user rotations (X/Y/Z) after alignment
        try {
          const eul = new THREE.Euler(this.RING_ROT_X_RAD, this.RING_ROT_Y_RAD, this.RING_ROT_Z_RAD, 'XYZ');
          const qRot = new THREE.Quaternion().setFromEuler(eul);
          this.ring3DGroup.quaternion.multiply(qRot);
          // Smooth transform to avoid stutter in live view
          this._applyRingSmoothing();
        } catch(e) {}
      } catch (e) {
        // fallback to camera-based method below
        const behindOffset = radius * this.RING_BEHIND_OFFSET_FACTOR;
        if (ft.camera && ft.camera.position) {
          const camDir = center.clone().sub(ft.camera.position).normalize();
          const upWorld = ft.camera.up ? ft.camera.up.clone().normalize() : new THREE.Vector3(0,1,0);
          const pos = center.clone().addScaledVector(camDir, behindOffset);
          pos.addScaledVector(upWorld, upOffset);
          this.ring3DGroup.position.copy(pos);
        } else {
          this.ring3DGroup.position.copy(center);
          this.ring3DGroup.position.addScaledVector(new THREE.Vector3(0,1,0), upOffset);
          this.ring3DGroup.position.z += behindOffset;
        }
        // Apply user rotations around default orientation when occluder alignment fails
        try {
          this.ring3DGroup.quaternion.set(0, 0, 0, 1);
          const eul = new THREE.Euler(this.RING_ROT_X_RAD, this.RING_ROT_Y_RAD, this.RING_ROT_Z_RAD, 'XYZ');
          const qRot = new THREE.Quaternion().setFromEuler(eul);
          this.ring3DGroup.quaternion.multiply(qRot);
          this._applyRingSmoothing();
        } catch (e2) {}
      }
    } else {
      // Compute a camera-relative offset so rings sit behind the face (away from the camera)
      let behindOffset = radius * this.RING_BEHIND_OFFSET_FACTOR;
      if (ft.camera && ft.camera.position) {
        const camDir = center.clone().sub(ft.camera.position).normalize();
        const upWorld = ft.camera.up ? ft.camera.up.clone().normalize() : new THREE.Vector3(0,1,0);
        const pos = center.clone().addScaledVector(camDir, behindOffset);
        pos.addScaledVector(upWorld, upOffset);
  this.ring3DGroup.position.copy(pos);
      } else {
        // Fallback: simple world Z offset
        this.ring3DGroup.position.copy(center);
        this.ring3DGroup.position.addScaledVector(new THREE.Vector3(0,1,0), upOffset);
        this.ring3DGroup.position.z += behindOffset;
      }
      // Apply user rotations even without occluder alignment
      try {
        this.ring3DGroup.quaternion.set(0, 0, 0, 1);
        const eul = new THREE.Euler(this.RING_ROT_X_RAD, this.RING_ROT_Y_RAD, this.RING_ROT_Z_RAD, 'XYZ');
        const qRot = new THREE.Quaternion().setFromEuler(eul);
  this.ring3DGroup.quaternion.multiply(qRot);
  this._applyRingSmoothing();
      } catch (e) {}
    }



    // Reset ring X and Z positions - but preserve Y for animation
    if (this.ring3DPurple && this.ring3DPurple.position) {
      this.ring3DPurple.position.x = 0;
      this.ring3DPurple.position.z = 0;
      // Don't reset Y - let animation handle it
    }
    if (this.ring3DCyan && this.ring3DCyan.position) {
      this.ring3DCyan.position.x = 0;
      this.ring3DCyan.position.z = 0;
      // Don't reset Y - let animation handle it
    }

    // Scale rings to match face tracking exactly
    // Use actual face radius for proportional scaling that follows face size
    const scaleBase = Math.max(0.35, radius * 1.15);

    // Apply configurable overall 3D size multiplier
    // Ensure non-overlap by biasing Purple bigger and Cyan smaller
    const purpleScale = scaleBase * this.RING_WIDTH_SCALE * this.RING_SCALE_MULT * 1.06;
    const cyanScale = scaleBase * (this.RING_WIDTH_SCALE * 0.96) * this.RING_SCALE_MULT;
    
    if (this.ring3DPurple && this.ring3DPurple.scale) {
      this.ring3DPurple.scale.setScalar(purpleScale);
    }
    if (this.ring3DCyan && this.ring3DCyan.scale) {
      this.ring3DCyan.scale.setScalar(cyanScale);
    }

    // Slightly offset rings in local Z to create parallax depth (one sits a bit further back)
    // Keep separation and also add slight Y bias to make overlap visually impossible
    const zSep = this.RING_Z_SEPARATION * scaleBase;
    if (this.ring3DPurple && this.ring3DPurple.position) {
      // Purple ring will be positioned by animation, but we set initial Z offset
      this.ring3DPurple.position.z = -zSep * 0.5;
    }
    if (this.ring3DCyan && this.ring3DCyan.position) {
      // Cyan ring will be positioned by animation, but we set initial Z offset
      this.ring3DCyan.position.z = zSep * 0.5;
    }

    this.set3DRingsVisible(true);
  }

  // Low-pass filter ring group transform to reduce micro jitter from head tracking
  _applyRingSmoothing() {
    try {
      const THREE = window.THREE;
      if (!THREE || !this.ring3DGroup) return;
      const alpha = 0.25; // smoothing factor (0=no smooth, 1=hard snap)
      // Position smoothing
      if (!this._ringPosSmoothed) this._ringPosSmoothed = this.ring3DGroup.position.clone();
      this._ringPosSmoothed.lerp(this.ring3DGroup.position, alpha);
      this.ring3DGroup.position.copy(this._ringPosSmoothed);
      // Rotation smoothing
      if (!this._ringQuatSmoothed) this._ringQuatSmoothed = this.ring3DGroup.quaternion.clone();
      this._ringQuatSmoothed.slerp(this.ring3DGroup.quaternion, alpha);
      this.ring3DGroup.quaternion.copy(this._ringQuatSmoothed);
    } catch(e) {}
  }

  startRingAnimation() {
    let last = performance.now();
    const rotAmp = 1.2; // degrees
    const bobAmp = 3.5; // px
    const rotFreq = 0.35; // cycles per second
    const bobFreq = 0.6; // cycles per second
    const phasePurple = 0;
    const phaseCyan = 1.3; // offset so they move independently

    const step = (now) => {
      const t = now / 1000;

      // Animate 2D DOM rings if they still exist (unlikely since removed), keep for backward-compat
      if (this.ellipsePurple) {
        try {
          const svgP = this.ellipsePurple.querySelector && this.ellipsePurple.querySelector('svg');
          if (svgP) {
            const baseP = this.RING_ANGLE_BASE + (this.RING_ANGLE_DELTA / 2);
            const animRot = Math.sin(2 * Math.PI * rotFreq * t + phasePurple) * rotAmp;
            const animBob = Math.sin(2 * Math.PI * bobFreq * t + phasePurple) * bobAmp;
            const visible = (this.ellipsePurple.style.opacity !== '0');
            svgP.style.transform = `rotate(${baseP + animRot}deg) translateY(${visible ? animBob : 0}px)`;
          }
        } catch (e) {}
      }

      if (this.ellipseCyan) {
        try {
          const svgC = this.ellipseCyan.querySelector && this.ellipseCyan.querySelector('svg');
          if (svgC) {
            const baseC = this.RING_ANGLE_BASE - (this.RING_ANGLE_DELTA / 2);
            const animRot = Math.sin(2 * Math.PI * rotFreq * t + phaseCyan) * rotAmp * 0.9;
            const animBob = Math.sin(2 * Math.PI * bobFreq * t + phaseCyan) * bobAmp * 0.9;
            const visible = (this.ellipseCyan.style.opacity !== '0');
            svgC.style.transform = `rotate(${baseC + animRot}deg) translateY(${visible ? animBob : 0}px)`;
          }
        } catch (e) {}
      }

      // Animate 3D rings if present - usando el estilo de refearing.ts
      if (this.ring3DGroup && window.THREE) {
        try {
          const THREE = window.THREE;
          
          if (this.ring3DPurple) {
            // Movimiento orbital (rotación del pivote) - como en refearing.ts
            this.ring3DPurple.rotation.y = t * 0.3;
            
            // Movimiento de rotación sobre sí mismos (rotación de los anillos internos)
            this.ring3DPurple.children.forEach(ring => {
              ring.rotation.z = t * 0.5;
              
              // Actualizar el tiempo en el shader para el efecto de pulsación
              if (ring.userData.shaderMaterial && ring.userData.shaderMaterial.uniforms.time) {
                ring.userData.shaderMaterial.uniforms.time.value = t;
              }
            });
            
            // Movimiento vertical suave (subir y bajar) - muy sutil como en refearing.ts
            this.ring3DPurple.position.y = Math.sin(t * 0.7) * 0.08;
          }

          if (this.ring3DCyan) {
            // Movimiento orbital con velocidad ligeramente diferente
            this.ring3DCyan.rotation.y = t * 0.25;
            
            // Rotación sobre sí mismo con velocidad diferente
            this.ring3DCyan.children.forEach(ring => {
              ring.rotation.z = t * 0.4;
              
              // Actualizar el tiempo en el shader para el efecto de pulsación
              if (ring.userData.shaderMaterial && ring.userData.shaderMaterial.uniforms.time) {
                ring.userData.shaderMaterial.uniforms.time.value = t;
              }
            });
            
            // Movimiento vertical desfasado usando cos - muy sutil como en refearing.ts
            this.ring3DCyan.position.y = Math.cos(t * 0.5) * 0.08;
          }
        } catch (e) {
          // swallow animation errors
        }
      }

      // Update debug info when tuner is visible
      try {
        const panel = this.ringsTunerPanel || document.getElementById('rings-tuner');
        if (panel && (panel.style.display !== 'none') && getComputedStyle(panel).display !== 'none') {
          this.updateRingsDebugInfo();
        }
      } catch(e) {}

      this.ringAnimRAF = requestAnimationFrame(step);
    };

    if (!this.ringAnimRAF) {
      this.ringAnimRAF = requestAnimationFrame(step);
    }
  }

  createRingsTuner() {
    const panel = document.createElement('div');
    panel.id = 'rings-tuner';
    panel.style.cssText = `
      position: fixed; top: 8px; left: 8px; z-index: 1000;
      background: rgba(0,0,0,0.55); color: #fff; padding: 8px 10px; border-radius: 8px;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px; line-height: 1.2; backdrop-filter: blur(6px);
      display: none;
    `;
    
    panel.innerHTML = `
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Rotación
          <input id="rt-rot" type="range" min="-45" max="45" step="0.5" value="${this.RING_ANGLE_BASE}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-rot-val" style="min-width:86px; text-align:right; display:inline-block;">${this.RING_ANGLE_BASE.toFixed(1)}°/Δ${this.RING_ANGLE_DELTA}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Ancho
          <input id="rt-w" type="range" min="40" max="150" step="1" value="${Math.round(this.RING_WIDTH_SCALE*100)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-w-val" style="min-width:46px; text-align:right; display:inline-block;">${Math.round(this.RING_WIDTH_SCALE*100)}%</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px;">
        <label style="white-space:nowrap;">Alto
          <input id="rt-h" type="range" min="40" max="150" step="1" value="${Math.round(this.RING_HEIGHT_SCALE*100)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-h-val" style="min-width:46px; text-align:right; display:inline-block;">${Math.round(this.RING_HEIGHT_SCALE*100)}%</span>
      </div>
      <hr style="border:none; border-top:1px solid rgba(255,255,255,0.2); margin:8px 0;" />
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Tamaño 3D
          <input id="rt-3d-scale" type="range" min="50" max="300" step="5" value="${Math.round(this.RING_SCALE_MULT*100)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-scale-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_SCALE_MULT*100)}%</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Rot X (°)
          <input id="rt-3d-rotx" type="range" min="-90" max="90" step="1" value="${Math.round(this.RING_ROT_X_RAD*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-rotx-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_ROT_X_RAD*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Rot Y (°)
          <input id="rt-3d-roty" type="range" min="-90" max="90" step="1" value="${Math.round(this.RING_ROT_Y_RAD*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-roty-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_ROT_Y_RAD*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Rot Z (°)
          <input id="rt-3d-rotz" type="range" min="-90" max="90" step="1" value="${Math.round(this.RING_ROT_Z_RAD*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-rotz-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_ROT_Z_RAD*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Altura base (%)
          <input id="rt-3d-up" type="range" min="30" max="200" step="1" value="${Math.round(this.RING_UP_OFFSET_FACTOR*100)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-up-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_UP_OFFSET_FACTOR*100)}%</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Altura extra (px)
          <input id="rt-3d-upx" type="range" min="-1000" max="1000" step="5" value="${this.RING_UP_EXTRA_PX}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-upx-val" style="min-width:56px; text-align:right; display:inline-block;">${this.RING_UP_EXTRA_PX}px</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Profundidad (×r)
          <input id="rt-3d-depth" type="range" min="0" max="80" step="1" value="${Math.round(this.RING_BEHIND_OFFSET_FACTOR*100)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-depth-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_BEHIND_OFFSET_FACTOR*100)}%</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Separación Z
          <input id="rt-3d-zsep" type="range" min="0" max="20" step="0.5" value="${(this.RING_Z_SEPARATION*100).toFixed(0)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-zsep-val" style="min-width:56px; text-align:right; display:inline-block;">${(this.RING_Z_SEPARATION*100).toFixed(0)}%</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Offset rotación individual (°)
          <input id="rt-3d-indrot" type="range" min="-180" max="180" step="1" value="${Math.round(this.RING_INDIVIDUAL_ROT_OFFSET*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-3d-indrot-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_INDIVIDUAL_ROT_OFFSET*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">LFO Amplitud (°)
          <input id="rt-lfo-amp" type="range" min="0" max="90" step="1" value="${Math.round(this.RING_LFO_AMPLITUDE*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-lfo-amp-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_LFO_AMPLITUDE*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">LFO Frecuencia (Hz)
          <input id="rt-lfo-freq" type="range" min="0.1" max="5.0" step="0.1" value="${this.RING_LFO_FREQUENCY.toFixed(1)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-lfo-freq-val" style="min-width:56px; text-align:right; display:inline-block;">${this.RING_LFO_FREQUENCY.toFixed(1)}Hz</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">LFO Desfase (°)
          <input id="rt-lfo-phase" type="range" min="0" max="360" step="5" value="${Math.round(this.RING_LFO_PHASE_OFFSET*180/Math.PI)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-lfo-phase-val" style="min-width:56px; text-align:right; display:inline-block;">${Math.round(this.RING_LFO_PHASE_OFFSET*180/Math.PI)}°</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="white-space:nowrap;">Rot. Púrpura (rev/s)
          <input id="rt-purple-speed" type="range" min="-2.0" max="2.0" step="0.1" value="${this.RING_PURPLE_ROTATION_SPEED.toFixed(1)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-purple-speed-val" style="min-width:56px; text-align:right; display:inline-block;">${this.RING_PURPLE_ROTATION_SPEED.toFixed(1)}</span>
      </div>
      <div class="rt-row" style="display:flex; align-items:center; gap:8px;">
        <label style="white-space:nowrap;">Rot. Cyan (rev/s)
          <input id="rt-cyan-speed" type="range" min="-2.0" max="2.0" step="0.1" value="${this.RING_CYAN_ROTATION_SPEED.toFixed(1)}" style="vertical-align:middle; width: 160px; margin-left:6px;">
        </label>
        <span id="rt-cyan-speed-val" style="min-width:56px; text-align:right; display:inline-block;">${this.RING_CYAN_ROTATION_SPEED.toFixed(1)}</span>
      </div>
    `;

    // Add delta slider row
    const deltaRow = document.createElement('div');
    deltaRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:6px;';
    deltaRow.innerHTML = `
      <label style="white-space:nowrap;">Delta rotación
        <input id="rt-delta" type="range" min="0" max="20" step="0.1" value="${this.RING_ANGLE_DELTA}" style="vertical-align:middle; width:160px; margin-left:6px;">
      </label>
      <span id="rt-delta-val" style="min-width:46px; text-align:right; display:inline-block;">${this.RING_ANGLE_DELTA}°</span>
    `;
    panel.appendChild(deltaRow);

    // Add Y offset slider
    const yRow = document.createElement('div');
    yRow.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:6px;';
    yRow.innerHTML = `
      <label style="white-space:nowrap;">Offset Y (px)
        <input id="rt-y" type="range" min="-1000" max="1000" step="5" value="${this.RING_Y_OFFSET}" style="vertical-align:middle; width:160px; margin-left:6px;">
      </label>
      <span id="rt-y-val" style="min-width:46px; text-align:right; display:inline-block;">${this.RING_Y_OFFSET}px</span>
    `;
    panel.appendChild(yRow);
    // Add Z auto-rotation controls (amplitude + toggle)
    const zAutoRow = document.createElement('div');
    zAutoRow.style.cssText = 'display:flex; align-items:center; gap:10px; margin-top:8px;';
    zAutoRow.innerHTML = `
      <label style="white-space:nowrap; display:flex; align-items:center; gap:6px;">
        <input id="rt-zauto-on" type="checkbox" ${this.RING_AUTO_ROT_Z_ENABLED ? 'checked' : ''} /> Z Auto
      </label>
      <label style="white-space:nowrap;">Z Auto Amp (°)
        <input id="rt-zauto-amp" type="range" min="0" max="30" step="0.5" value="${(this.RING_AUTO_ROT_Z_AMP_DEG||7)}" style="vertical-align:middle; width:160px; margin-left:6px;">
      </label>
      <span id="rt-zauto-amp-val" style="min-width:46px; text-align:right; display:inline-block;">${(this.RING_AUTO_ROT_Z_AMP_DEG||7)}°</span>
    `;
    panel.appendChild(zAutoRow);
    // Debug info block
    const dbgSep = document.createElement('hr');
    dbgSep.style.cssText = 'border:none; border-top:1px solid rgba(255,255,255,0.2); margin:8px 0;';
    panel.appendChild(dbgSep);
    const dbg = document.createElement('div');
    dbg.id = 'rt-debug';
    dbg.style.cssText = 'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; white-space: nowrap; max-width: 360px;';
    dbg.innerHTML = `
      <div style="opacity:0.85; margin-bottom:4px;">Debug</div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Purple scale:</span><span id="rt-dbg-ps">-</span></div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Cyan scale:</span><span id="rt-dbg-cs">-</span></div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Group pos:</span><span id="rt-dbg-gpos">-</span></div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Face center:</span><span id="rt-dbg-fc">-</span></div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Face radius:</span><span id="rt-dbg-fr">-</span></div>
      <div style="display:flex; gap:6px;"><span style="opacity:0.7;">Head Euler (deg XYZ):</span><span id="rt-dbg-he">-</span></div>
    `;
    panel.appendChild(dbg);
  document.body.appendChild(panel);
  this.ringsTunerPanel = panel;

    // Setup event listeners
    this.setupTunerEventListeners(panel);
    this.setup3DTunerEventListeners(panel);
  }

  updateRingsDebugInfo() {
    try {
      const panel = this.ringsTunerPanel || document.getElementById('rings-tuner');
      if (!panel) return;
      const ps = panel.querySelector('#rt-dbg-ps');
      const cs = panel.querySelector('#rt-dbg-cs');
      const gpos = panel.querySelector('#rt-dbg-gpos');
      const fc = panel.querySelector('#rt-dbg-fc');
      const fr = panel.querySelector('#rt-dbg-fr');
      const he = panel.querySelector('#rt-dbg-he');

      const fmt = (n) => (Number.isFinite(n) ? n.toFixed(3) : '-');
      const fmtDeg = (r) => (Number.isFinite(r) ? (r * 180 / Math.PI).toFixed(1) : '-');

      // Ring scales
      if (this.ring3DPurple && ps) {
        ps.textContent = `${fmt(this.ring3DPurple.scale.x)} ${fmt(this.ring3DPurple.scale.y)} ${fmt(this.ring3DPurple.scale.z)}`;
      }
      if (this.ring3DCyan && cs) {
        cs.textContent = `${fmt(this.ring3DCyan.scale.x)} ${fmt(this.ring3DCyan.scale.y)} ${fmt(this.ring3DCyan.scale.z)}`;
      }

      // Group position
      if (this.ring3DGroup && gpos) {
        const p = this.ring3DGroup.position;
        gpos.textContent = `x:${fmt(p.x)} y:${fmt(p.y)} z:${fmt(p.z)}`;
      }

      // Face center & radius
      if (this.faceTracker && (fc || fr)) {
        const THREE = window.THREE;
        const center = this.faceTracker.faceColliderCenter ? this.faceTracker.faceColliderCenter.clone() : (this.faceTracker.getHeadPosition ? this.faceTracker.getHeadPosition().world : (THREE ? new THREE.Vector3(0,0,3) : {x:0,y:0,z:3}));
        const radius = this.faceTracker.faceColliderRadius || (this.faceTracker.getHeadPosition ? this.faceTracker.getHeadPosition().colliderRadius : 0.8);
        if (fc && center) {
          fc.textContent = `x:${fmt(center.x)} y:${fmt(center.y)} z:${fmt(center.z)}`;
        }
        if (fr) {
          fr.textContent = `${fmt(radius)}`;
        }
      }

      // Head rotation (Euler from occluder root)
      if (this.faceTracker && this.faceTracker.headOccluderRoot && he && window.THREE) {
        const e = new THREE.Euler().setFromQuaternion(this.faceTracker.headOccluderRoot.quaternion, 'XYZ');
        he.textContent = `${fmtDeg(e.x)} ${fmtDeg(e.y)} ${fmtDeg(e.z)}`;
      }
    } catch (e) {}
  }

  toggleRingsTuner(forceState) {
    const panel = this.ringsTunerPanel || document.getElementById('rings-tuner');
    if (!panel) return;
    const isHidden = panel.style.display === 'none' || getComputedStyle(panel).display === 'none';
    const show = typeof forceState === 'boolean' ? forceState : isHidden;
    panel.style.display = show ? 'block' : 'none';
    if (show) {
      try { this.updateRingsDebugInfo(); } catch(e) {}
    }
  }

  setupTunerEventListeners(panel) {
    const rot = panel.querySelector('#rt-rot');
    const rotVal = panel.querySelector('#rt-rot-val');
    const w = panel.querySelector('#rt-w');
    const wVal = panel.querySelector('#rt-w-val');
    const h = panel.querySelector('#rt-h');
    const hVal = panel.querySelector('#rt-h-val');
    const d = panel.querySelector('#rt-delta');
    const dVal = panel.querySelector('#rt-delta-val');
  const y = panel.querySelector('#rt-y');
  const yVal = panel.querySelector('#rt-y-val');
  // Cross-link to 3D extra height controls for sync
  const upxMirror = panel.querySelector('#rt-3d-upx');
  const upxMirrorVal = panel.querySelector('#rt-3d-upx-val');

    const refresh = () => {
      rotVal.textContent = `${this.RING_ANGLE_BASE.toFixed(1)}°/Δ${this.RING_ANGLE_DELTA.toFixed(1)}°`;
      wVal.textContent = `${Math.round(this.RING_WIDTH_SCALE*100)}%`;
      hVal.textContent = `${Math.round(this.RING_HEIGHT_SCALE*100)}%`;
    };

    rot.addEventListener('input', (e) => {
      this.RING_ANGLE_BASE = parseFloat(e.target.value);
      refresh();
    });
    
    w.addEventListener('input', (e) => {
      this.RING_WIDTH_SCALE = Math.max(0.1, parseInt(e.target.value, 10) / 100);
      refresh();
    });
    
    h.addEventListener('input', (e) => {
      this.RING_HEIGHT_SCALE = Math.max(0.1, parseInt(e.target.value, 10) / 100);
      refresh();
    });
    
    d.addEventListener('input', (e) => {
      this.RING_ANGLE_DELTA = Math.max(0, parseFloat(e.target.value));
      dVal.textContent = `${this.RING_ANGLE_DELTA.toFixed(1)}°`;
      refresh();
    });
    
    y.addEventListener('input', (e) => {
      this.RING_Y_OFFSET = parseInt(e.target.value, 10) || 0;
      yVal.textContent = `${this.RING_Y_OFFSET}px`;
      // Keep px-based slider in sync
      this.RING_UP_EXTRA_PX = this.RING_Y_OFFSET;
      if (upxMirror) upxMirror.value = String(this.RING_UP_EXTRA_PX);
      if (upxMirrorVal) upxMirrorVal.textContent = `${this.RING_UP_EXTRA_PX}px`;
      // Force position update to apply the new Y offset immediately
      console.log(`Y Offset changed to: ${this.RING_UP_EXTRA_PX}px`);
      try { this.update3DRingsPosition(); } catch(e) {}
      refresh();
    });
  }

  setup3DTunerEventListeners(panel) {
    const scale = panel.querySelector('#rt-3d-scale');
    const scaleVal = panel.querySelector('#rt-3d-scale-val');
    const rotx = panel.querySelector('#rt-3d-rotx');
    const rotxVal = panel.querySelector('#rt-3d-rotx-val');
    const roty = panel.querySelector('#rt-3d-roty');
    const rotyVal = panel.querySelector('#rt-3d-roty-val');
    const rotz = panel.querySelector('#rt-3d-rotz');
    const rotzVal = panel.querySelector('#rt-3d-rotz-val');
    const up = panel.querySelector('#rt-3d-up');
    const upVal = panel.querySelector('#rt-3d-up-val');
    const upx = panel.querySelector('#rt-3d-upx');
    const upxVal = panel.querySelector('#rt-3d-upx-val');
    const depth = panel.querySelector('#rt-3d-depth');
    const depthVal = panel.querySelector('#rt-3d-depth-val');
    const zsep = panel.querySelector('#rt-3d-zsep');
    const zsepVal = panel.querySelector('#rt-3d-zsep-val');
    const indrot = panel.querySelector('#rt-3d-indrot');
    const indrotVal = panel.querySelector('#rt-3d-indrot-val');
    const lfoAmp = panel.querySelector('#rt-lfo-amp');
    const lfoAmpVal = panel.querySelector('#rt-lfo-amp-val');
    const lfoFreq = panel.querySelector('#rt-lfo-freq');
    const lfoFreqVal = panel.querySelector('#rt-lfo-freq-val');
    const lfoPhase = panel.querySelector('#rt-lfo-phase');
    const lfoPhaseVal = panel.querySelector('#rt-lfo-phase-val');
    const purpleSpeed = panel.querySelector('#rt-purple-speed');
    const purpleSpeedVal = panel.querySelector('#rt-purple-speed-val');
    const cyanSpeed = panel.querySelector('#rt-cyan-speed');
    const cyanSpeedVal = panel.querySelector('#rt-cyan-speed-val');
    // Cross-link to legacy Y offset controls for sync
    const yMirror = panel.querySelector('#rt-y');
    const yMirrorVal = panel.querySelector('#rt-y-val');
    // Z auto controls
    const zAutoOn = panel.querySelector('#rt-zauto-on');
    const zAutoAmp = panel.querySelector('#rt-zauto-amp');
    const zAutoAmpVal = panel.querySelector('#rt-zauto-amp-val');

    const refreshVals = () => {
      scaleVal.textContent = `${Math.round(this.RING_SCALE_MULT*100)}%`;
      rotxVal.textContent = `${Math.round(this.RING_ROT_X_RAD*180/Math.PI)}°`;
      rotyVal.textContent = `${Math.round(this.RING_ROT_Y_RAD*180/Math.PI)}°`;
      rotzVal.textContent = `${Math.round(this.RING_ROT_Z_RAD*180/Math.PI)}°`;
      upVal.textContent = `${Math.round(this.RING_UP_OFFSET_FACTOR*100)}%`;
      upxVal.textContent = `${this.RING_UP_EXTRA_PX}px`;
      depthVal.textContent = `${Math.round(this.RING_BEHIND_OFFSET_FACTOR*100)}%`;
      zsepVal.textContent = `${(this.RING_Z_SEPARATION*100).toFixed(0)}%`;
      indrotVal.textContent = `${Math.round(this.RING_INDIVIDUAL_ROT_OFFSET*180/Math.PI)}°`;
      lfoAmpVal.textContent = `${Math.round(this.RING_LFO_AMPLITUDE*180/Math.PI)}°`;
      lfoFreqVal.textContent = `${this.RING_LFO_FREQUENCY.toFixed(1)}Hz`;
      lfoPhaseVal.textContent = `${Math.round(this.RING_LFO_PHASE_OFFSET*180/Math.PI)}°`;
      purpleSpeedVal.textContent = `${this.RING_PURPLE_ROTATION_SPEED.toFixed(1)}x`;
      cyanSpeedVal.textContent = `${this.RING_CYAN_ROTATION_SPEED.toFixed(1)}x`;
      if (zAutoAmpVal) zAutoAmpVal.textContent = `${(this.RING_AUTO_ROT_Z_AMP_DEG||0).toFixed(1)}°`;
    };

    const forceUpdate = () => { try { this.update3DRingsPosition(); } catch(e) {} };
    scale.addEventListener('input', (e) => {
      this.RING_SCALE_MULT = Math.max(0.3, parseInt(e.target.value, 10) / 100);
      refreshVals();
      forceUpdate();
    });

    rotx.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_ROT_X_RAD = deg * Math.PI / 180;
      refreshVals();
      forceUpdate();
    });
    roty.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_ROT_Y_RAD = deg * Math.PI / 180;
      refreshVals();
      forceUpdate();
    });
    rotz.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_ROT_Z_RAD = deg * Math.PI / 180;
      this.RING_ROT_Z_BASE_RAD = this.RING_ROT_Z_RAD; // keep base in sync with slider
      refreshVals();
      forceUpdate();
    });

    if (zAutoOn) {
      zAutoOn.addEventListener('change', (e) => {
        this.RING_AUTO_ROT_Z_ENABLED = !!e.target.checked;
        refreshVals();
      });
    }
    if (zAutoAmp) {
      zAutoAmp.addEventListener('input', (e) => {
        this.RING_AUTO_ROT_Z_AMP_DEG = parseFloat(e.target.value) || 0;
        refreshVals();
      });
    }

    up.addEventListener('input', (e) => {
      this.RING_UP_OFFSET_FACTOR = Math.max(0, parseInt(e.target.value, 10) / 100);
      refreshVals();
      forceUpdate();
    });
    upx.addEventListener('input', (e) => {
      this.RING_UP_EXTRA_PX = parseInt(e.target.value, 10) || 0;
      refreshVals();
      // Keep legacy Y offset slider in sync so user perceives one control
      this.RING_Y_OFFSET = this.RING_UP_EXTRA_PX;
      if (yMirror) yMirror.value = String(this.RING_Y_OFFSET);
      if (yMirrorVal) yMirrorVal.textContent = `${this.RING_Y_OFFSET}px`;
      // Force position update to apply the new Y offset immediately
      console.log(`Y Offset updated to: ${this.RING_UP_EXTRA_PX}px`);
      forceUpdate();
    });

    depth.addEventListener('input', (e) => {
      this.RING_BEHIND_OFFSET_FACTOR = Math.max(0, parseInt(e.target.value, 10) / 100);
      refreshVals();
      forceUpdate();
    });

    zsep.addEventListener('input', (e) => {
      this.RING_Z_SEPARATION = Math.max(0, parseFloat(e.target.value) / 100);
      refreshVals();
      forceUpdate();
    });

    indrot.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_INDIVIDUAL_ROT_OFFSET = deg * Math.PI / 180;
      refreshVals();
      // Update the cyan ring rotation immediately
      if (this.ring3DCyan) {
        this.ring3DCyan.rotation.z = this.RING_CYAN_ROT_Z_OFFSET + this.RING_INDIVIDUAL_ROT_OFFSET;
      }
      forceUpdate();
    });

    lfoAmp.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_LFO_AMPLITUDE = deg * Math.PI / 180;
      refreshVals();
    });

    lfoFreq.addEventListener('input', (e) => {
      this.RING_LFO_FREQUENCY = Math.max(0.1, parseFloat(e.target.value) || 0.1);
      refreshVals();
    });

    lfoPhase.addEventListener('input', (e) => {
      const deg = parseInt(e.target.value, 10) || 0;
      this.RING_LFO_PHASE_OFFSET = deg * Math.PI / 180;
      refreshVals();
    });

    purpleSpeed.addEventListener('input', (e) => {
      this.RING_PURPLE_ROTATION_SPEED = parseFloat(e.target.value) || 0;
      refreshVals();
    });

    cyanSpeed.addEventListener('input', (e) => {
      this.RING_CYAN_ROTATION_SPEED = parseFloat(e.target.value) || 0;
      refreshVals();
    });
  }

  // Word roulette functionality
  async startWordRoulette() {
    if (this.isSpinning || !this.permanentWordElement) return;
    
    this.isSpinning = true;
    
    // Use the permanent word element for spinning
    this.permanentWordElement.className = 'word-text spinning';
    
    // Spin for 3 seconds
    const spinDuration = 3000;
    const spinInterval = 200;
    let spinTime = 0;
    
    const spinIntervalId = setInterval(() => {
      const randomWord = this.words[Math.floor(Math.random() * this.words.length)];
      this.currentWord = randomWord;
      const inner = this.permanentWordElement.querySelector('.word-inner');
      if (inner) {
        inner.textContent = randomWord;
        this.autoFitWordBanner();
      }
      
      spinTime += spinInterval;
      
      if (spinTime >= spinDuration) {
        clearInterval(spinIntervalId);
        this.finalizeRoulette();
      }
    }, spinInterval);
  }

  finalizeRoulette() {
    if (!this.permanentWordElement) return;
    
    // Final word selection
    const finalWord = this.words[Math.floor(Math.random() * this.words.length)];
    this.currentWord = finalWord;
    const inner = this.permanentWordElement.querySelector('.word-inner');
    if (inner) {
      inner.textContent = finalWord;
      // Do not add 'final' class to avoid yellow highlight in live view
    }
    this.permanentWordElement.className = 'word-text';
    this.autoFitWordBanner();
    
    // Keep the final effect for a bit, then return to normal
    setTimeout(() => {
      if (this.permanentWordElement) {
        this.permanentWordElement.className = 'word-text';
      }
      this.isSpinning = false;
    }, 3000);
  }

  // Auto-fit logic: shrink font-size inside fixed banner until it fits height & width
  autoFitWordBanner() {
    if (!this.permanentWordElement) return;
    const inner = this.permanentWordElement.querySelector('.word-inner');
    if (!inner) return;
    
    // Reset to max
    inner.style.fontSize = this.WORD_BANNER_MAX_FONT + 'px';
    const containerW = this.permanentWordElement.clientWidth - 8; // subtract small padding
    const containerH = this.permanentWordElement.clientHeight - 8;
    let current = this.WORD_BANNER_MAX_FONT;
    
    // Iteratively reduce until fits
    while (current > this.WORD_BANNER_MIN_FONT) {
      const { scrollWidth, scrollHeight } = inner;
      if (scrollWidth <= containerW && scrollHeight <= containerH) break;
      current -= 2;
      inner.style.fontSize = current + 'px';
    }
  }

  // Method to draw rings on canvas for video capture
  drawRingsOnCanvas(ctx, canvasWidth, canvasHeight) {
    if (!this.permanentWordElement) return;

    const bannerW = this.permanentWordElement.clientWidth || 360;
    const bannerH = this.permanentWordElement.clientHeight || 120;
    const centerX = this.smoothWordX; // screen px
    const bannerBottomY = this.smoothWordY + bannerH; // screen px
    const lift = Math.round(bannerH * 0.10);

    const ring1W = Math.round(bannerW * 1.25 * this.RING_WIDTH_SCALE);
    const ring1H = Math.max(12, Math.round(bannerH * 0.42 * this.RING_HEIGHT_SCALE));
    const ring2W = ring1W;
    const ring2H = ring1H;

    // Map screen coordinates to canvas pixel coordinates
    const scaleX = canvasWidth / window.innerWidth;
    const scaleY = canvasHeight / window.innerHeight;
    const cx = centerX * scaleX;
    const bannerBottomYc = bannerBottomY * scaleY;
    const liftC = Math.round(lift * scaleY);
    const rxP = (ring1W / 2) * scaleX;
    const ryP = (ring1H / 2) * scaleY;
    const rxC = rxP;
    const ryC = ryP;

    // Animation parameters
    const rotAmp = 1.2; // degrees
    const bobAmp = 3.5; // px
    const rotFreq = 0.35; // cycles/sec
    const bobFreq = 0.6; // cycles/sec
    const phasePurple = 0;
    const phaseCyan = 1.3;
    const t = performance.now() / 1000;

    // Purple ring
    const baseP = this.RING_ANGLE_BASE + (this.RING_ANGLE_DELTA / 2);
    const animRotP = Math.sin(2 * Math.PI * rotFreq * t + phasePurple) * rotAmp;
    const animBobP = Math.sin(2 * Math.PI * bobFreq * t + phasePurple) * bobAmp;
    const centerYP = bannerBottomYc + (ring1H / 2) * scaleY + (this.RING_Y_OFFSET * scaleY) - liftC + (animBobP * scaleY);
    const angleP = (baseP + animRotP) * (Math.PI / 180);

    // Cyan ring
    const baseC = this.RING_ANGLE_BASE - (this.RING_ANGLE_DELTA / 2);
    const animRotC = Math.sin(2 * Math.PI * rotFreq * t + phaseCyan) * rotAmp * 0.9;
    const animBobC = Math.sin(2 * Math.PI * bobFreq * t + phaseCyan) * bobAmp * 0.9;
    const centerYC = bannerBottomYc + (ring2H / 2) * scaleY + (this.RING_Y_OFFSET * scaleY) - liftC + (animBobC * scaleY);
    const angleC = (baseC + animRotC) * (Math.PI / 180);

    ctx.save();
    ctx.lineWidth = Math.max(1, 4 * ((scaleX + scaleY) / 2));
    ctx.lineCap = 'round';

    // Draw purple ring
    ctx.strokeStyle = '#AA3BFF';
    ctx.beginPath();
    ctx.ellipse(cx, centerYP, rxP, ryP, angleP, 0, Math.PI * 2);
    ctx.stroke();

    // Draw cyan ring
    ctx.beginPath();
    ctx.strokeStyle = '#00F0FF';
    ctx.ellipse(cx, centerYC, rxC, ryC, angleC, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  setVisibility(visible) {
    if (this.permanentWordElement) {
      this.permanentWordElement.style.display = visible ? 'flex' : 'none';
    }
  }

  getCurrentWord() {
    return this.currentWord;
  }

  isSpinningActive() {
    return this.isSpinning;
  }

  cleanup() {
    if (this.ringAnimRAF) {
      cancelAnimationFrame(this.ringAnimRAF);
      this.ringAnimRAF = 0;
    }
    // Remove 3D rings from scene and dispose geometries/materials
    try {
      if (this.ring3DGroup) {
        if (this.faceTracker && this.faceTracker.scene) {
          this.faceTracker.scene.remove(this.ring3DGroup);
        }
        this.ring3DGroup.traverse((obj) => {
          if (obj.geometry) {
            obj.geometry.dispose && obj.geometry.dispose();
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose && m.dispose());
            } else {
              obj.material.dispose && obj.material.dispose();
            }
          }
        });
        this.ring3DGroup = null;
        this.ring3DPurple = null;
        this.ring3DCyan = null;
      }
    } catch (e) {}
  }
}

// Export for use in other modules
window.DrawGame = DrawGame;