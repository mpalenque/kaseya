// UI Manager - Handles interface controls and interactions
class UIManager {
  constructor() {
    this.currentMode = 'none'; // none | draw | circles
    this.pressTimer = null;
    
    // DOM elements
    this.filtersBar = null;
    this.recorderButton = null;
    this.recorderContainer = null;
    this.previewClose = null;
    this.previewShare = null;
    this.loadingOverlay = null;
    this.tapOverlay = null;
    
    // Dependencies
    this.videoCapture = null;
    this.drawGame = null;
    this.sphereGame = null;
    this.faceTracker = null;
  }

  init(dependencies) {
    const { videoCapture, drawGame, sphereGame, faceTracker } = dependencies;
    this.videoCapture = videoCapture;
    this.drawGame = drawGame;
    this.sphereGame = sphereGame;
    this.faceTracker = faceTracker;
    
    this.initDOMElements();
    this.setupEventListeners();
    
    // Set initial mode with delay to allow THREE.js to load
    setTimeout(() => {
      this.selectFilterMode('spheres');
    }, 200);
  }

  initDOMElements() {
    this.filtersBar = document.getElementById('filters-bar');
    this.recorderButton = document.getElementById('recorder-button');
    this.recorderContainer = document.querySelector('.recorder-container');
    this.previewClose = document.getElementById('preview-close');
    this.previewShare = document.getElementById('preview-share');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.tapOverlay = document.getElementById('tap-to-start');
  }

  setupEventListeners() {
    // Filter buttons (delegation)
    this.filtersBar?.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const mode = btn.dataset.mode;
      this.selectFilterMode(mode);
    });
    
    // Recorder button (hace ruleta Y graba automáticamente)
    this.recorderButton?.addEventListener('pointerdown', (e) => this.startPress(e));
    this.recorderButton?.addEventListener('pointerup', (e) => this.endPress(e));
    this.recorderButton?.addEventListener('pointerleave', (e) => this.endPress(e));
    
    // Prevent context menu on long press
    this.recorderButton?.addEventListener('contextmenu', e => e.preventDefault());
    
    // Preview controls
    this.previewClose?.addEventListener('click', () => this.hidePreview());
    this.previewShare?.addEventListener('click', () => this.shareCurrentFile());
    
    // Window resize handler
    window.addEventListener('resize', () => this.handleResize());
  }

  selectFilterMode(mode) {
    if (!['none','draw','spheres'].includes(mode)) return;
    if (this.currentMode === mode) return;
    
    this.currentMode = mode;
    
    // Update UI buttons
    const wrappers = Array.from(document.querySelectorAll('#filters-bar .filter-wrapper'));
    const order = ['none','spheres','draw'];
    
    // Clear active states
    wrappers.forEach(w => w.classList.remove('active'));
    
    // Set active wrapper
    const centerWrapper = wrappers.find(w => w.dataset.mode === mode);
    if (!centerWrapper) return;
    centerWrapper.classList.add('active');
    
    // Ensure recorder container is in active wrapper
    const rc = document.querySelector('#filters-bar .recorder-container');
    if (rc && centerWrapper && rc.parentElement !== centerWrapper) {
      centerWrapper.appendChild(rc);
    }
    
    // Position other wrappers cyclically
    const centerIndex = order.indexOf(mode);
    const leftIndex = (centerIndex - 1 + order.length) % order.length;
    const rightIndex = (centerIndex + 1) % order.length;
    
    wrappers.forEach(w => {
      if (w.dataset.mode === mode) w.dataset.pos = 'center';
      else if (w.dataset.mode === order[leftIndex]) w.dataset.pos = 'left';
      else if (w.dataset.mode === order[rightIndex]) w.dataset.pos = 'right';
    });
    
    // Update modules based on mode
    this.updateModesForCurrentFilter(mode);

    // Toggle body class for sphere/draw modes to control CSS-driven visibility
    try {
      document.body.classList.toggle('sphere-mode', mode === 'spheres');
      document.body.classList.toggle('draw-mode', mode === 'draw');
    } catch (e) {}
  }

  updateModesForCurrentFilter(mode) {
    // Update draw game visibility
    if (this.drawGame) {
      this.drawGame.setVisibility(mode === 'draw');
      // Update word position for the current mode
      this.drawGame.updateWordPositionForMode(mode === 'draw');
    }
    
    // Handle sphere mode
    if (mode === 'spheres') {
      if (!this.sphereGame) return;
      
      // Force complete reactivation to ensure spheres always appear
      if (!this.sphereGame.isActive) {
        // First time or after full deactivate - always activate
        this.sphereGame.activate();
      } else {
        // Even if active, ensure proper state when coming from any mode
        // Check if spheres exist and are visible
        if (!this.sphereGame.followers || this.sphereGame.followers.length === 0 || 
            !this.sphereGame.spheresGroup || !this.sphereGame.spheresGroup.visible) {
          // Force reactivation if spheres are missing or invisible
          this.sphereGame.finalizeDeactivate();  // Clear current state
          this.sphereGame.activate();            // Full reactivation
        } else if (this.sphereGame.resumeFromDrawMode) {
          // Normal resume from draw mode
          this.sphereGame.resumeFromDrawMode();
        } else {
          // Fallback: ensure visibility and animation
          if (this.sphereGame.spheresGroup) this.sphereGame.spheresGroup.visible = true;
          this.sphereGame.startAnimation && this.sphereGame.startAnimation();
        }
      }
    } else if (this.sphereGame && this.sphereGame.isActive) {
      // When leaving spheres for draw, just pause to keep resources/warm state
      if (mode === 'draw' && this.sphereGame.pauseForDrawMode) {
        this.sphereGame.pauseForDrawMode();
      } else {
        // Smoothly exit spheres then deactivate when going to 'none'
        if (this.sphereGame.exitAndDeactivate) {
          this.sphereGame.exitAndDeactivate();
        } else {
          this.sphereGame.deactivate();
        }
      }
    }

    // When in draw mode, keep the 3D renderer visible to render rings (but hide spheres)
    if (mode === 'draw' && this.sphereGame) {
      try {
        if (this.sphereGame.sphereContainer) {
          this.sphereGame.sphereContainer.style.display = 'block';
        }
        // Hide/stop handled by pauseForDrawMode above
      } catch(e) {}
    }

    // Hide renderer when no filter selected
    if (mode === 'none' && this.sphereGame && this.sphereGame.sphereContainer) {
      this.sphereGame.sphereContainer.style.display = 'none';
    }
    
    // Stop spinning if not in draw mode
    if (mode !== 'draw' && this.drawGame) {
      this.drawGame.isSpinning = false;
    }
  }

  startPress(e) {
    if (!this.videoCapture || !this.recorderContainer) return;
    
    const recordingState = this.videoCapture.getRecordingState();
    if (recordingState.isRecording || (this.drawGame && this.drawGame.isSpinningActive())) return;
    
    this.recorderContainer.classList.add('active');
    
    // Start a timer; only when it elapses we begin recording
    this.pressTimer = setTimeout(() => {
      this.pressTimer = null;
      
      // Start recording
      this.recorderContainer.classList.add('recording');
      this.videoCapture.beginVideoRecording();
      
      // Start word roulette if in draw mode
      if (this.currentMode === 'draw' && this.drawGame) {
        this.drawGame.startWordRoulette();
      }
    }, 350); // long press threshold
  }

  endPress(e) {
    if (!this.recorderContainer) return;
    
    this.recorderContainer.classList.remove('active');
    
    // Short tap: cancel intention
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
      return;
    }
    
    // Long press active: maintain live recording for extra tail time
    if (this.videoCapture) {
      const recordingState = this.videoCapture.getRecordingState();
      if (recordingState.isRecording) {
        this.recorderContainer.classList.remove('recording');
        // In spheres mode, stop immediately on release; in draw mode keep delayed tail
        if (this.currentMode === 'spheres') {
          this.videoCapture.tailStopScheduled = false;
          this.videoCapture.stopVideoRecording();
        } else {
          this.videoCapture.scheduleDelayedStop();
        }
      }
    }
  }

  hideLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = 'none';
    }
  }

  showError(message) {
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

  hidePreview() {
    if (this.videoCapture) {
      this.videoCapture.hidePreview();
    }
    
    // Ensure current mode is properly restored after hiding preview
    // This fixes the issue where spheres don't appear after canceling video recording
    if (this.currentMode) {
      const currentMode = this.currentMode;
      // Force reactivation by briefly clearing and resetting the mode
      this.currentMode = null;
      this.selectFilterMode(currentMode);
    }
  }

  shareCurrentFile() {
    if (this.videoCapture) {
      this.videoCapture.shareOrDownload();
    }
  }

  handleResize() {
    // Update screen aspect ratio CSS variable
    try {
      document.documentElement.style.setProperty('--screen-ar', (window.innerWidth / window.innerHeight).toString());
    } catch(e){}
    
    // Update draw game auto-fit if needed
    if (this.drawGame) {
      this.drawGame.autoFitWordBanner();
    }
  }

  // Method to update rendering loop - called from main loop
  updateRendering() {
    // Update word position for current mode
    if (this.drawGame) {
      this.drawGame.updateWordPositionForMode(this.currentMode === 'draw');
    }
  }

  getCurrentMode() {
    return this.currentMode;
  }

  // Method to take a photo
  takePhoto() {
    if (this.videoCapture) {
      this.videoCapture.takePhoto();
    }
  }

  // Cleanup method
  cleanup() {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
  }
}

// Export for use in other modules
window.UIManager = UIManager;