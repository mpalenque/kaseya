// Color circles/particles system functionality
class ColorCircles {
  constructor() {
    this.particles = [];
    this.particleAnimationId = null;
    this.isActive = false;
    this.faceTracker = null;
    
    // Animation state
    this.groupYaw = 0;   // rotación Y (giro izquierda/derecha)
    this.groupPitch = 0; // rotación X (inclinación arriba/abajo)
    
    // Container element
    this.dotsContainer = null;
  }

  init(faceTracker) {
    this.faceTracker = faceTracker;
    this.createDotsContainer();
  }

  createDotsContainer() {
    this.dotsContainer = document.getElementById('dots-assets-container');
    if (!this.dotsContainer) {
      this.dotsContainer = document.createElement('div');
      this.dotsContainer.id = 'dots-assets-container';
      this.dotsContainer.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;perspective:1400px;z-index:12;';
      document.body.appendChild(this.dotsContainer);
    }
  }

  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    document.body.classList.add('particles-mode');
    this.createParticles();
    this.startAnimation();
  }

  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    document.body.classList.remove('particles-mode');
    this.clearParticles();
    this.stopAnimation();
  }

  createParticles() {
    // === Figma Dots Assets implementation ===
    // Layout extracted relative to frame (width 630, height 926)
    // Columns: Large (294) at x=0 (y:0,316,632) | Medium (156) at x=346 (y:77,393,709) | Small (72) at x=558 (y:119,435,751)
    // Depth strategy: smaller / brighter dots appear nearer (higher z), large farther (lower z)
    this.clearParticles();
    
    const layoutWidth = 630;
    const layoutHeight = 926;
    
    // Colors palette
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
    
    // Scale group relative to viewport
    const baseScale = Math.min(window.innerWidth / (layoutWidth * 2.2), window.innerHeight / (layoutHeight * 1.8));
    const groupScale = Math.max(0.28, Math.min(0.55, baseScale));
    
    const allSpecs = [...specs, ...specs.map(s => ({...s}))]; // duplicate for double amount
    let megaCount = 0;
    const MAX_MEGA = 2; // límite de mega círculos
    
    allSpecs.forEach((spec, idx) => {
      const el = document.createElement('div');
      el.className = 'particle dot-asset';
      el.style.position = 'absolute';
      el.style.borderRadius = '50%';
      el.style.background = spec.color;
      el.style.boxShadow = '0 0 25px -5px rgba(0,0,0,0.35)';
      el.style.willChange = 'transform';
      el.dataset.depth = spec.depth;
      this.dotsContainer.appendChild(el);
      
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
      
      // Mega círculos: 2x del más grande actual
      if (spec.size === 294 && megaCount < MAX_MEGA && Math.random() < 0.22) {
        baseSize = 294 * 1.4 * 2 * groupScale * (0.9 + Math.random()*0.2);
        isMega = true;
        megaCount++;
      } else if (spec.size === 294 && Math.random() < 0.38) {
        // Super círculos (1.4x) cuando no son mega
        baseSize = 294 * 1.4 * groupScale * (0.9 + Math.random()*0.2);
      }
      
      // Ensure DOM element size matches computed baseSize
      el.style.width = baseSize + 'px';
      el.style.height = baseSize + 'px';
      
      this.particles.push({
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
    
    // Después de crear todos: tomar 3 más frontales y duplicar su tamaño
    const frontMost = [...this.particles]
      .sort((a,b)=> b.depth - a.depth) // depth -40 se vuelve primero
      .filter(p=> !p.isMega)
      .slice(0,3);
    frontMost.forEach(p => { 
      p.baseSize *= 2; 
      if (p.element) { 
        p.element.style.width = p.baseSize + 'px'; 
        p.element.style.height = p.baseSize + 'px'; 
      }
    });
    
    // Ultra círculo: uno que sea el doble del más grande actual
    if (this.particles.length) {
      let largest = this.particles.reduce((m,p)=> p.baseSize>m.baseSize? p : m, this.particles[0]);
      const ORIGINAL_MAX = 294;
      if (largest.baseSize < ORIGINAL_MAX * groupScale * 5.5) {
        largest.baseSize *= 2;
        largest.isUltra = true;
        if (largest.element) { 
          largest.element.style.width = largest.baseSize + 'px'; 
          largest.element.style.height = largest.baseSize + 'px'; 
        }
      }
    }
  }

  clearParticles() {
    this.particles.forEach(particleData => {
      if (particleData.element && particleData.element.parentNode) {
        particleData.element.parentNode.removeChild(particleData.element);
      }
    });
    this.particles = [];
  }

  startAnimation() {
    if (!this.faceTracker) {
      console.warn('Face tracker not available for particles animation');
      return;
    }

    const animate = (ts) => {
      const facePos = this.faceTracker.getFacePosition();
      const faceX = facePos.pixels.x;
      const faceY = facePos.pixels.y;
      const faceR = facePos.radius * 0.9;
      
      // Objetivos de rotación según la posición normalizada
      const targetYaw = (facePos.normalized.x - 0.5) * 0.9;   // ~±0.9 rad (~±51°)
      const targetPitch = (facePos.normalized.y - 0.5) * 0.6; // ~±0.6 rad (~±34°)
      
      // Suavizado
      this.groupYaw += (targetYaw - this.groupYaw) * 0.07;
      this.groupPitch += (targetPitch - this.groupPitch) * 0.07;
      
      const cosY = Math.cos(this.groupYaw), sinY = Math.sin(this.groupYaw);
      const cosX = Math.cos(this.groupPitch), sinX = Math.sin(this.groupPitch);
      
      this.particles.forEach((p, idx) => {
        const layoutWidth = 630; 
        const layoutHeight = 926;
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
        
        // Empuje mínimo para alejar de la cara
        const dx = targetX - faceX;
        const dy = targetY - faceY;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        const desiredMin = faceR + p.baseSize * (0.32 + p.radialFactor*0.26) + 55 + (p.radialFactor*38);
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
          p.x = targetX; 
          p.y = targetY;
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
        
        // Escala según profundidad
        const depthScale = 0.55 + (depthNorm * 0.75);
        
        // Pequeña inclinación simulada según velocidad
        p.tiltPhase += p.tiltSpeed;
        const tiltX = (p.vy * 0.002) + Math.sin(p.tiltPhase)*2;
        const tiltY = (p.vx * -0.002) + Math.cos(p.tiltPhase*0.7)*2;
        
        p.element.style.transform = `translate3d(${(p.x - p.baseSize/2)}px, ${(p.y - p.baseSize/2)}px, ${elasticDepth}px) scale(${depthScale}) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      });
      
      if (this.isActive) {
        this.particleAnimationId = requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  stopAnimation() {
    if (this.particleAnimationId) {
      cancelAnimationFrame(this.particleAnimationId);
      this.particleAnimationId = null;
    }
  }

  getParticles() {
    return this.particles;
  }

  // Helper methods for collision detection
  isInFaceArea(x, y) {
    if (!this.faceTracker) return false;
    
    const facePos = this.faceTracker.getFacePosition();
    const dx = x - facePos.pixels.x;
    const dy = y - facePos.pixels.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const exclusion = Math.max(150, facePos.radius * 1.2); // Buffer around face
    return distance < exclusion;
  }

  isInButtonZone(x, y, buttonZones) {
    return buttonZones.some(zone => {
      return x >= zone.x && x <= zone.x + zone.width && 
             y >= zone.y && y <= zone.y + zone.height;
    });
  }
}

// Export for use in other modules
window.ColorCircles = ColorCircles;