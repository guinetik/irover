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

/** Howl event handler signatures (for symmetric `off` teardown). */
type HowlErrorEventHandler = (soundId: number, error: unknown) => void

/** One running instance registered with the manager (supports overlap within a category). */
interface ActivePlayback {
  /** Stable token for handle.stop bookkeeping. */
  token: number
  soundId: AudioSoundId
  category: AudioCategory
  howl: Howl
  /** Sound id returned by {@link Howl.play} (distinct instances on the same Howl). */
  howlPlayId?: number
  /** Same references passed to `on`/`once` so `off` can remove listeners on interrupt or failure. */
  endHandler: () => void
  playErrorHandler: HowlErrorEventHandler
  loadErrorHandler: HowlErrorEventHandler
}

const DEFAULT_CATEGORY_STATE: Record<AudioCategory, AudioCategoryState> = {
  ui: { volume: 1, muted: false },
  voice: { volume: 1, muted: false },
  sfx: { volume: 1, muted: false },
  ambient: { volume: 1, muted: false },
  music: { volume: 1, muted: false },
}

/**
 * Central runtime for manifest-driven playback: category routing, cached static {@link Howl}
 * instances, dynamic `src` for DSN-style streams, and manifest playback modes.
 */
export class AudioManager {
  private unlocked = false
  private readonly categoryState: Record<AudioCategory, AudioCategoryState>
  /** Multiple concurrent playbacks per category (e.g. overlap); exclusive modes clear before adding. */
  private readonly activeByCategory = new Map<AudioCategory, ActivePlayback[]>()
  private readonly cachedHowls = new Map<AudioSoundId, Howl>()
  /** Last trigger time for {@link AudioDefinition} `rate-limited` + `cooldownMs`. */
  private readonly lastRateLimitTriggerAt = new Map<string, number>()
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

    if (def.playback === 'rate-limited' && this.isRateLimited(def, soundId, options)) {
      return this.createNoopHandle(soundId)
    }

    this.applyPlaybackModePrelude(def, soundId)

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

    const howlPlayIdRaw = howl.play()
    const howlPlayId =
      typeof howlPlayIdRaw === 'number' && !Number.isNaN(howlPlayIdRaw) ? howlPlayIdRaw : undefined

    const vol = this.computePlaybackVolume(def, options)
    this.applyPerInstanceVolume(howl, vol, howlPlayId)

    const token = this.nextPlaybackToken++
    const playback: ActivePlayback = {
      token,
      soundId,
      category: def.category,
      howl,
      howlPlayId,
      endHandler: () => {},
      playErrorHandler: () => {},
      loadErrorHandler: () => {},
    }

    playback.endHandler = () => {
      try {
        options.onEnd?.()
      } finally {
        this.detachPlaybackListeners(playback)
        this.finalizePlaybackEnded(playback)
      }
    }

    const onHowlFailure: HowlErrorEventHandler = (id, _err) => {
      if (playback.howlPlayId !== undefined && id !== playback.howlPlayId) return
      this.teardownPlaybackFailure(playback)
    }
    playback.playErrorHandler = onHowlFailure
    playback.loadErrorHandler = onHowlFailure

    this.pushActive(def.category, playback)
    this.wirePlaybackLifecycle(howl, howlPlayId, playback)

    if (def.playback === 'rate-limited') {
      this.recordRateLimitTrigger(def, soundId, options)
    }

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
    const copy = [...list]
    for (const p of copy) {
      this.stopPlaybackInstance(p)
    }
  }

  /**
   * Applies manifest {@link AudioDefinition.playback} rules before starting a new instance.
   */
  private applyPlaybackModePrelude(def: Readonly<AudioDefinition>, soundId: AudioSoundId): void {
    switch (def.playback) {
      case 'exclusive-category':
        this.stopCategory(def.category)
        break
      case 'restart':
      case 'single-instance':
        this.stopAllActiveWithSoundId(soundId)
        break
      case 'overlap':
      case 'rate-limited':
        break
      default:
        break
    }
  }

  private isRateLimited(
    def: Readonly<AudioDefinition>,
    soundId: AudioSoundId,
    options: AudioPlayOptions,
  ): boolean {
    const ms = def.cooldownMs ?? 0
    if (ms <= 0) return false
    const key = options.cooldownKey ?? soundId
    const last = this.lastRateLimitTriggerAt.get(key)
    if (last === undefined) return false
    return performance.now() - last < ms
  }

  private recordRateLimitTrigger(
    def: Readonly<AudioDefinition>,
    soundId: AudioSoundId,
    options: AudioPlayOptions,
  ): void {
    const ms = def.cooldownMs ?? 0
    if (ms <= 0) return
    const key = options.cooldownKey ?? soundId
    this.lastRateLimitTriggerAt.set(key, performance.now())
  }

  private stopAllActiveWithSoundId(soundId: AudioSoundId): void {
    const toStop: ActivePlayback[] = []
    for (const cat of AUDIO_CATEGORIES) {
      const list = this.activeByCategory.get(cat)
      if (!list?.length) continue
      for (const p of list) {
        if (p.soundId === soundId) toStop.push(p)
      }
    }
    for (const p of toStop) {
      this.stopPlaybackInstance(p)
    }
  }

  /**
   * Registers `end`, `playerror`, and `loaderror` with stable handler refs so interrupted playbacks
   * can `off()` everything in {@link detachPlaybackListeners}.
   */
  private wirePlaybackLifecycle(howl: Howl, howlPlayId: number | undefined, playback: ActivePlayback): void {
    const { endHandler, playErrorHandler, loadErrorHandler } = playback
    if (howlPlayId !== undefined) {
      howl.once('end', endHandler, howlPlayId)
      howl.once('playerror', playErrorHandler, howlPlayId)
      howl.once('loaderror', loadErrorHandler, howlPlayId)
    } else {
      howl.once('end', endHandler)
      howl.once('playerror', playErrorHandler)
      howl.once('loaderror', loadErrorHandler)
    }
  }

  /**
   * Removes all listeners registered for this playback (call before stop/interrupt so `end` does
   * not run after teardown, and so error handlers do not leak on cached Howls).
   */
  private detachPlaybackListeners(playback: ActivePlayback): void {
    const { howl, howlPlayId, endHandler, playErrorHandler, loadErrorHandler } = playback
    if (howlPlayId !== undefined) {
      howl.off('end', endHandler, howlPlayId)
      howl.off('playerror', playErrorHandler, howlPlayId)
      howl.off('loaderror', loadErrorHandler, howlPlayId)
    } else {
      howl.off('end', endHandler)
      howl.off('playerror', playErrorHandler)
      howl.off('loaderror', loadErrorHandler)
    }
  }

  /** Natural completion: bookkeeping was updated in {@link endHandler}; only list + unload here. */
  private finalizePlaybackEnded(playback: ActivePlayback): void {
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  /** Load/decode failure: no `onEnd`; drop bookkeeping and unload dynamic Howls. */
  private teardownPlaybackFailure(playback: ActivePlayback): void {
    this.detachPlaybackListeners(playback)
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  private resumeHowlerAudioContext(): void {
    if (Howler.noAudio) return
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

  /** User stop / interrupt: tear down listeners first, then stop and unload dynamic Howls. */
  private stopPlaybackInstance(playback: ActivePlayback): void {
    this.detachPlaybackListeners(playback)
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    this.stopHowlSound(playback.howl, playback.howlPlayId)
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  private removeFromActiveList(playback: ActivePlayback): boolean {
    const list = this.activeByCategory.get(playback.category)
    if (!list?.length) return false
    const idx = list.findIndex((p) => p.token === playback.token)
    if (idx === -1) return false
    list.splice(idx, 1)
    if (!list.length) {
      this.activeByCategory.delete(playback.category)
    }
    return true
  }

  private stopHowlSound(howl: Howl, howlPlayId?: number): void {
    if (howlPlayId !== undefined) {
      howl.stop(howlPlayId)
    } else {
      howl.stop()
    }
  }

  /**
   * Per-instance gain: use `volume(vol, id)` when Howler exposes a play id so shared cached
   * Howls can overlap at different levels.
   */
  private applyPerInstanceVolume(howl: Howl, volume: number, howlPlayId: number | undefined): void {
    if (howlPlayId !== undefined) {
      howl.volume(volume, howlPlayId)
    } else {
      howl.volume(volume)
    }
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
