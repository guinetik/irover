# 3D Terminal Scene for Character Creation — Design Spec

## Overview

Add a 3D terminal (Osborne-style portable computer from `public/terminal.glb`) as the visual frame for the character creation form. The terminal rotates into view from a black void, the camera zooms to the screen, a black overlay covers the green CRT "desktop", and the form launches on top as if it were a program running on the terminal. On acceptance, the form closes, the green desktop is briefly visible, and the terminal recedes into the void.

## Animation Sequence

| Phase | Duration | Canvas | Overlay | Form |
|-------|----------|--------|---------|------|
| `intro` | ~2-3s | Terminal rotates in, camera zooms to screen | Hidden | Hidden |
| `boot` | ~500-800ms | Static, green CRT visible | Hidden | Hidden |
| `launch` | ~300ms | Static | Fades in (0→1 opacity) | Hidden |
| `active` | User-driven | Static | Visible (100% opacity, black) | Visible |
| `exit` | ~500ms | Static | Fades out (1→0 opacity) | Fades out |
| `outro` | ~2s | Terminal recedes into void | Hidden | Hidden |
| `done` | — | Navigate to `/patron` | — | — |

## Layer Stack

```
Layer 0: <canvas>              — Three.js terminal model (full viewport, z-index: 0)
Layer 1: <div class="overlay"> — black div positioned over CRT screen area (z-index: 1)
Layer 2: <div class="form">    — existing form HTML inside the overlay (z-index: 2)
```

## TerminalScene Class

**File:** `src/three/terminal/TerminalScene.ts`

Responsibilities:
- Load `terminal.glb` via GLTFLoader
- Simple scene: model + ambient light + directional light + black background
- No OrbitControls — camera is fully scripted
- `animateIntro(): Promise<void>` — model starts off-screen/rotated, lerps to final position, camera zooms to frame the screen. Resolves when complete.
- `animateOutro(): Promise<void>` — camera pulls back, model drifts/rotates away into void. Resolves when complete.
- `getScreenRect(): { x, y, width, height }` — projects the CRT screen corners from 3D to viewport pixel coordinates. Called once after intro completes and on window resize.
- `update(delta: number)` — called in render loop, drives animation lerps
- `dispose()` — cleanup

The screen corner positions in 3D are hardcoded as offsets from the model's origin, determined by inspecting the GLB in the Three.js scene (log mesh positions during development, then bake the values). These get projected via `vector.project(camera)` → viewport transform.

## CharacterCreateView Changes

The existing view adds:
1. A `<canvas ref="canvas">` element behind the form content
2. A `phase` ref driving the state machine
3. `onMounted`: creates renderer + TerminalScene, starts render loop, kicks off intro
4. After intro resolves → `boot` (brief pause) → `launch` (overlay fades in) → `active` (form visible)
5. `onAccept()` now triggers `exit` phase → overlay/form fade out → `outro` → `animateOutro()` resolves → `router.push('/patron')`
6. The form content (header, steps, nav) is wrapped in the overlay container instead of being fullscreen
7. `onUnmounted`: dispose scene + renderer

The existing form components (StepArchetype, StepMotivation, etc.) are unchanged. Only their container positioning changes.

## Render Loop

Runs continuously while the view is mounted. Single model, negligible GPU cost. Enables future subtle effects (CRT flicker, ambient light pulse) without restructuring.

```typescript
function tick() {
  const delta = clock.getDelta()
  terminalScene.update(delta)
  renderer.render(scene, camera)
  rafId = requestAnimationFrame(tick)
}
```

## Overlay Positioning

The overlay is absolutely positioned using pixel coordinates from `getScreenRect()`. Computed once after intro, recomputed on `resize`. The overlay is black (matches void), covers the green CRT. The form content is sized to fill the overlay with padding.

Since the camera is frozen during the `active` phase, the screen rect is stable. A single resize listener recomputes it.

## What's NOT Included

- No CRT shader effects (scanlines, curvature, bloom)
- No procedural textures — GLB used as-is with baked textures
- No CSS2DRenderer — plain DOM absolute positioning
- No OrbitControls — camera is scripted only
- No changes to form components or step logic
