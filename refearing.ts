<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anillos de Energía con Three.js</title>
    <style>
        body {
            margin: 0;
            overflow: hidden;
            background-color: #050515; /* Fondo oscuro casi negro */
        }
        canvas {
            display: block;
        }
    </style>
</head>
<body>
    <script type="importmap">
        {
            "imports": {
                "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
            }
        }
    </script>
    <script type="module">
        import * as THREE from 'three';

        // --- Configuración básica ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ antialias: true });

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(renderer.domElement);

        camera.position.z = 7;

        // --- Creación de los anillos ---

        // Función para crear un anillo con su "glow" simulado usando capas
        function createGlowingRing(radius, tubeThickness, color, inclination) {
            const pivot = new THREE.Group();

            // Capas para el efecto de "glow"
            const layers = [
                { thickness: tubeThickness, opacity: 0.8 },      // Núcleo brillante
                { thickness: tubeThickness * 3, opacity: 0.3 },   // Resplandor medio
                { thickness: tubeThickness * 6, opacity: 0.1 }    // Resplandor exterior
            ];

            layers.forEach(layer => {
                const geometry = new THREE.TorusGeometry(radius, layer.thickness, 16, 200);
                const material = new THREE.MeshBasicMaterial({
                    color: color,
                    transparent: true,
                    opacity: layer.opacity,
                    blending: THREE.AdditiveBlending // Clave para el efecto de brillo
                });
                const ring = new THREE.Mesh(geometry, material);
                ring.rotation.x = inclination;
                pivot.add(ring);
            });
            
            scene.add(pivot);
            return pivot;
        }

        // Crear los dos anillos con la función de capas
        const ring1Pivot = createGlowingRing(3, 0.03, 0x66ccff, Math.PI / 2.5); // Anillo azul
        const ring2Pivot = createGlowingRing(3.2, 0.03, 0xcc66ff, Math.PI / 2.2); // Anillo magenta

        // --- Animación ---
        const clock = new THREE.Clock();

        function animate() {
            requestAnimationFrame(animate);

            const elapsedTime = clock.getElapsedTime();

            // Movimiento orbital (rotación del pivote) - AHORA GIRAN EN LA MISMA DIRECCIÓN
            ring1Pivot.rotation.y = elapsedTime * 0.3;
            ring2Pivot.rotation.y = elapsedTime * 0.25; // Cambiado para que no sea negativo

            // Movimiento de rotación sobre sí mismos (rotación de los anillos internos) - AHORA GIRAN EN LA MISMA DIRECCIÓN
            // Se rotan todos los hijos del pivote
            ring1Pivot.children.forEach(ring => {
                ring.rotation.z = elapsedTime * 0.5;
            });
            ring2Pivot.children.forEach(ring => {
                ring.rotation.z = elapsedTime * 0.4; // Cambiado para que no sea negativo
            });

            // Movimiento vertical suave (subir y bajar)
            ring1Pivot.position.y = Math.sin(elapsedTime * 0.7) * 0.5;
            ring2Pivot.position.y = Math.cos(elapsedTime * 0.5) * 0.5; // Usamos cos para desfasar el movimiento

            renderer.render(scene, camera);
        }

        // --- Manejo del redimensionamiento de la ventana ---
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
        });

        // Iniciar la animación
        animate();
    </script>
</body>
</html>

