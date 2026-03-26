import { describe, expect, it } from 'vitest'
import {
  AUDIO_CATEGORIES,
  AUDIO_SOUND_IDS,
  SILENT_STATIC_WAV_DATA_URI,
  audioManifest,
  getAudioDefinition,
} from '../audioManifest'

describe('audioManifest', () => {
  it('registers the seeded sound ids used by the first migration', () => {
    expect(AUDIO_SOUND_IDS).toEqual([
      'voice.dsnTransmission',
      'ui.click',
      'ui.error',
      'sfx.discovery',
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

  it('uses self-contained audio sources for seeded static entries (no missing public fetches)', () => {
    for (const id of AUDIO_SOUND_IDS) {
      const def = getAudioDefinition(id)
      if (def.allowDynamicSrc === true) continue
      expect(typeof def.src).toBe('string')
      expect(def.src.length).toBeGreaterThan(0)
      expect(def.src.startsWith('data:audio/')).toBe(true)
      expect(def.src.startsWith('/audio/')).toBe(false)
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
    expect(getAudioDefinition('sfx.discovery')).toMatchObject({
      src: SILENT_STATIC_WAV_DATA_URI,
      load: 'lazy',
      playback: 'single-instance',
      volume: 0.55,
    })
  })
})
