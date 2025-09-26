// Ejecuta esto en la consola del navegador (F12) en http://localhost:8000
// después de que las esferas estén cargadas

console.log("=== VERIFICANDO CONFIGURACIÓN ACTUAL ===");

// 1. Verificar localStorage
const localConfig = localStorage.getItem('sphereConfig');
if (localConfig) {
    console.log("✅ ENCONTRADA CONFIGURACIÓN EN LOCALSTORAGE:");
    const parsed = JSON.parse(localConfig);
    console.log(JSON.stringify(parsed, null, 2));
} else {
    console.log("❌ No hay configuración en localStorage");
}

// 2. Verificar instancia del juego
if (window.sphereGameInstance) {
    console.log("✅ CONFIGURACIÓN EN JUEGO:");
    console.log("defaultConfig:", window.sphereGameInstance.defaultConfig);
    console.log("sphereConfigs:", window.sphereGameInstance.sphereConfigs);
} else {
    console.log("❌ No hay instancia del juego");
}

// 3. Verificar posiciones reales de las esferas
if (window.sphereGameInstance && window.sphereGameInstance.spheresGroup) {
    console.log("✅ POSICIONES REALES DE LAS ESFERAS:");
    const spheres = window.sphereGameInstance.spheresGroup.children;
    spheres.forEach((sphere, i) => {
        if (sphere.isMesh) {
            console.log(`Sphere ${i}: x=${sphere.position.x.toFixed(2)}, y=${sphere.position.y.toFixed(2)}, z=${sphere.position.z.toFixed(2)}`);
        }
    });
}

// 4. Capturar y mostrar configuración completa
if (typeof window.captureSpherePositions === 'function') {
    console.log("✅ CAPTURANDO POSICIONES ACTUALES:");
    window.captureSpherePositions();
} else {
    console.log("❌ Función captureSpherePositions no disponible");
}