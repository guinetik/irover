/**
 * Canonical audio channel categories used by manifest entries and the runtime.
 */
export const AUDIO_CATEGORIES = ['ui', 'voice', 'sfx', 'ambient', 'music'] as const

/** Union of known {@link AUDIO_CATEGORIES} values. */
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number]

/**
 * Built-in DSP / routing presets applied when playing a sound (e.g. radio band-pass for DSN voice).
 */
export const AUDIO_EFFECT_PRESETS = [
  'none',
  'dsn-radio',
  'helmet-comms',
  'terminal-beep',
] as const

/** Union of {@link AUDIO_EFFECT_PRESETS} values. */
export type AudioEffectPreset = (typeof AUDIO_EFFECT_PRESETS)[number]

/** How and when decoded audio buffers are loaded relative to app startup. */
export const AUDIO_LOAD_STRATEGIES = ['eager', 'lazy', 'manual'] as const

/** Union of {@link AUDIO_LOAD_STRATEGIES} values. */
export type AudioLoadStrategy = (typeof AUDIO_LOAD_STRATEGIES)[number]

/**
 * Coexistence and interruption rules when the same or related sounds are triggered.
 */
export const AUDIO_PLAYBACK_MODES = [
  'restart',
  'overlap',
  'single-instance',
  'exclusive-category',
  'rate-limited',
] as const

/** Union of {@link AUDIO_PLAYBACK_MODES} values. */
export type AudioPlaybackMode = (typeof AUDIO_PLAYBACK_MODES)[number]

/** Fields shared by every manifest entry. */
interface AudioDefinitionCommon {
  id: string
  category: AudioCategory
  load: AudioLoadStrategy
  playback: AudioPlaybackMode
  volume: number
  effect: AudioEffectPreset
  cooldownMs?: number
}

/**
 * Bundled or fixed file path(s); `src` is required so static sounds cannot omit assets silently.
 */
export interface AudioDefinitionStatic extends AudioDefinitionCommon {
  allowDynamicSrc?: false
  src: string | readonly string[]
}

/**
 * Source resolved at play time (e.g. DSN stream URL); must not rely on a bundled `src`.
 */
export interface AudioDefinitionDynamic extends AudioDefinitionCommon {
  allowDynamicSrc: true
  src?: never
}

/**
 * Static metadata for a registered sound id in the audio manifest.
 *
 * Discriminated by {@link AudioDefinitionStatic} vs {@link AudioDefinitionDynamic} (`allowDynamicSrc`).
 */
export type AudioDefinition = AudioDefinitionStatic | AudioDefinitionDynamic

/**
 * Per-play overrides passed to the runtime when triggering a sound (e.g. dynamic DSN URL).
 */
export interface AudioPlayOptions {
  src?: string
  volume?: number
  effect?: AudioEffectPreset
  cooldownKey?: string
  onEnd?: () => void
}

/**
 * Handle returned by the audio layer for controlling an active playback instance.
 */
export interface AudioPlaybackHandle {
  readonly soundId: string
  stop(): void
  playing(): boolean
  progress(): number
  duration(): number
}

/**
 * Per-category gain and mute state used by the audio manager for routing and UI.
 */
export interface AudioCategoryState {
  volume: number
  muted: boolean
}

/** Constructor options for the runtime audio manager (`AudioManager`). */
export interface AudioManagerOptions {
  /**
   * Initial category state; unspecified categories use full volume and unmuted.
   * Per-category patches may be partial (e.g. `{ volume: 0.5 }` without `muted`).
   */
  initialCategoryState?: Partial<Record<AudioCategory, Partial<AudioCategoryState>>>
}
