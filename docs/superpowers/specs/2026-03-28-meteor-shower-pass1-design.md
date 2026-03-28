# Meteor Shower — Pass 1 Design Spec
### Fall Sequence + Interactable Rock + MastCam Tagging

**Date:** 2026-03-28
**GDD Reference:** `inspo/mars-rovers-meteor-gdd-v01.md`
**Scope:** Pass 1 of 3 (see Scoping below)

---

## Scoping

The meteor module is delivered in three passes, each building on the last:

| Pass | Scope |
|------|-------|
| **1 (this spec)** | Shower event + fall sequence + interactable rock + MastCam meteor tagging |
| 2 | Shockwave damage, instrument impact damage, rover collision physics |
| 3 | DAN Crater Mode + vent placement + terrain crater deformation + achievements + reward track perks |

**Explicitly out of scope for Pass 1:**
- No shockwave or instrument damage
- No rover collision with falling meteors
- No terrain crater deformation
- No DAN Crater Mode or vent placement
- No achievements or reward track perks
- No MastCam crater photography (meteorite only)

---

## Architecture

Approach A from brainstorming: dedicated tick handler + rock system extension + coordinator.

### Layer Separation

| Layer | File | Role |
|-------|------|------|
| Model | `lib/meteor/meteorShower.ts` | Shower probability, severity rolls, meteor count |
| Model | `lib/meteor/meteorFall.ts` | Sky origin math, marker duration, sound delay |
| Model | `lib/meteor/meteorTypes.ts` | Shared interfaces |
| View | `three/MeteorFallRenderer.ts` | Meshes, markers, burn effect, flash, dust, shake, audio |
| Controller | `site-controllers/MeteorController.ts` | Coordinator: wires tick handler + renderer + rock factory |
| Controller | `site-controllers/MeteorTickHandler.ts` | Shower FSM, per-frame fall phase advancement |
| Archive | `types/meteorArchive.ts` | `ArchivedMeteorObservation` interface |
| UI | `ScienceLogDialog.vue` | New METEOR SCIENCE accordion (extend existing) |

### Touched Existing Files

| File | Change |
|------|--------|
| `RockFactory.ts` | Load `meteorites.glb`, expose method to create `iron-meteorite` from `Lp##` variant |
| `WaypointMarkers.ts` | Support custom color parameter (currently hardcoded cyan) |
| `useSiteRemsWeather.ts` | Add `remsMeteorIncomingText` / `remsMeteorActiveText` refs |
| `audioManifest.ts` | Register `meteor-fall` and `meteor-impact` sounds |
| `ScienceLogDialog.vue` | New accordion for meteor observations |

---

## Domain Logic (`lib/meteor/`)

Pure functions. No Three.js, no Vue. Fully unit-testable.

### `meteorTypes.ts`

```typescript
interface MeteorShower {
  id: string
  severity: 'light' | 'moderate' | 'heavy'
  meteorCount: number
  startSol: number
  triggerAtSolFraction: number  // 0.2–0.8 within the sol
}

interface MeteorFall {
  id: string
  showerId: string
  variant: string          // 'Lp01'–'Lp10'
  targetX: number
  targetZ: number
  groundY: number
  markerDuration: number   // 10–20 seconds
  entryAngle: number       // 30–70 degrees from horizontal
  azimuth: number          // 0–2pi
  phase: 'marker' | 'falling' | 'impacted'
  elapsed: number          // time in current phase
}
```

### `meteorShower.ts`

```typescript
/**
 * Per-sol shower probability. Maps meteorRisk to a daily chance
 * such that the expected interval matches the GDD design table.
 *
 *   meteorRisk 0.10 -> ~0.05/sol  -> mean interval ~20 sols
 *   meteorRisk 0.30 -> ~0.17/sol  -> mean interval ~6 sols
 *   meteorRisk 0.65 -> ~0.50/sol  -> mean interval ~2 sols
 */
function getShowerChancePerSol(meteorRisk: number): number {
  return 0.03 + 0.47 * Math.pow(meteorRisk, 1.4)
}

function rollShowerThisSol(meteorRisk: number): boolean {
  return Math.random() < getShowerChancePerSol(meteorRisk)
}

function rollShowerSeverity(meteorRisk: number): MeteorShower['severity'] {
  const roll = Math.random()
  if (meteorRisk >= 0.55) return roll < 0.7 ? 'heavy' : 'moderate'
  if (meteorRisk >= 0.30) return roll < 0.5 ? 'moderate' : roll < 0.85 ? 'heavy' : 'light'
  if (meteorRisk >= 0.15) return roll < 0.6 ? 'light' : 'moderate'
  return 'light'
}

const METEOR_COUNTS: Record<MeteorShower['severity'], [number, number]> = {
  light:    [1, 2],
  moderate: [3, 5],
  heavy:    [6, 10],
}

function rollMeteorCount(severity: MeteorShower['severity']): number {
  const [min, max] = METEOR_COUNTS[severity]
  return min + Math.floor(Math.random() * (max - min + 1))
}

function rollTriggerFraction(): number {
  return 0.2 + Math.random() * 0.6  // 0.2–0.8
}

function pickMeteoriteVariant(): string {
  const index = Math.floor(Math.random() * 10) + 1
  return `Lp${String(index).padStart(2, '0')}`
}
```

### `meteorFall.ts`

```typescript
function computeSkyOrigin(
  targetX: number, targetZ: number, groundY: number,
  entryAngle: number, azimuth: number
): { x: number, y: number, z: number } {
  const height = 80 + Math.random() * 40  // 80–120m above ground
  const horizontalOffset = height / Math.tan(entryAngle)
  return {
    x: targetX + Math.cos(azimuth) * horizontalOffset,
    y: groundY + height,
    z: targetZ + Math.sin(azimuth) * horizontalOffset,
  }
}

function rollMarkerDuration(): number {
  return 10 + Math.random() * 10  // 10–20 seconds
}

function rollEntryAngle(): number {
  const degMin = 30, degMax = 70
  const deg = degMin + Math.random() * (degMax - degMin)
  return deg * (Math.PI / 180)
}

function rollAzimuth(): number {
  return Math.random() * Math.PI * 2
}

/** Speed of sound on Mars ~240 m/s */
function computeSoundDelay(distanceM: number): number {
  return distanceM / 240
}
```

---

## Shower Tick Handler (`site-controllers/MeteorTickHandler.ts`)

Follows established tick handler pattern. Receives `SiteFrameContext` each frame.

### Shower Scheduling

On sol advance:
1. Roll `rollShowerThisSol(meteorRisk)`
2. If hit: roll severity, meteor count, and `triggerAtSolFraction`
3. Generate N `MeteorFall` objects with staggered marker start offsets (spread across a few seconds so they don't all appear simultaneously)
4. Store as a `ScheduledShower`

### Per-Frame Logic

```
if currentSolFraction >= scheduledShower.triggerAtSolFraction - warningLeadTime:
  -> fire REMS incoming text

if currentSolFraction >= scheduledShower.triggerAtSolFraction:
  -> activate falls (respecting per-fall stagger offsets)

for each active fall:
  phase 'marker':
    countdown markerDuration
    when expired -> transition to 'falling'

  phase 'falling':
    advance elapsed
    when elapsed >= fallDuration (~8s) -> transition to 'impacted'

  phase 'impacted':
    fire onMeteorImpact callback
    remove from active falls

if all falls impacted:
  -> clear REMS text
```

### Event Emission

Simple callback: `onMeteorImpact(fall: MeteorFall)` provided by `MeteorController` at construction.

---

## Meteor Fall Renderer (`three/MeteorFallRenderer.ts`)

Owns all Three.js objects for active falls. The tick handler tells it what to show.

### Init

Loads `meteorites.glb` via `GLTFLoader`, caches all 10 `Lp##` mesh variants as templates.

### Per Active Fall

**Marker phase:**
- `addWaypointMarker(id, x, z, groundY, scene)` with `color = 0xff6633` (red-orange)
- Marker is visible on minimap and in 3D scene

**Falling phase:**
- Clone the `Lp##` mesh template for this fall's variant
- Place at sky origin position
- Each frame: lerp position from origin to target (slightly curved trajectory for gravitational feel)
- Material override: emissive orange-white glow, additive particle trail (fire/smoke)
- Play `meteor-fall.mp3` — 3D-positioned at mesh, moves with it, volume scales with distance to player

**Impact:**
- Remove waypoint marker via `removeWaypointMarker(id, scene)`
- Strip burn material, apply standard `iron-meteorite` material (roughness 0.4, metalness 0.7)
- Impact flash: `THREE.PointLight` at impact coords, white-orange, fades over 0.2–0.4s
- Dust plume: particle emitter at impact point, brown/ochre column rising 8-15m, settling over 5-8s
- Play `meteor-impact.mp3` — delayed by `distance / 240` seconds
- Camera shake based on distance:

| Distance | Shake Intensity | Duration |
|----------|----------------|----------|
| 0–30m | Heavy | 1.2s |
| 30–100m | Moderate | 0.8s |
| 100–300m | Light | 0.4s |
| 300m+ | None | — |

Camera shake: decaying random offset applied to camera position each frame for the shake duration.

### Dispose

Cleans up any active meshes, lights, particles, and audio.

---

## Meteor Controller (`site-controllers/MeteorController.ts`)

The coordinator. Wires tick handler + renderer + rock factory.

### Construction

- Creates `MeteorTickHandler` (with `meteorRisk` from current landmark)
- Creates `MeteorFallRenderer` (with scene reference)
- Provides the `onMeteorImpact` callback to the tick handler
- Maintains `meteoriteRocks: MeteoriteRock[]` for storm cleanup

### On Impact Callback

1. The rock was already created by `RockFactory` and placed at sky origin before the fall started
2. The renderer has been lerping it to ground level — it's now sitting at the target position
3. Renderer strips the burn effect, applies standard material — the rock is done moving
4. Controller pushes the rock reference onto `meteoriteRocks` list
5. The rock is already interactable because it was always a rock in the rock system

**Key insight:** The object that falls from the sky IS the interactable rock. `RockFactory` creates it, the renderer moves it, and when it stops moving it's just a rock sitting on the ground. One object, one lifecycle.

### On Storm Active

- Iterates `meteoriteRocks`
- Removes each mesh from the scene and unregisters from rock system
- Clears the list
- No crater logic (Pass 2+)

### Rock Creation Flow

```
Controller asks RockFactory:
  "give me an iron-meteorite using Lp07 from meteorites.glb"

RockFactory returns:
  a rock mesh, same as any other rock, just sourced from meteorites.glb

Controller hands mesh to Renderer:
  "place this at sky origin, lerp it to target"

Renderer moves the mesh each frame.

On impact, Renderer says:
  "done moving, stripped the burn effect"

Controller says:
  "cool, tracking it for storm cleanup"

Player walks up, uses APXS/ChemCam/DRIL/SAM:
  works exactly like any other iron-meteorite
```

---

## Rock Factory Extension

### New Capability

`RockFactory` loads `meteorites.glb` alongside `rocks.glb` during init. Exposes a method to create an `iron-meteorite` rock using a specific `Lp##` variant from `meteorites.glb`.

```typescript
createMeteoriteRock(variant: string): RockMesh
// variant: 'Lp01'–'Lp10'
// Returns an iron-meteorite rock mesh using the specified GLB variant
// Same type as any other rock — just different geometry source
```

The returned rock has all standard properties: collider, rock type ID, material. It's indistinguishable from a naturally spawned `iron-meteorite` to the instrument system.

### Meteorite Flag

Rocks created via `createMeteoriteRock` carry a `fromShower: true` flag (or shower ID). This is used by:
- MastCam to detect meteor observation targets
- `MeteorController` to track rocks for storm cleanup

---

## Waypoint Marker Extension

### Color Parameter

`addWaypointMarker` currently renders all markers in cyan (`0x66ffee`). Extend to accept an optional color parameter:

```typescript
addWaypointMarker(id, x, z, groundY, scene, color?: number)
// Default: 0x66ffee (cyan) — existing behavior unchanged
// Meteor markers: 0xff6633 (red-orange)
```

Beam, ring, and diamond all render in the provided color. The existing pulse animation runs unchanged.

---

## REMS Integration

### New Refs

On the weather composable (`useSiteRemsWeather`):

```typescript
const remsMeteorIncomingText = ref<string | null>(null)
const remsMeteorActiveText = ref<string | null>(null)
```

### Flow

1. Sol rolls a shower at fraction 0.63
2. At ~0.61 (warning lead time): `remsMeteorIncomingText` set to severity-appropriate warning
3. At 0.63, first markers appear: `remsMeteorActiveText` set
4. Last meteor impacts: both refs cleared

### Gating

Same as dust storms — if REMS is off or damaged, no warning. The player who neglects REMS maintenance gets blindsided.

### Warning Text

```
Incoming: "REMS: Meteor shower incoming — elevated bolide activity detected. Expect [severity]."
Active:   "REMS: Meteor shower active — [N] impacts detected."
```

---

## MastCam Meteor Tagging

### Concept

Photographing a meteorite rock that came from a shower creates an **Archived Meteor Observation** — a new science log category. The meteorite (not the crater — that's Pass 3) is the subject.

### Archive Type (`types/meteorArchive.ts`)

```typescript
interface ArchivedMeteorObservation {
  archiveId: string
  capturedSol: number
  capturedAtMs: number
  siteId: string
  roverWorldX: number
  roverWorldZ: number
  subject: 'meteorite'        // Only meteorite for Pass 1
  showerId: string
  meteoriteVariant: string    // Lp01–Lp10
  distanceM: number
  sp: number                  // 20 SP per observation
  queuedForTransmission: boolean
  transmitted: boolean
}
```

### Trigger

When MastCam targets an `iron-meteorite` rock with `fromShower: true`, it produces a meteor observation entry. Standard MastCam interaction — point the camera, take the shot.

### Science Log

New **METEOR SCIENCE** accordion in `ScienceLogDialog.vue` when `meteorObservations.length > 0`. Same structure as other accordions — list items show variant and sol, detail pane shows captured data, each entry has queue/transmit status.

### SP Award

20 SP per meteorite observation. Follows the existing SP award pattern.

---

## Audio

### New Sounds

| ID | File | Category | Trigger |
|----|------|----------|---------|
| `meteor-fall` | `meteor-fall.mp3` | `sfx` | Marker timer expires, fall begins |
| `meteor-impact` | `meteor-impact.mp3` | `sfx` | Meteor reaches ground |

### Behavior

- `meteor-fall.mp3`: 3D-positioned at mesh, moves with it during descent, volume scales with distance. ~8 seconds duration.
- `meteor-impact.mp3`: 3D-positioned at impact coordinates, delayed by `distance / 240` seconds (Mars speed of sound). Loud at close range.

Both registered in `audioManifest.ts` with `rate-limited` playback mode (heavy showers could trigger many overlapping impacts).

---

## Storm Cleanup (Foundation)

### Mechanism

When dust storm transitions to `active` phase, `MeteorController` receives the event and:

1. Iterates its `meteoriteRocks` list
2. Removes each rock mesh from the scene via rock system
3. Clears the list

No crater logic, no vent exceptions. Future passes add survival conditions on top of this same hook.

### Integration Point

The storm FSM already fires phase transition events. `MeteorController` subscribes to the `active` transition — same pattern other systems use.

---

## File Layout

```
src/
├── lib/meteor/
│   ├── meteorShower.ts        # getShowerChancePerSol, rollShowerThisSol,
│   │                          # rollShowerSeverity, rollMeteorCount,
│   │                          # rollTriggerFraction, pickMeteoriteVariant
│   ├── meteorFall.ts          # computeSkyOrigin, rollMarkerDuration,
│   │                          # rollEntryAngle, rollAzimuth, computeSoundDelay
│   └── meteorTypes.ts         # MeteorShower, MeteorFall interfaces
├── three/
│   └── MeteorFallRenderer.ts  # GLB loading, mesh cloning, burn effect,
│                              # flash, dust particles, camera shake, audio
├── views/site-controllers/
│   ├── MeteorController.ts    # Coordinator: tick handler + renderer + rock factory
│   │                          # Impact callback, storm cleanup, REMS refs
│   └── MeteorTickHandler.ts   # Shower FSM: schedule -> warn -> activate -> complete
│                              # Per-frame fall phase advancement
├── types/
│   └── meteorArchive.ts       # ArchivedMeteorObservation interface
└── components/
    └── ScienceLogDialog.vue   # Extended: new METEOR SCIENCE accordion
```

**Modified existing files:**
- `three/terrain/RockFactory.ts` — load `meteorites.glb`, `createMeteoriteRock(variant)`
- `three/WaypointMarkers.ts` — optional `color` parameter on `addWaypointMarker`
- `composables/useSiteRemsWeather.ts` — `remsMeteorIncomingText`, `remsMeteorActiveText` refs
- `audio/audioManifest.ts` — register `meteor-fall`, `meteor-impact`
- `components/ScienceLogDialog.vue` — METEOR SCIENCE accordion

---

## Future Pass Hooks

This design leaves clean attachment points for Pass 2 and 3:

- **Pass 2 (Damage):** `MeteorController.onImpact` is where shockwave damage, instrument durability hits, and rover collision would fire. The impact event is already there.
- **Pass 3 (DAN Crater Mode):** Impact position data is available for crater creation. The `meteoriteRocks` tracking enables the "vent consumes meteorite" lifecycle. Achievements hook into existing events.
