// headTracker.js - Módulo de tracking de cabeza y MediaPipe
import * as THREE from 'https://esm.sh/three@0.160.0';
import Delaunator from 'https://esm.sh/delaunator@5';
import { FBXLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js';
import { FaceLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest';

export class HeadTracker {
  constructor(webcam, statusDot, note, scene, camera, renderer) {
    this.webcam = webcam;
    this.statusDot = statusDot;
    this.note = note;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    // Face mesh occluder controls
    this.faceScaleX = 1.0;
    this.faceScaleY = 1.0;
    this.faceScaleZ = 1.0;
    this.facePosX = 0.0;
    this.facePosY = 0.2;
    this.facePosZ = 0.0;
    
    // Face landmark mesh (depth-only occluder)
    this.faceMesh = null;
    this.faceMeshGeom = null;
    this.facePositions = null;
    this.faceTargets = null;
    this.lastTriangulationFrame = -1;
    this.triFrameSkip = 3;
    
    // Head tracking state
    this.headPos = new THREE.Vector3();
    this.headPosSmoothed = new THREE.Vector3();
    this.mirrorVideoX = true;
    this.faceColliderCenter = new THREE.Vector3();
    this.faceColliderRadius = 0.9;
    this.faceColliderMargin = 0.1;
    this.facePlaneMargin = 0.08;
    this.meshRadialScale = 1.6 * 0.93 * 0.97;
    this.meshExtraPush = 0.0;
    this.meshHorizontalScale = 0.9 * 0.95;
    
    // FBX head occluder
    this.fbxLoader = new FBXLoader();
    this.headOccluderRoot = null;
    this.headOccluderMesh = null;
    this.headOccluderLoaded = false;
    this.baseOccluderWidth = 1;
    this.headOccScaleSmoothed = 1;
    this.headOccQuatSmoothed = new THREE.Quaternion();
    this.headOccCorrection = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, Math.PI, 0));
    this.occluderBackOffsetFactor = 0.3;
    this.occluderSizeAdjust = 1.0;
    this.occluderEnabled = true; // ACTIVADO POR DEFECTO
    
    // MediaPipe
    this.faceLandmarker = null;
    this.lastVideoTime = -1;
    
    this.init();
  }
  
  async init() {
    await this.initCamera();
    await this.initFaceLandmarker();
    this.loadOccluder();
  }
  
  ensureFaceMesh(count) {
    if (this.faceMesh) return;
    this.facePositions = new Float32Array(count * 3);
    this.faceTargets = new Float32Array(count * 3);
    this.faceMeshGeom = new THREE.BufferGeometry();
    this.faceMeshGeom.setAttribute('position', new THREE.BufferAttribute(this.facePositions, 3));
    const faceMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true });
    this.faceMesh = new THREE.Mesh(this.faceMeshGeom, faceMat);
    this.faceMesh.frustumCulled = false;
    this.faceMesh.visible = this.occluderEnabled; // visible basado en el estado
    this.faceMesh.renderOrder = -1; // primero
    this.scene.add(this.faceMesh);
  }
  
  setDepthOnlyMaterial(root) {
    root.traverse((obj) => { if (obj.isMesh) obj.material = new THREE.MeshBasicMaterial({ colorWrite: false }); });
  }
  
  loadOccluder() {
    this.fbxLoader.load('../occluder.fbx', (obj) => {
      this.headOccluderMesh = obj;
      this.setDepthOnlyMaterial(this.headOccluderMesh);
      const box = new THREE.Box3().setFromObject(this.headOccluderMesh);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      this.baseOccluderWidth = Math.max(1e-3, size.x);
      this.headOccluderMesh.position.sub(center);
      this.headOccluderRoot = new THREE.Group();
      this.headOccluderRoot.add(this.headOccluderMesh);
      this.headOccluderRoot.frustumCulled = false;
      this.headOccluderRoot.visible = this.occluderEnabled; // visible basado en el estado
      this.scene.add(this.headOccluderRoot);
      this.headOccluderLoaded = true;
    }, undefined, (err) => {
      console.error('Error cargando occluder.fbx', err);
    });
  }
  
  normToNDC(x, y) {
    const cw = this.renderer.domElement.clientWidth;
    const ch = this.renderer.domElement.clientHeight;
    const vw = this.webcam.videoWidth || 1280;
    const vh = this.webcam.videoHeight || 720;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    let xNorm = x, yNorm = y;
    if (videoAspect > canvasAspect) {
      const displayedWidth = ch * videoAspect;
      const offsetX = (displayedWidth - cw) / 2;
      const xDisp = x * displayedWidth - offsetX;
      xNorm = xDisp / cw;
    } else {
      const displayedHeight = cw / videoAspect;
      const offsetY = (displayedHeight - ch) / 2;
      const yDisp = y * displayedHeight - offsetY;
      yNorm = yDisp / ch;
    }
    xNorm = THREE.MathUtils.clamp(xNorm, 0, 1);
    yNorm = THREE.MathUtils.clamp(yNorm, 0, 1);
    if (this.mirrorVideoX) xNorm = 1 - xNorm;
    return { x: xNorm * 2 - 1, y: (1 - yNorm) * 2 - 1 };
  }
  
  normToScreen(x, y) {
    const cw = this.renderer.domElement.clientWidth;
    const ch = this.renderer.domElement.clientHeight;
    const vw = this.webcam.videoWidth || 1280;
    const vh = this.webcam.videoHeight || 720;
    const videoAspect = vw / vh;
    const canvasAspect = cw / ch;
    let xNorm = x, yNorm = y;
    if (videoAspect > canvasAspect) {
      const displayedWidth = ch * videoAspect;
      const offsetX = (displayedWidth - cw) / 2;
      const xDisp = x * displayedWidth - offsetX;
      xNorm = xDisp / cw;
    } else {
      const displayedHeight = cw / videoAspect;
      const offsetY = (displayedHeight - ch) / 2;
      const yDisp = y * displayedHeight - offsetY;
      yNorm = yDisp / ch;
    }
    xNorm = THREE.MathUtils.clamp(xNorm, 0, 1);
    yNorm = THREE.MathUtils.clamp(yNorm, 0, 1);
    if (this.mirrorVideoX) xNorm = 1 - xNorm;
    return { x: xNorm * cw, y: yNorm * ch };
  }
  
  async initFaceLandmarker() {
    try {
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm');
      this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrices: false,
        runningMode: 'VIDEO',
        numFaces: 1
      });
      this.statusDot.style.background = '#2ecc71';
      this.statusDot.style.boxShadow = '0 0 12px rgba(46,204,113,.9)';
      this.note.textContent = 'Modelo cargado. Moviendo esferas con tu cabeza.';
    } catch (err) {
      console.error(err);
      this.note.textContent = 'Error al cargar el modelo: ' + (err?.message || err);
      this.statusDot.style.background = '#e74c3c';
      this.statusDot.style.boxShadow = '0 0 12px rgba(231,76,60,.9)';
    }
  }
  
  async initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      this.webcam.srcObject = stream;
      await this.webcam.play();
    } catch (err) {
      console.error('No se pudo acceder a la cámara', err);
      this.note.textContent = 'No se pudo acceder a la cámara. Revisa permisos y usa HTTPS/localhost.';
      this.statusDot.style.background = '#e74c3c';
      this.statusDot.style.boxShadow = '0 0 12px rgba(231,76,60,.9)';
    }
  }
  
  update() {
    if (this.faceLandmarker && this.webcam.readyState >= 2) {
      const videoTime = this.webcam.currentTime;
      if (videoTime !== this.lastVideoTime) {
        this.lastVideoTime = videoTime;
        const res = this.faceLandmarker.detectForVideo(this.webcam, performance.now());
        if (res?.faceLandmarks?.length) {
          const landmarks = res.faceLandmarks[0];
          this.ensureFaceMesh(landmarks.length);
          let sx = 0, sy = 0, sz = 0;
          for (let i = 0; i < landmarks.length; i++) {
            const l = landmarks[i];
            sx += l.x; sy += l.y; sz += l.z;
          }
          const n = landmarks.length;
          const cx = sx / n, cy = sy / n, cz = sz / n;
          const ndc = this.normToNDC(cx, cy);
          const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera);
          const dirRay = p.sub(this.camera.position).normalize();
          const targetDistance = 3.0;
          this.headPos.copy(this.camera.position).add(dirRay.multiplyScalar(targetDistance));
          this.headPosSmoothed.lerp(this.headPos, 0.25);

          const zScale = 1.8;
          const count = landmarks.length;
          for (let i = 0; i < count; i++) {
            const l = landmarks[i];
            const ndcP = this.normToNDC(l.x, l.y);
            const proj = new THREE.Vector3(ndcP.x, ndcP.y, 0.5).unproject(this.camera);
            const ray = proj.sub(this.camera.position).normalize();
            const zOff = THREE.MathUtils.clamp((l.z - cz) * -zScale, -1.2, 1.2);
            const dist = targetDistance + zOff;
            const idx = i * 3;
            this.faceTargets[idx + 0] = this.camera.position.x + ray.x * dist;
            this.faceTargets[idx + 1] = this.camera.position.y + ray.y * dist;
            this.faceTargets[idx + 2] = this.camera.position.z + ray.z * dist;
          }

          if (this.meshRadialScale !== 1.0 || this.meshExtraPush !== 0.0 || this.meshHorizontalScale !== 1.0) {
            const cxw = this.headPosSmoothed.x, cyw = this.headPosSmoothed.y, czw = this.headPosSmoothed.z;
            for (let i = 0; i < count; i++) {
              const idx = i * 3;
              let x = this.faceTargets[idx + 0] - cxw;
              let y = this.faceTargets[idx + 1] - cyw;
              let z = this.faceTargets[idx + 2] - czw;
              const len = Math.hypot(x, y, z) || 1.0;
              x = x * this.meshRadialScale + (x / len) * this.meshExtraPush;
              y = y * this.meshRadialScale + (y / len) * this.meshExtraPush;
              z = z * this.meshRadialScale + (z / len) * this.meshExtraPush;
              x *= this.meshHorizontalScale;
              this.faceTargets[idx + 0] = cxw + x;
              this.faceTargets[idx + 1] = cyw + y;
              this.faceTargets[idx + 2] = czw + z;
            }
          }

          if (this.facePositions && this.faceTargets) {
            const lerpF = 0.35;
            for (let i = 0; i < this.facePositions.length; i++) {
              const cur = this.facePositions[i];
              const to = this.faceTargets[i];
              this.facePositions[i] = cur + (to - cur) * lerpF;
            }
            this.faceMeshGeom.attributes.position.needsUpdate = true;
            this.faceMeshGeom.computeVertexNormals();
          }

          const frameNumber = Math.floor(performance.now() / (1000 / 60));
          if (frameNumber !== this.lastTriangulationFrame && (frameNumber % this.triFrameSkip === 0)) {
            this.lastTriangulationFrame = frameNumber;
            const pts2D = new Array(count);
            for (let i = 0; i < count; i++) {
              const l = landmarks[i];
              const s = this.normToScreen(l.x, l.y);
              pts2D[i] = [s.x, s.y];
            }
            const dela = Delaunator.from(pts2D);
            const tris = dela.triangles;
            const idxArr = new Uint16Array(tris);
            this.faceMeshGeom.setIndex(new THREE.BufferAttribute(idxArr, 1));
            this.faceMeshGeom.computeVertexNormals();
          }

          // Occluder visibility controlled by checkbox
          if (this.faceMesh) {
            this.faceMesh.visible = this.occluderEnabled;
            this.faceMesh.scale.set(this.faceScaleX, this.faceScaleY, this.faceScaleZ);
            this.faceMesh.position.set(this.facePosX, this.facePosY, this.facePosZ);
          }

          if (this.occluderEnabled && this.headOccluderLoaded && this.headOccluderRoot && this.facePositions) {
            this.headOccluderRoot.visible = true;
            this.headOccluderRoot.position.copy(this.headPosSmoothed);
            try {
              const countPos = this.faceMeshGeom.attributes.position.count;
              if (countPos >= 3) {
                const pick = (i) => {
                  const idx = i * 3;
                  return new THREE.Vector3(this.facePositions[idx + 0], this.facePositions[idx + 1], this.facePositions[idx + 2]);
                };
                const noseIdx = Math.min(1, countPos - 1);
                const leftIdx = Math.min(234, countPos - 1);
                const rightIdx = Math.min(454, countPos - 1);
                const noseP = pick(noseIdx);
                const leftP = pick(leftIdx);
                const rightP = pick(rightIdx);
                const vRight = rightP.clone().sub(leftP).normalize();
                const mid = leftP.clone().add(rightP).multiplyScalar(0.5);
                const vForward = mid.clone().sub(noseP).normalize();
                const vUp = new THREE.Vector3().crossVectors(vForward, vRight).normalize();
                const vRightOrtho = new THREE.Vector3().crossVectors(vUp, vForward).normalize();
                const m = new THREE.Matrix4();
                m.makeBasis(vRightOrtho, vUp, vForward);
                let q = new THREE.Quaternion().setFromRotationMatrix(m);
                const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
                if (this.mirrorVideoX) e.y = -e.y;
                e.x = -e.x;
                e.x *= 0.45;
                const qAdj = new THREE.Quaternion().setFromEuler(e, 'YXZ');
                this.headOccQuatSmoothed.slerp(qAdj, 0.25);
                const corrected = this.headOccQuatSmoothed.clone().multiply(this.headOccCorrection);
                this.headOccluderRoot.quaternion.copy(corrected);
                let minXw = Infinity, maxXw = -Infinity;
                for (let i = 0; i < this.faceMeshGeom.attributes.position.count; i++) {
                  const idx = i * 3;
                  const x = this.facePositions[idx + 0];
                  if (x < minXw) minXw = x;
                  if (x > maxXw) maxXw = x;
                }
                const faceWidthNow = Math.max(1e-3, maxXw - minXw);
                const forwardWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(corrected).normalize();
                const backOffset = -faceWidthNow * this.occluderBackOffsetFactor;
                this.headOccluderRoot.position.copy(this.headPosSmoothed).addScaledVector(forwardWorld, backOffset);
              } else {
                this.headOccluderRoot.lookAt(this.camera.position);
              }
            } catch (e) {
              this.headOccluderRoot.lookAt(this.camera.position);
            }

            let minX = Infinity, maxX = -Infinity;
            for (let i = 0; i < this.faceMeshGeom.attributes.position.count; i++) {
              const idx = i * 3;
              const x = this.facePositions[idx + 0];
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
            const faceWidth = Math.max(1e-3, maxX - minX);
            const targetScale = (faceWidth / this.baseOccluderWidth) * this.occluderSizeAdjust;
            this.headOccScaleSmoothed += (targetScale - this.headOccScaleSmoothed) * 0.25;
            this.headOccluderRoot.scale.setScalar(this.headOccScaleSmoothed);
            this.faceColliderCenter.copy(this.headPosSmoothed);
            this.faceColliderRadius = (faceWidth * 0.5) * 1.08;
          }

          // Siempre mantener el collider aunque la oclusión esté OFF
          if (this.faceMeshGeom && this.facePositions) {
            let minX = Infinity, maxX = -Infinity;
            for (let i = 0; i < this.faceMeshGeom.attributes.position.count; i++) {
              const idx = i * 3;
              const x = this.facePositions[idx + 0];
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
            const faceWidthAny = Math.max(1e-3, maxX - minX);
            this.faceColliderCenter.copy(this.headPosSmoothed);
            this.faceColliderRadius = (faceWidthAny * 0.5) * 1.08;
          }
        } else {
          this.headPosSmoothed.lerp(new THREE.Vector3(0, 0, 0), 0.02);
          if (this.faceMesh) this.faceMesh.visible = false;
          if (this.headOccluderRoot) this.headOccluderRoot.visible = false;
        }
      }
    }
  }
  
  // Métodos para controlar la oclusión
  setOccluderEnabled(enabled) {
    this.occluderEnabled = enabled;
    if (this.headOccluderRoot) this.headOccluderRoot.visible = enabled;
    if (this.faceMesh) this.faceMesh.visible = enabled;
  }
  
  setFaceScale(x, y, z) {
    this.faceScaleX = x;
    this.faceScaleY = y;
    this.faceScaleZ = z;
  }
  
  setFacePosition(x, y, z) {
    this.facePosX = x;
    this.facePosY = y;
    this.facePosZ = z;
  }
}