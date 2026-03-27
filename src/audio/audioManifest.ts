import type { AudioCategory, AudioDefinition } from './audioTypes'
import { AUDIO_CATEGORIES } from './audioTypes'

/**
 * Minimal valid silent WAV inlined as a data URI so seeded static sounds decode without
 * `public/audio/*` files. Swap for real assets when they land in the repo.
 */
export const SILENT_STATIC_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * Registered sound ids used by the current game-audio system (order is stable for tests and tooling).
 */
export const AUDIO_SOUND_IDS = [
  'voice.dsnTransmission',
  'ui.click',
  'ui.error',
  'sfx.discovery',
  'sfx.mastcamTag',
  'sfx.chemcamFire',
  'sfx.apxsContact',
  'sfx.drillStart',
  'sfx.mastMove',
  'sfx.danScan',
] as const

/** Union of {@link AUDIO_SOUND_IDS} values. */
export type AudioSoundId = (typeof AUDIO_SOUND_IDS)[number]

/**
 * First-migration static cues (everything in {@link AUDIO_SOUND_IDS} except DSN voice).
 * Bundled silent WAV data URIs; UI/SFX semantics are stable for tests and call sites.
 */
export const NON_DSN_SEEDED_SOUND_IDS = ['ui.click', 'ui.error', 'sfx.discovery'] as const

/** Instrument action one-shots triggered from site-controller state transitions. */
export const INSTRUMENT_ACTION_SOUND_IDS = [
  'sfx.mastcamTag',
  'sfx.chemcamFire',
  'sfx.apxsContact',
  'sfx.drillStart',
  'sfx.mastMove',
  'sfx.danScan',
] as const

/** Union of instrument-action one-shot ids. */
export type InstrumentActionSoundId = (typeof INSTRUMENT_ACTION_SOUND_IDS)[number]

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
  'sfx.mastcamTag': {
    id: 'sfx.mastcamTag',
    src: '/sound/shutter.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.chemcamFire': {
    id: 'sfx.chemcamFire',
    src: '/sound/chemcam.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.apxsContact': {
    id: 'sfx.apxsContact',
    src: '/sound/apxs.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.drillStart': {
    id: 'sfx.drillStart',
    src: '/sound/drill.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.mastMove': {
    id: 'sfx.mastMove',
    src: '/sound/mast.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.danScan': {
    id: 'sfx.danScan',
    src: '/sound/dan.mp3',
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
