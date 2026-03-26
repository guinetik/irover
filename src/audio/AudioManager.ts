import { Howl, Howler } from 'howler'
import { getAudioDefinition, type AudioSoundId } from './audioManifest'
import {
  AUDIO_CATEGORIES,
  type AudioCategory,
  type AudioCategoryState,
  type AudioDefinition,
  type AudioManagerOptions,
  type AudioPlayOptions,
  type AudioPlaybackHandle,
} from './audioTypes'

/** Tracks the currently active Howl for a category. */
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

/**
 * Central runtime for manifest-driven playback: category routing, exclusive voice,
 * cached static {@link Howl} instances, and dynamic `src` for DSN-style streams.
 */
export class AudioManager {
  private unlocked = false
  private readonly categoryState: Record<AudioCategory, AudioCategoryState>
  private readonly activeByCategory = new Map<AudioCategory, ActivePlayback>()
  private readonly cachedHowls = new Map<AudioSoundId, Howl>()

  constructor(options: AudioManagerOptions = {}) {
    this.categoryState = { ...DEFAULT_CATEGORY_STATE }
    const init = options.initialCategoryState
    if (init) {
      for (const cat of AUDIO_CATEGORIES) {
        const patch = init[cat]
        if (patch) {
          this.categoryState[cat] = { ...this.categoryState[cat], ...patch }
        }
      }
    }
    Howler.autoUnlock = false
  }

  /** Marks audio as allowed to play (e.g. after user interaction). */
  unlock(): void {
    this.unlocked = true
  }

  /**
   * Plays a registered sound. Dynamic sources pass `options.src` (required for manifest entries
   * with `allowDynamicSrc: true` and no bundled `src`).
   */
  play(soundId: AudioSoundId, options: AudioPlayOptions = {}): AudioPlaybackHandle {
    const def = getAudioDefinition(soundId)
    const resolvedSrc = this.resolvePlaySrc(def, options)
    if (!this.unlocked || resolvedSrc === undefined) {
      return this.createNoopHandle(soundId)
    }

    if (def.playback === 'exclusive-category') {
      this.stopCategory(def.category)
    }

    const dynamicSrc =
      options.src !== undefined && options.src !== '' ? options.src : undefined

    const howl =
      dynamicSrc !== undefined
        ? new Howl({
            src: [dynamicSrc],
            preload: false,
            volume: this.computePlaybackVolume(def, options),
          })
        : this.getOrCreateHowl(soundId, options)

    howl.play()
    this.activeByCategory.set(def.category, { soundId, category: def.category, howl })

    return {
      soundId,
      stop: () => {
        howl.stop()
      },
      playing: () => howl.playing(),
      progress: () => {
        const duration = howl.duration()
        return duration > 0 ? Number(howl.seek()) / duration : 0
      },
      duration: () => howl.duration(),
    }
  }

  /**
   * Stops and unloads the active sound for a category, and drops it from the static cache when
   * applicable.
   */
  stopCategory(category: AudioCategory): void {
    const active = this.activeByCategory.get(category)
    if (!active) return
    active.howl.stop()
    active.howl.unload()
    if (this.cachedHowls.get(active.soundId) === active.howl) {
      this.cachedHowls.delete(active.soundId)
    }
    this.activeByCategory.delete(category)
  }

  private computePlaybackVolume(def: Readonly<AudioDefinition>, options: AudioPlayOptions): number {
    const baseVol = options.volume ?? def.volume
    return baseVol * this.effectiveCategoryVolume(def.category)
  }

  private effectiveCategoryVolume(category: AudioCategory): number {
    const state = this.categoryState[category]
    return state.muted ? 0 : state.volume
  }

  private resolvePlaySrc(
    def: Readonly<AudioDefinition>,
    options: AudioPlayOptions,
  ): string | readonly string[] | undefined {
    if (options.src !== undefined && options.src !== '') {
      return options.src
    }
    if ('src' in def && def.src !== undefined) {
      return def.src
    }
    return undefined
  }

  private getOrCreateHowl(soundId: AudioSoundId, options: AudioPlayOptions): Howl {
    const cached = this.cachedHowls.get(soundId)
    if (cached) return cached

    const def = getAudioDefinition(soundId)
    if (!('src' in def) || def.src === undefined) {
      throw new Error(`Sound ${soundId} requires a runtime src`)
    }
    const srcList = Array.isArray(def.src) ? [...def.src] : [def.src]
    const howl = new Howl({
      src: srcList,
      preload: def.load === 'eager',
      volume: this.computePlaybackVolume(def, options),
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
