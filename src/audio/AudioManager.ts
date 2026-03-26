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

/** One running instance registered with the manager (supports overlap within a category). */
interface ActivePlayback {
  /** Stable token for handle.stop bookkeeping. */
  token: number
  soundId: AudioSoundId
  category: AudioCategory
  howl: Howl
  /** Sound id returned by {@link Howl.play} (distinct instances on the same Howl). */
  howlPlayId?: number
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
  /** Multiple concurrent playbacks per category (e.g. overlap); exclusive modes clear before adding. */
  private readonly activeByCategory = new Map<AudioCategory, ActivePlayback[]>()
  private readonly cachedHowls = new Map<AudioSoundId, Howl>()
  private nextPlaybackToken = 1

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

  /**
   * Merges mixer state for a category (volume/mute). Affects the next computed playback level.
   */
  applyCategoryState(category: AudioCategory, patch: Partial<AudioCategoryState>): void {
    this.categoryState[category] = { ...this.categoryState[category], ...patch }
  }

  /**
   * Marks the app as allowed to play audio and attempts to resume the Web Audio `AudioContext`
   * (required when `Howler.autoUnlock` is disabled). Safe to call repeatedly; resume failures are
   * ignored (e.g. strict autoplay policies).
   */
  unlock(): void {
    this.unlocked = true
    this.resumeHowlerAudioContext()
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
            volume: 1,
          })
        : this.getOrCreateHowl(soundId)

    this.applyHowlPlaybackVolume(howl, def, options)

    const howlPlayIdRaw = howl.play()
    const howlPlayId =
      typeof howlPlayIdRaw === 'number' && !Number.isNaN(howlPlayIdRaw) ? howlPlayIdRaw : undefined

    const token = this.nextPlaybackToken++
    const playback: ActivePlayback = {
      token,
      soundId,
      category: def.category,
      howl,
      howlPlayId,
    }
    this.pushActive(def.category, playback)

    return {
      soundId,
      stop: () => {
        this.stopPlaybackInstance(playback)
      },
      playing: () => (howlPlayId !== undefined ? howl.playing(howlPlayId) : howl.playing()),
      progress: () => {
        const dur =
          howlPlayId !== undefined ? howl.duration(howlPlayId) : howl.duration()
        const pos =
          howlPlayId !== undefined ? Number(howl.seek(howlPlayId)) : Number(howl.seek())
        return dur > 0 ? pos / dur : 0
      },
      duration: () =>
        howlPlayId !== undefined ? howl.duration(howlPlayId) : howl.duration(),
    }
  }

  /**
   * Stops every active sound in a category, unloads non-cached Howls, and clears bookkeeping.
   */
  stopCategory(category: AudioCategory): void {
    const list = this.activeByCategory.get(category)
    if (!list?.length) return

    const uniqueHowls = new Set<Howl>()
    for (const p of list) {
      this.stopHowlSound(p.howl, p.howlPlayId)
      uniqueHowls.add(p.howl)
    }
    for (const howl of uniqueHowls) {
      if (!this.isCachedHowlInstance(howl)) {
        howl.unload()
      }
    }
    this.activeByCategory.delete(category)
  }

  private resumeHowlerAudioContext(): void {
    if (Howler.noAudio) return
    // Lazily creates Howler's shared AudioContext (same entry point Howler uses internally).
    void Howler.volume()
    const ctx = Howler.ctx
    if (!ctx || typeof ctx.resume !== 'function') return
    void ctx.resume().catch(() => {
      /* ignore — may reject if not triggered from a user gesture */
    })
  }

  private pushActive(category: AudioCategory, playback: ActivePlayback): void {
    const list = this.activeByCategory.get(category) ?? []
    list.push(playback)
    this.activeByCategory.set(category, list)
  }

  private stopPlaybackInstance(playback: ActivePlayback): void {
    const list = this.activeByCategory.get(playback.category)
    if (!list?.length) return
    const idx = list.findIndex((p) => p.token === playback.token)
    if (idx === -1) return
    list.splice(idx, 1)
    if (!list.length) {
      this.activeByCategory.delete(playback.category)
    }
    this.stopHowlSound(playback.howl, playback.howlPlayId)
  }

  private stopHowlSound(howl: Howl, howlPlayId?: number): void {
    if (howlPlayId !== undefined) {
      howl.stop(howlPlayId)
    } else {
      howl.stop()
    }
  }

  /** Sets per-instance gain from manifest + category + optional per-play override (cached Howls). */
  private applyHowlPlaybackVolume(
    howl: Howl,
    def: Readonly<AudioDefinition>,
    options: AudioPlayOptions,
  ): void {
    howl.volume(this.computePlaybackVolume(def, options))
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

  private getOrCreateHowl(soundId: AudioSoundId): Howl {
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
      volume: 1,
    })
    this.cachedHowls.set(soundId, howl)
    return howl
  }

  private isCachedHowlInstance(howl: Howl): boolean {
    for (const h of this.cachedHowls.values()) {
      if (h === howl) return true
    }
    return false
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
