# DAN Tier 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DAN neutron prospecting instrument (Tier 4 slice) — toggle while driving, 10W power draw, particle VFX, landmark-biased sampling with hits/toasts/SP, prospect interaction with water roll, blue disc zone, and gray cone drill marker.

**Architecture:** DANController manages all DAN state (toggle, sampling, hits, prospect phases). MartianSiteView orchestrates the prospect flow (disc placement, progress bars, cone spawning, SP awards). New UI components: DANDialog (prospect data + placeholder graphic), DANProspectBar (progress bar under compass). Power integrates via a new `danW` field on PowerTickInput.

**Tech Stack:** Vue 3, Three.js, TypeScript

**Spec:** [2026-03-23-dan-tier4-implementation-design.md](../specs/2026-03-23-dan-tier4-implementation-design.md)

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
| `src/three/instruments/DANController.ts` | Full implementation: toggle state, powerDrawW, sampling engine, hit generation, particle VFX, prospect state machine |
| `src/composables/useMarsPower.ts` | Add `danW` field to `PowerTickInput` interface |
| `src/composables/useSciencePoints.ts` | Add `dan` source type and DAN-specific SP award function (flat 100 SP, no rock dedup) |
| `src/components/SampleToast.vue` | Add `showDAN(message)` method with blue variant styling |
| `src/components/InstrumentOverlay.vue` | DAN-specific button block: toggle Activate/Turn Off label, Prospect button next to activate |
| `src/components/InstrumentToolbar.vue` | Pulsing badge on slot 4 when DAN active |
| `src/views/MartianSiteView.vue` | DAN power tick integration, prospect flow orchestration, blue disc + cone placement, progress bar wiring |

---

## Task 1: DANController — toggle, power, and sampling engine

**Files:**
- Modify: `src/three/instruments/DANController.ts`

This task builds the core DAN state machine: toggle on/off, power reporting, sampling ticks, hit generation with site-biased probability.

- [ ] **Step 1: Implement toggle and power draw**

Replace the stub in `DANController.ts` with the toggle state and power getter:

```typescript
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

// --- Power ---
const DAN_ACTIVE_W = 10

// --- Sampling ---
const SAMPLE_INTERVAL_MOVING = 3.0   // seconds between samples when moving
const SAMPLE_INTERVAL_STATIC = 5.0   // seconds when stationary
const MIN_MOVE_DIST = 0.5            // meters moved to count as "moving"
const BASE_HIT_RATE = 0.02           // 2% per tick

// --- Feature multipliers (matches GeologicalFeature.featureType union) ---
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
  readonly slot = 4
  readonly focusNodeName = 'DAN_L'
  readonly focusOffset = new THREE.Vector3(0.0, 0.3, 0.0)
  readonly viewAngle = Math.PI * 0.5
  readonly viewPitch = 0.15
  readonly canActivate = true

  // --- Toggle state ---
  /** Whether the neutron generator is on (persists across mode changes) */
  scanning = false

  // --- Power ---
  get powerDrawW(): number { return this.scanning ? DAN_ACTIVE_W : 0 }

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
  /** Set to true by view after reading; controller clears after one frame */
  hitConsumed = false

  // --- Prospect state ---
  prospectPhase: DANProspectPhase = 'idle'
  prospectProgress = 0  // 0–1 for both initiating and prospecting phases
  prospectComplete = false
  waterConfirmed = false
  drillSitePosition: THREE.Vector3 | null = null
  reservoirQuality = 0
  /** Signal strength of the prospect that completed */
  prospectStrength = 0

  // --- Rover state (set by view each frame) ---
  private roverPos = new THREE.Vector3()
  roverMoving = false

  setRoverState(pos: THREE.Vector3, moving: boolean): void {
    this.roverPos.copy(pos)
    this.roverMoving = moving
  }

  /** Toggle DAN on/off. Returns new scanning state. */
  toggle(): boolean {
    this.scanning = !this.scanning
    if (this.scanning) {
      this.sampleTimer = 0
      this.lastSamplePos.copy(this.roverPos)
    }
    return this.scanning
  }

  /** Force off (e.g. sleep mode) */
  forceOff(): void {
    this.scanning = false
    if (this.prospectPhase === 'prospecting' || this.prospectPhase === 'initiating') {
      this.prospectPhase = 'idle'
      this.prospectProgress = 0
    }
  }

  override update(delta: number): void {
    if (!this.scanning) return
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

    // Hit roll
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

  /** Quality label from signal strength */
  static qualityLabel(strength: number): string {
    if (strength >= 0.7) return 'Strong'
    if (strength >= 0.5) return 'Moderate'
    return 'Weak'
  }

  /** Water probability from strength + site index */
  static waterChance(strength: number, waterIceIndex: number): number {
    const base = strength >= 0.7 ? 0.70 : strength >= 0.5 ? 0.40 : 0.15
    return Math.min(base * (0.5 + waterIceIndex), 1.0)
  }

  /** Roll for water. Returns true if water confirmed. */
  rollWater(): boolean {
    const chance = DANController.waterChance(this.prospectStrength, this.waterIceIndex)
    return Math.random() < chance
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors in DANController.ts

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/DANController.ts
git commit -m "feat(dan): implement toggle, power draw, and sampling engine"
```

---

## Task 2: SampleToast — DAN variant

**Files:**
- Modify: `src/components/SampleToast.vue`

Add a `showDAN` method with blue styling to match the hydrogen/water theme.

- [ ] **Step 1: Add showDAN method and dan variant styles**

In `SampleToast.vue`, add the method before `defineExpose`:

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

Update `defineExpose` to include it:

```typescript
defineExpose({ show, showError, showChemCam, showSP, showTrace, showDAN })
```

Add CSS for the dan variant after the `.sample-toast.trace` block:

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

DAN SP is flat 100 per event, not rock-deduped. Add a simple `awardDAN` function.

- [ ] **Step 1: Add awardDAN function**

In `useSciencePoints.ts`, add after the `awardAck` function:

```typescript
const DAN_SP = 100

/** Flat SP award for DAN events (no rock dedup — each event pays once) */
function awardDAN(reason: string): SPGain {
  const spYieldMult = mod('spYield')
  const amount = Math.round(DAN_SP * spYieldMult)
  totalSP.value += amount
  sessionSP.value += amount
  const gain: SPGain = { amount, source: 'dan' as SPSource, rockLabel: reason, bonus: 1.0 }
  lastGain.value = gain
  return gain
}
```

Update the `SPSource` type to include `'dan'`:

```typescript
export type SPSource = 'mastcam' | 'chemcam' | 'apxs' | 'chemcam-ack' | 'dan'
```

Return `awardDAN` from the composable's return object.

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/composables/useSciencePoints.ts
git commit -m "feat(dan): add flat 100 SP award function for DAN events"
```

---

## Task 4: useMarsPower — add danW to PowerTickInput

**Files:**
- Modify: `src/composables/useMarsPower.ts`

DAN's power draw is unconditional (not gated by active slot), so it needs its own field like `heaterW`.

- [ ] **Step 1: Add danW field to PowerTickInput and consumption**

In `useMarsPower.ts`, add to the `PowerTickInput` interface:

```typescript
/** DAN neutron generator draw (W, 0 or 10). Always-on when toggled, like heater. */
danW?: number
```

In `tickPower`, add DAN draw **outside** the `!isSleeping` block — DAN is force-turned-off by the view's sleep handler (like heaterW), not suppressed by the power system:

```typescript
// After the !isSleeping block and heater line, before applying consumptionMult:
const danDraw = input.danW ?? 0
// Add danDraw to total consumption (DAN is toggled off by forceOff(), not by sleep guard)
baseUse += danDraw
```

Place this after the existing `heaterW` handling and before the final `consumptionW.value = ...` assignment.

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/composables/useMarsPower.ts
git commit -m "feat(dan): add danW field to PowerTickInput for always-on draw"
```

---

## Task 5: InstrumentOverlay — DAN toggle button + Prospect button

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

DAN slot 4 needs: (a) Activate button that toggles to "Turn Off", (b) Prospect button that appears when a hit exists (like ChemCam's "See Results").

- [ ] **Step 1: Add DAN props and emits**

Add new props to the component:

```typescript
/** DAN: whether neutron generator is currently on */
danScanning?: boolean
/** DAN: whether a prospect hit is available */
danHitAvailable?: boolean
/** DAN: prospect phase for button state */
danProspectPhase?: string
```

Add new emits:

```typescript
danToggle: []
danProspect: []
```

- [ ] **Step 2: Add DAN-specific button block**

In the template, add a DAN block between the ChemCam block and the Buttons div. Only visible when `activeSlot === 4`:

```html
<!-- DAN: toggle + prospect -->
<div v-if="activeSlot === 4" class="ov-dan-block">
  <div class="ov-buttons">
    <button
      class="ov-btn-primary"
      :class="{ active: danScanning }"
      @click="$emit('danToggle')"
    >{{ danScanning ? 'TURN OFF' : 'ACTIVATE' }}</button>
    <button
      v-if="danHitAvailable && danProspectPhase === 'idle'"
      class="ov-btn-see-results"
      @click="$emit('danProspect')"
    >PROSPECT</button>
  </div>
</div>
```

- [ ] **Step 3: Hide default ACTIVATE button for slot 4**

Update the existing Buttons div to hide for DAN since it has its own block:

```html
<div v-if="activeSlot !== 4" class="ov-buttons">
```

- [ ] **Step 4: Add DAN button styles**

```css
.ov-dan-block {
  padding: 0 16px;
}

.ov-dan-block .ov-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ov-dan-block .ov-btn-primary.active {
  background: rgba(68, 170, 255, 0.15);
  border-color: rgba(68, 170, 255, 0.5);
  color: #44aaff;
}

.ov-dan-block .ov-btn-see-results {
  padding: 6px 14px;
  background: rgba(68, 170, 255, 0.1);
  border: 1px solid rgba(68, 170, 255, 0.4);
  border-radius: 4px;
  color: #44aaff;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  animation: dan-pulse 2s ease-in-out infinite;
}

@keyframes dan-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(68, 170, 255, 0.2); }
  50% { box-shadow: 0 0 12px rgba(68, 170, 255, 0.5); }
}
```

- [ ] **Step 5: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/components/InstrumentOverlay.vue
git commit -m "feat(dan): add toggle and Prospect buttons to overlay"
```

---

## Task 6: InstrumentToolbar — DAN active badge

**Files:**
- Modify: `src/components/InstrumentToolbar.vue`

Show a pulsing blue dot on slot 4 when DAN is scanning.

- [ ] **Step 1: Add danScanning prop**

```typescript
const props = defineProps<{
  activeSlot: number | null
  inventoryOpen?: boolean
  chemCamUnread?: number
  danScanning?: boolean  // <-- add
}>()
```

- [ ] **Step 2: Add badge to template**

After the ChemCam badge line, add:

```html
<span v-if="inst.slot === 4 && (danScanning ?? false)" class="badge-dan">&#x2022;</span>
```

- [ ] **Step 3: Add badge styles**

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

- [ ] **Step 4: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/components/InstrumentToolbar.vue
git commit -m "feat(dan): add pulsing blue badge on toolbar when DAN active"
```

---

## Task 7: DANDialog component

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
          <!-- Left: placeholder graphic -->
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
          <!-- Right: live data -->
          <div class="dan-data">
            <div class="dan-stat">
              <div class="dan-stat-label">SIGNAL STRENGTH</div>
              <div class="dan-stat-bar-track">
                <div
                  class="dan-stat-bar-fill"
                  :style="{ width: Math.round(signalStrength * 100) + '%' }"
                />
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

// Try to load dan.png from inspo folder
const danImgSrc = computed(() => {
  // Will resolve at runtime; fallback to placeholder if missing
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
```

Style the dialog following SAMDialog patterns — same position/sizing approach, but with blue accent (`#44aaff`). Panel uses `display: flex` with `.dan-graphic` (flex: 0 0 45%) and `.dan-data` (flex: 1).

```css
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

.dan-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(68, 170, 255, 0.15);
}

.dan-icon { font-size: 16px; color: #44aaff; }
.dan-title { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: rgba(68, 170, 255, 0.9); }
.dan-close { margin-left: auto; background: none; border: none; color: rgba(255,255,255,0.3); font-size: 18px; cursor: pointer; }

.dan-body { display: flex; flex: 1; overflow: hidden; }

.dan-graphic {
  flex: 0 0 45%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(68, 170, 255, 0.1);
  padding: 12px;
}

.dan-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; opacity: 0.85; }

.dan-graphic-placeholder { text-align: center; color: rgba(68, 170, 255, 0.3); }
.dan-gp-icon { font-size: 32px; margin-bottom: 8px; }
.dan-gp-text { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; }
.dan-gp-sub { font-size: 10px; margin-top: 4px; opacity: 0.6; }

.dan-data { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }

.dan-stat { display: flex; flex-direction: column; gap: 2px; }
.dan-stat-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; color: rgba(68, 170, 255, 0.5); }
.dan-stat-value { font-size: 12px; color: rgba(200, 220, 240, 0.9); }

.dan-stat-bar-track {
  height: 4px;
  background: rgba(68, 170, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.dan-stat-bar-fill {
  height: 100%;
  background: #44aaff;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.dan-footer {
  padding: 8px 16px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.2);
  letter-spacing: 0.1em;
  border-top: 1px solid rgba(68, 170, 255, 0.1);
}

.dan-slide-enter-active, .dan-slide-leave-active { transition: all 0.25s ease; }
.dan-slide-enter-from { opacity: 0; transform: translateY(-50%) translateX(20px); }
.dan-slide-leave-to { opacity: 0; transform: translateY(-50%) translateX(20px); }
```

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add -f src/components/DANDialog.vue
git commit -m "feat(dan): create DANDialog component with placeholder graphic"
```

---

## Task 8: DANProspectBar component

**Files:**
- Create: `src/components/DANProspectBar.vue`

Progress bar positioned below the compass. Two modes: inverse countdown ("Initiating DAN Prospecting") and normal progress ("Prospecting subsurface...").

- [ ] **Step 1: Create DANProspectBar.vue**

```vue
<template>
  <div v-if="phase !== 'idle' && phase !== 'complete'" class="dan-prospect-bar">
    <div class="dpb-label">{{ label }}</div>
    <div class="dpb-track">
      <div
        class="dpb-fill"
        :class="phase"
        :style="{ width: fillPct + '%' }"
      />
    </div>
    <div class="dpb-pct font-instrument">{{ Math.round(fillPct) }}%</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  phase: string    // 'idle' | 'initiating' | 'prospecting' | 'drive-to-zone' | 'complete'
  progress: number // 0–1
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
  if (props.phase === 'initiating') {
    // Inverse: starts full, drains to 0
    return (1 - props.progress) * 100
  }
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

.dpb-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: rgba(68, 170, 255, 0.8);
  white-space: nowrap;
}

.dpb-track {
  width: 120px;
  height: 4px;
  background: rgba(68, 170, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.dpb-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s linear;
}

.dpb-fill.drive-to-zone {
  background: rgba(68, 170, 255, 0.3);
}

.dpb-fill.initiating {
  background: rgba(68, 170, 255, 0.6);
}

.dpb-fill.prospecting {
  background: #44aaff;
  box-shadow: 0 0 6px rgba(68, 170, 255, 0.4);
}

.dpb-pct {
  font-size: 11px;
  color: rgba(68, 170, 255, 0.7);
  min-width: 30px;
  text-align: right;
}
</style>
```

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add -f src/components/DANProspectBar.vue
git commit -m "feat(dan): create DANProspectBar component for prospect progress display"
```

---

## Task 9: DANController — particle VFX

**Files:**
- Modify: `src/three/instruments/DANController.ts`

Add particle stream from DAN_L node downward to ground. Only visible when slot is selected (controlled by view).

- [ ] **Step 1: Add particle system to DANController**

Add particle VFX members and methods to the class. The particles use Points + BufferGeometry with additive blending (same pattern as ChemCam flash particles):

```typescript
// Add to class members:
private particles: THREE.Points | null = null
private particlePositions: Float32Array | null = null
private particleVelocities: Float32Array | null = null
private particleSpeeds: Float32Array | null = null
private sceneRef: THREE.Scene | null = null
private readonly PARTICLE_COUNT = 24
vfxVisible = false  // set by view based on slot selection

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
  // Start at DAN node position with small random spread
  const wp = new THREE.Vector3()
  this.node.getWorldPosition(wp)
  const i3 = i * 3
  this.particlePositions[i3] = wp.x + (Math.random() - 0.5) * 0.08
  this.particlePositions[i3 + 1] = wp.y
  this.particlePositions[i3 + 2] = wp.z + (Math.random() - 0.5) * 0.08
  // Downward velocity
  this.particleVelocities[i3] = (Math.random() - 0.5) * 0.1
  this.particleVelocities[i3 + 1] = -1
  this.particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.1
}

/** Call in update() to animate particles. groundY = terrain height below rover. */
updateVFX(delta: number, groundY: number): void {
  if (!this.particles || !this.particlePositions || !this.particleVelocities || !this.particleSpeeds) return

  this.particles.visible = this.vfxVisible && this.scanning

  if (!this.particles.visible) return

  const positions = this.particles.geometry.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < this.PARTICLE_COUNT; i++) {
    const i3 = i * 3
    const speed = this.particleSpeeds[i]
    this.particlePositions[i3] += this.particleVelocities[i3] * speed * delta
    this.particlePositions[i3 + 1] += this.particleVelocities[i3 + 1] * speed * delta
    this.particlePositions[i3 + 2] += this.particleVelocities[i3 + 2] * speed * delta

    // Reset when below ground
    if (this.particlePositions[i3 + 1] <= groundY) {
      this.resetParticle(i)
    }
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

- [ ] **Step 2: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/DANController.ts
git commit -m "feat(dan): add neutron particle stream VFX"
```

---

## Task 10: MartianSiteView — full DAN integration

**Files:**
- Modify: `src/views/MartianSiteView.vue`

This is the orchestration task. Wire up:
1. DAN power draw into tick
2. DAN toggle from overlay
3. Hit detection → toast + SP
4. Prospect flow: blue disc, drive-to-zone, initiating timer, prospecting timer, water roll, cone placement
5. Sleep mode safety
6. VFX visibility based on slot selection
7. New component imports and template bindings

This is the largest task. Break into sub-steps.

- [ ] **Step 1: Add imports and reactive state**

Add to the imports section:

```typescript
import DANDialog from '@/components/DANDialog.vue'
import DANProspectBar from '@/components/DANProspectBar.vue'
import { DANController } from '@/three/instruments'
```

Update the `useSciencePoints` destructuring to include `awardDAN`:

```typescript
const { totalSP, award: awardSP, awardAck, awardDAN } = useSciencePoints()
```

Add reactive state for DAN UI:

```typescript
// --- DAN state ---
const danScanning = ref(false)
const danHitAvailable = ref(false)
const danProspectPhase = ref<string>('idle')
const danProspectProgress = ref(0)
const danDialogVisible = ref(false)
const danSignalStrength = ref(0)
const danTotalSamples = ref(0)
const danWaterResult = ref<boolean | null>(null)
// Blue disc mesh
let danDiscMesh: THREE.Mesh | null = null
// Gray cone mesh
let danConeMesh: THREE.Mesh | null = null
// Prospect timers
const INITIATE_DURATION = 4  // real seconds for inverse countdown
```

- [ ] **Step 2: Add DAN power to tick**

In the animation loop where `tickPower` is called, find the `instrumentW` calculation and add DAN draw:

```typescript
// After existing instrumentW calculation:
const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
const danW = danInst?.powerDrawW ?? 0

tickPower(sceneDelta, {
  nightFactor: siteScene.sky?.nightFactor ?? 0,
  roverInSunlight: siteScene.roverInSunlight,
  moving: controller?.isMoving ?? false,
  apxsDrilling,
  instrumentW,
  heaterW: heaterW.value,
  danW,  // <-- add
})
```

- [ ] **Step 3: Add DAN update in animation loop**

After the power tick, add DAN frame update:

```typescript
// --- DAN frame update ---
if (danInst) {
  // Update rover state
  danInst.setRoverState(
    siteScene.rover?.position ?? new THREE.Vector3(),
    controller?.isMoving ?? false,
  )
  // Set site priors
  if (siteTerrainParams) {
    danInst.waterIceIndex = siteTerrainParams.waterIceIndex ?? 0.1
    danInst.featureType = siteTerrainParams.featureType ?? 'plain'
  }
  // Tick sampling
  danInst.update(sceneDelta)

  // Sync UI state
  danScanning.value = danInst.scanning
  danTotalSamples.value = danInst.totalSamples
  danHitAvailable.value = danInst.pendingHit !== null

  // VFX visibility: only when slot 4 is selected
  danInst.vfxVisible = controller?.activeInstrument?.id === 'dan'
  if (danInst.vfxVisible && siteScene.terrain) {
    const rp = siteScene.rover?.position
    const groundY = rp ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
    danInst.updateVFX(sceneDelta, groundY)
  }

  // Hit detection → toast + SP
  if (danInst.pendingHit && !danInst.hitConsumed) {
    // Notify if replacing a previous pending hit
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
  }

  // Sleep mode safety
  if (isSleeping.value && danInst.scanning) {
    danInst.forceOff()
    danScanning.value = false
    sampleToastRef.value?.showDAN('Prospect interrupted — insufficient power')
    cleanupDanDisc()
    danProspectPhase.value = 'idle'
    danProspectProgress.value = 0
  }
}
```

- [ ] **Step 4: Add DAN toggle handler**

Add a function to handle the overlay toggle emit:

```typescript
function handleDanToggle(): void {
  const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
  if (!danInst) return
  danInst.toggle()
  danScanning.value = danInst.scanning
}
```

Also guard the existing `handleActivate` (or `onInstrumentActivateRequest`) so the keyboard **E** shortcut routes to DAN toggle instead of `enterActiveMode`:

```typescript
// In handleActivate / onInstrumentActivateRequest:
if (controller.activeInstrument instanceof DANController) {
  handleDanToggle()
  return
}
// ... existing RTG / default logic
```

- [ ] **Step 5: Add prospect flow handler**

```typescript
function handleDanProspect(): void {
  const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
  if (!danInst?.pendingHit) return

  const hit = danInst.pendingHit

  // Place blue disc at hit position
  if (!danDiscMesh) {
    const geo = new THREE.CircleGeometry(5, 32)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44aaff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    danDiscMesh = new THREE.Mesh(geo, mat)
    siteScene?.scene.add(danDiscMesh)
  }
  const groundY = siteScene?.terrain
    ? siteScene.terrain.heightAt(hit.worldPosition.x, hit.worldPosition.z)
    : hit.worldPosition.y
  danDiscMesh.position.set(hit.worldPosition.x, groundY + 0.05, hit.worldPosition.z)
  danDiscMesh.visible = true

  // Store prospect strength
  danInst.prospectStrength = hit.signalStrength
  danInst.prospectPhase = 'drive-to-zone'
  danProspectPhase.value = 'drive-to-zone'
  danProspectProgress.value = 0
  danWaterResult.value = null

  // Open dialog
  danDialogVisible.value = true
}

function cleanupDanDisc(): void {
  if (danDiscMesh) {
    danDiscMesh.visible = false
  }
}
```

- [ ] **Step 6: Add prospect phase tick in animation loop**

After the DAN frame update block, add prospect phase management:

```typescript
// --- DAN prospect phase tick ---
if (danInst && danInst.prospectPhase !== 'idle' && danInst.prospectPhase !== 'complete') {
  const rp = siteScene?.rover?.position
  const hitPos = danInst.pendingHit?.worldPosition ?? danDiscMesh?.position
  if (rp && hitPos) {
    const distToZone = new THREE.Vector2(rp.x - hitPos.x, rp.z - hitPos.z).length()

    if (danInst.prospectPhase === 'drive-to-zone') {
      // Check if rover is in the zone
      if (distToZone < 5) {
        danInst.prospectPhase = 'initiating'
        danProspectPhase.value = 'initiating'
        danProspectProgress.value = 0
      }
    } else if (danInst.prospectPhase === 'initiating') {
      // Inverse countdown — must stay in zone
      if (distToZone >= 5) {
        danInst.prospectPhase = 'drive-to-zone'
        danProspectPhase.value = 'drive-to-zone'
        danProspectProgress.value = 0
      } else {
        danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / INITIATE_DURATION)
        danInst.prospectProgress = danProspectProgress.value
        if (danProspectProgress.value >= 1) {
          // Lock rover, start prospecting
          danInst.prospectPhase = 'prospecting'
          danProspectPhase.value = 'prospecting'
          danProspectProgress.value = 0
          // Lock rover movement
          if (controller) controller.config.moveSpeed = 0
        }
      }
    } else if (danInst.prospectPhase === 'prospecting') {
      // 2 Martian hours scaled to real time (import from MarsSky)
      // Add to imports: import { SOL_DURATION, MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'
      const prospectDurationSec = (120 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION
      danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / prospectDurationSec)
      danInst.prospectProgress = danProspectProgress.value

      if (danProspectProgress.value >= 1) {
        // Complete!
        danInst.prospectPhase = 'complete'
        danProspectPhase.value = 'complete'
        danInst.prospectComplete = true

        // SP for completing prospect
        const gain = awardDAN('DAN prospect complete')
        if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN PROSPECT', gain.bonus)

        // Water roll
        const hasWater = danInst.rollWater()
        danInst.waterConfirmed = hasWater
        danWaterResult.value = hasWater

        if (hasWater) {
          sampleToastRef.value?.showDAN('Subsurface ice confirmed — marking drill site')
          const bonusGain = awardDAN('DAN water confirmed')
          if (bonusGain) sampleToastRef.value?.showSP(bonusGain.amount, 'WATER CONFIRMED', bonusGain.bonus)

          // Place gray cone at disc position
          const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
          const coneGeo = new THREE.ConeGeometry(0.15, 0.3, 8)
          const coneMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })
          danConeMesh = new THREE.Mesh(coneGeo, coneMat)
          danConeMesh.position.copy(conePos)
          danConeMesh.position.y += 0.15  // sit on ground
          siteScene?.scene.add(danConeMesh)

          danInst.drillSitePosition = conePos.clone()
          danInst.reservoirQuality = danInst.prospectStrength
        } else {
          sampleToastRef.value?.showDAN('Analysis inconclusive — hydrogen likely mineral-bound')
        }

        // Cleanup
        cleanupDanDisc()
        danInst.pendingHit = null
        danHitAvailable.value = false
        // Unlock rover movement
        if (controller) controller.config.moveSpeed = 5
      }
    }
  }
}
```

- [ ] **Step 7: Add template bindings**

Add the new components to the template. Add `DANProspectBar` below `SiteCompass`:

```html
<DANProspectBar
  :phase="danProspectPhase"
  :progress="danProspectProgress"
/>
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
:dan-scanning="danScanning"
:dan-hit-available="danHitAvailable"
:dan-prospect-phase="danProspectPhase"
@dan-toggle="handleDanToggle"
@dan-prospect="handleDanProspect"
```

Pass `danScanning` to `InstrumentToolbar`:

```html
:dan-scanning="danScanning"
```

- [ ] **Step 8: Init DAN VFX in setup**

In the section where instruments are initialized (near `mc.initSurvey`, `cc.initTargeting`), add:

```typescript
const danInst2 = controller.instruments.find(i => i.id === 'dan') as DANController | undefined
if (danInst2 && siteScene) {
  danInst2.initVFX(siteScene.scene)
}
```

- [ ] **Step 9: Verify compilation**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Fix any type errors.

- [ ] **Step 10: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(dan): integrate DAN into site view — power, sampling, prospect flow, VFX"
```

---

## Task 11: Manual integration test

- [ ] **Step 1: Run dev server**

Run: `npm run dev`

- [ ] **Step 2: Test activation flow**

1. Navigate to a geological site (e.g., one with `waterIceIndex > 0.3`)
2. Press **4** — verify camera orbits to DAN, overlay shows description
3. Click **ACTIVATE** — verify button changes to **TURN OFF**
4. Press **Esc** — verify back to driving, toolbar shows blue pulsing badge on slot 4
5. Verify power HUD shows ~10W additional consumption

- [ ] **Step 3: Test sampling + hits**

1. Drive around with DAN active
2. Wait for a hit toast — verify "Hydrogen signal" toast appears with blue styling
3. Verify +100 SP toast follows
4. Press **4** — verify **PROSPECT** button visible next to **TURN OFF**

- [ ] **Step 4: Test prospect flow**

1. Click **PROSPECT** — verify blue disc appears on terrain, DAN dialog opens
2. Close dialog, drive to the blue disc
3. Verify inverse progress bar appears under compass ("Initiating DAN Prospecting")
4. Stay in zone — verify countdown completes, then "Prospecting subsurface..." progress bar appears
5. Wait ~15 seconds — verify completion toast, SP awards, and either cone placement or inconclusive message

- [ ] **Step 5: Test sleep mode safety**

1. Drain battery low (use many instruments)
2. Verify DAN turns off when sleep mode triggers
3. Verify any in-progress prospect is cancelled

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(dan): integration test fixes"
```

---

## Task 12: Type-check and build verification

- [ ] **Step 1: Full type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All existing tests pass (DAN adds no regressions)

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: clean up DAN integration — type fixes and build verification"
```
