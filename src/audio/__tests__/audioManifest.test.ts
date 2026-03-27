import { describe, expect, it } from 'vitest'
import {
  AUDIO_CATEGORIES,
  AUDIO_SOUND_IDS,
  INSTRUMENT_ACTION_SOUND_IDS,
  NON_DSN_SEEDED_SOUND_IDS,
  SILENT_STATIC_WAV_DATA_URI,
  audioManifest,
  getAudioDefinition,
} from '../audioManifest'

const AMBIENT_SOUND_IDS = [
  'ambient.base',
  'ambient.day',
  'ambient.night',
  'ambient.winds',
  'ambient.storm',
  'ambient.quake',
  'ambient.rtg',
  'ambient.heater',
  'ambient.rems',
] as const

describe('audioManifest', () => {
  it('registers the seeded sound ids used by the first migration', () => {
    expect(AUDIO_SOUND_IDS).toEqual([
      'voice.dsnTransmission',
      'ui.click',
      'ui.error',
      'ui.dsnArchivePlay',
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
      'sfx.roverDrive',
      'sfx.roverTurn',
      'sfx.roverTurnOut',
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

  it('keeps record keys and definition ids aligned for every seeded sound', () => {
    for (const id of AUDIO_SOUND_IDS) {
      expect(getAudioDefinition(id).id).toBe(id)
      const fromList = audioManifest.find((d) => d.id === id)
      expect(fromList).toBeDefined()
      expect(fromList!.id).toBe(id)
    }
  })

  it('requires static sources for non-dynamic sounds and forbids silent src omission', () => {
    for (const def of audioManifest) {
      if (def.allowDynamicSrc === true) {
        expect('src' in def && def.src !== undefined).toBe(false)
        continue
      }
      expect(def.src).toBeDefined()
      expect(typeof def.src === 'string' || Array.isArray(def.src)).toBe(true)
    }
  })

  it('uses valid static sources for bundled entries', () => {
    for (const id of AUDIO_SOUND_IDS) {
      const def = getAudioDefinition(id)
      if (def.allowDynamicSrc === true) continue
      const src = def.src
      expect(typeof src).toBe('string')
      if (typeof src !== 'string') throw new Error('expected string src for static entry')
      expect(src.length).toBeGreaterThan(0)
      const isInstrument = INSTRUMENT_ACTION_SOUND_IDS.includes(id as (typeof INSTRUMENT_ACTION_SOUND_IDS)[number])
      const isAmbient = AMBIENT_SOUND_IDS.includes(id as (typeof AMBIENT_SOUND_IDS)[number])
      const isBundledFileCue = id === 'ui.dsnArchivePlay'
      if (isInstrument || isAmbient || isBundledFileCue) {
        expect(src.startsWith('/sound/')).toBe(true)
      } else {
        expect(src.startsWith('data:audio/')).toBe(true)
      }
      expect(src.startsWith('/audio/')).toBe(false)
    }
  })

  it('returns frozen snapshots so callers cannot mutate shared manifest state', () => {
    const fromGetter = getAudioDefinition('ui.click')
    expect(Object.isFrozen(fromGetter)).toBe(true)

    try {
      ;(fromGetter as { src?: string }).src = '/tampered.mp3'
    } catch {
      /* strict mode may throw on frozen prop assign */
    }
    expect(getAudioDefinition('ui.click').src).toBe(SILENT_STATIC_WAV_DATA_URI)

    const fromList = audioManifest[1]
    expect(fromList?.id).toBe('ui.click')
    expect(Object.isFrozen(fromList)).toBe(true)
    try {
      ;(fromList as { volume?: number }).volume = 0
    } catch {
      /* frozen */
    }
    expect(getAudioDefinition('ui.click').volume).toBe(0.35)
  })

  it('locks non-DSN seeded cues to bundled static sources and UI/SFX semantics', () => {
    expect(NON_DSN_SEEDED_SOUND_IDS).toEqual(['ui.click', 'ui.error', 'sfx.discovery'])
    for (const id of NON_DSN_SEEDED_SOUND_IDS) {
      const def = getAudioDefinition(id)
      expect(def.allowDynamicSrc).toBeUndefined()
      expect(def.effect).toBe('none')
      expect(typeof def.src).toBe('string')
      expect(def.src).toBe(SILENT_STATIC_WAV_DATA_URI)
    }
    expect(getAudioDefinition('ui.click')).toMatchObject({
      category: 'ui',
      load: 'eager',
      playback: 'restart',
      volume: 0.35,
    })
    expect(getAudioDefinition('ui.error')).toMatchObject({
      category: 'ui',
      load: 'eager',
      playback: 'restart',
      volume: 0.45,
    })
    expect(getAudioDefinition('sfx.discovery')).toMatchObject({
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      volume: 0.55,
    })
  })

  it('lists expected load, playback, volume, and inline src per seeded entry', () => {
    expect(getAudioDefinition('voice.dsnTransmission')).toMatchObject({
      load: 'lazy',
      playback: 'exclusive-category',
      volume: 0.6,
      effect: 'dsn-radio',
    })
    expect(getAudioDefinition('ui.click')).toMatchObject({
      src: SILENT_STATIC_WAV_DATA_URI,
      load: 'eager',
      playback: 'restart',
      volume: 0.35,
    })
    expect(getAudioDefinition('ui.error')).toMatchObject({
      src: SILENT_STATIC_WAV_DATA_URI,
      load: 'eager',
      playback: 'restart',
      volume: 0.45,
    })
    expect(getAudioDefinition('ui.dsnArchivePlay')).toMatchObject({
      src: '/sound/dsn-archive-play.mp3',
      category: 'ui',
      load: 'lazy',
      playback: 'restart',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.discovery')).toMatchObject({
      src: SILENT_STATIC_WAV_DATA_URI,
      load: 'lazy',
      playback: 'single-instance',
      volume: 0.55,
    })
    expect(getAudioDefinition('sfx.mastcamTag')).toMatchObject({
      src: '/sound/shutter.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.chemcamFire')).toMatchObject({
      src: '/sound/chemcam.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'restart',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.apxsContact')).toMatchObject({
      src: '/sound/apxs.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'restart',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.drillStart')).toMatchObject({
      src: '/sound/drill.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'restart',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.mastMove')).toMatchObject({
      src: '/sound/mast.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.cameraMove')).toMatchObject({
      src: '/sound/camera-move.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.danScan')).toMatchObject({
      src: '/sound/dan.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.danProspecting')).toMatchObject({
      src: '/sound/dan-prospecting.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('sfx.heaterOff')).toMatchObject({
      src: '/sound/htr-off.mp3',
      category: 'sfx',
      load: 'lazy',
      playback: 'restart',
      effect: 'none',
    })
    expect(getAudioDefinition('ambient.rtg')).toMatchObject({
      src: '/sound/rtg.mp3',
      category: 'ambient',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
    expect(getAudioDefinition('ambient.heater')).toMatchObject({
      src: '/sound/htr.mp3',
      category: 'ambient',
      load: 'lazy',
      playback: 'single-instance',
      effect: 'none',
    })
  })
})
