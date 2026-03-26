import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPlay = vi.fn()
const mockStop = vi.fn()
const mockUnload = vi.fn()
const mockDuration = vi.fn(() => 12)
const mockSeek = vi.fn(() => 3)
const mockPlaying = vi.fn(() => true)
const mockHowlVolume = vi.fn()

const { mockCtxResume } = vi.hoisted(() => ({
  mockCtxResume: vi.fn(() => Promise.resolve()),
}))

vi.mock('howler', () => {
  let playCounter = 0

  class MockHowl {
    src: string[]
    constructor(opts: { src: string[] | string; volume?: number }) {
      this.src = Array.isArray(opts.src) ? opts.src : [opts.src]
    }
    play = () => {
      playCounter += 1
      return mockPlay() ?? playCounter
    }
    stop = mockStop
    unload = mockUnload
    duration = mockDuration
    seek = mockSeek
    playing = mockPlaying
    on = vi.fn()
    once = vi.fn()
    volume = mockHowlVolume
    fade = vi.fn()
  }

  const ctx = {
    state: 'suspended' as string,
    resume: mockCtxResume,
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn() })),
  }

  const Howler = {
    noAudio: false,
    autoUnlock: false,
    _volume: 1,
    get ctx() {
      return ctx
    },
    volume(this: { _volume: number; ctx: typeof ctx }, vol?: number) {
      if (typeof vol === 'number' && vol >= 0 && vol <= 1) {
        this._volume = vol
        return this
      }
      return this._volume
    },
  }

  return {
    Howl: MockHowl,
    Howler,
  }
})

import { AudioManager } from '../AudioManager'
import { resetAudioForTests, useAudio } from '../useAudio'

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockCtxResume.mockImplementation(() => Promise.resolve())
    manager = new AudioManager()
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

  it('resume()s the Web Audio context on unlock when autoUnlock is disabled', () => {
    manager.unlock()
    expect(mockCtxResume).toHaveBeenCalled()
  })

  it('applies fresh computed volume on each play for cached static Howls', () => {
    const m = new AudioManager({
      initialCategoryState: { ui: { volume: 1, muted: false } },
    })
    m.unlock()
    m.play('ui.click')
    m.applyCategoryState('ui', { volume: 0.5 })
    m.play('ui.click')
    expect(mockHowlVolume).toHaveBeenCalled()
    const lastVol = mockHowlVolume.mock.calls[mockHowlVolume.mock.calls.length - 1]![0]
    const firstVol = mockHowlVolume.mock.calls[0]![0]
    expect(lastVol).not.toBe(firstVol)
    expect(lastVol).toBeCloseTo(firstVol * 0.5)
  })

  it('applies per-play volume override on top of category mix for cached static sounds', () => {
    manager.unlock()
    manager.play('ui.click', { volume: 1 })
    manager.play('ui.click', { volume: 0.5 })
    const first = mockHowlVolume.mock.calls[0]![0]
    const second = mockHowlVolume.mock.calls[1]![0]
    expect(second).toBeCloseTo(first * 0.5)
  })

  it('tracks multiple concurrent playbacks in the same category when not exclusive', () => {
    manager.unlock()
    manager.play('ui.click')
    manager.play('ui.error')
    expect(mockPlay).toHaveBeenCalledTimes(2)
    manager.stopCategory('ui')
    expect(mockStop).toHaveBeenCalledTimes(2)
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

describe('AudioManagerOptions.initialCategoryState', () => {
  it('merges partial nested category patches', () => {
    const m = new AudioManager({
      initialCategoryState: {
        ui: { volume: 0.25 },
        voice: { muted: true },
      },
    })
    m.unlock()
    m.play('ui.click')
    const vol = mockHowlVolume.mock.calls[0]![0]
    expect(vol).toBeCloseTo(0.35 * 0.25)
    m.play('voice.dsnTransmission', { src: '/x.mp3' })
    const voiceVol = mockHowlVolume.mock.calls[1]![0]
    expect(voiceVol).toBe(0)
  })
})
