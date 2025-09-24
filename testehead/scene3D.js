// scene3D.js - Módulo de contenido 3D y esferas
import * as THREE from 'https://esm.sh/three@0.160.0';

export class Scene3D {
  constructor() {
    // DOM elements
    this.app = document.getElementById('app');
    this.webcam = document.getElementById('webcam');
    this.statusDot = document.getElementById('status');
    this.note = document.getElementById('note');
    
    // 3D setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.sortObjects = true;
    this.app.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { position: 'fixed', inset: '0', zIndex: '11', pointerEvents: 'none' });

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
    this.camera.position.set(0, 0, 6);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(4, 6, 8);
    this.scene.add(dir);

    // Followers (esferas)
    this.followerCount = 180;
    this.followers = [];
    this.sphereColliders = [];
    this.faceExclusionRadius = 1.2;
    this.minGap = 0.05;
    this.facePlaneMargin = 0.08;
    this.tmp = new THREE.Vector3();
    
    const DOT_COLORS = ['#00FFFF', '#C77DFF', '#3D348B', '#7209B7', '#5E2EA7', '#A45CFF', '#36E5FF', '#8A2BE2', '#B794F4'];
    
    this.setupSpheres(DOT_COLORS);
    this.setupResize();
    
    // Render loop
    this.clock = new THREE.Clock();
  }
  
  rand(a, b) {
    return a + Math.random() * (b - a);
  }
  
  checkSphereCollision(x, y, z, radius) {
    const distanceFromFaceCenter = Math.sqrt(x*x + y*y + (z > 0 ? z*z : 0));
    if (z > -0.3 && distanceFromFaceCenter < this.faceExclusionRadius + radius) {
      return { collision: true, type: 'face' };
    }
    for (let i = 0; i < this.sphereColliders.length; i++) {
      const other = this.sphereColliders[i];
      const dx = x - other.x;
      const dy = y - other.y;
      const dz = z - other.z;
      const centerDistance = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const requiredDistance = radius + other.radius + this.minGap;
      if (centerDistance < requiredDistance) {
        return { collision: true, type: 'sphere', distance: centerDistance, required: requiredDistance, overlap: requiredDistance - centerDistance };
      }
    }
    return { collision: false };
  }

  findValidPosition(targetRadius, zone, maxAttempts = 200) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x, y, z;
      switch (zone) {
        case 'behind':
          x = (Math.random() - 0.5) * 4.0; y = (Math.random() - 0.5) * 4.0; z = -Math.abs(Math.random() * 3.0 + 0.3); break;
        case 'sides': {
          const isLeft = Math.random() < 0.5; const sideDistance = this.rand(2.0, 4.0);
          x = isLeft ? -sideDistance : sideDistance; y = (Math.random() - 0.5) * 3.0; z = (Math.random() - 0.5) * 5.0; break; }
        case 'front-corners': {
          const isLeftCorner = Math.random() < 0.5; x = isLeftCorner ? this.rand(-4.0, -2.0) : this.rand(2.0, 4.0);
          y = (Math.random() - 0.5) * 2.5; z = this.rand(1.0, 3.0); break; }
        case 'top':
          x = (Math.random() - 0.5) * 2.5; y = this.rand(2.0, 4.0); z = (Math.random() - 0.5) * 2.0; break;
      }
      const collision = this.checkSphereCollision(x, y, z, targetRadius);
      if (!collision.collision) return { x, y, z, success: true };
    }
    return { success: false };
  }
  
  setupSpheres(DOT_COLORS) {
    let successfulPlacements = 0;
    for (let i = 0; i < this.followerCount && successfulPlacements < this.followerCount; i++) {
      let r, zone, position;
      const distribution = Math.random();
      if (distribution < 0.4) { zone = 'behind'; r = this.rand(0.06, 0.15); }
      else if (distribution < 0.65) { zone = 'sides'; r = this.rand(0.12, 0.25); }
      else if (distribution < 0.85) { zone = 'front-corners'; r = this.rand(0.18, 0.32); }
      else { zone = 'top'; r = this.rand(0.15, 0.28); }

      position = this.findValidPosition(r, zone);
      if (!position.success) { r *= 0.7; position = this.findValidPosition(r, zone); }
      if (!position.success) { r *= 0.7; position = this.findValidPosition(r, zone); }
      if (!position.success) continue;

      const { x, y, z } = position;
      this.sphereColliders.push({ x, y, z, radius: r });
      const geo = new THREE.SphereGeometry(r, 24, 24);
      const colorHex = DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)];
      const color = new THREE.Color(colorHex);
      const emissiveColor = new THREE.Color(colorHex).multiplyScalar(0.4);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: emissiveColor, roughness: 0.6, metalness: 0.1, transparent: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      const orbit = { 
        baseRadius: Math.sqrt(x*x + y*y + z*z), 
        theta: Math.atan2(z, x), 
        phi: Math.acos(y / Math.sqrt(x*x + y*y + z*z)), 
        dTheta: this.rand(-0.15, 0.15) * 0.25, 
        dPhi: this.rand(-0.15, 0.15) * 0.25, 
        followLerp: this.rand(0.02, 0.06), 
        zMul: this.rand(1.3, 2.2), 
        zBias: -this.rand(0.3, 1.0) 
      };
      mesh.userData.orbit = orbit; 
      mesh.userData.radius = r; 
      mesh.renderOrder = 1; 
      this.followers.push(mesh); 
      this.scene.add(mesh);
      successfulPlacements++;
    }

    console.log(`Successfully placed ${successfulPlacements} out of ${this.followerCount} spheres without overlap`);
  }
  
  setupResize() {
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);
  }
  
  updateSpheres(headTracker) {
    const dt = Math.min(this.clock.getDelta(), 0.033);
    const headPosSmoothed = headTracker.headPosSmoothed;
    const faceColliderCenter = headTracker.faceColliderCenter;
    const faceColliderRadius = headTracker.faceColliderRadius;
    const faceColliderMargin = headTracker.faceColliderMargin;
    
    // Seguimiento de esferas
    for (const s of this.followers) {
      const o = s.userData.orbit; 
      o.theta += o.dTheta * dt; 
      o.phi += o.dPhi * dt; 
      const r = o.baseRadius;
      const ox = r * Math.sin(o.phi) * Math.cos(o.theta); 
      const oy = r * Math.cos(o.phi); 
      let oz = r * Math.sin(o.phi) * Math.sin(o.theta);
      oz = oz * o.zMul + o.zBias; 
      this.tmp.set(ox, oy, oz).add(headPosSmoothed);
      const dxh = this.tmp.x - faceColliderCenter.x; 
      const dyh = this.tmp.y - faceColliderCenter.y; 
      const dzh = this.tmp.z - faceColliderCenter.z; 
      const distHeadSq = dxh*dxh + dyh*dyh + dzh*dzh; 
      const minHeadDist = faceColliderRadius + s.userData.radius + faceColliderMargin;
      if (distHeadSq > 0.0001) { 
        const distHead = Math.sqrt(distHeadSq); 
        if (distHead < minHeadDist) { 
          const scale = (minHeadDist - distHead) / distHead; 
          this.tmp.x += dxh * scale; 
          this.tmp.y += dyh * scale; 
          this.tmp.z += dzh * scale; 
        } 
      }
      const sideAllowance = Math.abs(ox) > r * 0.6; 
      if (!sideAllowance && this.tmp.z > headPosSmoothed.z + this.facePlaneMargin) { 
        this.tmp.z = headPosSmoothed.z + this.facePlaneMargin; 
      }
      s.position.lerp(this.tmp, o.followLerp);
    }

    // Colisiones entre esferas
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.followers.length; i++) {
        const a = this.followers[i]; 
        const ra = a.userData.radius;
        for (let j = i + 1; j < this.followers.length; j++) {
          const b = this.followers[j]; 
          const rb = b.userData.radius; 
          const dx = b.position.x - a.position.x; 
          const dy = b.position.y - a.position.y; 
          const dz = b.position.z - a.position.z; 
          const distSq = dx*dx + dy*dy + dz*dz; 
          const minDist = ra + rb + 0.01; 
          if (distSq > 0) { 
            const dist = Math.sqrt(distSq); 
            if (dist < minDist) { 
              const overlap = (minDist - dist); 
              const nx = dx / dist; 
              const ny = dy / dist; 
              const nz = dz / dist; 
              const stiffness = 0.5; 
              const factor = stiffness * (1.0 - iter * 0.25); 
              const push = overlap * 0.5 * Math.max(0.1, factor); 
              const pushAx = -nx * push; 
              const pushAy = -ny * push; 
              const pushAz = -nz * push; 
              const pushBx = nx * push; 
              const pushBy = ny * push; 
              const pushBz = nz * push; 
              a.position.x = THREE.MathUtils.lerp(a.position.x, a.position.x + pushAx, 0.7); 
              a.position.y = THREE.MathUtils.lerp(a.position.y, a.position.y + pushAy, 0.7); 
              a.position.z = THREE.MathUtils.lerp(a.position.z, a.position.z + pushAz, 0.7); 
              b.position.x = THREE.MathUtils.lerp(b.position.x, b.position.x + pushBx, 0.7); 
              b.position.y = THREE.MathUtils.lerp(b.position.y, b.position.y + pushBy, 0.7); 
              b.position.z = THREE.MathUtils.lerp(b.position.z, b.position.z + pushBz, 0.7); 
              const faceZ = headPosSmoothed.z + this.facePlaneMargin; 
              if (a.position.z > faceZ) a.position.z = faceZ; 
              if (b.position.z > faceZ) b.position.z = faceZ; 
            } 
          }
        }
      }
    }
  }
  
  render() {
    this.renderer.render(this.scene, this.camera);
  }
}