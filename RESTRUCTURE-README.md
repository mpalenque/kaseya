# Kaseya Face Tracking Application - Restructured

## Estructura de Archivos

La aplicación ha sido reestructurada en módulos separados para mejorar la organización y mantenibilidad del código:

### Archivos Principales

- **`main-restructured.js`** - Archivo principal que coordina todos los módulos
- **`main-original.js`** - Respaldo del archivo original monolítico
- **`index.html`** - Página principal (actualizada para usar la nueva estructura)

### Módulos

#### `/modules/face-tracker.js`
- **Responsabilidad**: Detección y seguimiento facial usando MediaPipe
- **Clase**: `FaceTracker`
- **Funciones principales**:
  - Inicialización de MediaPipe Face Detection
  - Bucle de detección facial optimizado
  - Mapeo de coordenadas de video a pantalla
  - Suavizado de posición facial
  - Callbacks para eventos de detección

#### `/modules/color-circles.js`
- **Responsabilidad**: Sistema de partículas/círculos de colores
- **Clase**: `ColorCircles`
- **Funciones principales**:
  - Creación y gestión de partículas 3D
  - Animación física con resortes y amortiguación
  - Rotación grupal basada en posición facial
  - Evitación de colisiones con la cara
  - Renderizado con profundidad y perspectiva

#### `/modules/draw-game.js`
- **Responsabilidad**: Juego de dibujo con ruleta de palabras y anillos animados
- **Clase**: `DrawGame`
- **Funciones principales**:
  - Ruleta de palabras animada
  - Posicionamiento dinámico del texto sobre la cara
  - Anillos elípticos animados (púrpura y cian)
  - Auto-ajuste de tamaño de fuente
  - Controles de afinación de anillos

#### `/modules/video-capture.js`
- **Responsabilidad**: Captura de video y fotos
- **Clase**: `VideoCapture`
- **Funciones principales**:
  - Grabación de video con MediaRecorder
  - Composición de elementos HTML en canvas
  - Renderizado de footer y gradientes
  - Sistema de vista previa
  - Compartir/descargar archivos
  - Grabación con "cola" después de soltar

#### `/modules/ui-manager.js`
- **Responsabilidad**: Gestión de la interfaz de usuario y controles
- **Clase**: `UIManager`
- **Funciones principales**:
  - Manejo de modos de filtro (none/circles/draw)
  - Eventos de botones y controles
  - Gestión de grabación con long-press
  - Vista previa de medios
  - Manejo de errores y estados de carga

## Características de la Restructuración

### Beneficios

1. **Separación de Responsabilidades**: Cada módulo tiene una función específica y bien definida
2. **Mantenibilidad**: Es más fácil encontrar y modificar funcionalidades específicas
3. **Reutilización**: Los módulos pueden ser reutilizados independientemente
4. **Debugging**: Los errores son más fáciles de localizar y solucionar
5. **Testing**: Cada módulo puede ser probado por separado
6. **Colaboración**: Diferentes desarrolladores pueden trabajar en módulos distintos

### Comunicación Entre Módulos

- Los módulos se comunican a través de referencias pasadas durante la inicialización
- `FaceTracker` proporciona datos de posición facial a otros módulos
- `UIManager` coordina las interacciones entre módulos
- `VideoCapture` utiliza datos de otros módulos para composición

### Carga de Módulos

La aplicación utiliza carga dinámica de scripts para garantizar que todos los módulos estén disponibles antes de la inicialización:

```javascript
// Cargar todos los módulos en secuencia
const modules = [
  'modules/face-tracker.js',
  'modules/color-circles.js', 
  'modules/draw-game.js',
  'modules/video-capture.js',
  'modules/ui-manager.js'
];
```

## Uso

La aplicación se inicia automáticamente cuando se carga la página. No se requiere código adicional para el usuario final.

## Desarrollo

Para modificar funcionalidades específicas:

1. **Face tracking**: Editar `/modules/face-tracker.js`
2. **Partículas/círculos**: Editar `/modules/color-circles.js`
3. **Ruleta de palabras**: Editar `/modules/draw-game.js`
4. **Grabación de video**: Editar `/modules/video-capture.js`
5. **Interfaz de usuario**: Editar `/modules/ui-manager.js`

Cada módulo exporta su clase principal a `window` para compatibilidad con la carga dinámica.