import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPlay = vi.fn()
const mockStop = vi.fn()
const mockUnload = vi.fn()
const mockDuration = vi.fn(() => 12)
const mockSeek = vi.fn(() => 3)
const mockPlaying = vi.fn(() => true)

vi.mock('howler', () => {
  class MockHowl {
    src: string[]
    constructor(opts: { src: string[] | string }) {
      this.src = Array.isArray(opts.src) ? opts.src : [opts.src]
    }
    play = mockPlay
    stop = mockStop
    unload = mockUnload
    duration = mockDuration
    seek = mockSeek
    playing = mockPlaying
    on = vi.fn()
    once = vi.fn()
    volume = vi.fn()
    fade = vi.fn()
  }

  return {
    Howl: MockHowl,
    Howler: {
      ctx: {
        state: 'running',
        createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
      },
      autoUnlock: false,
    },
  }
})

import { AudioManager } from '../AudioManager'
import { resetAudioForTests, useAudio } from '../useAudio'

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    manager = new AudioManager()
    vi.clearAllMocks()
  })

  it('plays dynamic DSN voice sources through the voice category', () => {
    manager.unlock()
    const handle = manager.play('voice.dsnTransmission', { src: '/logs/VASQUEZ-001.mp3' })
    expect(mockPlay).toHaveBeenCalled()
    expect(handle.soundId).toBe('voice.dsnTransmission')
    expect(handle.duration()).toBe(12)
    expect(handle.progress()).toBeCloseTo(0.25)
  })

  it('stops the previous voice sound when an exclusive voice sound starts', () => {
    manager.unlock()
    manager.play('voice.dsnTransmission', { src: '/logs/A.mp3' })
    manager.play('voice.dsnTransmission', { src: '/logs/B.mp3' })
    expect(mockStop).toHaveBeenCalled()
  })
})

describe('useAudio', () => {
  beforeEach(() => {
    resetAudioForTests()
    vi.clearAllMocks()
  })

  it('returns a singleton AudioManager', () => {
    const a = useAudio()
    const b = useAudio()
    expect(a).toBe(b)
  })

  it('clears the singleton via resetAudioForTests', () => {
    const first = useAudio()
    resetAudioForTests()
    const second = useAudio()
    expect(second).not.toBe(first)
  })
})
