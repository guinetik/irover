// src/views/site-controllers/__tests__/MicTickHandler.test.ts
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import * as THREE from 'three'
import type { SiteFrameContext } from '../SiteFrameContext'
import { createMicTickHandler } from '../MicTickHandler'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'

function makeFctx(overrides: Partial<SiteFrameContext> = {}): SiteFrameContext {
  return {
    sceneDelta: 0.016,
    skyDelta: 0.016,
    simulationTime: 0,
    camera: new THREE.PerspectiveCamera(),
    siteScene: {
      rover: { position: new THREE.Vector3() },
      terrain: { heightAt: () => 0 },
      scene: new THREE.Scene(),
    } as unknown as SiteFrameContext['siteScene'],
    rover: null,
    roverReady: true,
    isSleeping: false,
    nightFactor: 0,
    thermalZone: 'OPTIMAL',
    marsSol: 1,
    marsTimeOfDay: 0.25,
    totalSP: 0,
    activeInstrumentSlot: null,
    windMs: 3,
    dustStormPhase: 'none',
    dustStormLevel: null,
    ...overrides,
  }
}

function makeHandle(): AudioPlaybackHandle {
  return {
    soundId: 'test',
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
    setVolume: vi.fn(),
  }
}

describe('MicTickHandler', () => {
  it('does not start audio when mic is disabled', () => {
    const playAmbientLoop = vi.fn()
    const handler = createMicTickHandler(
      { micEnabled: ref(false) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )
    handler.tick(makeFctx())
    expect(playAmbientLoop).not.toHaveBeenCalled()
  })

  it('starts all 6 ambient loops when mic is enabled', () => {
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )
    handler.tick(makeFctx())
    expect(playAmbientLoop).toHaveBeenCalledTimes(6)
  })

  it('stops all loops when mic is disabled after being enabled', () => {
    const handles = Array.from({ length: 6 }, () => makeHandle())
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const micEnabled = ref(true)
    const handler = createMicTickHandler(
      { micEnabled },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )

    handler.tick(makeFctx())
    micEnabled.value = false
    handler.tick(makeFctx())

    for (const h of handles) {
      expect(h.stop).toHaveBeenCalled()
    }
  })

  it('drives day layer volume up during daytime (nightFactor=0)', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    // Run several ticks to let lerp converge
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({ nightFactor: 0, sceneDelta: 0.016 }))
    }

    // Find day layer calls (index 1 = ambient.day)
    const dayCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 1,
    )
    const lastDayVol = dayCalls[dayCalls.length - 1][1] as number
    expect(lastDayVol).toBeGreaterThan(0.8)
  })

  it('drives night layer volume up during nighttime (nightFactor=1)', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({ nightFactor: 1, sceneDelta: 0.016 }))
    }

    const nightCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 2,
    )
    const lastNightVol = nightCalls[nightCalls.length - 1][1] as number
    expect(lastNightVol).toBeGreaterThan(0.8)
  })

  it('drives storm volume when dust storm is active', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 3,
        sceneDelta: 0.016,
      }))
    }

    // Storm is index 4
    const stormCalls = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 4,
    )
    const lastStormVol = stormCalls[stormCalls.length - 1][1] as number
    expect(lastStormVol).toBeGreaterThan(0.2)
  })

  it('drives quake volume only at storm level 4+', () => {
    const setAmbientVolume = vi.fn()
    const playAmbientLoop = vi.fn().mockReturnValue(makeHandle())
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume },
    )

    // Storm level 3 — no quake
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 3,
        sceneDelta: 0.016,
      }))
    }

    const quakeCalls3 = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 5,
    )
    const lastQuakeVol3 = quakeCalls3[quakeCalls3.length - 1][1] as number
    expect(lastQuakeVol3).toBeLessThan(0.01)

    // Storm level 5 — quake
    setAmbientVolume.mockClear()
    for (let i = 0; i < 60; i++) {
      handler.tick(makeFctx({
        dustStormPhase: 'active',
        dustStormLevel: 5,
        sceneDelta: 0.016,
      }))
    }

    const quakeCalls5 = setAmbientVolume.mock.calls.filter(
      (_call: [AudioPlaybackHandle, number], idx: number) => idx % 6 === 5,
    )
    const lastQuakeVol5 = quakeCalls5[quakeCalls5.length - 1][1] as number
    expect(lastQuakeVol5).toBeGreaterThan(0.5)
  })

  it('cleans up on dispose', () => {
    const handles = Array.from({ length: 6 }, () => makeHandle())
    let callIdx = 0
    const playAmbientLoop = vi.fn().mockImplementation(() => handles[callIdx++])
    const handler = createMicTickHandler(
      { micEnabled: ref(true) },
      { playAmbientLoop, setAmbientVolume: vi.fn() },
    )

    handler.tick(makeFctx())
    handler.dispose()

    for (const h of handles) {
      expect(h.stop).toHaveBeenCalled()
    }
  })
})
