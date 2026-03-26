# Patron Scene — Particle Morphing Skull Background

## Overview

A Three.js particle morphing scene for the `/patron` route. Loads `skull.glb`, samples vertex positions, renders them as a GPU particle system that morphs from scattered randomness into the skull shape. The skull follows the mouse with smooth lerp. A placeholder form area sits below the skull's eyes for future patron selection UI.

## Visual Reference

- Three.js Journey "Particles Morphing" lesson
- Radiohead "House of Cards" music video — point cloud aesthetic

## Scene: `src/three/patron/PatronScene.ts`

**Particle system:**
- Load `skull.glb`, traverse meshes, extract all vertex positions from BufferGeometry
- Create a matching `Float32Array` of random scattered positions (spawn state)
- Custom `ShaderMaterial` on a `Points` object:
  - Vertex shader: `mix(randomPos, skullPos, uProgress)` — morph between random and skull
  - `uProgress` uniform animates from 0→1 on mount (~2-3 seconds, eased)
  - `uMouse` uniform (vec2, normalized) — offsets skull rotation/position subtly
  - Point size with slight random variation, distance attenuation
- Fragment shader: soft circle (smoothstep on distance from center), warm color (amber/white), alpha falloff
- Particle count: match vertex count from the model (or cap at ~50k if more)

**Mouse tracking:**
- Track mouse position as normalized -1 to 1 coords
- Apply as a gentle rotation to the Points group (lerped, ~0.05 factor)
- Eerie, smooth — skull watches you

**Positioning:**
- Skull centered horizontally, positioned in the upper portion of the viewport
- Camera looking straight at it, close enough that the skull fills ~40-50% of viewport width

**Post-processing:**
- EffectComposer with RenderPass + UnrealBloomPass + VignetteShader
- Bloom makes particles glow
- Vignette focuses attention

**Renderer:**
- Continuous render loop (particles are always alive)
- Black background
- Resize handling

## View: `src/views/PatronSelectView.vue`

Replace the current placeholder with:
- Full-viewport canvas for the 3D scene
- A placeholder overlay div positioned below the skull's eye line (~50-60% from top, centered, ~40% width) with a visible border so we can calibrate
- Mount/dispose pattern matching CharacterCreateView
- Mouse tracking via `mousemove` listener, passed to scene

## Files

```
src/three/patron/PatronScene.ts     — particle skull scene
src/views/PatronSelectView.vue      — canvas + placeholder overlay
```

## Not Included

- Patron selection form/cards/UI
- Intro/outro animations
- Keyboard navigation
- Any profile mutations
