# Rover Microphone — Ambient Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a passive MIC instrument (slot 14) that plays layered Mars ambient audio loops whose volumes react to weather, time-of-day, and storm state each frame.

**Architecture:** MicController (passive instrument) → 6 new ambient manifest entries → MicTickHandler (per-frame volume driver) → MIC button in power-hud-side-controls + overlay card in InstrumentOverlay.

**Tech Stack:** TypeScript, Vue 3, Howler.js (via AudioManager), Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/three/instruments/MicController.ts` | Create | Passive instrument controller, slot 14 |
| `src/three/instruments/index.ts` | Modify | Export MicController + MIC_SLOT |
| `src/audio/audioTypes.ts` | Modify | Add 6 ambient sound IDs to AUDIO_SOUND_IDS |
| `src/audio/audioManifest.ts` | Modify | Add 6 ambient manifest entries |
| `src/views/site-controllers/MicTickHandler.ts` | Create | Per-frame ambient volume driver |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Modify | Wire mic handler |
| `src/views/site-controllers/SiteFrameContext.ts` | Modify | Add weather fields to SiteFrameContext |
| `src/views/MarsSiteViewController.ts` | Modify | Add MicController to rover, populate weather in fctx, add refs |
| `src/views/MartianSiteView.vue` | Modify | MIC button + toggle function + overlay props |
| `src/views/MartianSiteView.css` | Modify | MIC button glow styles |
| `src/components/InstrumentOverlay.vue` | Modify | Slot 14 card data + mic overlay case |
| `src/audio/__tests__/audioManifest.test.ts` | Modify | Update manifest count assertions |
| `src/views/site-controllers/__tests__/MicTickHandler.test.ts` | Create | Tick handler volume logic tests |

---

### Task 1: MicController — Passive Instrument

**Files:**
- Create: `src/three/instruments/MicController.ts`
- Modify: `src/three/instruments/index.ts`

- [ ] **Step 1: Create MicController**

```typescript
// src/three/instruments/MicController.ts
import * as THREE from 'three'
import { InstrumentController } from './InstrumentController'

/** Instrument toolbar / overlay slot index for MIC. */
export const MIC_SLOT = 14

/**
 * Rover microphone — passive audio sensor. When enabled, ambient Mars sounds
 * play with volumes driven by weather, time-of-day, and storm state.
 * Audio sourced from NASA Perseverance rover mic recordings (2021).
 */
export class MicController extends InstrumentController {
  readonly id = 'mic'
  readonly name = 'Microphone'
  readonly slot = MIC_SLOT
  override readonly canActivate = true
  override readonly passiveDecayPerSol = 0.15
  override readonly repairComponentId = 'engineering-components'
  override readonly usageDecayChance = 0.05
  override readonly usageDecayAmount = 0.5
  override readonly billsPassiveBackgroundPower = true
  override readonly passiveSubsystemOnly = true
  /** Start OFF — player enables from overlay card. */
  override passiveSubsystemEnabled = false
  /** No dedicated mesh — fall back to rover body. */
  readonly focusNodeName = 'body001'
  readonly altNodeNames = ['Chassis']
  override readonly selectionHighlightRootNames = [] as const
  readonly focusOffset = new THREE.Vector3(0, 0.1, 0)
  readonly viewAngle = 0.0
  readonly viewPitch = 0.6
  override readonly selectionIdlePowerW = 1
}
```

- [ ] **Step 2: Export from index**

Add to `src/three/instruments/index.ts`:

```typescript
export { MicController, MIC_SLOT } from './MicController'
```

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/MicController.ts src/three/instruments/index.ts
git commit -m "$(cat <<'EOF'
feat: add MicController passive instrument (slot 14, 1W)
EOF
)"
```

---

### Task 2: Audio Manifest — 6 Ambient Sound Entries

**Files:**
- Modify: `src/audio/audioTypes.ts` (line 14–25 area)
- Modify: `src/audio/audioManifest.ts` (lines 14–25 and 56–147 areas)

- [ ] **Step 1: Add sound IDs to audioTypes re-exported array**

In `src/audio/audioManifest.ts`, add 6 new IDs to the `AUDIO_SOUND_IDS` array (after `'sfx.danScan'`):

```typescript
  'sfx.danScan',
  'ambient.base',
  'ambient.day',
  'ambient.night',
  'ambient.winds',
  'ambient.storm',
  'ambient.quake',
] as const
```

- [ ] **Step 2: Add manifest entries**

In `src/audio/audioManifest.ts`, add to `manifestById` (after the `sfx.danScan` entry):

```typescript
  'ambient.base': {
    id: 'ambient.base',
    src: '/sound/ambient.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.15,
    effect: 'none',
  },
  'ambient.day': {
    id: 'ambient.day',
    src: '/sound/day.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'ambient.night': {
    id: 'ambient.night',
    src: '/sound/night.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'ambient.winds': {
    id: 'ambient.winds',
    src: '/sound/winds.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.3,
    effect: 'none',
  },
  'ambient.storm': {
    id: 'ambient.storm',
    src: '/sound/wind.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'ambient.quake': {
    id: 'ambient.quake',
    src: '/sound/marsquake.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
```

- [ ] **Step 3: Update manifest test assertions**

In `src/audio/__tests__/audioManifest.test.ts`, update the count assertion for `AUDIO_SOUND_IDS` from 10 to 16, and update the `audioManifest` array length assertion similarly. Also add `'ambient.base'` etc. to any exhaustive ID list checks.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/audio/__tests__/audioManifest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/audio/audioManifest.ts src/audio/__tests__/audioManifest.test.ts
git commit -m "$(cat <<'EOF'
feat: add 6 ambient sound manifest entries for rover mic
EOF
)"
```

---

### Task 3: Extend SiteFrameContext with Weather Fields

**Files:**
- Modify: `src/views/site-controllers/SiteFrameContext.ts`
- Modify: `src/views/MarsSiteViewController.ts` (fctx construction ~line 653)

- [ ] **Step 1: Add weather fields to SiteFrameContext**

In `src/views/site-controllers/SiteFrameContext.ts`, add three fields to the `SiteFrameContext` interface:

```typescript
export interface SiteFrameContext {
  sceneDelta: number
  skyDelta: number
  simulationTime: number
  camera: THREE.PerspectiveCamera
  siteScene: SiteScene
  rover: RoverController | null
  roverReady: boolean
  isSleeping: boolean
  nightFactor: number
  thermalZone: ThermalZone
  marsSol: number
  marsTimeOfDay: number
  totalSP: number
  activeInstrumentSlot: number | null
  /** Wind speed in m/s from site weather model. */
  windMs: number
  /** 'none' | 'incoming' | 'active' */
  dustStormPhase: 'none' | 'incoming' | 'active'
  /** Storm intensity 1–5, or null when no storm. */
  dustStormLevel: number | null
}
```

- [ ] **Step 2: Populate weather in fctx construction**

In `src/views/MarsSiteViewController.ts`, update the `fctx` object at ~line 653 to include the new fields:

```typescript
      const fctx: SiteFrameContext = {
        sceneDelta,
        skyDelta,
        simulationTime,
        camera,
        siteScene,
        rover: controller,
        roverReady,
        isSleeping: isSleeping.value,
        nightFactor,
        thermalZone: thermalZone.value,
        marsSol: marsSol.value,
        marsTimeOfDay: marsTimeOfDay.value,
        totalSP: totalSP.value,
        activeInstrumentSlot: activeInstrumentSlot.value,
        windMs: siteWeather.value.windMs,
        dustStormPhase: siteWeather.value.dustStormPhase,
        dustStormLevel: siteWeather.value.dustStormLevel,
      }
```

- [ ] **Step 3: Update buildFrameContext helper**

In the same file, find `buildFrameContext()` (~line 989) and add the three fields there too:

```typescript
      windMs: 0,
      dustStormPhase: 'none',
      dustStormLevel: null,
```

- [ ] **Step 4: Update test helper**

In `src/views/site-controllers/__tests__/instrumentActionSounds.test.ts`, update `makeFrameContext` to include the new fields:

```typescript
    windMs: 0,
    dustStormPhase: 'none',
    dustStormLevel: null,
    ...overrides,
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/views/site-controllers/__tests__/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/SiteFrameContext.ts src/views/MarsSiteViewController.ts src/views/site-controllers/__tests__/instrumentActionSounds.test.ts
git commit -m "$(cat <<'EOF'
feat: add weather fields (windMs, dustStormPhase, dustStormLevel) to SiteFrameContext
EOF
)"
```

---

### Task 4: MicTickHandler — Ambient Volume Driver

**Files:**
- Create: `src/views/site-controllers/MicTickHandler.ts`

- [ ] **Step 1: Write MicTickHandler**

```typescript
// src/views/site-controllers/MicTickHandler.ts
import type { Ref } from 'vue'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface MicTickRefs {
  micEnabled: Ref<boolean>
}

export interface MicTickCallbacks {
  playAmbientLoop: (soundId: AudioSoundId) => AudioPlaybackHandle
  setAmbientVolume: (handle: AudioPlaybackHandle, volume: number) => void
}

/** Smoothing rate per second — higher = faster convergence. */
const LERP_SPEED = 3.0

/** Map wind m/s (0–15+) to volume (0.05–0.6). */
function windVolume(windMs: number): number {
  const t = Math.min(windMs / 15, 1)
  return 0.05 + t * 0.55
}

/** Map storm level (1–5) to volume (0.3–0.8) during active phase. */
function stormVolume(level: number | null, phase: string): number {
  if (phase !== 'active' || level == null) return 0
  return 0.3 + (Math.min(level, 5) - 1) * 0.125
}

/** Map storm level 4–5 to quake volume (0.4–0.7). */
function quakeVolume(level: number | null, phase: string): number {
  if (phase !== 'active' || level == null || level < 4) return 0
  return level >= 5 ? 0.7 : 0.4
}

function lerp(current: number, target: number, speed: number, dt: number): number {
  const t = Math.min(speed * dt, 1)
  return current + (target - current) * t
}

interface AmbientLayer {
  id: AudioSoundId
  handle: AudioPlaybackHandle | null
  currentVol: number
}

/**
 * Creates a tick handler that manages 6 ambient audio layers driven by Mars weather state.
 * Volumes lerp per-frame toward targets derived from nightFactor, windMs, and storm state.
 */
export function createMicTickHandler(
  refs: MicTickRefs,
  callbacks: MicTickCallbacks,
): SiteTickHandler {
  const { micEnabled } = refs
  const { playAmbientLoop, setAmbientVolume } = callbacks

  const layers: AmbientLayer[] = [
    { id: 'ambient.base' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.day' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.night' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.winds' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.storm' as AudioSoundId, handle: null, currentVol: 0 },
    { id: 'ambient.quake' as AudioSoundId, handle: null, currentVol: 0 },
  ]

  let active = false

  function startAll(): void {
    for (const layer of layers) {
      layer.handle = playAmbientLoop(layer.id)
      layer.currentVol = 0
    }
    active = true
  }

  function stopAll(): void {
    for (const layer of layers) {
      layer.handle?.stop()
      layer.handle = null
      layer.currentVol = 0
    }
    active = false
  }

  function computeTargets(fctx: SiteFrameContext): number[] {
    const { nightFactor, windMs, dustStormPhase, dustStormLevel } = fctx
    return [
      0.15,                                              // ambient.base
      nightFactor < 0.5 ? 1.0 - nightFactor * 2 : 0,   // ambient.day
      nightFactor >= 0.5 ? (nightFactor - 0.5) * 2 : 0, // ambient.night
      windVolume(windMs),                                 // ambient.winds
      stormVolume(dustStormLevel, dustStormPhase),        // ambient.storm
      quakeVolume(dustStormLevel, dustStormPhase),        // ambient.quake
    ]
  }

  function tick(fctx: SiteFrameContext): void {
    if (!micEnabled.value) {
      if (active) stopAll()
      return
    }

    if (!active) startAll()

    const targets = computeTargets(fctx)
    const dt = fctx.sceneDelta

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      const target = targets[i]
      layer.currentVol = lerp(layer.currentVol, target, LERP_SPEED, dt)

      // Snap to zero below threshold to avoid inaudible playback overhead
      if (layer.currentVol < 0.005 && target === 0) {
        layer.currentVol = 0
      }

      if (layer.handle) {
        setAmbientVolume(layer.handle, layer.currentVol)
      }
    }
  }

  function dispose(): void {
    stopAll()
  }

  return { tick, dispose }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/site-controllers/MicTickHandler.ts
git commit -m "$(cat <<'EOF'
feat: add MicTickHandler — per-frame ambient volume driver for rover mic
EOF
)"
```

---

### Task 5: MicTickHandler Tests

**Files:**
- Create: `src/views/site-controllers/__tests__/MicTickHandler.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/views/site-controllers/__tests__/MicTickHandler.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as THREE from 'three'
import type { SiteFrameContext } from '../SiteFrameContext'
import { createMicTickHandler } from '../MicTickHandler'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'

function makeFctx(overrides: Partial<SiteFrameContext> = {}): SiteFrameContext {
  return {
    sceneDelta: 0.016,
    skyDelta: 0.016,
    simulationTime: 0,
    camera: new THREE.PerspectiveCamera(),
    siteScene: {
      rover: { position: new THREE.Vector3() },
      terrain: { heightAt: () => 0 },
      scene: new THREE.Scene(),
    } as unknown as SiteFrameContext['siteScene'],
    rover: null,
    roverReady: true,
    isSleeping: false,
    nightFactor: 0,
    thermalZone: 'OPTIMAL',
    marsSol: 1,
    marsTimeOfDay: 0.25,
    totalSP: 0,
    activeInstrumentSlot: null,
    windMs: 3,
    dustStormPhase: 'none',
    dustStormLevel: null,
    ...overrides,
  }
}

function makeHandle(): AudioPlaybackHandle {
  return {
    soundId: 'test',
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
  }
}

describe('MicTickHandler', () => {
  it('does not start audio when mic is disabled', () => {
    const playAmbientLoop = vi.fn()
    const handler = createMicTickHandler(
      { micEnabled: ref(false) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )
    handler.tick(makeFctx())
    expect(playAmbientLoop).not.toHaveBeenCalled()
  })

  it('starts all 6 ambient loops when mic is enabled', () => {
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )
    handler.tick(makeFctx())
    expect(playAmbientLoop).toHaveBeenCalledTimes(6)
  })

  it('stops all loops when mic is disabled after being enabled', () => {
    const handles = Array.from({ length: 6 }, () => makeHandle())
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const micEnabled = ref(true)
    const handler = createMicTickHandler(
      { micEnabled },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )

    handler.tick(makeFctx())
    micEnabled.value = false
    handler.tick(makeFctx())

    for (const h of handles) {
      expect(h.stop).toHaveBeenCalled()
    }
  })

  it('drives day layer volume up during daytime (nightFactor=0)', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    // Run several ticks to let lerp converge
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({ nightFactor: 0, sceneDelta: 0.016 }))
    }

    // Find day layer calls (index 1 = ambient.day)
    const dayCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 1,
    )
    const lastDayVol = dayCalls[dayCalls.length - 1][1] as number
    expect(lastDayVol).toBeGreaterThan(0.8)
  })

  it('drives night layer volume up during nighttime (nightFactor=1)', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({ nightFactor: 1, sceneDelta: 0.016 }))
    }

    const nightCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 2,
    )
    const lastNightVol = nightCalls[nightCalls.length - 1][1] as number
    expect(lastNightVol).toBeGreaterThan(0.8)
  })

  it('drives storm volume when dust storm is active', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 3,
        sceneDelta: 0.016,
      }))
    }

    // Storm is index 4
    const stormCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 4,
    )
    const lastStormVol = stormCalls[stormCalls.length - 1][1] as number
    expect(lastStormVol).toBeGreaterThan(0.2)
  })

  it('drives quake volume only at storm level 4+', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    // Storm level 3 — no quake
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 3,
        sceneDelta: 0.016,
      }))
    }

    const quakeCalls3 = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 5,
    )
    const lastQuakeVol3 = quakeCalls3[quakeCalls3.length - 1][1] as number
    expect(lastQuakeVol3).toBeLessThan(0.01)

    // Storm level 5 — quake
    setAmbientVolume.mockClear()
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 5,
        sceneDelta: 0.016,
      }))
    }

    const quakeCalls5 = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 5,
    )
    const lastQuakeVol5 = quakeCalls5[quakeCalls5.length - 1][1] as number
    expect(lastQuakeVol5).toBeGreaterThan(0.5)
  })

  it('cleans up on dispose', () => {
    const handles = Array.from({ length: 6 }, () => makeHandle())
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )

    handler.tick(makeFctx())
    handler.dispose()

    for (const h of handles) {
      expect(h.stop).toHaveBeenCalled()
    }
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/views/site-controllers/__tests__/MicTickHandler.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/views/site-controllers/__tests__/MicTickHandler.test.ts
git commit -m "$(cat <<'EOF'
test: MicTickHandler ambient volume driver tests
EOF
)"
```

---

### Task 6: Wire MicTickHandler into createMarsSiteTickHandlers

**Files:**
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`
- Modify: `src/views/MarsSiteViewController.ts`

- [ ] **Step 1: Add micHandler to MarsSiteTickHandlers interface and factory**

In `src/views/site-controllers/createMarsSiteTickHandlers.ts`:

Add import at top:
```typescript
import { createMicTickHandler } from './MicTickHandler'
```

Add to `MarsSiteTickHandlers` interface:
```typescript
  micHandler: ReturnType<typeof createMicTickHandler>
```

Add mic handler creation inside `createMarsSiteTickHandlers`, after `antennaHandler`:
```typescript
  const micHandler = createMicTickHandler(
    {
      micEnabled: refs.micEnabled,
    },
    {
      playAmbientLoop: ctx.playAmbientLoop,
      setAmbientVolume: ctx.setAmbientVolume,
    },
  )
```

Add to `disposeAll`:
```typescript
    micHandler.dispose()
```

Add to return object:
```typescript
    micHandler,
```

- [ ] **Step 2: Add micEnabled ref and audio callbacks to MarsSiteViewRefs and MarsSiteViewContext**

In `src/views/MarsSiteViewController.ts`:

Add to `MarsSiteViewRefs` interface (after `remsSurveying`):
```typescript
  /** Mic passive subsystem enabled state — drives ambient audio layers. */
  micEnabled: Ref<boolean>
```

Add to `MarsSiteViewContext` interface (after `onGlobalKeyDown`):
```typescript
  playAmbientLoop: (soundId: import('@/audio/audioManifest').AudioSoundId) => import('@/audio/audioTypes').AudioPlaybackHandle
  setAmbientVolume: (handle: import('@/audio/audioTypes').AudioPlaybackHandle, volume: number) => void
```

- [ ] **Step 3: Add MicController to rover instrument list**

In `src/views/MarsSiteViewController.ts`, find where instruments are instantiated (search for `new MastCamController`) and add:
```typescript
import { MicController, MIC_SLOT } from '@/three/instruments'
```

Then add `new MicController()` to the instruments array alongside the others.

- [ ] **Step 4: Wire micHandler.tick into the animation loop**

In `src/views/MarsSiteViewController.ts`, find where other handlers are ticked (search for `tickHandlers.danHandler.tick(fctx)` or similar) and add:
```typescript
      tickHandlers.micHandler.tick(fctx)
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/views/site-controllers/__tests__/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/MarsSiteViewController.ts
git commit -m "$(cat <<'EOF'
feat: wire MicTickHandler into site controller tick loop
EOF
)"
```

---

### Task 7: MIC Button in MartianSiteView Template

**Files:**
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/views/MartianSiteView.css`

- [ ] **Step 1: Add MIC button to template**

In `src/views/MartianSiteView.vue`, inside `.power-hud-side-controls` div (after the HTR button, before the closing `</div>`), add:

```html
        <button
          type="button"
          class="wheels-hud-btn wheels-hud-btn--mic"
          :class="{
            active: activeInstrumentSlot === MIC_SLOT,
            disabled: wheelsHudBlocked,
            'wheels-hud-btn--mic-on': micListening,
          }"
          :disabled="wheelsHudBlocked"
          :title="micListening ? 'Microphone [M] — LISTENING' : 'Microphone [M]'"
          @click="toggleMicPanel"
        >
          <span class="wheels-hud-key font-instrument">M</span>
          <span class="wheels-hud-icon wheels-hud-mic-icon" aria-hidden="true">&#x1F399;</span>
          <span class="wheels-hud-name">MIC</span>
        </button>
```

- [ ] **Step 2: Add script refs and toggle function**

In the `<script setup>` section of `MartianSiteView.vue`:

Import `MIC_SLOT`:
```typescript
import { MIC_SLOT } from '@/three/instruments'
```

Add reactive ref:
```typescript
const micListening = ref(false)
```

Add toggle function (near `toggleHeaterPanel`):
```typescript
function toggleMicPanel() {
  if (!siteRover.value) return
  if (activeInstrumentSlot.value === MIC_SLOT) siteRover.value.activateInstrument(null)
  else siteRover.value.activateInstrument(MIC_SLOT)
}
```

Add keyboard handler for 'M' key in the existing `onGlobalKeyDown` handler (search for the 'h' key handler for heater pattern):
```typescript
    if (e.key === 'm' || e.key === 'M') {
      toggleMicPanel()
      return
    }
```

Wire `micEnabled` ref and audio callbacks into the context object passed to `createMarsSiteViewController`. The `micEnabled` ref should be synced from the MicController's `passiveSubsystemEnabled` state (same pattern as `remsSurveying` syncs from REMS).

Wire `playAmbientLoop` callback:
```typescript
  playAmbientLoop: (soundId) => audioManager.play(soundId, { loop: true }),
```

Wire `setAmbientVolume` callback — this needs to set volume on the Howl instance. Since AudioPlaybackHandle doesn't expose a volume setter, use a thin wrapper that re-plays at the target volume via the AudioManager's category volume. The simplest approach: use `audioManager.applyCategoryState('ambient', { volume })` as a global ambient gain, but since each layer needs individual volume, we need per-handle volume. The handle wraps a Howl, so the callback should use the Howl API directly:

```typescript
  setAmbientVolume: (handle, volume) => {
    // AudioPlaybackHandle doesn't expose volume(), so use category-level scaling
    // combined with per-layer manifest volume. Since all layers share the ambient
    // category, we drive volume through the handle's underlying Howl via the
    // internal _sounds API. Simpler: just call play with volume option each time.
    // Actually, the cleanest path is to not use setAmbientVolume at all and instead
    // have the tick handler stop/restart layers. But that's janky.
    // Best: expose a setVolume on the handle.
  },
```

**Revised approach:** Add a `setVolume` method to `AudioPlaybackHandle` and `AudioManager`. This is the cleanest path. See next step.

- [ ] **Step 3: Add setVolume to AudioPlaybackHandle**

In `src/audio/audioTypes.ts`, add to `AudioPlaybackHandle`:
```typescript
  /** Sets the playback volume (0–1) for this instance. */
  setVolume(volume: number): void
```

In `src/audio/AudioManager.ts`, in the `play()` method where the handle is returned (~line 276), add `setVolume` to the returned object:

```typescript
      setVolume: (vol: number) => {
        playback.baseVolumeScale = vol
        const effectiveVol = vol * this.getCategoryVolume(def.category)
        this.applyPerInstanceVolume(howl, effectiveVol, playback.howlPlayId)
      },
```

Also add `setVolume` to the noop handle (`createNoopHandle`):
```typescript
      setVolume: () => {},
```

And the pending voice handle (`createPendingVoiceHandle`):
```typescript
      setVolume: (vol: number) => {
        if (stateRef.kind === 'active') stateRef.realHandle?.setVolume(vol)
      },
```

Then the `setAmbientVolume` callback simplifies to:
```typescript
  setAmbientVolume: (handle, volume) => handle.setVolume(volume),
```

- [ ] **Step 4: Sync micListening ref from MicController**

In the animation loop (or where `remsSurveying` is synced), add:
```typescript
      const micInst = controller?.instruments.find(i => i.id === 'mic') as MicController | undefined
      if (micInst) {
        micListening.value = micInst.passiveSubsystemEnabled
      }
```

- [ ] **Step 5: Add MIC button CSS**

In `src/views/MartianSiteView.css`, after the HTR glow keyframes block (~line 128), add:

```css
/* MIC: cyan pulse while listening */
.wheels-hud-btn.wheels-hud-btn--mic-on .wheels-hud-mic-icon {
  color: #40c8f0;
  animation: wheels-hud-mic-glow 1.5s ease-in-out infinite;
}

.wheels-hud-btn.active.wheels-hud-btn--mic-on .wheels-hud-mic-icon {
  color: #60d8ff;
}

@media (prefers-reduced-motion: reduce) {
  .wheels-hud-btn.wheels-hud-btn--mic-on .wheels-hud-mic-icon {
    animation: none;
  }
}

@keyframes wheels-hud-mic-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 1px rgba(64, 200, 240, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(64, 200, 240, 0.85));
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/views/MartianSiteView.vue src/views/MartianSiteView.css src/audio/audioTypes.ts src/audio/AudioManager.ts
git commit -m "$(cat <<'EOF'
feat: add MIC button to power HUD with cyan glow + setVolume on AudioPlaybackHandle
EOF
)"
```

---

### Task 8: InstrumentOverlay — MIC Card

**Files:**
- Modify: `src/components/InstrumentOverlay.vue`

- [ ] **Step 1: Add slot 14 instrument card data**

In `src/components/InstrumentOverlay.vue`, find the `instruments` record (the object with slot keys 1–13) and add:

```typescript
  14: {
    slot: 14, icon: '\uD83C\uDF99', name: 'MIC', type: 'AUDIO SENSOR',
    desc: 'Rover-mounted microphone capturing Mars ambient sound. Audio sourced from NASA Perseverance recordings. Layers wind, atmosphere, day/night ambience, and storm rumble.',
    power: '1W', powerColor: '#5dc9a5', status: 'LISTENING', statusColor: '#40c8f0', health: '100%',
    hint: '~1W on the bus while listening. ACTIVATE / STANDBY or [E] toggles. Ambient audio reacts to wind speed, time of day, and storm intensity.',
    temp: '',
    upgName: 'HIGH-FIDELITY MIC', upgDesc: 'Wider frequency response captures faint geological sounds at greater distance.', upgReq: 'Requires: Science Pack Alpha drop',
  },
```

- [ ] **Step 2: Pass passiveSubsystemOnly and passiveSubsystemEnabled for slot 14**

In `MartianSiteView.vue`, where the `<InstrumentOverlay>` component is used, ensure the `passive-subsystem-only` and `passive-subsystem-enabled` props are passed for the mic slot. This should already work if the existing logic derives these props from the active instrument controller — check the pattern used for REMS/RAD/DAN. If props are computed from the controller, slot 14 will "just work" since `MicController.passiveSubsystemOnly = true`.

- [ ] **Step 3: Add passiveInstrumentHud for mic**

Where other passive instruments get their `passiveInstrumentHud` computed (search for `passiveInstrumentHud` in MartianSiteView.vue), add the mic case:

```typescript
    if (activeInstrumentSlot.value === MIC_SLOT) {
      const micInst = siteRover.value?.instruments.find(i => i.id === 'mic')
      if (micInst) {
        return {
          power: micInst.passiveSubsystemEnabled ? '1W' : '0W',
          powerColor: micInst.passiveSubsystemEnabled ? '#5dc9a5' : '#6b4a30',
          status: micInst.passiveSubsystemEnabled ? 'LISTENING' : 'STANDBY',
          statusColor: micInst.passiveSubsystemEnabled ? '#40c8f0' : '#6b4a30',
        }
      }
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/components/InstrumentOverlay.vue src/views/MartianSiteView.vue
git commit -m "$(cat <<'EOF'
feat: add MIC instrument card to InstrumentOverlay (slot 14)
EOF
)"
```

---

### Task 9: Update AudioManager Tests for setVolume

**Files:**
- Modify: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Add setVolume test**

Add a test to the existing AudioManager test file:

```typescript
describe('setVolume on playback handle', () => {
  it('updates the per-instance volume on a playing sound', () => {
    const mgr = new AudioManager()
    mgr.unlock()
    const handle = mgr.play('ui.click')
    // Should not throw
    handle.setVolume(0.5)
    expect(handle.playing).toBeDefined()
  })

  it('is a no-op on a noop handle', () => {
    const mgr = new AudioManager()
    // Not unlocked — returns noop
    const handle = mgr.play('ui.click')
    expect(() => handle.setVolume(0.5)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/audio/__tests__/AudioManager.test.ts
git commit -m "$(cat <<'EOF'
test: add setVolume coverage for AudioPlaybackHandle
EOF
)"
```

---

### Task 10: Final Integration Verification

- [ ] **Step 1: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Dev server smoke test**

Run: `npm run dev`
Verify:
- MIC button appears below HTR in the power HUD side controls
- Clicking MIC opens the instrument overlay card with "Microphone / AUDIO SENSOR"
- Pressing E toggles STANDBY / LISTENING
- When LISTENING, ambient audio plays (verify with browser audio)
- MIC button glows cyan when listening
- M key toggles the mic panel

- [ ] **Step 4: Commit any fixes from smoke test, then final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: rover mic ambient audio — integration polish
EOF
)"
```
