// Script para capturar y editar configuración de esferas en tiempo real
// Funciona con Ctrl+E para abrir el editor

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

// Editor visual de posiciones con sliders
function createSphereEditor() {
    if (!window.sphereGameInstance) {
        console.log('sphereGameInstance no encontrada');
        return;
    }

    // Si ya existe el editor, solo togglearlo
    const existingEditor = document.getElementById('sphere-position-editor');
    if (existingEditor) {
        const isVisible = existingEditor.style.display !== 'none';
        existingEditor.style.display = isVisible ? 'none' : 'block';
        return;
    }

    const sphereGame = window.sphereGameInstance;
    if (!sphereGame.followers || sphereGame.followers.length === 0) {
        console.log('No hay esferas cargadas para editar');
        return;
    }

    // Crear panel de edición
    const editor = document.createElement('div');
    editor.id = 'sphere-position-editor';
    editor.style.cssText = `
        position: fixed; top: 20px; right: 20px; width: 400px; max-height: 80vh;
        background: rgba(0,0,0,0.9); color: white; padding: 15px; border-radius: 12px;
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 13px; line-height: 1.3; border: 2px solid #A44BFF;
        z-index: 3000; overflow-y: auto; backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(164, 75, 255, 0.3);
    `;

    // Header con botones de control
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex; justify-content: space-between; align-items: center; 
        margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.3); 
        padding-bottom: 10px;
    `;
    header.innerHTML = `
        <h3 style="margin: 0; color: #A44BFF; font-size: 16px; font-weight: 800;">
            🎯 Editor de Esferas (${sphereGame.followers.length})
        </h3>
        <button id="close-editor" style="
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.3);
            color: white; font-size: 18px; cursor: pointer; padding: 5px 10px;
            border-radius: 6px; transition: all 0.2s;
        ">✕</button>
    `;

    // Botones de acción
    const actions = document.createElement('div');
    actions.style.cssText = `
        display: flex; gap: 8px; margin-bottom: 15px; flex-wrap: wrap;
    `;
    actions.innerHTML = `
        <button id="apply-temp" style="
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white; border: none; padding: 8px 12px; border-radius: 6px;
            cursor: pointer; font-size: 11px; font-weight: 600; flex: 1;
            transition: transform 0.2s; min-width: 80px;
        ">✅ Aplicar Ahora</button>
        <button id="save-static" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; border: none; padding: 8px 12px; border-radius: 6px;
            cursor: pointer; font-size: 11px; font-weight: 600; flex: 1;
            transition: transform 0.2s; min-width: 80px;
        ">💾 Descargar Archivo</button>
        <button id="reset-positions" style="
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white; border: none; padding: 8px 12px; border-radius: 6px;
            cursor: pointer; font-size: 11px; font-weight: 600; flex: 1;
            transition: transform 0.2s; min-width: 80px;
        ">🔄 Reset</button>
        <button id="copy-config" style="
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
            color: white; border: none; padding: 8px 12px; border-radius: 6px;
            cursor: pointer; font-size: 11px; font-weight: 600; flex: 1;
            transition: transform 0.2s; min-width: 80px;
        ">📋 Copiar JSON</button>
    `;

        // Controles globales del face box (escala X/Y)
        const globalControls = document.createElement('div');
        globalControls.style.cssText = `
                margin-bottom: 12px; padding: 10px; 
                background: rgba(255,255,255,0.08); border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.12);
        `;
            // Show defaults consistent with sphere-game.js (larger defaults)
            const fbX = (sphereGame.faceBoxScaleX || 100).toFixed(2);
            const fbY = (sphereGame.faceBoxScaleY || 170).toFixed(2);
            const fbZ = (sphereGame.faceBoxScaleZ || 1.0).toFixed(2);
        globalControls.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
                <strong style="color:#FFD166">🧊 Face Box</strong>
                <span style="opacity:0.7">Escala</span>
            </div>
            <div style="display:grid; grid-template-columns: 20px 1fr 50px; gap: 6px; margin-bottom: 6px; align-items: center;">
                <label style="color:#ff6b6b; font-weight:600;">X:</label>
                    <input id="fb-scale-x" type="range" min="1" max="200" step="0.1" value="${fbX}" />
                <span id="fb-scale-x-val">${fbX}</span>
            </div>
            <div style="display:grid; grid-template-columns: 20px 1fr 50px; gap: 6px; align-items: center;">
                    <label style="color:#4ecdc4; font-weight:600;">Y:</label>
                    <input id="fb-scale-y" type="range" min="1" max="200" step="0.1" value="${fbY}" />
                <span id="fb-scale-y-val">${fbY}</span>
            </div>
            <div style="display:grid; grid-template-columns: 20px 1fr 50px; gap: 6px; align-items: center;">
                    <label style="color:#45b7d1; font-weight:600;">Z:</label>
                    <input id="fb-scale-z" type="range" min="0.1" max="10" step="0.1" value="${fbZ}" />
                    <span id="fb-scale-z-val">${fbZ}</span>
                </div>
        `;

        // Lista de esferas con controles
    const spheresList = document.createElement('div');
    spheresList.id = 'spheres-controls-list';
    spheresList.style.cssText = `
        max-height: 50vh; overflow-y: auto; 
        border: 1px solid rgba(255,255,255,0.1); 
        border-radius: 8px; padding: 8px;
        background: rgba(255,255,255,0.05);
    `;

    // Construir interfaz para cada esfera
    let spheresHTML = '';
    sphereGame.followers.forEach((sphere, index) => {
        const pos = sphere.position;
        // Obtener radio de la geometría actual o userData como fallback
        const radius = sphere.geometry?.parameters?.radius || sphere.userData?.radius || 0.1;
        const color = sphere.material ? `#${sphere.material.color.getHexString()}` : '#00FFFF';
        
        // Debug: mostrar valores actuales
        console.log(`Esfera ${index}: pos(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}), radius: ${radius.toFixed(2)}`);

        spheresHTML += `
            <div class="sphere-control" data-index="${index}" style="
                margin-bottom: 12px; padding: 10px; 
                background: rgba(255,255,255,0.08); border-radius: 8px;
                border-left: 4px solid ${color};
            ">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <div style="
                        width: 12px; height: 12px; border-radius: 50%; 
                        background: ${color}; margin-right: 8px;
                        box-shadow: 0 0 8px ${color}88;
                    "></div>
                    <strong>Esfera ${index + 1}</strong>
                </div>
                
                <div style="display: grid; grid-template-columns: 20px 1fr 50px; gap: 6px; margin-bottom: 4px; align-items: center;">
                    <label style="color: #ff6b6b; font-weight: 600;">X:</label>
                    <input type="range" min="-6" max="6" step="0.1" value="${pos.x.toFixed(1)}"
                           data-sphere="${index}" data-axis="x" class="position-slider"
                           style="width: 100%;">
                    <span class="value-display" data-sphere="${index}" data-axis="x">${pos.x.toFixed(1)}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 20px 1fr 50px; gap: 6px; margin-bottom: 4px; align-items: center;">
                    <label style="color: #4ecdc4; font-weight: 600;">Y:</label>
                    <input type="range" min="-6" max="6" step="0.1" value="${pos.y.toFixed(1)}"
                           data-sphere="${index}" data-axis="y" class="position-slider"
                           style="width: 100%;">
                    <span class="value-display" data-sphere="${index}" data-axis="y">${pos.y.toFixed(1)}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 20px 1fr 50px; gap: 6px; margin-bottom: 4px; align-items: center;">
                    <label style="color: #45b7d1; font-weight: 600;">Z:</label>
                    <input type="range" min="-8" max="12" step="0.1" value="${pos.z.toFixed(1)}"
                           data-sphere="${index}" data-axis="z" class="position-slider"
                           style="width: 100%;">
                    <span class="value-display" data-sphere="${index}" data-axis="z">${pos.z.toFixed(1)}</span>
                </div>
                
                <div style="display: grid; grid-template-columns: 20px 1fr 50px; gap: 6px; align-items: center;">
                    <label style="color: #f7b731; font-weight: 600;">R:</label>
                    <input type="range" min="0.03" max="0.5" step="0.01" value="${radius.toFixed(2)}"
                           data-sphere="${index}" data-prop="radius" class="radius-slider"
                           style="width: 100%;">
                    <span class="value-display" data-sphere="${index}" data-prop="radius">${radius.toFixed(2)}</span>
                </div>
            </div>
        `;
    });

    spheresList.innerHTML = spheresHTML;

    // Ensamblar editor
    editor.appendChild(header);
    editor.appendChild(actions);
    editor.appendChild(globalControls);
    editor.appendChild(spheresList);
    document.body.appendChild(editor);

    // Event listeners
    setupEditorEventListeners(editor, sphereGame);

    // Activar modo de selección de esferas
    setTimeout(() => {
        enableSphereSelection(sphereGame);
        // Asegurar pointer events en el canvas para permitir drag
        if (sphereGame.renderer && sphereGame.renderer.domElement) {
            sphereGame.renderer.domElement.style.pointerEvents = 'auto';
        }
    }, 500); // Esperar un poco para asegurar que todo esté listo

    // Refrescar valores una vez más para asegurar sincronización
    setTimeout(() => {
        updateEditorValues(editor, sphereGame);
    }, 100);

    console.log('✅ Editor de esferas creado - usa los sliders para ajustar posiciones');
    console.log('🖱️ Haz clic en cualquier esfera para identificarla en la lista');
}

function setupEditorEventListeners(editor, sphereGame) {
    // Agregar estilos para highlighting
    if (!document.querySelector('#sphere-highlight-styles')) {
        const style = document.createElement('style');
        style.id = 'sphere-highlight-styles';
        style.textContent = `
            .sphere-control.highlighted {
                border: 2px solid #A44BFF !important;
                box-shadow: 0 0 15px rgba(164, 75, 255, 0.5) !important;
            }
            .sphere-control {
                transition: all 0.3s ease;
                cursor: default;
            }
            .sphere-control:hover {
                background: rgba(255,255,255,0.12) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Cerrar editor
    editor.querySelector('#close-editor').onclick = () => {
        editor.style.display = 'none';
        // Restaurar cursor normal
        if (sphereGame.renderer && sphereGame.renderer.domElement) {
            sphereGame.renderer.domElement.style.cursor = 'default';
        }
    };

    // Aplicar cambios temporalmente (solo para esta sesión)
    editor.querySelector('#apply-temp').onclick = () => {
        const config = generateStaticConfig(sphereGame);
        applyConfigToCurrentGame(config, sphereGame);
        showNotification('✅ Cambios aplicados a la sesión actual', '#4CAF50');
    };

    // Descargar archivo modificado automáticamente
    editor.querySelector('#save-static').onclick = () => {
        const config = generateStaticConfig(sphereGame);
        applyConfigToCurrentGame(config, sphereGame);
        downloadModifiedSphereGameFile(config);
        showNotification('� Archivo descargado - reemplaza modules/sphere-game.js', '#4CAF50');
    };

    // Reset posiciones
    editor.querySelector('#reset-positions').onclick = () => {
        resetToDefaultPositions(sphereGame);
        updateEditorValues(editor, sphereGame);
        showNotification('🔄 Posiciones reseteadas', '#FF9800');
    };

    // Copiar JSON
    editor.querySelector('#copy-config').onclick = () => {
        const config = generateStaticConfig(sphereGame);
        navigator.clipboard.writeText(JSON.stringify(config, null, 2));
        showNotification('📋 JSON copiado al clipboard', '#2196F3');
    };

    // Sliders Face Box
    editor.querySelector('#fb-scale-x').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        sphereGame.faceBoxScaleX = v;
        editor.querySelector('#fb-scale-x-val').textContent = v.toFixed(2);
    });
    editor.querySelector('#fb-scale-y').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        sphereGame.faceBoxScaleY = v;
        editor.querySelector('#fb-scale-y-val').textContent = v.toFixed(2);
    });
    editor.querySelector('#fb-scale-z').addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        sphereGame.faceBoxScaleZ = v;
        editor.querySelector('#fb-scale-z-val').textContent = v.toFixed(2);
    });

    // Sliders de posición
    editor.querySelectorAll('.position-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            updateSpherePosition(e, sphereGame);
            updateValueDisplay(e);
        });
    });

    // Sliders de radio
    editor.querySelectorAll('.radius-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            updateSphereRadius(e, sphereGame);
            updateValueDisplay(e);
        });
    });
}

function updateSpherePosition(e, sphereGame) {
    const sphereIndex = parseInt(e.target.dataset.sphere);
    const axis = e.target.dataset.axis;
    const value = parseFloat(e.target.value);

    if (sphereGame.followers[sphereIndex]) {
        const sphere = sphereGame.followers[sphereIndex];
        sphere.position[axis] = value;
        
        // Actualizar basePosition si existe
        if (sphere.userData.basePosition) {
            sphere.userData.basePosition[axis] = value;
        }
        
        // Actualizar orbit data si existe
        if (sphere.userData.orbit) {
            const pos = sphere.position;
            sphere.userData.orbit.baseRadius = Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z);
            sphere.userData.orbit.theta = Math.atan2(pos.z, pos.x);
            sphere.userData.orbit.phi = Math.acos(pos.y / Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z));
        }
    }
}

function updateSphereRadius(e, sphereGame) {
    const sphereIndex = parseInt(e.target.dataset.sphere);
    const value = parseFloat(e.target.value);

    console.log(`🔧 Actualizando radio de esfera ${sphereIndex} a ${value}`);

    if (sphereGame.followers[sphereIndex]) {
        const sphere = sphereGame.followers[sphereIndex];
        
        // Recrear geometría con nuevo radio
        const oldGeometry = sphere.geometry;
        sphere.geometry = new THREE.SphereGeometry(value, 24, 24);
        oldGeometry.dispose();
        
        // Actualizar userData (importante para persistencia)
        if (!sphere.userData) sphere.userData = {};
        sphere.userData.radius = value;
        
        // Actualizar collider si existe
        if (sphereGame.sphereColliders && sphereGame.sphereColliders[sphereIndex]) {
            sphereGame.sphereColliders[sphereIndex].radius = value;
        }
        
        console.log(`✅ Radio de esfera ${sphereIndex} actualizado a ${value}`);
    }
}

function updateValueDisplay(e) {
    const sphereIndex = e.target.dataset.sphere;
    const prop = e.target.dataset.axis || e.target.dataset.prop;
    const value = parseFloat(e.target.value);
    
    const display = document.querySelector(`[data-sphere="${sphereIndex}"][data-${e.target.dataset.axis ? 'axis' : 'prop'}="${prop}"].value-display`);
    if (display) {
        display.textContent = value.toFixed(e.target.dataset.prop === 'radius' ? 2 : 1);
    }
}

function generateStaticConfig(sphereGame) {
    const config = {
        spheres: [],
        timestamp: Date.now()
    };

    sphereGame.followers.forEach((sphere, index) => {
        const pos = sphere.position;
        const radius = sphere.userData.radius || 0.1;
        const color = sphere.material ? `#${sphere.material.color.getHexString().toUpperCase()}` : '#00FFFF';
        
        config.spheres.push({
            id: index,
            position: {
                x: parseFloat(pos.x.toFixed(2)),
                y: parseFloat(pos.y.toFixed(2)),
                z: parseFloat(pos.z.toFixed(2))
            },
            radius: parseFloat(radius.toFixed(2)),
            baseRadius: parseFloat(Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z).toFixed(2)),
            color: color
        });
    });

    return config;
}

function saveStaticConfig(config) {
    // Guardar en localStorage
    localStorage.setItem('staticSphereConfig', JSON.stringify(config));
    
    // APLICAR INMEDIATAMENTE al juego actual
    if (window.sphereGameInstance) {
        console.log('🔄 Aplicando configuración al juego actual...');
        const sphereGame = window.sphereGameInstance;
        
        // Actualizar la configuración del juego
        sphereGame.sphereConfigs = config;
        sphereGame.defaultConfig = false;
        
        // Si el juego está activo, recrear las esferas con la nueva configuración
        if (sphereGame.isActive) {
            sphereGame.clearSpheres();
            sphereGame.createSpheres();
        }
        
        console.log('✅ Configuración aplicada al juego actual');
    }
    
    // Mostrar el código para pegar en sphere-game.js
    console.log('='.repeat(60));
    console.log('📍 CONFIGURACIÓN ESTÁTICA GENERADA Y APLICADA:');
    console.log('='.repeat(60));
    console.log('✅ Los cambios YA están aplicados en el juego actual.');
    console.log('');
    console.log('📋 Para guardar PERMANENTEMENTE (páginas estáticas):');
    console.log('   Copia este código y reemplaza getEmbeddedConfig() en modules/sphere-game.js:');
    console.log('');
    console.log(`getEmbeddedConfig() {
    return ${JSON.stringify(config, null, 6)};
}`);
    console.log('');
    console.log('='.repeat(60));
}

function applyConfigToCurrentGame(config, sphereGame) {
    console.log('🔄 Aplicando configuración solo a la sesión actual...');
    
    // Actualizar la configuración del juego
    sphereGame.sphereConfigs = config;
    sphereGame.defaultConfig = false;
    
    console.log('✅ Configuración aplicada a la sesión actual (temporal)');
    console.log('💡 Los cambios solo durarán hasta recargar la página');
}

async function downloadModifiedSphereGameFile(config) {
    try {
        console.log('📥 Descargando archivo sphere-game.js modificado...');
        
        // Leer el archivo original
        const response = await fetch('/modules/sphere-game.js');
        let originalContent = await response.text();
        
        // Generar el nuevo método getEmbeddedConfig
        const newConfigMethod = `getEmbeddedConfig() {
    return ${JSON.stringify(config, null, 6)};
  }`;
        
        // Reemplazar el método existente usando regex
        const configMethodRegex = /getEmbeddedConfig\(\)\s*{[\s\S]*?^\s*}/m;
        
        if (configMethodRegex.test(originalContent)) {
            // Reemplazar método existente
            const modifiedContent = originalContent.replace(configMethodRegex, newConfigMethod);
            
            // Crear y descargar el archivo
            const blob = new Blob([modifiedContent], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sphere-game.js';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            console.log('✅ Archivo sphere-game.js descargado con nueva configuración');
            console.log('📁 Reemplaza el archivo en modules/sphere-game.js');
            
        } else {
            console.error('❌ No se pudo encontrar el método getEmbeddedConfig() en el archivo original');
            fallbackDownloadInstructions(config);
        }
        
    } catch (error) {
        console.error('❌ Error al descargar archivo:', error);
        fallbackDownloadInstructions(config);
    }
}

function fallbackDownloadInstructions(config) {
    // Si falla la descarga automática, mostrar instrucciones
    console.log('='.repeat(60));
    console.log('📍 DESCARGA FALLÓ - INSTRUCCIONES MANUALES:');
    console.log('='.repeat(60));
    console.log('Reemplaza el método getEmbeddedConfig() en modules/sphere-game.js con:');
    console.log('');
    console.log(`getEmbeddedConfig() {
    return ${JSON.stringify(config, null, 6)};
}`);
    console.log('');
    console.log('='.repeat(60));
}

function resetToDefaultPositions(sphereGame) {
    // Resetear a posiciones en grid centrado
    const gridSize = Math.ceil(Math.sqrt(sphereGame.followers.length));
    const spacing = 0.4;
    
    sphereGame.followers.forEach((sphere, index) => {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        
        const x = (col - (gridSize - 1) / 2) * spacing;
        const y = (row - (gridSize - 1) / 2) * spacing;
        const z = Math.sin(index * 0.5) * 0.3;
        
        sphere.position.set(x, y, z);
        
        if (sphere.userData.basePosition) {
            sphere.userData.basePosition = { x, y, z };
        }
        
        // Actualizar orbit data
        if (sphere.userData.orbit) {
            sphere.userData.orbit.baseRadius = Math.sqrt(x*x + y*y + z*z);
            sphere.userData.orbit.theta = Math.atan2(z, x);
            sphere.userData.orbit.phi = Math.acos(y / Math.sqrt(x*x + y*y + z*z));
        }
    });
}

function updateEditorValues(editor, sphereGame) {
    console.log('🔄 Actualizando valores del editor...');
    
    sphereGame.followers.forEach((sphere, index) => {
        const pos = sphere.position;
        // Obtener radio de la geometría actual o userData como fallback
        const radius = sphere.geometry?.parameters?.radius || sphere.userData?.radius || 0.1;
        
        console.log(`Actualizando Esfera ${index}: pos(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}), radius: ${radius.toFixed(2)}`);
        
        // Actualizar sliders de posición
        ['x', 'y', 'z'].forEach(axis => {
            const slider = editor.querySelector(`[data-sphere="${index}"][data-axis="${axis}"]`);
            const display = editor.querySelector(`[data-sphere="${index}"][data-axis="${axis}"].value-display`);
            if (slider && display) {
                const value = pos[axis];
                slider.value = value.toFixed(1);
                display.textContent = value.toFixed(1);
            } else {
                console.warn(`No se encontró slider/display para esfera ${index}, eje ${axis}`);
            }
        });
        
        // Actualizar slider de radio
        const radiusSlider = editor.querySelector(`[data-sphere="${index}"][data-prop="radius"]`);
        const radiusDisplay = editor.querySelector(`[data-sphere="${index}"][data-prop="radius"].value-display`);
        if (radiusSlider && radiusDisplay) {
            radiusSlider.value = radius.toFixed(2);
            radiusDisplay.textContent = radius.toFixed(2);
        } else {
            console.warn(`No se encontró slider/display de radio para esfera ${index}`);
        }
    });
    
    console.log('✅ Valores del editor actualizados');
}

function showNotification(message, color = '#4CAF50') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${color}; color: white; padding: 12px 24px;
        border-radius: 8px; font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 14px; font-weight: 600; z-index: 4000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: slideDown 0.3s ease;
    `;
    notification.textContent = message;
    
    // Agregar animación CSS
    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideDown {
                from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideDown 0.3s ease reverse';
            setTimeout(() => notification.remove(), 300);
        }
    }, 3000);
}

// Agregar listener para Ctrl+E (Editor)
document.addEventListener('keydown', function(event) {
    // Ctrl+E (Windows/Linux) o Cmd+E (Mac)
    if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault();
        console.log('🎯 Abriendo editor de esferas...');
        createSphereEditor();
    }
});

// Exponer funciones globalmente
window.captureSpherePositions = captureSpherePositions;
window.createSphereEditor = createSphereEditor;
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

function enableSphereSelection(sphereGame) {
    // Configurar raycaster para detección de clics y drag
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let draggedSphere = null;
    let dragStartPosition = new THREE.Vector3();
    let dragOffset = new THREE.Vector3();
    
    console.log('🔧 Configurando detección de esferas...');
    console.log('📊 Renderer disponible:', !!sphereGame.renderer);
    console.log('📊 Canvas disponible:', !!sphereGame.renderer?.domElement);
    console.log('📊 Esferas disponibles:', sphereGame.followers?.length || 0);
    
    // Función para manejar mousedown en esferas
    function onMouseDown(event) {
        // Solo funcionar si el editor está abierto
        const editor = document.getElementById('sphere-position-editor');
        if (!editor || editor.style.display === 'none') {
            return;
        }
        
        event.preventDefault();
        event.stopPropagation();
        
        // Calcular posición del mouse normalizada
        const rect = sphereGame.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Configurar raycaster
        raycaster.setFromCamera(mouse, sphereGame.camera);
        
        // Buscar intersecciones con las esferas
        const intersects = raycaster.intersectObjects(sphereGame.followers);
        
        if (intersects.length > 0) {
            const clickedSphere = intersects[0].object;
            const sphereIndex = sphereGame.followers.indexOf(clickedSphere);
            
            if (sphereIndex !== -1) {
                // Iniciar drag
                isDragging = true;
                draggedSphere = clickedSphere;
                dragStartPosition.copy(clickedSphere.position);
                
                // Calcular offset del punto de intersección
                const intersectionPoint = intersects[0].point;
                dragOffset.subVectors(clickedSphere.position, intersectionPoint);

                // Asegurar que la nueva posición que fijemos persista y no vuelva al estado desplazado previo
                if (!draggedSphere.userData) draggedSphere.userData = {};
                draggedSphere.userData.isDisplaced = false;
                draggedSphere.userData.displacedPosition = null;
                draggedSphere.userData.repelUntil = 0;
                draggedSphere.userData.lastBoundary = null;
                
                highlightSphereInList(sphereIndex);
                console.log('🎯 Iniciando drag de esfera:', sphereIndex);
            }
        }
    }
    
    // Función para manejar mousemove (drag)
    function onMouseMove(event) {
        const editor = document.getElementById('sphere-position-editor');
        if (!editor || editor.style.display === 'none') return;
        
        const rect = sphereGame.renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        if (isDragging && draggedSphere) {
            // Drag en curso - mover la esfera
            raycaster.setFromCamera(mouse, sphereGame.camera);
            
            // Proyectar a un plano en Z=draggedSphere.position.z para mantener Z fijo
            const planeZ = draggedSphere.position.z;
            const ray = raycaster.ray;
            const t = (planeZ - ray.origin.z) / ray.direction.z;
            const newPosition = ray.origin.clone().add(ray.direction.multiplyScalar(t));
            
            // Aplicar offset y actualizar posición
            newPosition.add(dragOffset);
            draggedSphere.position.x = newPosition.x;
            draggedSphere.position.y = newPosition.y;
            // Z se mantiene fijo
            
            // Actualizar la configuración base para que persista
            if (draggedSphere.userData && draggedSphere.userData.basePosition) {
                draggedSphere.userData.basePosition.x = newPosition.x;
                draggedSphere.userData.basePosition.y = newPosition.y;
                draggedSphere.userData.basePosition.z = draggedSphere.position.z;
            }
            
            // Actualizar sliders en el editor
            const sphereIndex = sphereGame.followers.indexOf(draggedSphere);
            updateEditorSliders(sphereIndex, draggedSphere);
        } else {
            // Solo hover - cambiar cursor
            raycaster.setFromCamera(mouse, sphereGame.camera);
            const intersects = raycaster.intersectObjects(sphereGame.followers);
            
            const canvas = sphereGame.renderer.domElement;
            canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
        }
    }
    
    // Función para manejar mouseup (terminar drag)
    function onMouseUp(event) {
        if (isDragging && draggedSphere) {
            console.log('✅ Drag terminado');
            const sphereIndex = sphereGame.followers.indexOf(draggedSphere);
            showSphereInfo(sphereIndex, draggedSphere);

            // Recalcular parámetros de órbita para orbitar alrededor de la nueva posición
            if (draggedSphere.userData && draggedSphere.userData.orbit) {
                const pos = draggedSphere.position;
                const orbit = draggedSphere.userData.orbit;
                const r = Math.sqrt(pos.x*pos.x + pos.y*pos.y + pos.z*pos.z) || 1;
                orbit.baseRadius = r;
                orbit.theta = Math.atan2(pos.z, pos.x);
                orbit.phi = Math.acos(Math.max(-1, Math.min(1, pos.y / r)));
            }
        }
        
        isDragging = false;
        draggedSphere = null;
    }
    
    // Función para actualizar sliders del editor
    function updateEditorSliders(sphereIndex, sphere) {
        const pos = sphere.position;
        
        // Actualizar sliders
        const xSlider = document.querySelector(`[data-sphere="${sphereIndex}"][data-axis="x"]`);
        const ySlider = document.querySelector(`[data-sphere="${sphereIndex}"][data-axis="y"]`);
        
        if (xSlider) {
            xSlider.value = pos.x.toFixed(1);
            const xDisplay = document.querySelector(`[data-sphere="${sphereIndex}"][data-axis="x"].value-display`);
            if (xDisplay) xDisplay.textContent = pos.x.toFixed(1);
        }
        
        if (ySlider) {
            ySlider.value = pos.y.toFixed(1);
            const yDisplay = document.querySelector(`[data-sphere="${sphereIndex}"][data-axis="y"].value-display`);
            if (yDisplay) yDisplay.textContent = pos.y.toFixed(1);
        }
    }
    
    // Agregar listener al canvas del renderer
    if (sphereGame.renderer && sphereGame.renderer.domElement) {
        const canvas = sphereGame.renderer.domElement;
        
        // Asegurar que el canvas puede recibir eventos
        canvas.style.pointerEvents = 'auto';
        
        // Drag listeners
        canvas.addEventListener('mousedown', onMouseDown, { passive: false });
        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp, { passive: false });

        // Scroll para cambiar tamaño (radio) mientras se apunta/arrastra una esfera
        canvas.addEventListener('wheel', (event) => {
            const editor = document.getElementById('sphere-position-editor');
            if (!editor || editor.style.display === 'none') return;
            if (!sphereGame.followers || sphereGame.followers.length === 0) return;

            event.preventDefault();

            // Raycast al cursor para detectar esfera activa
            const rect = canvas.getBoundingClientRect();
            const mx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const my = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(mx, my), sphereGame.camera);
            const intersects = raycaster.intersectObjects(sphereGame.followers);
            if (intersects.length === 0) return;

            const sphere = intersects[0].object;
            const index = sphereGame.followers.indexOf(sphere);
            if (index === -1) return;

            // deltaY > 0 => scroll down => reducir tamaño, deltaY < 0 => scroll up => aumentar
            const delta = -Math.sign(event.deltaY) * 0.02; // paso fino
            const current = sphere.geometry?.parameters?.radius || sphere.userData?.radius || 0.1;
            const next = Math.max(0.05, Math.min(1.0, current + delta));

            // Recrear geometría con nuevo radio
            const oldGeometry = sphere.geometry;
            sphere.geometry = new THREE.SphereGeometry(next, 24, 24);
            oldGeometry?.dispose?.();
            
            // Actualizar userData y collider
            sphere.userData = sphere.userData || {};
            sphere.userData.radius = next;
            // Si estaba marcada como desplazada por colisión previa, limpiarlo al editar
            sphere.userData.isDisplaced = false;
            sphere.userData.displacedPosition = null;
            if (sphereGame.sphereColliders && sphereGame.sphereColliders[index]) {
                sphereGame.sphereColliders[index].radius = next;
            }

            // Actualizar slider de radio en el editor
            const radiusSlider = document.querySelector(`[data-sphere="${index}"][data-prop="radius"]`);
            const radiusDisplay = document.querySelector(`[data-sphere="${index}"][data-prop="radius"].value-display`);
            if (radiusSlider) radiusSlider.value = next.toFixed(2);
            if (radiusDisplay) radiusDisplay.textContent = next.toFixed(2);
        }, { passive: false });
        
        console.log('🖱️ Event listener agregado al canvas');
        console.log('📊 Canvas style pointer-events:', canvas.style.pointerEvents);
        console.log('📊 Canvas computed pointer-events:', getComputedStyle(canvas).pointerEvents);
        
        // Cambiar cursor cuando se pasa por encima de esferas
        canvas.addEventListener('mousemove', (event) => {
            const editor = document.getElementById('sphere-position-editor');
            if (!editor || editor.style.display === 'none') return;
            
            const rect = canvas.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, sphereGame.camera);
            const intersects = raycaster.intersectObjects(sphereGame.followers);
            
            canvas.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
        });
        
    console.log('✅ Selección de esferas activada completamente (drag + scroll radius)');
    } else {
        console.error('❌ No se pudo acceder al canvas del renderer');
    }
}

function highlightSphereInList(sphereIndex) {
    // Remover highlights anteriores
    const previousHighlights = document.querySelectorAll('.sphere-control.highlighted');
    previousHighlights.forEach(el => {
        el.classList.remove('highlighted');
        el.style.background = 'rgba(255,255,255,0.08)';
        el.style.transform = 'scale(1)';
    });
    
    // Destacar la esfera seleccionada
    const sphereControl = document.querySelector(`[data-index="${sphereIndex}"]`);
    if (sphereControl) {
        sphereControl.classList.add('highlighted');
        sphereControl.style.background = 'rgba(164, 75, 255, 0.3)';
        sphereControl.style.transform = 'scale(1.02)';
        sphereControl.style.transition = 'all 0.3s ease';
        
        // Scroll hacia el elemento
        sphereControl.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        // Efecto de pulso
        setTimeout(() => {
            sphereControl.style.boxShadow = '0 0 20px rgba(164, 75, 255, 0.6)';
        }, 100);
        
        setTimeout(() => {
            sphereControl.style.boxShadow = 'none';
        }, 1000);
    }
}

function showSphereInfo(sphereIndex, sphere) {
    const pos = sphere.position;
    const radius = sphere.geometry?.parameters?.radius || sphere.userData?.radius || 0.1;
    const color = sphere.material ? `#${sphere.material.color.getHexString().toUpperCase()}` : '#FFFFFF';
    
    // Mostrar información en una notificación
    const info = `🎯 Esfera ${sphereIndex + 1} seleccionada\n` +
                `📍 Posición: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})\n` +
                `📏 Radio: ${radius.toFixed(2)}\n` +
                `🎨 Color: ${color}`;
    
    console.log(info);
    
    // Mostrar notificación visual
    showNotification(`🎯 Esfera ${sphereIndex + 1} seleccionada`, '#A44BFF');
    
    // Hacer destacar temporalmente la esfera en 3D
    const originalEmissive = sphere.material.emissive.clone();
    sphere.material.emissive.setHex(0x444444);
    
    setTimeout(() => {
        sphere.material.emissive.copy(originalEmissive);
    }, 1000);
}

// Función de test para verificar la detección
window.testSphereDetection = function() {
    const sphereGame = window.sphereGameInstance;
    if (!sphereGame) {
        console.log('❌ sphereGameInstance no encontrada');
        return;
    }
    
    console.log('🧪 DIAGNÓSTICO DE DETECCIÓN DE ESFERAS:');
    console.log('📊 Renderer:', !!sphereGame.renderer);
    console.log('📊 Canvas:', !!sphereGame.renderer?.domElement);
    console.log('📊 Camera:', !!sphereGame.camera);
    console.log('📊 Esferas:', sphereGame.followers?.length || 0);
    console.log('📊 Container pointer-events:', sphereGame.sphereContainer?.style.pointerEvents);
    
    if (sphereGame.renderer?.domElement) {
        const canvas = sphereGame.renderer.domElement;
        console.log('📊 Canvas pointer-events:', canvas.style.pointerEvents);
        console.log('📊 Canvas computed pointer-events:', getComputedStyle(canvas).pointerEvents);
        console.log('📊 Canvas z-index:', getComputedStyle(canvas).zIndex);
        
        // Test manual
        console.log('🔧 Agregando test listener...');
        canvas.addEventListener('click', function testClick(e) {
            console.log('🖱️ TEST: Clic detectado en canvas!', e.clientX, e.clientY);
            canvas.removeEventListener('click', testClick);
        }, { once: true });
        
        console.log('✅ Haz clic en el canvas para verificar detección');
    }
};

console.log('📋 Editor de posiciones cargado. Presiona Ctrl+E para abrir el editor visual.');
console.log('🧪 Ejecuta testSphereDetection() en la consola para diagnosticar problemas.');