# Meteor Shower — Pass 2 Design Spec
### Shockwave Damage + Terrain Craters + Visual Polish + Impact Kill

**Date:** 2026-03-28
**GDD Reference:** `inspo/mars-rovers-meteor-gdd-v01.md`
**Scope:** Pass 2 of 3 (builds on Pass 1)
**Depends on:** `docs/superpowers/specs/2026-03-28-meteor-shower-pass1-design.md`

---

## Scoping

| Pass | Scope |
|------|-------|
| 1 (done) | Shower event + fall sequence + interactable rock + MastCam tagging |
| **2 (this spec)** | Visual polish + shockwave damage + terrain craters + impact kill |
| 3 | DAN Crater Mode + vent placement + achievements + reward track perks |

---

## 1. Meteor Trail

During the `falling` phase, each meteor mesh gets a glowing particle trail that stretches along its trajectory.

### Implementation

In `MeteorFallRenderer`, while a fall is in `falling` phase, emit point sprites at the mesh's current position each frame. Use a single `THREE.Points` buffer per fall with a custom shader that handles per-particle age and fade.

### Particle Behavior

- Spawn at the mesh's current position each frame
- Lifespan: ~1-2 seconds per particle
- Color: white-hot at birth → orange → transparent
- Slight upward drift as they cool (simulating heat dissipation)
- No wind interaction (they're in the upper atmosphere)

### Cleanup

Trail particles are removed when the fall completes. Any remaining particles fade out naturally over their lifespan after impact.

### Visual Goal

With the blood-red sky and white-hot trails, each falling meteor is a bright slash across a dark red atmosphere.

---

## 2. Sky Mood Shift

When a shower becomes active, the sky shifts toward a dramatic blood-red darkness. The color comes from meteor combustion and atmospheric ablation — not sunlight — so the effect is the same day or night.

### Implementation

Add a `uMeteorShowerIntensity` uniform (0.0–1.0) to the `MarsSky` shader. The MeteorController lerps this value:

- **Shower starts:** lerp from 0 → 1 over ~3 seconds
- **Last meteor impacts:** lerp from 1 → 0 over ~5 seconds

### Shader Effect

When `uMeteorShowerIntensity > 0`:

- Darken overall brightness by up to ~40%
- Push hue toward deep blood-red (multiply sky color by a red tint)
- Slightly increase atmospheric haze density
- Effect scales linearly with the uniform value

### Day/Night Parity

The red glow comes from the meteors burning through atmosphere, not from the sun. At night it's even more dramatic — red streaks against the dark sky. The shader applies the same tint regardless of time-of-day.

---

## 3. Shockwave Damage

On impact, if the rover is within the blast radius but outside the kill zone, instruments take durability damage and the rover gets knocked back.

### Damage Zones (Concentric)

```
[KILL]  ← marker ring radius (~1.5m) — instant death (see Section 5)
[SHOCK] ← kill radius × 3 (~4.5m) — durability damage + knockback
[SAFE]  ← beyond blast radius — no damage, observe from distance
```

### Durability Hit

Flat durability hit to ALL instruments (deployed or stowed), scaled by tier and distance falloff:

```typescript
const SHOCKWAVE_BASE_DAMAGE: Record<InstrumentTier, number> = {
  rugged:    0.03,
  standard:  0.08,
  sensitive: 0.15,
}

function computeShockwaveDamage(
  distanceToImpact: number,
  shockwaveRadius: number,
  instrumentTier: InstrumentTier,
): number {
  if (distanceToImpact >= shockwaveRadius) return 0
  const falloff = 1.0 - (distanceToImpact / shockwaveRadius)
  return SHOCKWAVE_BASE_DAMAGE[instrumentTier] * falloff
}
```

At the kill zone edge, a sensitive instrument takes 0.15 durability. At the shockwave edge, damage approaches zero. A heavy shower with multiple nearby impacts stacks up.

### hazardDecay.ts Integration

Add `'meteor'` to `TIER_COEFFICIENTS`:

```typescript
'meteor': { rugged: 0.03, standard: 0.08, sensitive: 0.15 }
```

Fire a one-shot `HazardEvent` with `source: 'meteor'`, `level` based on proximity (1-3). Apply via `computeDecayMultiplier`, then immediately deactivate.

### Knockback Effects

- **Camera shake:** Heavy, 1.5 seconds (stronger than the existing Pass 1 shake for impacts within blast radius)
- **Dust whiteout:** If within 15m — screen goes near-opaque brown for 1-2 seconds via a CSS overlay with opacity transition
- **Visual rover push:** If within 10m — rover mesh slides 0.5-1m away from blast center, cosmetic only (no physics simulation)

---

## 4. Terrain Craters

On impact, deform the terrain heightmap to create a bowl-shaped crater with a raised rim.

### Crater Parameters

| Property | Range | Notes |
|----------|-------|-------|
| Radius | 3-8m | Randomized per impact |
| Depth | 0.8-2.5m | Proportional to radius |
| Rim height | 0.15-0.5m | Above original surface |
| Bowl profile | Cosine falloff | Center → edge |
| Rim profile | Gaussian bump | Just outside bowl |

### Implementation

The terrain generators (`GlbTerrainGenerator`, `MarsGlobalTerrainGenerator`, `TerrainGenerator`) all maintain a `heightmap: Float32Array` grid and terrain mesh geometries with vertex positions.

On impact:

1. **Modify the heightmap** — For each grid cell within `craterRadius * 1.3` of the impact point:
   - `dist < radius`: push Y down with cosine bowl profile
   - `radius < dist < radius * 1.3`: push Y up for raised rim (gaussian bump)

2. **Update mesh vertices** — Find all mesh vertices within the affected region. For each vertex, sample the new heightmap value and update its Y position. Flag `geometry.attributes.position.needsUpdate = true`.

3. **Recompute normals** — Call `geometry.computeVertexNormals()` on the affected mesh. Only the vertices within the crater region changed, but Three.js recomputes all normals. This is acceptable since it runs once per impact, not per frame.

4. **Reposition the meteorite** — The rock mesh's Y position must account for the new ground level at the crater center (the deepest point).

### Interface

Add a `deformCrater(x, z, radius, depth, rimHeight)` method to `ITerrainGenerator`. Each terrain generator implementation handles the heightmap + mesh update for its specific geometry layout.

### Persistence

Craters persist for the session. Pass 3 will add storm cleanup (reverting deformations for non-vent craters). For now, craters stay permanently.

### Performance

A crater affects maybe 20-50 heightmap cells and a similar number of mesh vertices. The normal recomputation is the most expensive step but runs once per impact. Even a heavy shower with 25 impacts is fine.

---

## 5. Impact Kill (Game Over)

If the rover is inside the marker's ring radius when a meteor lands, it's a direct hit. Game over.

### Kill Zone

The waypoint marker ring radius (~1.5m from impact center). Same hitbox as the visual marker the player sees — the red-orange beam IS the warning.

### Detection

In `MeteorController.onFallImpact`, before processing shockwave damage:

```
roverDistance = distance(roverPosition, impactPoint)
if roverDistance < KILL_RADIUS:
  emit gameOver callback
  return (skip shockwave, skip rock registration)
```

### Game Over Sequence

All game systems freeze (tick handlers stop, input disabled). A Vue overlay component (`MeteorDeathOverlay.vue`) handles the visual sequence:

| Time | Visual |
|------|--------|
| 0-0.3s | Impact flash fills screen white-hot |
| 0.3-1.5s | Signal breakup — static noise, scanlines, color distortion (CSS filters + animated noise) |
| 1.5-2.5s | Fade to black |
| 2.5s+ | Terminal text appears via `ScrambleText` component |

### Terminal Screen

Uses the same `font-mono`, amber-on-black palette as `CharacterCreateView.vue`. The terminal aesthetic is the common thread — operator created the rover through a terminal, watches it die through one.

```
SIGNAL LOST

ROVER TELEMETRY: NO RESPONSE
LAST KNOWN STATUS: CATASTROPHIC IMPACT

[ RESTART MISSION ]
```

`ScrambleText` renders each line with the characteristic letter-by-letter scramble effect.

### Restart

Click or Enter on `[ RESTART MISSION ]` → reload the current site (same landmark, fresh state). Alternatively, offer `[ SITE SELECT ]` to return to the globe view.

---

## File Layout

### New Files

| File | Purpose |
|------|---------|
| `src/lib/meteor/shockwaveDamage.ts` | `computeShockwaveDamage()` pure function |
| `src/lib/meteor/craterProfile.ts` | Crater bowl/rim heightmap math (pure functions) |
| `src/components/MeteorDeathOverlay.vue` | Game over overlay with signal breakup + terminal |

### Modified Files

| File | Change |
|------|--------|
| `src/three/MeteorFallRenderer.ts` | Add trail particles, dust whiteout overlay |
| `src/three/MarsSky.ts` | Add `uMeteorShowerIntensity` uniform, red tint in shader |
| `src/three/shaders/sky.frag.glsl` | Apply meteor tint when uniform > 0 |
| `src/views/site-controllers/MeteorController.ts` | Wire shockwave damage, kill detection, sky intensity, crater creation |
| `src/views/site-controllers/MeteorTickHandler.ts` | No changes needed (phase logic unchanged) |
| `src/lib/hazards/hazardDecay.ts` | Add `'meteor'` tier coefficients |
| `src/three/terrain/TerrainGenerator.ts` | Add `deformCrater()` to `ITerrainGenerator` interface + implementation |
| `src/three/terrain/GlbTerrainGenerator.ts` | Implement `deformCrater()` |
| `src/three/terrain/MarsGlobalTerrainGenerator.ts` | Implement `deformCrater()` |
| `src/three/terrain/ElevationTerrainGenerator.ts` | Implement `deformCrater()` |
| `src/views/MartianSiteView.vue` | Mount `MeteorDeathOverlay`, handle game over state |

---

## Future Pass 3 Hooks

- **Crater cleanup:** `deformCrater` returns enough data to revert the deformation. Storm cleanup in Pass 3 will use this.
- **DAN Crater Mode:** Crater position + radius data is available from `MeteorController` for the DAN panel.
- **Achievements:** Impact kill, shockwave survival, and crater science events all fire from points already in the controller.
