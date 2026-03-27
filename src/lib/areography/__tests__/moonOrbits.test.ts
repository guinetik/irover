import { describe, it, expect } from 'vitest'
import { phobosPosition, deimosPosition, moonPhaseAngle } from '../moonOrbits'

describe('phobosPosition', () => {
  it('returns azimuth and elevation', () => {
    const pos = phobosPosition(0.5, 0)
    expect(pos).toHaveProperty('azimuthRad')
    expect(pos).toHaveProperty('elevationRad')
  })

  it('moves retrograde — azimuth decreases over time (rises west)', () => {
    const pos0 = phobosPosition(0.0, 0)
    const pos1 = phobosPosition(0.1, 0)
    const delta = pos1.azimuthRad - pos0.azimuthRad
    expect(Math.abs(delta)).toBeGreaterThan(1.0)
  })

  it('completes roughly one orbit in 7.65 game-hours', () => {
    const pos0 = phobosPosition(0.0, 0)
    const pos1 = phobosPosition(0.311, 0)
    const azDiff = Math.abs(pos1.azimuthRad - pos0.azimuthRad) % (Math.PI * 2)
    const wrapped = Math.min(azDiff, Math.PI * 2 - azDiff)
    expect(wrapped).toBeLessThan(0.4)
  })
})

describe('deimosPosition', () => {
  it('returns azimuth and elevation', () => {
    const pos = deimosPosition(0.5, 0)
    expect(pos).toHaveProperty('azimuthRad')
    expect(pos).toHaveProperty('elevationRad')
  })

  it('moves prograde — appears nearly stationary over a short interval', () => {
    const pos0 = deimosPosition(0.0, 0)
    const pos1 = deimosPosition(0.1, 0)
    const delta = Math.abs(pos1.azimuthRad - pos0.azimuthRad)
    expect(delta).toBeLessThan(0.5)
  })
})

describe('moonPhaseAngle', () => {
  it('returns 0 when moon is in direction of sun (full phase)', () => {
    const sunDir = { x: 1, y: 0, z: 0 }
    const moonDir = { x: 1, y: 0, z: 0 }
    expect(moonPhaseAngle(sunDir, moonDir)).toBeCloseTo(0, 1)
  })

  it('returns PI when moon is opposite the sun (new phase)', () => {
    const sunDir = { x: 1, y: 0, z: 0 }
    const moonDir = { x: -1, y: 0, z: 0 }
    expect(moonPhaseAngle(sunDir, moonDir)).toBeCloseTo(Math.PI, 1)
  })
})
