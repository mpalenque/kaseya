// Main application file - coordinates all modules
// MediaPipe Face Detection with Word Roulette - Restructured

// Application class that coordinates all modules
class KaseyaApp {
  constructor() {
    // Core modules
    this.faceTracker = null;
    this.sphereGame = null;
    this.drawGame = null;
    this.videoCapture = null;
    this.uiManager = null;
    
    // DOM elements
    this.webcamEl = null;
    this.canvas = null;
    this.ctx = null;
    
    // Animation loops
    this.renderRAF = 0;
    
    // Initialize all modules
    this.init();
  }

  async init() {
    try {
      // Initialize DOM elements
      this.initDOMElements();
      
      // Initialize camera first
      await this.initCamera();
      
      // Initialize all modules
      await this.initModules();
      
      // Setup rendering loop
      this.startRenderingLoop();
      
      // Hide loading overlay
      this.uiManager.hideLoadingOverlay();
      
      console.log('Kaseya App initialized successfully');
    } catch (error) {
      console.error('Initialization failed:', error);
      this.uiManager?.showError(error.message);
    }
  }

  initDOMElements() {
    this.webcamEl = document.getElementById('webcam');
    this.canvas = document.getElementById('overlay-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    if (!this.webcamEl || !this.canvas) {
      throw new Error('Required DOM elements not found');
    }
  }

  async initCamera() {
    try {
      // Check for HTTPS requirement
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        throw new Error('HTTPS required for camera access');
      }
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: false 
      });
      
      this.webcamEl.srcObject = stream;
      await this.webcamEl.play();
      
      // Set canvas size to match video
      this.canvas.width = this.webcamEl.videoWidth || 1280;
      this.canvas.height = this.webcamEl.videoHeight || 720;
      
      console.log('Camera initialized successfully');
    } catch (error) {
      console.error('Camera initialization failed:', error);
      throw error;
    }
  }

  async initModules() {
    // Initialize Face Tracker
    this.faceTracker = new FaceTracker();
    await this.faceTracker.init(this.webcamEl);
    this.faceTracker.startDetection();
    
    // Initialize Sphere Game
    this.sphereGame = new SphereGame();
    this.sphereGame.init(this.faceTracker);
    
    // Initialize Draw Game
    this.drawGame = new DrawGame();
    this.drawGame.init(this.faceTracker);
    
  // Initialize Video Capture
  this.videoCapture = new VideoCapture();
  await this.videoCapture.init(this.webcamEl, this.drawGame, this.sphereGame, this.faceTracker);
    
    // Initialize UI Manager
    this.uiManager = new UIManager();
    this.uiManager.init({
      videoCapture: this.videoCapture,
      drawGame: this.drawGame,
      sphereGame: this.sphereGame,
      faceTracker: this.faceTracker
    });
  }

  startRenderingLoop() {
    const renderFrame = () => {
      this.drawOverlay();
      this.uiManager.updateRendering();
      this.renderRAF = requestAnimationFrame(renderFrame);
    };

    renderFrame();
  }

  drawOverlay() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // In draw mode, render the 3D scene (rings) and skip 2D rings
    const mode = this.uiManager.getCurrentMode();
    if (mode === 'draw') {
      if (this.faceTracker && this.faceTracker.renderer && this.faceTracker.scene && this.faceTracker.camera) {
        // Ensure spheres group hidden in draw mode
        if (this.sphereGame && this.sphereGame.spheresGroup) {
          this.sphereGame.spheresGroup.visible = false;
        }
        this.faceTracker.renderer.render(this.faceTracker.scene, this.faceTracker.camera);
      }
      return;
    }

    // Skip overlay if sphere mode (sphere game renders on its own)
    if (mode === 'spheres') return;
  }

  // Cleanup method
  cleanup() {
    // Stop all animation loops
    if (this.renderRAF) {
      cancelAnimationFrame(this.renderRAF);
      this.renderRAF = 0;
    }
    
    // Cleanup modules
    this.faceTracker?.stopDetection();
    this.sphereGame?.deactivate();
    this.drawGame?.cleanup();
    this.videoCapture?.stopVideoRecording();
    this.uiManager?.cleanup();
  }
}

// Load all module scripts and initialize the app
async function loadModulesAndInit() {
  try {
    // Load THREE.js first as a global script (not as module)
    await loadScript('https://unpkg.com/three@0.160.0/build/three.min.js');
    
    // Add a small delay to ensure THREE.js is fully loaded
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify THREE.js is loaded
    if (typeof THREE === 'undefined') {
      throw new Error('THREE.js failed to load');
    }
    
    // Load FBXLoader dynamically as ES6 module
    try {
      const { FBXLoader } = await import('https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js');
      THREE.FBXLoader = FBXLoader;
      console.log('FBXLoader loaded successfully');
    } catch (e) {
      console.warn('FBXLoader failed to load:', e);
    }
    
    const modules = [
      'modules/face-tracker.js',
      'modules/sphere-game.js', 
      'modules/draw-game.js',
      'modules/video-capture.js',
      'modules/ui-manager.js'
    ];

    // Load all modules
    for (const module of modules) {
      await loadScript(module);
    }
    
    // Initialize the app once all modules are loaded
    window.kaseyaApp = new KaseyaApp();
  } catch (error) {
    console.error('Failed to load modules:', error);
    showLoadingError(error.message);
  }
}

// Helper function to load scripts dynamically
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

// Show loading error
function showLoadingError(message) {
  const errorMsg = document.createElement('div');
  errorMsg.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(255,0,0,0.9); color: white; padding: 20px; border-radius: 10px;
    text-align: center; z-index: 1000; max-width: 90vw;
  `;
  errorMsg.innerHTML = `Error loading application: ${message}<br>Please refresh the page.`;
  document.body.appendChild(errorMsg);
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadModulesAndInit);
} else {
  loadModulesAndInit();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  window.kaseyaApp?.cleanup();
});