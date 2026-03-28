import { describe, it, expect } from 'vitest'
import {
  getShowerChancePerSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '../meteorShower'
import {
  computeSkyOrigin,
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  computeSoundDelay,
  FALL_DURATION,
} from '../meteorFall'
import type { MeteorFall, MeteorShower } from '../meteorTypes'

describe('meteor shower → fall integration', () => {
  it('generates a complete shower with valid falls', () => {
    const meteorRisk = 0.3
    const severity = rollShowerSeverity(meteorRisk)
    const count = rollMeteorCount(severity)
    const triggerFraction = rollTriggerFraction()

    const shower: MeteorShower = {
      id: 'test-shower',
      severity,
      meteorCount: count,
      startSol: 5,
      triggerAtSolFraction: triggerFraction,
    }

    expect(shower.meteorCount).toBeGreaterThanOrEqual(1)
    expect(shower.triggerAtSolFraction).toBeGreaterThanOrEqual(0.2)
    expect(shower.triggerAtSolFraction).toBeLessThanOrEqual(0.8)

    const falls: MeteorFall[] = []
    for (let i = 0; i < shower.meteorCount; i++) {
      const targetX = (Math.random() - 0.5) * 400
      const targetZ = (Math.random() - 0.5) * 400

      falls.push({
        id: `${shower.id}-fall-${i}`,
        showerId: shower.id,
        variant: pickMeteoriteVariant(),
        targetX,
        targetZ,
        groundY: 0,
        markerDuration: rollMarkerDuration(),
        entryAngle: rollEntryAngle(),
        azimuth: rollAzimuth(),
        phase: 'marker',
        elapsed: 0,
        staggerOffset: i * 2,
      })
    }

    expect(falls.length).toBe(shower.meteorCount)

    for (const fall of falls) {
      const origin = computeSkyOrigin(
        fall.targetX, fall.targetZ, fall.groundY,
        fall.entryAngle, fall.azimuth,
      )
      expect(origin.y).toBeGreaterThan(fall.groundY + 50)

      expect(fall.variant).toMatch(/^Lp\d{2}$/)
      const num = parseInt(fall.variant.slice(2))
      expect(num).toBeGreaterThanOrEqual(1)
      expect(num).toBeLessThanOrEqual(10)
    }
  })

  it('sound delay is proportional to distance', () => {
    const near = computeSoundDelay(30)
    const far = computeSoundDelay(500)
    expect(far).toBeGreaterThan(near)
    expect(near).toBeLessThan(0.2)
    expect(far).toBeGreaterThan(1.5)
  })
})
