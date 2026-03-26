import type { AudioCategory, AudioDefinition } from './audioTypes'
import { AUDIO_CATEGORIES } from './audioTypes'

/**
 * Minimal valid silent WAV inlined as a data URI so seeded static sounds decode without
 * `public/audio/*` files. Swap for real assets when they land in the repo.
 */
export const SILENT_STATIC_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * Seeded sound ids registered for the first audio migration (order is stable for tests and tooling).
 */
export const AUDIO_SOUND_IDS = [
  'voice.dsnTransmission',
  'ui.click',
  'ui.error',
  'sfx.discovery',
] as const

/** Union of {@link AUDIO_SOUND_IDS} values. */
export type AudioSoundId = (typeof AUDIO_SOUND_IDS)[number]

/**
 * Ensures each manifest record key matches its `id` field for compile-time drift checks.
 */
type ManifestById = {
  [K in AudioSoundId]: AudioDefinition & { id: K }
}

const manifestById: ManifestById = {
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
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
  'ui.error': {
    id: 'ui.error',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'sfx.discovery': {
    id: 'sfx.discovery',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
    effect: 'none',
  },
}

/** Shallow-clones and freezes a manifest entry (including a copy of array `src` when present). */
function freezeAudioDefinition(def: AudioDefinition): Readonly<AudioDefinition> {
  if ('src' in def && def.src !== undefined && Array.isArray(def.src)) {
    return Object.freeze({
      ...def,
      src: Object.freeze([...def.src]) as readonly string[],
    }) as Readonly<AudioDefinition>
  }
  return Object.freeze({ ...def }) as Readonly<AudioDefinition>
}

/**
 * Ordered list of manifest entries in {@link AUDIO_SOUND_IDS} order (frozen snapshots).
 */
export const audioManifest: readonly Readonly<AudioDefinition>[] = Object.freeze(
  AUDIO_SOUND_IDS.map((id) => freezeAudioDefinition(manifestById[id])),
)

/**
 * Returns a frozen {@link AudioDefinition} snapshot for a seeded sound id.
 *
 * @param id - A registered {@link AudioSoundId}.
 */
export function getAudioDefinition(id: AudioSoundId): Readonly<AudioDefinition> {
  return freezeAudioDefinition(manifestById[id])
}

export { AUDIO_CATEGORIES }
export type { AudioCategory }
