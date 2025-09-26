console.log("📍 INSTRUCCIONES PARA CAPTURAR POSICIONES REALES:");
console.log("1. Abre http://localhost:8000 en tu navegador");
console.log("2. Espera a que las esferas se carguen");
console.log("3. Abre DevTools (F12)");
console.log("4. Pega y ejecuta este código en la consola:");
console.log("");
console.log("// CÓDIGO PARA CAPTURAR POSICIONES:");
console.log("window.captureSpherePositions()");
console.log("");
console.log("5. Copia el JSON que se imprime en la consola");
console.log("6. Pégamelo en el chat para que pueda crear la versión estática");

// También crear una función simplificada de captura
window.getCCurrentPositions = function() {
    const sphereGame = window.sphereGameInstance;
    if (!sphereGame || !sphereGame.spheresGroup) {
        return "ERROR: No hay esferas cargadas";
    }
    
    const positions = [];
    sphereGame.spheresGroup.children.forEach((sphere, i) => {
        if (sphere.isMesh) {
            positions.push({
                id: i,
                x: parseFloat(sphere.position.x.toFixed(2)),
                y: parseFloat(sphere.position.y.toFixed(2)),
                z: parseFloat(sphere.position.z.toFixed(2)),
                radius: parseFloat(sphere.geometry.parameters.radius.toFixed(2))
            });
        }
    });
    
    console.log("=== POSICIONES ACTUALES ===");
    console.log(JSON.stringify(positions, null, 2));
    return positions;
};