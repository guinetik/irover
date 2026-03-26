/**
 * Canonical audio channel categories used by {@link AudioDefinition} and the manifest.
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

/**
 * Static metadata for a registered sound id in the audio manifest.
 */
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
