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
  'ui.switch',
  'ui.instrument',
  'ui.confirm',
  'ui.type',
  'ui.processing',
  'ui.science',
  'ui.achievement',
  'ui.reward',
  'ui.error',
  'ui.dsnArchivePlay',
  'ui.dsnArchiveSelect',
  'sfx.dsnIncoming',
  'sfx.rtgShunt',
  'sfx.rtgOverdrive',
  'sfx.discovery',
  'sfx.mastcamTag',
  'sfx.chemcamFire',
  'sfx.apxsContact',
  'sfx.drillStart',
  'sfx.mastMove',
  'sfx.cameraMove',
  'sfx.danScan',
  'sfx.danProspecting',
  'sfx.heaterOff',
  'ambient.base',
  'ambient.day',
  'ambient.night',
  'ambient.winds',
  'ambient.storm',
  'ambient.quake',
  'ambient.rtg',
  'ambient.heater',
  'ambient.rems',
  'sfx.landing',
  'sfx.thrusters',
  'sfx.contact',
  'music.intro',
  'music.theme',
  'sfx.uhfLock',
  'sfx.uhfUplink',
  'sfx.lgaUplink',
  'sfx.roverDrive',
  'sfx.roverTurn',
  'sfx.roverTurnOut',
  'ambient.geiger',
  'sfx.radEventSting',
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
  'sfx.dsnIncoming',
  'sfx.rtgShunt',
  'sfx.rtgOverdrive',
  'sfx.mastcamTag',
  'sfx.chemcamFire',
  'sfx.apxsContact',
  'sfx.drillStart',
  'sfx.mastMove',
  'sfx.cameraMove',
  'sfx.danScan',
  'sfx.danProspecting',
  'sfx.heaterOff',
  'sfx.uhfLock',
  'sfx.uhfUplink',
  'sfx.lgaUplink',
  'sfx.roverDrive',
  'sfx.roverTurn',
  'sfx.roverTurnOut',
  'sfx.landing',
  'sfx.thrusters',
  'sfx.contact',
  'sfx.radEventSting',
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
  'ui.switch': {
    id: 'ui.switch',
    src: '/sound/switch.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.instrument': {
    id: 'ui.instrument',
    src: '/sound/instrument.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.confirm': {
    id: 'ui.confirm',
    src: '/sound/confirm.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.type': {
    id: 'ui.type',
    src: '/sound/type.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.55,
    effect: 'none',
  },
  'ui.processing': {
    id: 'ui.processing',
    src: '/sound/processing.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.4,
    effect: 'none',
  },
  'ui.science': {
    id: 'ui.science',
    src: '/sound/science.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.achievement': {
    id: 'ui.achievement',
    src: '/sound/achievement.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.58,
    effect: 'none',
  },
  'ui.reward': {
    id: 'ui.reward',
    src: '/sound/reward.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.58,
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
  'ui.dsnArchivePlay': {
    id: 'ui.dsnArchivePlay',
    src: '/sound/dsn-archive-play.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.dsnArchiveSelect': {
    id: 'ui.dsnArchiveSelect',
    src: '/sound/dsn-select.mp3',
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'sfx.dsnIncoming': {
    id: 'sfx.dsnIncoming',
    src: '/sound/dsn.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.rtgShunt': {
    id: 'sfx.rtgShunt',
    src: '/sound/rtg-shunt.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.rtgOverdrive': {
    id: 'sfx.rtgOverdrive',
    src: '/sound/rtg-overdrive.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
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
  'sfx.cameraMove': {
    id: 'sfx.cameraMove',
    src: '/sound/camera-move.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
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
  'sfx.danProspecting': {
    id: 'sfx.danProspecting',
    src: '/sound/dan-prospecting.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.heaterOff': {
    id: 'sfx.heaterOff',
    src: '/sound/htr-off.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
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
  'ambient.rtg': {
    id: 'ambient.rtg',
    src: '/sound/rtg.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.08,
    effect: 'none',
  },
  'ambient.heater': {
    id: 'ambient.heater',
    src: '/sound/htr.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.rems': {
    id: 'ambient.rems',
    src: '/sound/rems.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.geiger': {
    id: 'ambient.geiger',
    src: '/sound/rad.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.radEventSting': {
    id: 'sfx.radEventSting',
    src: '/sound/rad-event-sting.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
  'music.intro': {
    id: 'music.intro',
    src: '/sound/intro.mp3',
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.4,
    effect: 'none',
  },
  'music.theme': {
    id: 'music.theme',
    src: '/sound/theme.mp3',
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.24,
    effect: 'none',
  },
  'sfx.uhfLock': {
    id: 'sfx.uhfLock',
    src: '/sound/uhf-lock.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.uhfUplink': {
    id: 'sfx.uhfUplink',
    src: '/sound/uhf-uplink.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.lgaUplink': {
    id: 'sfx.lgaUplink',
    src: '/sound/lga-uplink.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.roverDrive': {
    id: 'sfx.roverDrive',
    src: '/sound/rover.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.25,
    effect: 'none',
  },
  'sfx.roverTurn': {
    id: 'sfx.roverTurn',
    src: '/sound/rover-turn.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.roverTurnOut': {
    id: 'sfx.roverTurnOut',
    src: '/sound/rover-turn-out.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.landing': {
    id: 'sfx.landing',
    src: '/sound/landing.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.thrusters': {
    id: 'sfx.thrusters',
    src: '/sound/thrusters.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.contact': {
    id: 'sfx.contact',
    src: '/sound/contact.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.7,
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
