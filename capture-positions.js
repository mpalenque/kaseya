// Script para capturar la configuración actual exacta del servidor local
// Ejecutar en la consola del navegador cuando las esferas estén cargadas

function captureSpherePositions() {
    if (!window.sphereGameInstance) {
        console.log('sphereGameInstance no encontrada');
        return;
    }
    
    const sphereGame = window.sphereGameInstance;
    const actualSpheres = [];
    
    // Capturar las posiciones reales de las esferas en la escena
    if (sphereGame.spheresGroup && sphereGame.spheresGroup.children) {
        sphereGame.spheresGroup.children.forEach((sphere, index) => {
            if (sphere.isMesh) {
                actualSpheres.push({
                    id: index,
                    position: {
                        x: parseFloat(sphere.position.x.toFixed(2)),
                        y: parseFloat(sphere.position.y.toFixed(2)),
                        z: parseFloat(sphere.position.z.toFixed(2))
                    },
                    radius: parseFloat(sphere.geometry.parameters.radius.toFixed(2)),
                    baseRadius: parseFloat((Math.sqrt(sphere.position.x*sphere.position.x + sphere.position.y*sphere.position.y + sphere.position.z*sphere.position.z)).toFixed(2)),
                    color: '#' + sphere.material.color.getHexString().toUpperCase()
                });
            }
        });
    }
    
    const config = {
        spheres: actualSpheres,
        timestamp: Date.now()
    };
    
    console.log('Configuración actual capturada:');
    console.log(JSON.stringify(config, null, 2));
    
    // Copiar al clipboard
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    console.log('✅ Configuración copiada al clipboard');
    
    return config;
}

// Exponer globalmente
window.captureSpherePositions = captureSpherePositions;