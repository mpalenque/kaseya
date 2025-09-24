// app.js - Archivo principal que conecta tracking y 3D
import { HeadTracker } from './headTracker.js';
import { Scene3D } from './scene3D.js';

class App {
  constructor() {
    // Inicializar la escena 3D
    this.scene3D = new Scene3D();
    
    // Inicializar el head tracker con los elementos de la escena
    this.headTracker = new HeadTracker(
      this.scene3D.webcam,
      this.scene3D.statusDot,
      this.scene3D.note,
      this.scene3D.scene,
      this.scene3D.camera,
      this.scene3D.renderer
    );
    
    this.setupControls();
    this.startRenderLoop();
  }
  
  setupControls() {
    // Controles UI
    const scaleXSlider = document.getElementById('scaleX');
    const scaleYSlider = document.getElementById('scaleY');
    const scaleZSlider = document.getElementById('scaleZ');
    const posXSlider = document.getElementById('posX');
    const posYSlider = document.getElementById('posY');
    const posZSlider = document.getElementById('posZ');
    const scaleXValue = document.getElementById('scaleXValue');
    const scaleYValue = document.getElementById('scaleYValue');
    const scaleZValue = document.getElementById('scaleZValue');
    const posXValue = document.getElementById('posXValue');
    const posYValue = document.getElementById('posYValue');
    const posZValue = document.getElementById('posZValue');
    const toggleOcc = document.getElementById('toggleOcc');
    
    // Establecer checkbox como marcado por defecto (oclusión activada)
    if (toggleOcc) {
      toggleOcc.checked = true;
    }

    scaleXSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.faceScaleX = value;
      if (scaleXValue) scaleXValue.textContent = value.toFixed(1); 
    });
    
    scaleYSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.faceScaleY = value;
      if (scaleYValue) scaleYValue.textContent = value.toFixed(1); 
    });
    
    scaleZSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.faceScaleZ = value;
      if (scaleZValue) scaleZValue.textContent = value.toFixed(1); 
    });
    
    posXSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.facePosX = value;
      if (posXValue) posXValue.textContent = value.toFixed(1); 
    });
    
    posYSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.facePosY = value;
      if (posYValue) posYValue.textContent = value.toFixed(1); 
    });
    
    posZSlider?.addEventListener('input', (e) => { 
      const value = parseFloat(e.target.value);
      this.headTracker.facePosZ = value;
      if (posZValue) posZValue.textContent = value.toFixed(1); 
    });
    
    toggleOcc?.addEventListener('change', (e) => { 
      this.headTracker.setOccluderEnabled(!!e.target.checked);
    });
  }
  
  startRenderLoop() {
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Actualizar tracking de cabeza
      this.headTracker.update();
      
      // Actualizar esferas 3D
      this.scene3D.updateSpheres(this.headTracker);
      
      // Renderizar la escena
      this.scene3D.render();
    };
    
    animate();
  }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  new App();
});