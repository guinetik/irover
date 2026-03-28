# Day/Night Lighting Improvements — Design Spec

**Date:** 2026-03-22
**Goal:** Make daytime brighter and more colorful with realistic Mars tones; add dramatic color temperature shifts throughout the day cycle.

**UI reference:** [mars_rovers_day_night_hud.html](../../../mars_rovers_day_night_hud.html) — interactive **dawn / day / dusk / night / blackout** presets with sol clock and scene tint. See [ui-reference-mockups](../../plans/gdd/ui-reference-mockups.md).

## Problem

1. The scene is too dark overall — stacked post-processing effects (desaturation, vignette, shadow compression) combined with low exposure and conservative light intensities make everything feel muddy.
2. Day/night transitions lack visual drama — light intensity and color barely shift, so the cycle feels flat.

## Approach

Parameter tuning only — no new systems, passes, or dependencies. All changes target existing values in MarsSky.ts, MartianSiteView.vue, terrain.frag.glsl, and SiteScene.ts.

## Constraints

- Drone feed post-pass (DustAtmospherePass) is not touched.
- Night values stay the same — only daytime is lifted.
- Rover point lights are not changed.
- Changes should be easy to hook into future sun power dynamics.

---

## 1. Sun Light Intensity & Color Temperature Arc

**File:** `src/three/MarsSky.ts`

Current: `sunLight.intensity = sunUp * 3.5` (max 3.5), with a binary color toggle between `0xffaa66` (dusk) and `0xffe8d0` (default). Sun elevation is `Math.sin(angle)` where angle cycles 0-2PI, so elevation ranges -1 to 1 with 1.0 at noon.

Replace with a smooth color temperature curve based on sun elevation:

| Phase | Sun Elevation | Intensity | Sun Color | Feel |
|-------|--------------|-----------|-----------|------|
| Night | < -0.1 | 0 | — | dark |
| Dawn | -0.1 to 0.1 | 0 to 2.0 | `0xffaa66` (warm orange) | cool-warm transition |
| Morning | 0.1 to 0.5 | 2.0 to 4.0 | `0xffd0a0` (soft gold) | warming up |
| Noon | 0.5 to 1.0 | 4.0 to 5.5 | `0xfff0d8` (bright warm white) | peak brightness |
| Afternoon | mirrors morning | mirrors | mirrors | cooling down |
| Dusk | 0.1 to -0.1 | 2.0 to 0 | `0xff8844` (deep amber) | golden hour |

Implementation: use elevation-based `smoothstep` or `lerp` between color stops. The elevation value is symmetric (afternoon mirrors morning), so the same curve works for both halves of the day.

### Ambient Light

- Current: `0.03 + sunUp * 0.2` (max 0.23)
- New: `0.05 + sunUp * 0.35` (max 0.40)

### Hemisphere Light

- Current: `0.03 + sunUp * 0.15` (max 0.18)
- New: `0.05 + sunUp * 0.25` (max 0.30)

### Ambient Light Color

Current: abrupt toggle — `0x1a1018` when `elevation < 0`, `0x8b5e3c` otherwise.
New: smooth lerp between the two colors using `smoothstep(-0.1, 0.2, elevation)` (same range as `nightFactor`). This eliminates the hard color pop at the horizon crossing.

### nightFactor

Current `nightFactor = 1.0 - smoothstep(-0.1, 0.2, elevation)` is unchanged. It remains consistent with the new intensity curve since the sun intensity also ramps through the same elevation range (0 at -0.1, ramping through 0.2+).

---

## 2. Tone Mapping Exposure

**File:** `src/views/MartianSiteView.vue`

- Current: `renderer.toneMappingExposure = 0.85`
- New: `renderer.toneMappingExposure = 1.15`

Single biggest lever for overall brightness. ACES Filmic at 1.15 lets the boosted sun intensity come through without blowing out highlights.

---

## 3. Terrain Shader Lighting

**File:** `src/three/shaders/terrain.frag.glsl`

### Ambient Floor

- Current: `diffuse = wrap * 0.85 + 0.15` (15% minimum)
- New: `diffuse = wrap * 0.75 + 0.25` (25% minimum)

Lifts shadowed areas so terrain detail is visible in shadow without flattening lighting.

### Atmospheric Scatter

- Current: `color = mix(color, atmosphereColor * 0.3, scatter * 0.3)`
- New: `color = mix(color, atmosphereColor * 0.45, scatter * 0.35)`

Brighter, warmer haze at distance, making the horizon more vivid during day.

---

## 4. Fog Color Ranges

**File:** `src/three/SiteScene.ts`

Widen daytime fog color ranges. Night values unchanged.

### Default Sites

- Current day RGB: `(0.26, 0.13, 0.06)`
- New day RGB: `(0.45, 0.25, 0.12)`
- Multipliers: `r = 0.16 + sunUp * 0.29`, `g = 0.08 + sunUp * 0.17`, `b = 0.03 + sunUp * 0.09`

### Polar Sites

- Current day RGB: `(0.48, 0.54, 0.65)`
- New day RGB: `(0.58, 0.64, 0.72)`
- Multipliers: `r = 0.10 + sunUp * 0.48`, `g = 0.12 + sunUp * 0.52`, `b = 0.15 + sunUp * 0.57`

### Volcanic Sites

- Current day RGB: `(0.18, 0.09, 0.04)`
- New day RGB: `(0.28, 0.15, 0.08)`
- Multipliers: `r = 0.10 + sunUp * 0.18`, `g = 0.05 + sunUp * 0.10`, `b = 0.02 + sunUp * 0.06`

---

## Files Changed

| File | Change |
|------|--------|
| `src/three/MarsSky.ts` | Sun intensity curve, color temperature arc, ambient/hemi ranges |
| `src/views/MartianSiteView.vue` | Tone mapping exposure |
| `src/three/shaders/terrain.frag.glsl` | Ambient floor, atmospheric scatter |
| `src/three/SiteScene.ts` | Fog color ranges |

## Future Hooks

The sun intensity curve (elevation-based) is the natural place to hook sun power dynamics — solar panel output can read the same elevation/intensity values.
