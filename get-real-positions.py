#!/usr/bin/env python3
"""
Script para obtener las posiciones reales de las esferas desde el navegador
"""

import time
import subprocess
import json

# Crear un script AppleScript para obtener las posiciones desde el navegador
applescript = '''
tell application "Safari"
    activate
    tell front document
        do JavaScript "
            if (window.sphereGameInstance && window.sphereGameInstance.sphereConfigs) {
                JSON.stringify(window.sphereGameInstance.sphereConfigs, null, 2);
            } else if (localStorage.getItem('sphereConfig')) {
                localStorage.getItem('sphereConfig');
            } else {
                'NO_CONFIG_FOUND';
            }
        "
    end tell
end tell
'''

try:
    result = subprocess.run(['osascript', '-e', applescript], 
                          capture_output=True, text=True)
    
    if result.returncode == 0:
        config_str = result.stdout.strip()
        if config_str != 'NO_CONFIG_FOUND':
            try:
                config = json.loads(config_str)
                print("=== POSICIONES REALES CARGADAS EN EL NAVEGADOR ===")
                print(json.dumps(config, indent=2))
                
                # Guardar las posiciones reales
                with open('real-sphere-positions.json', 'w') as f:
                    json.dump(config, f, indent=2)
                    
                print("\n✅ Posiciones guardadas en real-sphere-positions.json")
                
            except json.JSONDecodeError:
                print("Error: No se pudo parsear la configuración")
                print("Respuesta del navegador:", config_str)
        else:
            print("❌ No se encontró configuración en el navegador")
    else:
        print("❌ Error ejecutando AppleScript:", result.stderr)
        
except Exception as e:
    print(f"❌ Error: {e}")
    print("\n💡 Alternativa: Abre el navegador en http://localhost:8000")
    print("   Abre DevTools (F12) y ejecuta en la consola:")
    print("   window.captureSpherePositions()")