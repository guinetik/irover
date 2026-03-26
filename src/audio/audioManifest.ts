import type { AudioCategory, AudioDefinition } from './audioTypes'
import { AUDIO_CATEGORIES } from './audioTypes'

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

/**
 * Ordered list of manifest entries in {@link AUDIO_SOUND_IDS} order.
 */
export const audioManifest = AUDIO_SOUND_IDS.map((id) => manifestById[id])

/**
 * Returns the static {@link AudioDefinition} for a seeded sound id.
 *
 * @param id - A registered {@link AudioSoundId}.
 */
export function getAudioDefinition(id: AudioSoundId): AudioDefinition {
  return manifestById[id]
}

export { AUDIO_CATEGORIES }
export type { AudioCategory }
