import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPlay = vi.fn()
const mockStop = vi.fn()
const mockUnload = vi.fn()
const mockDuration = vi.fn(() => 12)
const mockSeek = vi.fn(() => 3)
const mockPlaying = vi.fn(() => true)
const mockHowlVolume = vi.fn()

const { mockCtxResume, registeredEndHandlers, playErrorHandlers, playCounterRef, mockOff } =
  vi.hoisted(() => ({
    mockCtxResume: vi.fn(() => Promise.resolve()),
    registeredEndHandlers: [] as Array<() => void>,
    playErrorHandlers: [] as Array<(id: number, err: unknown) => void>,
    playCounterRef: { n: 0 },
    mockOff: vi.fn(),
  }))

vi.mock('howler', () => {
  class MockHowl {
    src: string[]
    constructor(opts: { src: string[] | string; volume?: number }) {
      this.src = Array.isArray(opts.src) ? opts.src : [opts.src]
    }
    play = () => {
      playCounterRef.n += 1
      return mockPlay() ?? playCounterRef.n
    }
    stop = mockStop
    unload = mockUnload
    duration = mockDuration
    seek = mockSeek
    playing = mockPlaying
    on = vi.fn()
    once = vi.fn((event: string, cb: (...args: unknown[]) => void, _id?: number) => {
      if (event === 'end') {
        registeredEndHandlers.push(cb as () => void)
      }
      if (event === 'playerror' || event === 'loaderror') {
        playErrorHandlers.push(cb as (id: number, err: unknown) => void)
      }
      return this
    })
    off = mockOff.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'end') {
        const i = registeredEndHandlers.indexOf(cb as () => void)
        if (i >= 0) registeredEndHandlers.splice(i, 1)
      }
      if (event === 'playerror' || event === 'loaderror') {
        const i = playErrorHandlers.indexOf(cb as (id: number, err: unknown) => void)
        if (i >= 0) playErrorHandlers.splice(i, 1)
      }
      return this
    })
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

import * as audioManifest from '../audioManifest'
import { AudioManager } from '../AudioManager'
import { resetAudioForTests, useAudio } from '../useAudio'

function fireRegisteredEndCallbacks(): void {
  const copy = [...registeredEndHandlers]
  registeredEndHandlers.length = 0
  for (const cb of copy) {
    cb()
  }
}

function firePlayErrorForSound(id: number): void {
  const copy = [...playErrorHandlers]
  for (const cb of copy) {
    cb(id, new Error('mock play error'))
  }
}

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    vi.clearAllMocks()
    registeredEndHandlers.length = 0
    playErrorHandlers.length = 0
    playCounterRef.n = 0
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
    expect(mockHowlVolume).toHaveBeenCalledWith(0.6, 1)
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

  it('applies per-instance volume on each play for shared cached Howls', () => {
    const m = new AudioManager({
      initialCategoryState: { ui: { volume: 1, muted: false } },
    })
    m.unlock()
    m.play('ui.click')
    m.applyCategoryState('ui', { volume: 0.5 })
    m.play('ui.click')
    expect(mockHowlVolume).toHaveBeenCalledTimes(2)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 0.35, 1)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0.175, 2)
  })

  it('applies distinct per-play volume overrides per Howl play id on shared cached Howls', () => {
    manager.unlock()
    manager.play('ui.click', { volume: 1 })
    manager.play('ui.click', { volume: 0.5 })
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 1, 1)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0.5, 2)
  })

  it('tracks multiple concurrent playbacks in the same category when not exclusive', () => {
    manager.unlock()
    manager.play('ui.click')
    manager.play('ui.error')
    expect(mockPlay).toHaveBeenCalledTimes(2)
    manager.stopCategory('ui')
    expect(mockStop).toHaveBeenCalledTimes(2)
  })

  it('restart mode stops the prior instance of the same sound before replaying', () => {
    manager.unlock()
    manager.play('ui.click')
    expect(registeredEndHandlers).toHaveLength(1)
    manager.play('ui.click')
    expect(mockStop).toHaveBeenCalledTimes(1)
    expect(mockOff).toHaveBeenCalled()
    expect(registeredEndHandlers).toHaveLength(1)
  })

  it('single-instance mode stops the prior instance before replaying', () => {
    manager.unlock()
    manager.play('sfx.discovery')
    manager.play('sfx.discovery')
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('overlap mode does not pre-stop prior instances of the same sound', () => {
    const orig = audioManifest.getAudioDefinition
    const spy = vi.spyOn(audioManifest, 'getAudioDefinition').mockImplementation((id) => {
      const def = orig(id)
      if (id === 'ui.click') {
        return { ...def, playback: 'overlap' as const }
      }
      return def
    })
    manager.unlock()
    manager.play('ui.click')
    manager.play('ui.click')
    expect(mockStop).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('rate-limited mode ignores plays inside cooldown', () => {
    const orig = audioManifest.getAudioDefinition
    const spy = vi.spyOn(audioManifest, 'getAudioDefinition').mockImplementation((id) => {
      const def = orig(id)
      if (id === 'ui.click') {
        return { ...def, playback: 'rate-limited' as const, cooldownMs: 60_000 }
      }
      return def
    })
    manager.unlock()
    const a = manager.play('ui.click')
    const b = manager.play('ui.click')
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(a.soundId).toBe('ui.click')
    expect(b.soundId).toBe('ui.click')
    expect(b.playing()).toBe(false)
    spy.mockRestore()
  })

  it('invokes onEnd and unloads dynamic Howls when a playback ends naturally', () => {
    let ended = false
    manager.unlock()
    manager.play('voice.dsnTransmission', {
      src: '/logs/X.mp3',
      onEnd: () => {
        ended = true
      },
    })
    expect(registeredEndHandlers).toHaveLength(1)
    fireRegisteredEndCallbacks()
    expect(ended).toBe(true)
    expect(mockUnload).toHaveBeenCalled()
  })

  it('unloads dynamic Howls on manual stop', () => {
    manager.unlock()
    const h = manager.play('voice.dsnTransmission', { src: '/logs/Y.mp3' })
    h.stop()
    expect(mockUnload).toHaveBeenCalled()
  })

  it('cleans up active playback and unloads dynamic Howls on playerror', () => {
    manager.unlock()
    manager.play('voice.dsnTransmission', { src: '/logs/fail.mp3' })
    expect(playErrorHandlers.length).toBeGreaterThan(0)
    firePlayErrorForSound(1)
    expect(mockUnload).toHaveBeenCalled()
    expect(registeredEndHandlers).toHaveLength(0)
  })

  it('cleans up active playback on playerror matching the play id', () => {
    manager.unlock()
    manager.play('voice.dsnTransmission', { src: '/logs/z.mp3' })
    firePlayErrorForSound(999)
    expect(mockUnload).not.toHaveBeenCalled()
    firePlayErrorForSound(1)
    expect(mockUnload).toHaveBeenCalled()
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
  beforeEach(() => {
    registeredEndHandlers.length = 0
    playErrorHandlers.length = 0
    playCounterRef.n = 0
    vi.clearAllMocks()
  })

  it('merges partial nested category patches', () => {
    const m = new AudioManager({
      initialCategoryState: {
        ui: { volume: 0.25 },
        voice: { muted: true },
      },
    })
    m.unlock()
    m.play('ui.click')
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 0.35 * 0.25, 1)
    m.play('voice.dsnTransmission', { src: '/x.mp3' })
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0, 2)
  })
})
