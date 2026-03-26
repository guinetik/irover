import { describe, expect, it } from 'vitest'
import { buildSpawnDistribution, pickRockType, ROCK_TYPE_LIST } from '../rocks'

const spawnParams = {
  basalt: 0.5,
  ironOxide: 0.4,
  silicateIndex: 0.3,
  waterIceIndex: 0.2,
  dustCover: 0.4,
}

describe('rocks spawn distribution', () => {
  it('buildSpawnDistribution sums to ~1', () => {
    const dist = buildSpawnDistribution(spawnParams)
    const last = dist[dist.length - 1][0]
    expect(last).toBeCloseTo(1, 5)
  })

  it('pickRockType returns a valid id', () => {
    const dist = buildSpawnDistribution(spawnParams)
    const id = pickRockType(dist, 0)
    expect(ROCK_TYPE_LIST.some((t) => t.id === id)).toBe(true)
  })
})
