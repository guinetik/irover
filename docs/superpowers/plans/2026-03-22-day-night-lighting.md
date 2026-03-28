# Day/Night Lighting Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make daytime brighter and more colorful with realistic Mars color temperature arc through the day cycle.

**Architecture:** Parameter tuning across 4 files — sun light intensity/color curve in MarsSky.ts, tone mapping exposure in MartianSiteView.vue, terrain shader ambient floor and scatter in terrain.frag.glsl, fog color ranges in SiteScene.ts.

**Tech Stack:** Three.js lights, GLSL shaders, ACES Filmic tone mapping

**Spec:** `docs/superpowers/specs/2026-03-22-day-night-lighting-design.md`

---

### Task 1: Sun Light Intensity & Color Temperature Arc

**Files:**
- Modify: `src/three/MarsSky.ts:92-114`

Replace the current simple intensity ramp (`sunUp * 3.5`), binary `isDusk` color toggle, and hard ambient color toggle with a smooth multi-phase curve. This removes the `isDusk` variable entirely.

- [ ] **Step 1: Add color constants as static fields**

Add these static fields at the top of the `MarsSky` class (after line 14 `export class MarsSky {`):

```typescript
  // Color temperature stops (hoisted to avoid per-frame allocations)
  private static readonly DAWN_COLOR = new THREE.Color(0xffaa66)
  private static readonly MORNING_COLOR = new THREE.Color(0xffd0a0)
  private static readonly NOON_COLOR = new THREE.Color(0xfff0d8)
  private static readonly AMBIENT_DAY = new THREE.Color(0x8b5e3c)
  private static readonly AMBIENT_NIGHT = new THREE.Color(0x1a1018)
  private readonly _scratchColor = new THREE.Color()
```

- [ ] **Step 2: Replace sun intensity and color logic**

Replace lines 92-114 of `MarsSky.ts` (the entire light adjustment block, from `// Adjust light intensity/color` through the closing `}` of the ambient color toggle) with:

```typescript
    // Adjust light intensity/color based on sun elevation
    const sunUp = Math.max(0, elevation)
    this.nightFactor = 1.0 - smoothstep(-0.1, 0.2, elevation)

    // Sun intensity — multi-phase curve for dramatic day arc
    // Dawn/dusk ramp (elevation -0.1 to 0.1): 0 to 2.0
    // Morning (0.1-0.5): 2.0 to 4.0
    // Noon (0.5-1.0): 4.0 to 5.5
    const dawnRamp = smoothstep(-0.1, 0.1, elevation)
    const morningRamp = smoothstep(0.1, 0.5, elevation)
    const noonRamp = smoothstep(0.5, 1.0, elevation)
    this.sunLight.intensity = dawnRamp * 2.0 + morningRamp * 2.0 + noonRamp * 1.5

    // Ambient and hemisphere — higher daytime fill
    this.ambientLight.intensity = 0.05 + sunUp * 0.35
    this.hemiLight.intensity = 0.05 + sunUp * 0.25

    // Sun color temperature arc — smooth lerp through day phases
    // Dawn: warm orange -> Morning: soft gold -> Noon: bright warm white
    // Dusk mirrors dawn symmetrically (elevation follows sin curve)
    if (elevation < 0) {
      this.sunLight.color.copy(MarsSky.DAWN_COLOR)
    } else {
      const dayProgress = smoothstep(0.0, 0.5, elevation)
      const noonProgress = smoothstep(0.5, 1.0, elevation)
      this._scratchColor.copy(MarsSky.DAWN_COLOR).lerp(MarsSky.MORNING_COLOR, dayProgress)
      this._scratchColor.lerp(MarsSky.NOON_COLOR, noonProgress)
      this.sunLight.color.copy(this._scratchColor)
    }

    // Ambient color — smooth transition instead of hard toggle
    const ambientT = smoothstep(-0.1, 0.2, elevation)
    this.ambientLight.color.copy(MarsSky.AMBIENT_NIGHT).lerp(MarsSky.AMBIENT_DAY, ambientT)
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Visual check**

Run: `npm run dev` and observe the day cycle. Sun should visibly brighten through morning, peak at noon with warm white light, and shift to amber at dusk. Ambient color should transition smoothly (no pop at horizon).

- [ ] **Step 4: Commit**

```bash
git add src/three/MarsSky.ts
git commit -m "feat: add sun color temperature arc and boost light intensities"
```

---

### Task 2: Tone Mapping Exposure

**Files:**
- Modify: `src/views/MartianSiteView.vue:145`

- [ ] **Step 1: Update exposure value**

Change line 145 from:
```typescript
  renderer.toneMappingExposure = 0.85
```
to:
```typescript
  renderer.toneMappingExposure = 1.15
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Visual check**

Run: `npm run dev`. The scene should be noticeably brighter overall, especially during daytime. Highlights should not blow out (ACES Filmic handles rolloff).

- [ ] **Step 4: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat: raise tone mapping exposure from 0.85 to 1.15"
```

---

### Task 3: Terrain Shader Ambient Floor & Atmospheric Scatter

**Files:**
- Modify: `src/three/shaders/terrain.frag.glsl:210,223`

- [ ] **Step 1: Raise ambient floor**

Change line 210 from:
```glsl
  float diffuse = wrap * 0.85 + 0.15; // low ambient floor = visible shadows
```
to:
```glsl
  float diffuse = wrap * 0.75 + 0.25; // raised ambient floor for visible terrain detail
```

- [ ] **Step 2: Boost atmospheric scatter**

Change line 223 from:
```glsl
  color = mix(color, atmosphereColor * 0.3, scatter * 0.3);
```
to:
```glsl
  color = mix(color, atmosphereColor * 0.45, scatter * 0.35);
```

- [ ] **Step 3: Verify the app builds**

Run: `npm run build`
Expected: No errors

- [ ] **Step 4: Visual check**

Run: `npm run dev`. Shadowed terrain areas should show more detail. Distant horizon should have a warmer, brighter haze.

- [ ] **Step 5: Commit**

```bash
git add src/three/shaders/terrain.frag.glsl
git commit -m "feat: raise terrain ambient floor and boost atmospheric scatter"
```

---

### Task 4: Fog Color Ranges

**Files:**
- Modify: `src/three/SiteScene.ts:194-209`

- [ ] **Step 1: Update fog color multipliers**

Replace lines 194-209 (the fog color calculation block inside `if (this.sky)`) with:

```typescript
      if (this.waterIceIndex > 0.7 || this.featureType === 'polar-cap') {
        // Polar: cool blue-grey fog — brighter cold blue during day
        r = 0.10 + sunUp * 0.48
        g = 0.12 + sunUp * 0.52
        b = 0.15 + sunUp * 0.57
      } else if (this.featureType === 'volcano') {
        // Volcanic: dark murky brown — lifts more visibly during day
        r = 0.10 + sunUp * 0.18
        g = 0.05 + sunUp * 0.10
        b = 0.02 + sunUp * 0.06
      } else {
        // Default warm Mars brown — much warmer/brighter day fog
        r = 0.16 + sunUp * 0.29
        g = 0.08 + sunUp * 0.17
        b = 0.03 + sunUp * 0.09
      }
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run build`
Expected: No errors

- [ ] **Step 3: Visual check**

Run: `npm run dev`. Daytime fog should be noticeably warmer and brighter across all site types. Night fog should be unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/three/SiteScene.ts
git commit -m "feat: widen fog color ranges for brighter daytime atmosphere"
```
