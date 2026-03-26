import { describe, expect, it } from 'vitest'
import {
  AUDIO_CATEGORIES,
  AUDIO_SOUND_IDS,
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
})
