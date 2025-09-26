# Sphere Configuration System

## Overview
The sphere configuration system allows you to manually position and size all 22 spheres in the Sphere Game mode, saving custom configurations that persist between sessions.

## How to Use

### Opening the Configuration Panel
1. Switch to **Spheres mode** (middle button)
2. Press **Ctrl+S** to open the sphere configuration panel

### Configuration Panel Features

#### Buttons:
- **Capture Current**: Saves the current positions and sizes of all spheres as your custom configuration
- **Reset to Default**: Reverts to the original random placement algorithm
- **Save**: Saves your configuration to a JSON file (both locally and on server)

#### Sphere Controls:
Each sphere has a row of 4 mini sliders (faders) for:
- **X Position** (red slider): Left-right movement (-5 to +5)
- **Y Position** (green slider): Up-down movement (-5 to +5) 
- **Z Position** (blue slider): Forward-back movement (-5 to +5)
- **Size** (yellow slider): Sphere radius (0.02 to 0.4)

Each row is identified by a colored dot matching the sphere's color in the scene.

### Behavior
- **Custom positions**: When a configuration is loaded, spheres will orbit gently around their configured base positions
- **Head tracking**: Spheres still follow head movement but stay close to their configured positions
- **Smooth movement**: The original orbital motion and collision avoidance are preserved

### Storage
- Configurations are saved to `sphere-config.json`
- Also cached in browser localStorage for immediate loading
- Persists between browser sessions and page reloads

## Technical Details

### File Structure
```json
{
  "spheres": [
    {
      "id": 0,
      "position": { "x": 1.234, "y": -0.567, "z": 2.890 },
      "radius": 0.125,
      "baseRadius": 3.156,
      "color": "#00FFFF"
    },
    // ... 21 more spheres
  ],
  "timestamp": 1695123456789
}
```

### Integration
- Non-breaking: Existing functionality remains unchanged when no config is present
- Fallback: If config loading fails, defaults to original random placement
- Real-time: Changes in the panel immediately affect the spheres in the scene

## Usage Tips
1. Start with "Capture Current" to get a baseline of the current random positions
2. Use the colored sliders to adjust each sphere's position in real-time
3. The colored dot helps you identify which sphere you're editing
4. Values update live as you drag the sliders
5. Adjust sizes (yellow sliders) to create visual variety or emphasis
6. Use "Save" frequently to preserve your work
7. "Reset to Default" if you want to start over with random placement

The configuration system maintains the smooth, organic movement of the original while giving you full control over where spheres are positioned in 3D space.