# DAN Tier 4 Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DAN neutron prospecting instrument (Tier 4 slice) — toggle while driving, 10W power draw, particle VFX, landmark-biased sampling with hits/toasts/SP, prospect interaction with water roll, blue disc zone, and gray cone drill marker.

**Architecture:** DANController extends the base class's `passiveSubsystemOnly` pattern (like REMS/RAD) — power, toggle, and overlay status are already handled by the infrastructure. The controller adds: sampling engine, hit state, prospect state machine, and particle VFX. MartianSiteView orchestrates the prospect flow (disc placement, progress bars, cone spawning, SP awards). New UI components: DANDialog (prospect data + placeholder graphic), DANProspectBar (progress bar under compass).

**Tech Stack:** Vue 3, Three.js, TypeScript

**Spec:** [2026-03-23-dan-tier4-implementation-design.md](../specs/2026-03-23-dan-tier4-implementation-design.md)

---

## What the infrastructure already provides

The codebase has evolved since the original spec. These are **already working** and need no changes:

| Feature | How it works |
|---------|-------------|
| **10W power draw** | `DANController` sets `billsPassiveBackgroundPower = true` + `selectionIdlePowerW = 10`. `buildInstrumentPowerLines()` in MartianSiteView picks this up and feeds it into `tickPower` via `instrumentLines`. Shows as a named "DAN" line in the power HUD. |
| **Toggle on/off** | `passiveSubsystemOnly = true` makes the overlay button cycle ACTIVATE ↔ STANDBY. Keyboard E routes through `togglePassiveSubsystemEnabled()`. |
| **Overlay status** | `passiveOverlayPatch` computed in MartianSiteView shows "SCANNING" when `passiveSubsystemEnabled = true`. |
| **Power persists while driving** | `getPassiveBackgroundPowerW()` returns 10W whenever `passiveSubsystemEnabled` is true, regardless of slot selection. |
| **Sleep mode** | When sleep triggers (SOC ≤ 5%), instruments are suppressed. DAN should `forceOff()` in the sleep handler. |

**DAN is currently slot 5** (not 4). Slot layout: 1=MastCam, 2=ChemCam, 3=Drill, 4=APXS, 5=DAN, 6=SAM, 7=RTG.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/components/DANDialog.vue` | Prospect dialog: left panel = dan.png placeholder, right panel = live signal/prospect data |
| `src/components/DANProspectBar.vue` | Progress bar rendered below the compass strip during prospecting phases |

### Modified files

| File | Changes |
|------|---------|
| `src/three/instruments/DANController.ts` | Add sampling engine, hit generation, prospect state machine, particle VFX to existing stub |
| `src/composables/useSciencePoints.ts` | Add `dan` source type and `awardDAN` function (flat 100 SP, no rock dedup) |
| `src/components/SampleToast.vue` | Add `showDAN(message)` method with blue variant styling |
| `src/components/InstrumentOverlay.vue` | Add DAN Prospect button (next to ACTIVATE/STANDBY) when a hit is available |
| `src/components/InstrumentToolbar.vue` | Add pulsing blue badge on DAN slot when `passiveSubsystemEnabled` is true |
| `src/views/MartianSiteView.vue` | DAN sampling tick, hit → toast + SP, prospect flow (blue disc, timers, cone), sleep safety |

---

## Task 1: DANController — sampling engine and prospect state

**Files:**
- Modify: `src/three/instruments/DANController.ts`

The existing stub already has the correct base class flags. We add the sampling logic, hit generation, and prospect state.

- [ ] **Step 1: Implement sampling and prospect state**

Replace the stub with the full implementation. Key design: use `passiveSubsystemEnabled` (inherited) as the "scanning" flag — no custom toggle needed.

```typescript
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

// --- Sampling ---
const SAMPLE_INTERVAL_MOVING = 3.0
const SAMPLE_INTERVAL_STATIC = 5.0
const MIN_MOVE_DIST = 0.5
const BASE_HIT_RATE = 0.02

const FEATURE_MULT: Record<string, number> = {
  'polar-cap': 3.0,
  'canyon': 1.5,
  'basin': 1.5,
  'plain': 1.0,
  'volcano': 0.5,
}

function siteMultiplier(waterIceIndex: number): number {
  if (waterIceIndex >= 0.8) return 5.0
  if (waterIceIndex >= 0.5) return 3.5
  if (waterIceIndex >= 0.3) return 2.5
  if (waterIceIndex >= 0.1) return 1.5
  return 1.0
}

export interface DANHit {
  worldPosition: THREE.Vector3
  signalStrength: number
  timestamp: number
}

export type DANProspectPhase = 'idle' | 'drive-to-zone' | 'initiating' | 'prospecting' | 'complete'

export class DANController extends InstrumentController {
  readonly id = 'dan'
  readonly name = 'DAN'
  readonly slot = 5
  readonly canActivate = true
  readonly billsPassiveBackgroundPower = true
  readonly passiveSubsystemOnly = true
  readonly focusNodeName = 'DAN_L'
  readonly focusOffset = new THREE.Vector3(0.0, 0.3, 0.0)
  readonly viewAngle = Math.PI * 0.5
  readonly viewPitch = 0.15
  readonly selectionIdlePowerW = 10

  // --- Sampling state ---
  private sampleTimer = 0
  private lastSamplePos = new THREE.Vector3()
  totalSamples = 0
  totalHits = 0

  // --- Site priors (set by view each frame) ---
  waterIceIndex = 0.1
  featureType = 'plain'

  // --- Hit state ---
  pendingHit: DANHit | null = null
  hitConsumed = false

  // --- Prospect state ---
  prospectPhase: DANProspectPhase = 'idle'
  prospectProgress = 0
  prospectComplete = false
  waterConfirmed = false
  drillSitePosition: THREE.Vector3 | null = null
  reservoirQuality = 0
  prospectStrength = 0

  // --- Rover state (set by view each frame) ---
  private roverPos = new THREE.Vector3()
  roverMoving = false

  setRoverState(pos: THREE.Vector3, moving: boolean): void {
    this.roverPos.copy(pos)
    this.roverMoving = moving
  }

  /** Force off (sleep mode / power loss) */
  forceOff(): void {
    this.passiveSubsystemEnabled = false
    if (this.prospectPhase === 'prospecting' || this.prospectPhase === 'initiating') {
      this.prospectPhase = 'idle'
      this.prospectProgress = 0
    }
  }

  override update(delta: number): void {
    if (!this.passiveSubsystemEnabled) return
    this.tickSampling(delta)
  }

  private tickSampling(delta: number): void {
    const dist = this.roverPos.distanceTo(this.lastSamplePos)
    const isMoving = dist > MIN_MOVE_DIST
    const interval = isMoving ? SAMPLE_INTERVAL_MOVING : SAMPLE_INTERVAL_STATIC

    this.sampleTimer += delta
    if (this.sampleTimer < interval) return
    this.sampleTimer = 0
    if (isMoving) this.lastSamplePos.copy(this.roverPos)

    this.totalSamples++

    const siteMult = siteMultiplier(this.waterIceIndex)
    const featMult = FEATURE_MULT[this.featureType] ?? 1.0
    const p = Math.min(BASE_HIT_RATE * siteMult * featMult, 0.95)

    if (Math.random() < p) {
      const strength = Math.min(1.0, Math.max(0.3,
        0.3 + Math.random() * 0.5 + this.waterIceIndex * 0.15,
      ))
      this.pendingHit = {
        worldPosition: this.roverPos.clone(),
        signalStrength: strength,
        timestamp: Date.now(),
      }
      this.hitConsumed = false
      this.totalHits++
    }
  }

  static qualityLabel(strength: number): string {
    if (strength >= 0.7) return 'Strong'
    if (strength >= 0.5) return 'Moderate'
    return 'Weak'
  }

  static waterChance(strength: number, waterIceIndex: number): number {
    const base = strength >= 0.7 ? 0.70 : strength >= 0.5 ? 0.40 : 0.15
    return Math.min(base * (0.5 + waterIceIndex), 1.0)
  }

  rollWater(): boolean {
    const chance = DANController.waterChance(this.prospectStrength, this.waterIceIndex)
    return Math.random() < chance
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/DANController.ts
git commit -m "feat(dan): implement sampling engine, hit generation, and prospect state"
```

---

## Task 2: SampleToast — DAN variant

**Files:**
- Modify: `src/components/SampleToast.vue`

- [ ] **Step 1: Add showDAN method and styles**

Add before `defineExpose`:

```typescript
function showDAN(message: string): void {
  push({
    id: uid(),
    prefix: 'DAN',
    label: message,
    weight: '',
    color: '#44aaff',
    variant: 'dan',
  })
}
```

Update `defineExpose` to include `showDAN`.

Add CSS after `.sample-toast.trace` styles:

```css
.sample-toast.dan {
  background: rgba(5, 15, 35, 0.92);
  border-color: rgba(68, 170, 255, 0.35);
}

.sample-toast.dan .toast-label {
  color: rgba(68, 170, 255, 0.9);
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/SampleToast.vue
git commit -m "feat(dan): add DAN toast variant with blue styling"
```

---

## Task 3: useSciencePoints — DAN SP awards

**Files:**
- Modify: `src/composables/useSciencePoints.ts`

DAN SP is flat 100 per event, not rock-deduped.

- [ ] **Step 1: Add awardDAN function**

Update `SPSource`:

```typescript
export type SPSource = 'mastcam' | 'chemcam' | 'drill' | 'chemcam-ack' | 'dan'
```

Add after `awardAck`:

```typescript
const DAN_SP = 100

function awardDAN(reason: string): SPGain {
  const spYieldMult = mod('spYield')
  const amount = Math.round(DAN_SP * spYieldMult)
  totalSP.value += amount
  sessionSP.value += amount
  const gain: SPGain = { amount, source: 'dan', rockLabel: reason, bonus: 1.0 }
  lastGain.value = gain
  return gain
}
```

Add `awardDAN` to the return object.

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/composables/useSciencePoints.ts
git commit -m "feat(dan): add flat 100 SP award function for DAN events"
```

---

## Task 4: InstrumentOverlay — Prospect button

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

The ACTIVATE/STANDBY toggle is already handled by the `passiveSubsystemOnly` template. We only need to add the **Prospect button** next to it when a DAN hit is available.

- [ ] **Step 1: Add DAN props and emit**

Add props:

```typescript
danHitAvailable?: boolean
danProspectPhase?: string
```

Add emit:

```typescript
danProspect: []
```

- [ ] **Step 2: Add Prospect button in template**

In the `v-else-if="passiveSubsystemOnly"` template block, after the ACTIVATE/STANDBY button, add:

```html
<button
  v-if="activeSlot === 5 && danHitAvailable && danProspectPhase === 'idle'"
  class="ov-btn-see-results ov-btn-dan-prospect"
  @click="$emit('danProspect')"
>PROSPECT</button>
```

- [ ] **Step 3: Add Prospect button styles**

```css
.ov-btn-dan-prospect {
  background: rgba(68, 170, 255, 0.1);
  border: 1px solid rgba(68, 170, 255, 0.4);
  border-radius: 4px;
  color: #44aaff;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  padding: 6px 14px;
  animation: dan-pulse 2s ease-in-out infinite;
}

@keyframes dan-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(68, 170, 255, 0.2); }
  50% { box-shadow: 0 0 12px rgba(68, 170, 255, 0.5); }
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/InstrumentOverlay.vue
git commit -m "feat(dan): add Prospect button to overlay for DAN hits"
```

---

## Task 5: InstrumentToolbar — DAN active badge

**Files:**
- Modify: `src/components/InstrumentToolbar.vue`

Show a pulsing blue dot on slot 5 when DAN is scanning.

- [ ] **Step 1: Add prop and badge**

Add prop:

```typescript
danScanning?: boolean
```

Add badge in template after the ChemCam badge line:

```html
<span v-if="inst.slot === 5 && (danScanning ?? false)" class="badge-dan">&#x2022;</span>
```

- [ ] **Step 2: Add badge styles**

```css
.badge-dan {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  color: #44aaff;
  font-size: 16px;
  line-height: 10px;
  text-align: center;
  text-shadow: 0 0 6px rgba(68, 170, 255, 0.8);
  animation: dan-badge-pulse 1.5s ease-in-out infinite;
}

@keyframes dan-badge-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1.0; }
}
```

- [ ] **Step 3: Verify compilation and commit**

```bash
git add src/components/InstrumentToolbar.vue
git commit -m "feat(dan): add pulsing blue badge on toolbar when DAN active"
```

---

## Task 6: DANDialog component

**Files:**
- Create: `src/components/DANDialog.vue`

Dialog with left panel (dan.png placeholder) and right panel (live prospect data). Follows SAMDialog pattern.

- [ ] **Step 1: Create DANDialog.vue**

```vue
<template>
  <Teleport to="body">
    <Transition name="dan-slide">
      <div v-if="visible" class="dan-dialog">
        <div class="dan-header">
          <span class="dan-icon">&#x2261;</span>
          <span class="dan-title">DAN — NEUTRON PROSPECTING</span>
          <button class="dan-close" @click="$emit('close')">&times;</button>
        </div>
        <div class="dan-body">
          <div class="dan-graphic">
            <img
              v-if="danImgSrc"
              :src="danImgSrc"
              alt="DAN traverse reference"
              class="dan-img"
            />
            <div v-else class="dan-graphic-placeholder">
              <div class="dan-gp-icon">&#x2261;</div>
              <div class="dan-gp-text">TRAVERSE MAP</div>
              <div class="dan-gp-sub">Visualization pending</div>
            </div>
          </div>
          <div class="dan-data">
            <div class="dan-stat">
              <div class="dan-stat-label">SIGNAL STRENGTH</div>
              <div class="dan-stat-bar-track">
                <div class="dan-stat-bar-fill" :style="{ width: Math.round(signalStrength * 100) + '%' }" />
              </div>
              <div class="dan-stat-value">{{ Math.round(signalStrength * 100) }}%</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">QUALITY</div>
              <div class="dan-stat-value" :style="{ color: qualityColor }">{{ qualityLabel }}</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">WATER ICE INDEX</div>
              <div class="dan-stat-value">{{ (waterIceIndex * 100).toFixed(0) }}%</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">SAMPLES</div>
              <div class="dan-stat-value">{{ totalSamples }}</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">STATUS</div>
              <div class="dan-stat-value" :style="{ color: statusColor }">{{ statusLabel }}</div>
            </div>
          </div>
        </div>
        <div class="dan-footer">[ESC] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  signalStrength: number
  waterIceIndex: number
  totalSamples: number
  prospectPhase: string
  waterConfirmed: boolean | null
}>()

defineEmits<{ close: [] }>()

const danImgSrc = computed(() => {
  try { return new URL('../../../inspo/dan.png', import.meta.url).href } catch { return '' }
})

const qualityLabel = computed(() => {
  if (props.signalStrength >= 0.7) return 'STRONG'
  if (props.signalStrength >= 0.5) return 'MODERATE'
  return 'WEAK'
})

const qualityColor = computed(() => {
  if (props.signalStrength >= 0.7) return '#44aaff'
  if (props.signalStrength >= 0.5) return '#66ccff'
  return '#88aacc'
})

const statusLabel = computed(() => {
  if (props.waterConfirmed === true) return 'COMPLETE — WATER CONFIRMED'
  if (props.waterConfirmed === false) return 'COMPLETE — INCONCLUSIVE'
  switch (props.prospectPhase) {
    case 'drive-to-zone': return 'DRIVE TO ZONE'
    case 'initiating': return 'INITIATING...'
    case 'prospecting': return 'PROSPECTING...'
    default: return 'PENDING'
  }
})

const statusColor = computed(() => {
  if (props.waterConfirmed === true) return '#44aaff'
  if (props.waterConfirmed === false) return '#88aacc'
  if (props.prospectPhase === 'prospecting') return '#44aaff'
  return '#c4753a'
})
</script>

<style scoped>
.dan-dialog {
  position: fixed;
  top: 50%;
  right: 320px;
  transform: translateY(-50%);
  width: 580px;
  height: 320px;
  background: rgba(5, 10, 25, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(68, 170, 255, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  font-family: var(--font-ui);
  overflow: hidden;
}
.dan-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid rgba(68, 170, 255, 0.15); }
.dan-icon { font-size: 16px; color: #44aaff; }
.dan-title { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: rgba(68, 170, 255, 0.9); }
.dan-close { margin-left: auto; background: none; border: none; color: rgba(255,255,255,0.3); font-size: 18px; cursor: pointer; }
.dan-body { display: flex; flex: 1; overflow: hidden; }
.dan-graphic { flex: 0 0 45%; display: flex; align-items: center; justify-content: center; border-right: 1px solid rgba(68, 170, 255, 0.1); padding: 12px; }
.dan-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; opacity: 0.85; }
.dan-graphic-placeholder { text-align: center; color: rgba(68, 170, 255, 0.3); }
.dan-gp-icon { font-size: 32px; margin-bottom: 8px; }
.dan-gp-text { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; }
.dan-gp-sub { font-size: 10px; margin-top: 4px; opacity: 0.6; }
.dan-data { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dan-stat { display: flex; flex-direction: column; gap: 2px; }
.dan-stat-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; color: rgba(68, 170, 255, 0.5); }
.dan-stat-value { font-size: 12px; color: rgba(200, 220, 240, 0.9); }
.dan-stat-bar-track { height: 4px; background: rgba(68, 170, 255, 0.1); border-radius: 2px; overflow: hidden; }
.dan-stat-bar-fill { height: 100%; background: #44aaff; border-radius: 2px; transition: width 0.3s ease; }
.dan-footer { padding: 8px 16px; font-size: 10px; color: rgba(255, 255, 255, 0.2); letter-spacing: 0.1em; border-top: 1px solid rgba(68, 170, 255, 0.1); }
.dan-slide-enter-active, .dan-slide-leave-active { transition: all 0.25s ease; }
.dan-slide-enter-from { opacity: 0; transform: translateY(-50%) translateX(20px); }
.dan-slide-leave-to { opacity: 0; transform: translateY(-50%) translateX(20px); }
</style>
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/DANDialog.vue
git commit -m "feat(dan): create DANDialog component with placeholder graphic"
```

---

## Task 7: DANProspectBar component

**Files:**
- Create: `src/components/DANProspectBar.vue`

Progress bar below compass. Two modes: inverse countdown ("Initiating") and normal ("Prospecting").

- [ ] **Step 1: Create DANProspectBar.vue**

```vue
<template>
  <div v-if="phase !== 'idle' && phase !== 'complete'" class="dan-prospect-bar">
    <div class="dpb-label">{{ label }}</div>
    <div class="dpb-track">
      <div class="dpb-fill" :class="phase" :style="{ width: fillPct + '%' }" />
    </div>
    <div class="dpb-pct font-instrument">{{ Math.round(fillPct) }}%</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  phase: string
  progress: number
}>()

const label = computed(() => {
  switch (props.phase) {
    case 'initiating': return 'INITIATING DAN PROSPECTING'
    case 'prospecting': return 'PROSPECTING SUBSURFACE...'
    case 'drive-to-zone': return 'DRIVE TO SIGNAL ZONE'
    default: return ''
  }
})

const fillPct = computed(() => {
  if (props.phase === 'initiating') return (1 - props.progress) * 100
  return props.progress * 100
})
</script>

<style scoped>
.dan-prospect-bar {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(5, 10, 25, 0.88);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(68, 170, 255, 0.25);
  border-radius: 6px;
  z-index: 45;
  font-family: var(--font-ui);
}
.dpb-label { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; color: rgba(68, 170, 255, 0.8); white-space: nowrap; }
.dpb-track { width: 120px; height: 4px; background: rgba(68, 170, 255, 0.1); border-radius: 2px; overflow: hidden; }
.dpb-fill { height: 100%; border-radius: 2px; transition: width 0.3s linear; }
.dpb-fill.drive-to-zone { background: rgba(68, 170, 255, 0.3); }
.dpb-fill.initiating { background: rgba(68, 170, 255, 0.6); }
.dpb-fill.prospecting { background: #44aaff; box-shadow: 0 0 6px rgba(68, 170, 255, 0.4); }
.dpb-pct { font-size: 11px; color: rgba(68, 170, 255, 0.7); min-width: 30px; text-align: right; }
</style>
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add -f src/components/DANProspectBar.vue
git commit -m "feat(dan): create DANProspectBar component for prospect progress"
```

---

## Task 8: DANController — particle VFX

**Files:**
- Modify: `src/three/instruments/DANController.ts`

Add particle stream from DAN_L downward to ground. Only visible when DAN slot is selected.

- [ ] **Step 1: Add particle system**

Add to DANController class (follows ChemCam flash particle pattern — Points + BufferGeometry + AdditiveBlending):

```typescript
// --- VFX ---
private particles: THREE.Points | null = null
private particlePositions: Float32Array | null = null
private particleVelocities: Float32Array | null = null
private particleSpeeds: Float32Array | null = null
private sceneRef: THREE.Scene | null = null
private readonly PARTICLE_COUNT = 24
vfxVisible = false

initVFX(scene: THREE.Scene): void {
  this.sceneRef = scene
  const count = this.PARTICLE_COUNT
  this.particlePositions = new Float32Array(count * 3)
  this.particleVelocities = new Float32Array(count * 3)
  this.particleSpeeds = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    this.particleSpeeds[i] = 0.8 + Math.random() * 1.2
    this.resetParticle(i)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(this.particlePositions, 3))

  const mat = new THREE.PointsMaterial({
    color: 0x44aaff,
    size: 0.04,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })

  this.particles = new THREE.Points(geo, mat)
  this.particles.visible = false
  scene.add(this.particles)
}

private resetParticle(i: number): void {
  if (!this.particlePositions || !this.particleVelocities || !this.node) return
  const wp = new THREE.Vector3()
  this.node.getWorldPosition(wp)
  const i3 = i * 3
  this.particlePositions[i3] = wp.x + (Math.random() - 0.5) * 0.08
  this.particlePositions[i3 + 1] = wp.y
  this.particlePositions[i3 + 2] = wp.z + (Math.random() - 0.5) * 0.08
  this.particleVelocities[i3] = (Math.random() - 0.5) * 0.1
  this.particleVelocities[i3 + 1] = -1
  this.particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.1
}

updateVFX(delta: number, groundY: number): void {
  if (!this.particles || !this.particlePositions || !this.particleVelocities || !this.particleSpeeds) return
  this.particles.visible = this.vfxVisible && this.passiveSubsystemEnabled
  if (!this.particles.visible) return

  const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < this.PARTICLE_COUNT; i++) {
    const i3 = i * 3
    const speed = this.particleSpeeds[i]
    this.particlePositions[i3] += this.particleVelocities[i3] * speed * delta
    this.particlePositions[i3 + 1] += this.particleVelocities[i3 + 1] * speed * delta
    this.particlePositions[i3 + 2] += this.particleVelocities[i3 + 2] * speed * delta
    if (this.particlePositions[i3 + 1] <= groundY) this.resetParticle(i)
  }
  positions.needsUpdate = true
}

override dispose(): void {
  if (this.particles && this.sceneRef) {
    this.sceneRef.remove(this.particles)
    this.particles.geometry.dispose()
    ;(this.particles.material as THREE.PointsMaterial).dispose()
  }
  this.particles = null
  this.sceneRef = null
}
```

- [ ] **Step 2: Verify compilation and commit**

```bash
git add src/three/instruments/DANController.ts
git commit -m "feat(dan): add neutron particle stream VFX"
```

---

## Task 9: MartianSiteView — full DAN integration

**Files:**
- Modify: `src/views/MartianSiteView.vue`

Wire up: DAN sampling tick, hit detection → toast + SP, prospect flow (blue disc, initiating timer, prospecting timer, water roll, cone placement), sleep safety, VFX visibility, new component imports.

- [ ] **Step 1: Add imports and reactive state**

Add imports:

```typescript
import DANDialog from '@/components/DANDialog.vue'
import DANProspectBar from '@/components/DANProspectBar.vue'
import { DANController } from '@/three/instruments'
import { SOL_DURATION, MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'
```

Update the `useSciencePoints` destructuring:

```typescript
const { totalSP, award: awardSP, awardAck, awardDAN } = useSciencePoints()
```

Add reactive state:

```typescript
// --- DAN state ---
const danHitAvailable = ref(false)
const danProspectPhase = ref<string>('idle')
const danProspectProgress = ref(0)
const danDialogVisible = ref(false)
const danSignalStrength = ref(0)
const danTotalSamples = ref(0)
const danWaterResult = ref<boolean | null>(null)
let danDiscMesh: THREE.Mesh | null = null
let danConeMesh: THREE.Mesh | null = null
const INITIATE_DURATION = 4 // real seconds for inverse countdown
const PROSPECT_DURATION_MARS_HOURS = 2
```

- [ ] **Step 2: Add DAN frame update in animation loop**

After the heater controller update and before `buildInstrumentPowerLines`, add:

```typescript
// --- DAN frame update ---
const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
if (danInst && siteScene.roverState === 'ready') {
  danInst.setRoverState(
    siteScene.rover?.position ?? new THREE.Vector3(),
    controller?.isMoving ?? false,
  )
  if (siteTerrainParams) {
    danInst.waterIceIndex = siteTerrainParams.waterIceIndex ?? 0.1
    danInst.featureType = siteTerrainParams.featureType ?? 'plain'
  }
  danInst.update(sceneDelta)

  danTotalSamples.value = danInst.totalSamples
  danHitAvailable.value = danInst.pendingHit !== null && !danInst.hitConsumed

  // VFX: only when DAN slot selected
  danInst.vfxVisible = controller?.activeInstrument?.id === 'dan'
  if (danInst.vfxVisible && siteScene.terrain) {
    const rp = siteScene.rover?.position
    const groundY = rp ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
    danInst.updateVFX(sceneDelta, groundY)
  }

  // Hit detection → toast + SP
  if (danInst.pendingHit && !danInst.hitConsumed) {
    if (danHitAvailable.value) {
      sampleToastRef.value?.showDAN('New hydrogen signal — previous marker updated')
    }
    const hit = danInst.pendingHit
    const qual = DANController.qualityLabel(hit.signalStrength)
    sampleToastRef.value?.showDAN(`Hydrogen signal — ${qual} (${Math.round(hit.signalStrength * 100)}%)`)
    const gain = awardDAN('DAN signal hit')
    if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN SIGNAL', gain.bonus)
    danSignalStrength.value = hit.signalStrength
    danInst.hitConsumed = true
    danHitAvailable.value = true
  }

  // Sleep mode safety
  if (isSleeping.value && danInst.passiveSubsystemEnabled) {
    danInst.forceOff()
    sampleToastRef.value?.showDAN('Prospect interrupted — insufficient power')
    if (danDiscMesh) danDiscMesh.visible = false
    danProspectPhase.value = 'idle'
    danProspectProgress.value = 0
    passiveUiRevision.value++
  }
}
```

- [ ] **Step 3: Add prospect flow handlers**

```typescript
function handleDanProspect(): void {
  const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
  if (!danInst?.pendingHit) return

  const hit = danInst.pendingHit

  // Place blue disc
  if (!danDiscMesh) {
    const geo = new THREE.CircleGeometry(5, 32)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false,
    })
    danDiscMesh = new THREE.Mesh(geo, mat)
    siteScene?.scene.add(danDiscMesh)
  }
  const groundY = siteScene?.terrain
    ? siteScene.terrain.heightAt(hit.worldPosition.x, hit.worldPosition.z)
    : hit.worldPosition.y
  danDiscMesh.position.set(hit.worldPosition.x, groundY + 0.05, hit.worldPosition.z)
  danDiscMesh.visible = true

  danInst.prospectStrength = hit.signalStrength
  danInst.prospectPhase = 'drive-to-zone'
  danProspectPhase.value = 'drive-to-zone'
  danProspectProgress.value = 0
  danWaterResult.value = null
  danDialogVisible.value = true
}
```

- [ ] **Step 4: Add prospect phase tick in animation loop**

After the DAN frame update block:

```typescript
// --- DAN prospect phase tick ---
if (danInst && danInst.prospectPhase !== 'idle' && danInst.prospectPhase !== 'complete') {
  const rp = siteScene?.rover?.position
  const hitPos = danDiscMesh?.position
  if (rp && hitPos) {
    const distToZone = new THREE.Vector2(rp.x - hitPos.x, rp.z - hitPos.z).length()

    if (danInst.prospectPhase === 'drive-to-zone') {
      if (distToZone < 5) {
        danInst.prospectPhase = 'initiating'
        danProspectPhase.value = 'initiating'
        danProspectProgress.value = 0
      }
    } else if (danInst.prospectPhase === 'initiating') {
      if (distToZone >= 5) {
        danInst.prospectPhase = 'drive-to-zone'
        danProspectPhase.value = 'drive-to-zone'
        danProspectProgress.value = 0
      } else {
        danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / INITIATE_DURATION)
        danInst.prospectProgress = danProspectProgress.value
        if (danProspectProgress.value >= 1) {
          danInst.prospectPhase = 'prospecting'
          danProspectPhase.value = 'prospecting'
          danProspectProgress.value = 0
          if (controller) controller.config.moveSpeed = 0
        }
      }
    } else if (danInst.prospectPhase === 'prospecting') {
      const prospectDurationSec = (PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION
      danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / prospectDurationSec)
      danInst.prospectProgress = danProspectProgress.value

      if (danProspectProgress.value >= 1) {
        danInst.prospectPhase = 'complete'
        danProspectPhase.value = 'complete'
        danInst.prospectComplete = true

        const gain = awardDAN('DAN prospect complete')
        if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN PROSPECT', gain.bonus)

        const hasWater = danInst.rollWater()
        danInst.waterConfirmed = hasWater
        danWaterResult.value = hasWater

        if (hasWater) {
          sampleToastRef.value?.showDAN('Subsurface ice confirmed — marking drill site')
          const bonusGain = awardDAN('DAN water confirmed')
          if (bonusGain) sampleToastRef.value?.showSP(bonusGain.amount, 'WATER CONFIRMED', bonusGain.bonus)

          const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
          const coneGeo = new THREE.ConeGeometry(0.15, 0.3, 8)
          const coneMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })
          danConeMesh = new THREE.Mesh(coneGeo, coneMat)
          danConeMesh.position.copy(conePos)
          danConeMesh.position.y += 0.15
          siteScene?.scene.add(danConeMesh)
          danInst.drillSitePosition = conePos.clone()
          danInst.reservoirQuality = danInst.prospectStrength
        } else {
          sampleToastRef.value?.showDAN('Analysis inconclusive — hydrogen likely mineral-bound')
        }

        if (danDiscMesh) danDiscMesh.visible = false
        danInst.pendingHit = null
        danHitAvailable.value = false
        if (controller) controller.config.moveSpeed = 5
      }
    }
  }
}
```

- [ ] **Step 5: Add template bindings**

Add `DANProspectBar` below `SiteCompass`:

```html
<DANProspectBar :phase="danProspectPhase" :progress="danProspectProgress" />
```

Add `DANDialog`:

```html
<DANDialog
  :visible="danDialogVisible"
  :signal-strength="danSignalStrength"
  :water-ice-index="siteTerrainParams?.waterIceIndex ?? 0.1"
  :total-samples="danTotalSamples"
  :prospect-phase="danProspectPhase"
  :water-confirmed="danWaterResult"
  @close="danDialogVisible = false"
/>
```

Pass DAN props to `InstrumentOverlay`:

```html
:dan-hit-available="danHitAvailable"
:dan-prospect-phase="danProspectPhase"
@dan-prospect="handleDanProspect"
```

Pass to `InstrumentToolbar`:

```html
:dan-scanning="!!(controller?.instruments.find(i => i.id === 'dan') as DANController | undefined)?.passiveSubsystemEnabled"
```

- [ ] **Step 6: Init DAN VFX in setup**

In the instrument init section (where `mc.initSurvey`, `cc.initTargeting` are called):

```typescript
const danInit = controller.instruments.find(i => i.id === 'dan') as DANController | undefined
if (danInit && siteScene) danInit.initVFX(siteScene.scene)
```

- [ ] **Step 7: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 8: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(dan): integrate DAN into site view — sampling, prospect flow, VFX"
```

---

## Task 10: Manual integration test

- [ ] **Step 1:** Run `npm run dev`, navigate to a geological site
- [ ] **Step 2:** Press 5, verify DAN overlay. Click ACTIVATE, verify STANDBY label, toolbar badge
- [ ] **Step 3:** Press Esc, drive around. Wait for hit toast (blue DAN variant + 100 SP)
- [ ] **Step 4:** Press 5, verify PROSPECT button. Click it — verify blue disc + dialog
- [ ] **Step 5:** Drive to disc, verify initiating countdown, then prospecting timer under compass
- [ ] **Step 6:** Verify completion: toast, SP, cone placement (or inconclusive message)
- [ ] **Step 7:** Test sleep mode — drain battery, verify DAN shuts off and prospect cancels

- [ ] **Step 8: Commit fixes**

```bash
git add -A && git commit -m "fix(dan): integration test fixes"
```

---

## Task 11: Build verification

- [ ] **Step 1:** `npx vue-tsc --noEmit` — no errors
- [ ] **Step 2:** `npm run build` — build succeeds
- [ ] **Step 3:** `npm run test` — all existing tests pass

- [ ] **Step 4: Final commit if needed**

```bash
git add -A && git commit -m "chore: DAN Tier 4 build verification"
```
