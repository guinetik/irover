# Sound System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared 2D-first game-audio system on top of `howler.js` that centralizes loading, playback, ducking, DSN voice effects, and current DSN feature integration.

**Architecture:** Add a small `src/audio/` subsystem that wraps `howler.js` behind app-owned types, a manifest, effect presets, and an `AudioManager`. Migrate the two existing DSN playback paths to the shared facade first, prove ducking and `dsn-radio` on real content, and leave simple extension points for UI and reactive one-shot sounds.

**Tech Stack:** Vue 3, TypeScript, Vitest, `howler.js`

---

## File Structure

### New Files

- `src/audio/audioTypes.ts`
  Defines audio categories, manifest entry types, effect preset ids, play options, and playback handle interfaces.
- `src/audio/audioManifest.ts`
  Declares the app-owned sound registry, including seeded entries for DSN voice, UI click/error, and a reactive discovery cue.
- `src/audio/audioEffects.ts`
  Contains preset metadata and the Web Audio chain builder used by `dsn-radio`.
- `src/audio/AudioManager.ts`
  Wraps `howler.js` with app-facing playback, category control, unlock, preload, effect application, and ducking.
- `src/audio/useAudio.ts`
  Exposes a singleton manager/composable for Vue call sites.
- `src/audio/__tests__/audioManifest.test.ts`
  Verifies manifest integrity and seeded sound semantics.
- `src/audio/__tests__/AudioManager.test.ts`
  Verifies unlock, play/stop, exclusivity, ducking, and effect/failure behavior with mocked `howler`.

### Modified Files

- `package.json`
  Adds `howler` as a runtime dependency.
- `src/views/MartianSiteView.vue`
  Replaces direct DSN `Audio` element logic with `useAudio()` and the shared `voice.dsnTransmission` cue.
- `src/components/DSNArchiveDialog.vue`
  Replaces local `Audio` element lifecycle with manager-backed playback and progress polling.

### Existing Files To Reference While Implementing

- `docs/superpowers/specs/2026-03-26-sound-system-design.md`
- `src/types/dsnArchive.ts`
- `src/composables/__tests__/useDSNArchive.test.ts`

## Task 1: Add The Audio Dependency And Type-Safe Manifest Skeleton

**Files:**
- Modify: `package.json`
- Create: `src/audio/audioTypes.ts`
- Create: `src/audio/audioManifest.ts`
- Test: `src/audio/__tests__/audioManifest.test.ts`

- [ ] **Step 1: Write the failing manifest test**

```ts
import { describe, expect, it } from 'vitest'
import {
  AUDIO_CATEGORIES,
  AUDIO_SOUND_IDS,
  audioManifest,
  getAudioDefinition,
} from '../audioManifest'

describe('audioManifest', () => {
  it('registers the seeded sound ids used by the first migration', () => {
    expect(AUDIO_SOUND_IDS).toEqual([
      'voice.dsnTransmission',
      'ui.click',
      'ui.error',
      'sfx.discovery',
    ])
  })

  it('defines valid category and loading semantics for DSN voice playback', () => {
    const def = getAudioDefinition('voice.dsnTransmission')
    expect(def.category).toBe('voice')
    expect(def.load).toBe('lazy')
    expect(def.playback).toBe('exclusive-category')
    expect(def.allowDynamicSrc).toBe(true)
    expect(def.effect).toBe('dsn-radio')
  })

  it('keeps the manifest categories aligned with the exported category list', () => {
    for (const def of audioManifest) {
      expect(AUDIO_CATEGORIES).toContain(def.category)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/audio/__tests__/audioManifest.test.ts`
Expected: FAIL with module resolution errors such as `Cannot find module '../audioManifest'`.

- [ ] **Step 3: Add the dependency**

Run: `npm install howler`
Expected: package install completes and `package.json` includes `"howler"`.

- [ ] **Step 4: Create the shared audio types**

```ts
export const AUDIO_CATEGORIES = ['ui', 'voice', 'sfx', 'ambient', 'music'] as const

export type AudioCategory = typeof AUDIO_CATEGORIES[number]

export const AUDIO_EFFECT_PRESETS = [
  'none',
  'dsn-radio',
  'helmet-comms',
  'terminal-beep',
] as const

export type AudioEffectPreset = typeof AUDIO_EFFECT_PRESETS[number]

export const AUDIO_LOAD_STRATEGIES = ['eager', 'lazy', 'manual'] as const

export type AudioLoadStrategy = typeof AUDIO_LOAD_STRATEGIES[number]

export const AUDIO_PLAYBACK_MODES = [
  'restart',
  'overlap',
  'single-instance',
  'exclusive-category',
  'rate-limited',
] as const

export type AudioPlaybackMode = typeof AUDIO_PLAYBACK_MODES[number]

export interface AudioDefinition {
  id: string
  category: AudioCategory
  src?: string | readonly string[]
  allowDynamicSrc?: boolean
  load: AudioLoadStrategy
  playback: AudioPlaybackMode
  volume: number
  effect: AudioEffectPreset
  cooldownMs?: number
}

export interface AudioPlayOptions {
  src?: string
  volume?: number
  effect?: AudioEffectPreset
  cooldownKey?: string
  onEnd?: () => void
}

export interface AudioPlaybackHandle {
  readonly soundId: string
  stop(): void
  playing(): boolean
  progress(): number
  duration(): number
}
```

- [ ] **Step 5: Create the manifest module**

```ts
import type { AudioCategory, AudioDefinition } from './audioTypes'
import { AUDIO_CATEGORIES } from './audioTypes'

export const AUDIO_SOUND_IDS = [
  'voice.dsnTransmission',
  'ui.click',
  'ui.error',
  'sfx.discovery',
] as const

export type AudioSoundId = typeof AUDIO_SOUND_IDS[number]

const manifestById: Record<AudioSoundId, AudioDefinition> = {
  'voice.dsnTransmission': {
    id: 'voice.dsnTransmission',
    category: 'voice',
    allowDynamicSrc: true,
    load: 'lazy',
    playback: 'exclusive-category',
    volume: 0.6,
    effect: 'dsn-radio',
  },
  'ui.click': {
    id: 'ui.click',
    src: '/audio/ui/click.mp3',
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
  'ui.error': {
    id: 'ui.error',
    src: '/audio/ui/error.mp3',
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'sfx.discovery': {
    id: 'sfx.discovery',
    src: '/audio/sfx/discovery.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
    effect: 'none',
  },
}

export const audioManifest = AUDIO_SOUND_IDS.map(id => manifestById[id])

export function getAudioDefinition(id: AudioSoundId): AudioDefinition {
  return manifestById[id]
}

export { AUDIO_CATEGORIES }
export type { AudioCategory }
```

- [ ] **Step 6: Run the manifest test to verify it passes**

Run: `npm run test -- src/audio/__tests__/audioManifest.test.ts`
Expected: PASS with `3 passed`.

- [ ] **Step 7: Commit**

```bash
git add package.json src/audio/audioTypes.ts src/audio/audioManifest.ts src/audio/__tests__/audioManifest.test.ts
git commit -m "feat: add audio manifest"
```

## Task 2: Build The Shared Audio Manager And Vue Entry Point

**Files:**
- Create: `src/audio/AudioManager.ts`
- Create: `src/audio/useAudio.ts`
- Modify: `src/audio/audioTypes.ts`
- Test: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Write the failing manager test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPlay = vi.fn()
const mockStop = vi.fn()
const mockUnload = vi.fn()
const mockDuration = vi.fn(() => 12)
const mockSeek = vi.fn(() => 3)

vi.mock('howler', () => {
  class MockHowl {
    src: string[]
    constructor(opts: { src: string[] | string }) {
      this.src = Array.isArray(opts.src) ? opts.src : [opts.src]
    }
    play = mockPlay
    stop = mockStop
    unload = mockUnload
    duration = mockDuration
    seek = mockSeek
    on = vi.fn()
    once = vi.fn()
    volume = vi.fn()
    fade = vi.fn()
  }

  return {
    Howl: MockHowl,
    Howler: {
      ctx: {
        state: 'running',
        createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
      },
      autoUnlock: false,
    },
  }
})

import { AudioManager } from '../AudioManager'

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    manager = new AudioManager()
    vi.clearAllMocks()
  })

  it('plays dynamic DSN voice sources through the voice category', () => {
    manager.unlock()
    const handle = manager.play('voice.dsnTransmission', { src: '/logs/VASQUEZ-001.mp3' })
    expect(mockPlay).toHaveBeenCalled()
    expect(handle.soundId).toBe('voice.dsnTransmission')
    expect(handle.duration()).toBe(12)
    expect(handle.progress()).toBeCloseTo(0.25)
  })

  it('stops the previous voice sound when an exclusive voice sound starts', () => {
    manager.unlock()
    manager.play('voice.dsnTransmission', { src: '/logs/A.mp3' })
    manager.play('voice.dsnTransmission', { src: '/logs/B.mp3' })
    expect(mockStop).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: FAIL with `Cannot find module '../AudioManager'` or equivalent missing export errors.

- [ ] **Step 3: Extend the types for manager state**

```ts
export interface AudioCategoryState {
  volume: number
  muted: boolean
}

export interface AudioManagerOptions {
  initialCategoryState?: Partial<Record<AudioCategory, AudioCategoryState>>
}

export interface AudioPlaybackHandle {
  readonly soundId: string
  stop(): void
  playing(): boolean
  progress(): number
  duration(): number
}
```

- [ ] **Step 4: Implement `AudioManager`**

```ts
import { Howl, Howler } from 'howler'
import { getAudioDefinition, type AudioSoundId } from './audioManifest'
import type {
  AudioCategory,
  AudioCategoryState,
  AudioManagerOptions,
  AudioPlayOptions,
  AudioPlaybackHandle,
} from './audioTypes'

interface ActivePlayback {
  soundId: AudioSoundId
  category: AudioCategory
  howl: Howl
}

const DEFAULT_CATEGORY_STATE: Record<AudioCategory, AudioCategoryState> = {
  ui: { volume: 1, muted: false },
  voice: { volume: 1, muted: false },
  sfx: { volume: 1, muted: false },
  ambient: { volume: 1, muted: false },
  music: { volume: 1, muted: false },
}

export class AudioManager {
  private unlocked = false
  private readonly categoryState: Record<AudioCategory, AudioCategoryState>
  private readonly activeByCategory = new Map<AudioCategory, ActivePlayback>()
  private readonly cachedHowls = new Map<AudioSoundId, Howl>()

  constructor(options: AudioManagerOptions = {}) {
    this.categoryState = {
      ...DEFAULT_CATEGORY_STATE,
      ...options.initialCategoryState,
    }
    Howler.autoUnlock = false
  }

  unlock(): void {
    this.unlocked = true
  }

  play(soundId: AudioSoundId, options: AudioPlayOptions = {}): AudioPlaybackHandle {
    const def = getAudioDefinition(soundId)
    const src = options.src ?? def.src
    if (!this.unlocked || !src) {
      return this.createNoopHandle(soundId)
    }

    if (def.playback === 'exclusive-category') {
      this.stopCategory(def.category)
    }

    const howl = options.src
      ? new Howl({
          src: [options.src],
          preload: false,
          volume: def.volume * this.effectiveCategoryVolume(def.category),
        })
      : this.getOrCreateHowl(soundId)

    howl.play()
    this.activeByCategory.set(def.category, { soundId, category: def.category, howl })

    return {
      soundId,
      stop: () => howl.stop(),
      playing: () => true,
      progress: () => {
        const duration = howl.duration()
        return duration > 0 ? Number(howl.seek()) / duration : 0
      },
      duration: () => howl.duration(),
    }
  }

  stopCategory(category: AudioCategory): void {
    const active = this.activeByCategory.get(category)
    if (!active) return
    active.howl.stop()
    active.howl.unload()
    this.activeByCategory.delete(category)
  }

  private effectiveCategoryVolume(category: AudioCategory): number {
    const state = this.categoryState[category]
    return state.muted ? 0 : state.volume
  }

  private getOrCreateHowl(soundId: AudioSoundId): Howl {
    const cached = this.cachedHowls.get(soundId)
    if (cached) return cached

    const def = getAudioDefinition(soundId)
    if (!def.src) {
      throw new Error(`Sound ${soundId} requires a runtime src`)
    }

    const howl = new Howl({
      src: Array.isArray(def.src) ? [...def.src] : [def.src],
      preload: def.load === 'eager',
      volume: def.volume * this.effectiveCategoryVolume(def.category),
    })
    this.cachedHowls.set(soundId, howl)
    return howl
  }

  private createNoopHandle(soundId: AudioSoundId): AudioPlaybackHandle {
    return {
      soundId,
      stop: () => {},
      playing: () => false,
      progress: () => 0,
      duration: () => 0,
    }
  }
}
```

- [ ] **Step 5: Implement the Vue entry point**

```ts
import { AudioManager } from './AudioManager'

let sharedAudioManager: AudioManager | null = null

export function useAudio(): AudioManager {
  if (!sharedAudioManager) {
    sharedAudioManager = new AudioManager()
  }
  return sharedAudioManager
}

export function resetAudioForTests(): void {
  sharedAudioManager = null
}
```

- [ ] **Step 6: Run the manager test to verify it passes**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: PASS with `2 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/audio/AudioManager.ts src/audio/useAudio.ts src/audio/audioTypes.ts src/audio/__tests__/AudioManager.test.ts
git commit -m "feat: add audio manager"
```

## Task 3: Add Ducking, Reusable DSN Effects, And Failure Safety

**Files:**
- Create: `src/audio/audioEffects.ts`
- Modify: `src/audio/AudioManager.ts`
- Modify: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Extend the failing manager test for ducking and effects**

```ts
it('ducks UI and SFX while voice playback is active', () => {
  manager.unlock()
  manager.play('voice.dsnTransmission', { src: '/logs/VASQUEZ-001.mp3' })
  expect(manager.getCategoryVolume('ui')).toBeCloseTo(0.55)
  expect(manager.getCategoryVolume('sfx')).toBeCloseTo(0.55)
})

it('resolves the DSN radio preset for voice sounds', () => {
  expect(manager.resolveEffect('voice.dsnTransmission')).toEqual({
    id: 'dsn-radio',
    lowpassHz: 3400,
    highpassHz: 280,
    distortion: 0.08,
  })
})

it('returns a no-op handle when a dynamic sound is requested without a source', () => {
  manager.unlock()
  const handle = manager.play('voice.dsnTransmission')
  expect(handle.playing()).toBe(false)
  expect(handle.duration()).toBe(0)
})
```

- [ ] **Step 2: Run the manager test to verify it fails**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: FAIL with missing `getCategoryVolume` and `resolveEffect` methods.

- [ ] **Step 3: Create the reusable effect presets and chain builder**

```ts
import type { AudioEffectPreset } from './audioTypes'

export interface AudioEffectConfig {
  id: AudioEffectPreset
  lowpassHz?: number
  highpassHz?: number
  distortion?: number
}

const EFFECTS: Record<AudioEffectPreset, AudioEffectConfig> = {
  none: { id: 'none' },
  'dsn-radio': {
    id: 'dsn-radio',
    lowpassHz: 3400,
    highpassHz: 280,
    distortion: 0.08,
  },
  'helmet-comms': {
    id: 'helmet-comms',
    lowpassHz: 4200,
    highpassHz: 220,
  },
  'terminal-beep': {
    id: 'terminal-beep',
    highpassHz: 800,
  },
}

export function getAudioEffectConfig(id: AudioEffectPreset): AudioEffectConfig {
  return EFFECTS[id]
}

function makeCurve(amount: number): Float32Array {
  const samples = 256
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / samples - 1
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x))
  }
  return curve
}

export function createEffectChain(
  ctx: AudioContext,
  effectId: AudioEffectPreset,
): { input: GainNode; output: AudioNode } {
  const config = getAudioEffectConfig(effectId)
  const input = ctx.createGain()

  if (config.id === 'none') {
    return { input, output: input }
  }

  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = config.highpassHz ?? 0

  const lowpass = ctx.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = config.lowpassHz ?? 20_000

  const distortion = ctx.createWaveShaper()
  distortion.curve = makeCurve(config.distortion ?? 0)
  distortion.oversample = '2x'

  input.connect(highpass)
  highpass.connect(lowpass)
  lowpass.connect(distortion)

  return { input, output: distortion }
}
```

- [ ] **Step 4: Add effect resolution and ducking to the manager**

```ts
import { getAudioEffectConfig, type AudioEffectConfig } from './audioEffects'

private readonly duckMultipliers: Partial<Record<AudioCategory, number>> = {
  ui: 0.55,
  sfx: 0.55,
}

private voiceActiveCount = 0
private readonly duckState: Partial<Record<AudioCategory, number>> = {}

resolveEffect(soundId: AudioSoundId): AudioEffectConfig {
  return getAudioEffectConfig(getAudioDefinition(soundId).effect)
}

getCategoryVolume(category: AudioCategory): number {
  const state = this.categoryState[category]
  const duck = this.duckState[category] ?? 1
  return state.muted ? 0 : state.volume * duck
}

private applyVoiceDuck(): void {
  for (const category of ['ui', 'sfx'] as const) {
    this.duckState[category] = this.duckMultipliers[category] ?? 1
  }
}

private releaseVoiceDuck(): void {
  for (const category of ['ui', 'sfx'] as const) {
    this.duckState[category] = 1
  }
}
```

- [ ] **Step 5: Apply the DSN effect chain and wire voice lifecycle to duck and release**

```ts
private tryApplyEffect(howl: Howl, soundId: AudioSoundId): void {
  const effect = this.resolveEffect(soundId)
  if (effect.id === 'none') return

  const webAudioNode = (howl as Howl & {
    _sounds?: Array<{ _node?: AudioNode }>
  })._sounds?.[0]?._node

  if (!webAudioNode || !(webAudioNode instanceof AudioNode)) {
    return
  }

  const chain = createEffectChain(Howler.ctx, effect.id)
  webAudioNode.disconnect()
  webAudioNode.connect(chain.input)
  chain.output.connect(Howler.ctx.destination)
}

this.tryApplyEffect(howl, soundId)

if (def.category === 'voice') {
  this.voiceActiveCount += 1
  this.applyVoiceDuck()
  howl.once('end', () => {
    this.voiceActiveCount = Math.max(0, this.voiceActiveCount - 1)
    if (this.voiceActiveCount === 0) {
      this.releaseVoiceDuck()
    }
  })
}
```

- [ ] **Step 6: Run the manager test to verify it passes**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: PASS with the existing tests plus the new ducking/effect/failure assertions.

- [ ] **Step 7: Commit**

```bash
git add src/audio/audioEffects.ts src/audio/AudioManager.ts src/audio/__tests__/AudioManager.test.ts
git commit -m "feat: add audio ducking"
```

## Task 4: Migrate `MartianSiteView.vue` To The Shared DSN Voice Path

**Files:**
- Modify: `src/views/MartianSiteView.vue`
- Modify: `src/audio/AudioManager.ts`
- Test: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Add the failing manager test for DSN autoplay cleanup**

```ts
it('can stop the voice category explicitly when the owning view unmounts', () => {
  manager.unlock()
  manager.play('voice.dsnTransmission', { src: '/logs/VASQUEZ-001.mp3' })
  manager.stopCategory('voice')
  expect(mockStop).toHaveBeenCalled()
  expect(mockUnload).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: FAIL if `stopCategory('voice')` does not unload the active voice instance consistently.

- [ ] **Step 3: Replace the raw audio setup in `MartianSiteView.vue`**

```ts
import { useAudio } from '@/audio/useAudio'

const audio = useAudio()

function ensureAudioUnlocked() {
  audio.unlock()
  window.removeEventListener('keydown', ensureAudioUnlocked)
  window.removeEventListener('pointerdown', ensureAudioUnlocked)
}

window.addEventListener('keydown', ensureAudioUnlocked, { once: false })
window.addEventListener('pointerdown', ensureAudioUnlocked, { once: false })
```

- [ ] **Step 4: Replace DSN auto-play with a manifest-backed call**

```ts
onDSNTransmissionsReceived: (txs) => {
  const count = txs.length
  const label = count === 1 ? '1 DSN transmission received' : `${count} DSN transmissions received`
  sampleToastRef.value?.showComm?.(label)

  const firstWithAudio = txs.find(tx => tx.audioUrl)
  if (firstWithAudio?.audioUrl) {
    audio.play('voice.dsnTransmission', {
      src: firstWithAudio.audioUrl,
    })
  }
},
```

- [ ] **Step 5: Replace the unmount cleanup**

```ts
onUnmounted(() => {
  window.removeEventListener('keydown', ensureAudioUnlocked)
  window.removeEventListener('pointerdown', ensureAudioUnlocked)
  audio.stopCategory('voice')
})
```

- [ ] **Step 6: Run the manager test to verify it passes**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: PASS with the explicit category-stop test included.

- [ ] **Step 7: Run the full test suite for the DSN-adjacent area**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts src/composables/__tests__/useDSNArchive.test.ts`
Expected: PASS with both the new audio manager tests and the existing archive tests green.

- [ ] **Step 8: Commit**

```bash
git add src/views/MartianSiteView.vue src/audio/AudioManager.ts src/audio/__tests__/AudioManager.test.ts
git commit -m "feat: migrate dsn autoplay"
```

## Task 5: Migrate `DSNArchiveDialog.vue` To Manager-Backed Playback And Progress

**Files:**
- Modify: `src/components/DSNArchiveDialog.vue`
- Modify: `src/audio/audioTypes.ts`
- Modify: `src/audio/AudioManager.ts`
- Modify: `src/audio/useAudio.ts`
- Test: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Add the failing manager test for playback progress**

```ts
it('reports progress for archive playback handles', () => {
  manager.unlock()
  const handle = manager.play('voice.dsnTransmission', { src: '/logs/VASQUEZ-001.mp3' })
  expect(handle.progress()).toBeCloseTo(0.25)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: FAIL if the handle no longer exposes stable progress/duration behavior after the DSN migration.

- [ ] **Step 3: Update the audio handle contract to support archive UI**

```ts
export interface AudioPlaybackHandle {
  readonly soundId: string
  stop(): void
  playing(): boolean
  progress(): number
  duration(): number
}
```

- [ ] **Step 4: Replace the local dialog audio state with manager-backed state**

```ts
import { useAudio } from '@/audio/useAudio'

const audio = useAudio()
let currentHandle: AudioPlaybackHandle | null = null

function stopAudio() {
  currentHandle?.stop()
  currentHandle = null
  isPlaying.value = false
  playingTxId.value = null
  audioProgress.value = 0
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null }
}
```

- [ ] **Step 5: Replace dialog playback with the shared voice cue**

```ts
function toggleAudio(tx: DiscoveredTx) {
  if (isPlaying.value && playingTxId.value === tx.id) {
    stopAudio()
    return
  }

  stopAudio()
  if (!tx.audioUrl) return

  currentHandle = audio.play('voice.dsnTransmission', {
    src: tx.audioUrl,
    onEnd: stopAudio,
  })

  isPlaying.value = currentHandle.playing()
  playingTxId.value = currentHandle.playing() ? tx.id : null
  progressInterval = setInterval(() => {
    audioProgress.value = currentHandle ? currentHandle.progress() * 100 : 0
  }, 100)
}
```

- [ ] **Step 6: Keep the existing close/unmount cleanup behavior**

```ts
onUnmounted(stopAudio)

watch(() => props.open, (open) => {
  if (open) {
    selectedId.value = null
    activeSenderFilter.value = 'all'
  } else {
    stopAudio()
  }
})
```

- [ ] **Step 7: Run the manager test to verify it passes**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts`
Expected: PASS with the progress assertions intact.

- [ ] **Step 8: Run the full targeted suite**

Run: `npm run test -- src/audio/__tests__/AudioManager.test.ts src/composables/__tests__/useDSNArchive.test.ts`
Expected: PASS with the migrated dialog behavior covered by manager tests and the archive composable staying green.

- [ ] **Step 9: Commit**

```bash
git add src/components/DSNArchiveDialog.vue src/audio/audioTypes.ts src/audio/AudioManager.ts src/audio/useAudio.ts src/audio/__tests__/AudioManager.test.ts
git commit -m "feat: migrate archive audio"
```

## Task 6: Seed UI And Reactive Cue On-Ramps And Verify The App Still Builds

**Files:**
- Modify: `src/audio/audioManifest.ts`
- Modify: `src/audio/AudioManager.ts`
- Test: `src/audio/__tests__/audioManifest.test.ts`
- Test: `src/audio/__tests__/AudioManager.test.ts`

- [ ] **Step 1: Extend the failing manifest test to lock the initial non-DSN cues**

```ts
it('seeds app-wide UI and reactive cues for follow-on adoption', () => {
  expect(getAudioDefinition('ui.click').category).toBe('ui')
  expect(getAudioDefinition('ui.error').load).toBe('eager')
  expect(getAudioDefinition('sfx.discovery').playback).toBe('single-instance')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/audio/__tests__/audioManifest.test.ts`
Expected: FAIL if the manifest has drifted or the seeded cues were removed during the DSN migration.

- [ ] **Step 3: Confirm the seeded cues remain wired in the manifest**

```ts
'ui.click': {
  id: 'ui.click',
  src: '/audio/ui/click.mp3',
  category: 'ui',
  load: 'eager',
  playback: 'restart',
  volume: 0.35,
  effect: 'none',
},
'ui.error': {
  id: 'ui.error',
  src: '/audio/ui/error.mp3',
  category: 'ui',
  load: 'eager',
  playback: 'restart',
  volume: 0.45,
  effect: 'none',
},
'sfx.discovery': {
  id: 'sfx.discovery',
  src: '/audio/sfx/discovery.mp3',
  category: 'sfx',
  load: 'lazy',
  playback: 'single-instance',
  volume: 0.55,
  effect: 'none',
},
```

- [ ] **Step 4: Add a manager preload helper for UI warmup**

```ts
preload(soundIds: readonly AudioSoundId[]): void {
  for (const soundId of soundIds) {
    void this.getOrCreateHowl(soundId)
  }
}
```

- [ ] **Step 5: Run the targeted audio tests**

Run: `npm run test -- src/audio/__tests__/audioManifest.test.ts src/audio/__tests__/AudioManager.test.ts`
Expected: PASS with the manifest and manager suites green.

- [ ] **Step 6: Run the full project verification**

Run: `npm run test`
Expected: PASS across the repository.

Run: `npm run build`
Expected: PASS with `vue-tsc -b && vite build`.

- [ ] **Step 7: Commit**

```bash
git add src/audio/audioManifest.ts src/audio/AudioManager.ts src/audio/__tests__/audioManifest.test.ts src/audio/__tests__/AudioManager.test.ts
git commit -m "feat: seed audio cues"
```

## Spec Coverage Check

- Centralized audio service: covered by Tasks 1-2.
- First-class `ui`, `voice`, and `sfx` categories: covered by Tasks 1, 2, and 6.
- `dsn-radio` reusable preset: covered by Task 3.
- Unlock, loading, and failure handling: covered by Tasks 2, 3, and 6.
- Current DSN migration in `MartianSiteView.vue` and `DSNArchiveDialog.vue`: covered by Tasks 4 and 5.
- Extension path for UI and reactive one-shots: covered by Tasks 1 and 6.

## Notes For Execution

- Execute this plan in a dedicated git worktree so the audio migration stays isolated from the current dirty workspace.
- Keep public APIs documented with TSDoc as files are created.
- Do not add ambient/music/positional features during this implementation; the manifest and category types already reserve the extension points.
