// Draw game functionality with word roulette and animated rings
class DrawGame {
  constructor() {
    this.currentWord = "What's my tech alter-ego?"; // Texto inicial
    this.isSpinning = false;
    this.permanentWordElement = null;
    this.ellipsePurple = null;
    this.ellipseCyan = null;
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
    this.RING_WIDTH_SCALE = 0.83;
    this.RING_HEIGHT_SCALE = 1.5;
    this.RING_ANGLE_BASE = -3;
    this.RING_ANGLE_DELTA = 1.8;
    this.RING_Y_OFFSET = -14;
    
    // Ring animation
    this.ringAnimRAF = 0;
    
    // Word pool for the roulette
    this.words = [
      'Debugging Wizard 🧙‍♂️',
      'Captain Stack Overflow 🧠',
      'Deadline Denier⏳',
      'Sir Talks-a-Lot (in Meetings)🎙️',
      'CSS Sorcerer 🎨',
      'Network Ninja⚡',
      'Tab Hoarder🧾',
      'Mad Dev Scientist 🧪',
      'The Code Poet🖋️',
      'WiFi Wizard 📶',
      'Cloud Prophet ☁️',
      'Meme Lord 👑',
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
    // Purple ellipse (#AA3BFF)
    this.ellipsePurple = document.createElement('div');
    this.ellipsePurple.className = 'draw-ellipse ellipse-purple';
    this.ellipsePurple.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="45" ry="25" fill="none" stroke="currentColor" stroke-width="4" vector-effect="non-scaling-stroke"/></svg>';
    document.body.appendChild(this.ellipsePurple);

    // Cyan ellipse (#00F0FF)
    this.ellipseCyan = document.createElement('div');
    this.ellipseCyan.className = 'draw-ellipse ellipse-cyan';
    this.ellipseCyan.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="45" ry="25" fill="none" stroke="currentColor" stroke-width="4" vector-effect="non-scaling-stroke"/></svg>';
    document.body.appendChild(this.ellipseCyan);

    // Start hidden until positioned
    this.ellipsePurple.style.opacity = '0';
    this.ellipseCyan.style.opacity = '0';
    // Hide DOM SVG rings to avoid duplication; we'll render rings on the overlay canvas
    this.ellipsePurple.style.display = 'none';
    this.ellipseCyan.style.display = 'none';
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
    const factor = Math.min(0.45, this.WORD_SMOOTHING_FACTOR + (dist / 500) * 0.15);
    this.smoothWordX += dx * factor;
    this.smoothWordY += dy * factor;

    // Update element position with smoothed values
    this.permanentWordElement.style.left = `${this.smoothWordX}px`;
    this.permanentWordElement.style.top = `${this.smoothWordY}px`;
    this.permanentWordElement.style.transform = 'translateX(-50%)';

    // Update ellipses behind the banner (only in draw mode)
    if (this.ellipsePurple && this.ellipseCyan) {
      if (!isDrawMode) {
        this.ellipsePurple.style.opacity = '0';
        this.ellipseCyan.style.opacity = '0';
      } else {
        this.updateEllipsesPosition();
      }
    }
  }

  updateEllipsesPosition() {
    const bannerW = this.permanentWordElement.clientWidth || 360;
    const bannerH = this.permanentWordElement.clientHeight || 120;
    const centerX = this.smoothWordX;
    const bannerBottomY = this.smoothWordY + bannerH;

    // Elliptical ring sizes relative to banner
    const ring1W = Math.round(bannerW * 1.25 * this.RING_WIDTH_SCALE);
    const ring1H = Math.max(12, Math.round(bannerH * 0.42 * this.RING_HEIGHT_SCALE));
    const ring2W = ring1W;
    const ring2H = ring1H;

    // Shared geometry
    [this.ellipsePurple, this.ellipseCyan].forEach(el => {
      el.style.position = 'fixed';
      el.style.left = `${centerX}px`;
      el.style.zIndex = '14'; // behind banner
      el.style.pointerEvents = 'none';
      el.style.background = 'transparent';
    });

    // Individual sizes
    this.ellipsePurple.style.width = `${ring1W}px`;
    this.ellipsePurple.style.height = `${ring1H}px`;
    const lift = Math.round(bannerH * 0.10);
    this.ellipsePurple.style.top = `${bannerBottomY + ring1H / 2 + this.RING_Y_OFFSET - lift}px`;
    this.ellipsePurple.style.transform = 'translate(-50%, -50%)';
    
    const svgP = this.ellipsePurple.querySelector('svg');
    if (svgP) { 
      this.displayBlock(svgP); 
      svgP.style.transformOrigin = '50% 50%'; 
      svgP.style.willChange = 'transform'; 
    }

    this.ellipseCyan.style.width = `${ring2W}px`;
    this.ellipseCyan.style.height = `${ring2H}px`;
    this.ellipseCyan.style.top = `${bannerBottomY + ring2H / 2 + this.RING_Y_OFFSET - lift}px`;
    this.ellipseCyan.style.transform = 'translate(-50%, -50%)';
    
    const svgC = this.ellipseCyan.querySelector('svg');
    if (svgC) { 
      this.displayBlock(svgC); 
      svgC.style.transformOrigin = '50% 50%'; 
      svgC.style.willChange = 'transform'; 
    }

    // Make visible
    this.ellipsePurple.style.opacity = '1';
    this.ellipseCyan.style.opacity = '1';
  }

  displayBlock(el) { 
    el.style.display = 'block'; 
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

      if (this.ellipsePurple) {
        const svgP = this.ellipsePurple.querySelector('svg');
        if (svgP) {
          const baseP = this.RING_ANGLE_BASE + (this.RING_ANGLE_DELTA / 2);
          const animRot = Math.sin(2 * Math.PI * rotFreq * t + phasePurple) * rotAmp;
          const animBob = Math.sin(2 * Math.PI * bobFreq * t + phasePurple) * bobAmp;
          const visible = (this.ellipsePurple.style.opacity !== '0');
          svgP.style.transform = `rotate(${baseP + animRot}deg) translateY(${visible ? animBob : 0}px)`;
        }
      }

      if (this.ellipseCyan) {
        const svgC = this.ellipseCyan.querySelector('svg');
        if (svgC) {
          const baseC = this.RING_ANGLE_BASE - (this.RING_ANGLE_DELTA / 2);
          const animRot = Math.sin(2 * Math.PI * rotFreq * t + phaseCyan) * rotAmp * 0.9;
          const animBob = Math.sin(2 * Math.PI * bobFreq * t + phaseCyan) * bobAmp * 0.9;
          const visible = (this.ellipseCyan.style.opacity !== '0');
          svgC.style.transform = `rotate(${baseC + animRot}deg) translateY(${visible ? animBob : 0}px)`;
        }
      }

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
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
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
        <input id="rt-y" type="range" min="-80" max="120" step="1" value="${this.RING_Y_OFFSET}" style="vertical-align:middle; width:160px; margin-left:6px;">
      </label>
      <span id="rt-y-val" style="min-width:46px; text-align:right; display:inline-block;">${this.RING_Y_OFFSET}px</span>
    `;
    panel.appendChild(yRow);
    document.body.appendChild(panel);

    // Setup event listeners
    this.setupTunerEventListeners(panel);
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
      refresh();
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
      inner.classList.add('final');
    }
    this.permanentWordElement.className = 'word-text final';
    this.autoFitWordBanner();
    
    // Keep the final effect for a bit, then return to normal
    setTimeout(() => {
      if (this.permanentWordElement) {
        this.permanentWordElement.className = 'word-text';
        const inner = this.permanentWordElement.querySelector('.word-inner');
        if (inner) {
          inner.classList.remove('final');
        }
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
  }
}

// Export for use in other modules
window.DrawGame = DrawGame;