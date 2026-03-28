import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'
import type { MeteorFall, MeteorShower } from '@/lib/meteor'
import {
  rollShowerThisSol,
  rollShowerSeverity,
  rollMeteorCount,
  rollTriggerFraction,
  pickMeteoriteVariant,
} from '@/lib/meteor'
import {
  rollMarkerDuration,
  rollEntryAngle,
  rollAzimuth,
  FALL_DURATION,
} from '@/lib/meteor'
import { TERRAIN_SCALE } from '@/three/terrain/terrainConstants'

const STAGGER_SPREAD_SEC = 6

export interface MeteorTickCallbacks {
  meteorRisk: number
  heightAt: (x: number, z: number) => number
  onShowerScheduled: (shower: MeteorShower) => void
  onFallMarkerShow: (fall: MeteorFall) => void
  onFallStart: (fall: MeteorFall) => void
  onFallImpact: (fall: MeteorFall) => void
  onShowerComplete: () => void
}

export function createMeteorTickHandler(
  callbacks: MeteorTickCallbacks,
): SiteTickHandler {
  const { meteorRisk, heightAt } = callbacks

  let lastSol = -1
  let scheduledShower: (MeteorShower & { triggered: boolean; warningFired: boolean }) | null = null
  const activeFalls: MeteorFall[] = []
  let pendingFalls: MeteorFall[] = []
  let showerElapsed = 0
  let allFallsCompleted = false

  function scheduleShowerForSol(sol: number): void {
    if (!rollShowerThisSol(meteorRisk)) return

    const severity = rollShowerSeverity(meteorRisk)
    const meteorCount = rollMeteorCount(severity)
    const triggerFraction = rollTriggerFraction()
    const half = TERRAIN_SCALE / 2

    const shower: MeteorShower = {
      id: `shower-${sol}-${Date.now()}`,
      severity,
      meteorCount,
      startSol: sol,
      triggerAtSolFraction: triggerFraction,
    }

    const falls: MeteorFall[] = []
    for (let i = 0; i < meteorCount; i++) {
      const targetX = (Math.random() - 0.5) * half * 1.6
      const targetZ = (Math.random() - 0.5) * half * 1.6
      const groundY = heightAt(targetX, targetZ)
      if (Number.isNaN(groundY)) continue

      falls.push({
        id: `${shower.id}-fall-${i}`,
        showerId: shower.id,
        variant: pickMeteoriteVariant(),
        targetX,
        targetZ,
        groundY,
        markerDuration: rollMarkerDuration(),
        entryAngle: rollEntryAngle(),
        azimuth: rollAzimuth(),
        phase: 'marker',
        elapsed: 0,
        staggerOffset: (i / Math.max(1, meteorCount - 1)) * STAGGER_SPREAD_SEC,
      })
    }

    pendingFalls = falls
    scheduledShower = { ...shower, triggered: false, warningFired: false }
    callbacks.onShowerScheduled(shower)
  }

  function tick(fctx: SiteFrameContext): void {
    const { sceneDelta, marsSol, marsTimeOfDay } = fctx

    if (marsSol !== lastSol) {
      lastSol = marsSol
      if (!scheduledShower) {
        scheduleShowerForSol(marsSol)
      }
    }

    if (!scheduledShower) return

    const solFraction = marsTimeOfDay

    // REMS warning
    if (!scheduledShower.warningFired && !scheduledShower.triggered) {
      const warningFraction = scheduledShower.triggerAtSolFraction - 0.03
      if (solFraction >= warningFraction) {
        scheduledShower.warningFired = true
      }
    }

    // Trigger the shower
    if (!scheduledShower.triggered && solFraction >= scheduledShower.triggerAtSolFraction) {
      scheduledShower.triggered = true
      showerElapsed = 0
      allFallsCompleted = false
    }

    if (!scheduledShower.triggered) return

    showerElapsed += sceneDelta

    // Release pending falls based on stagger offset
    for (let i = pendingFalls.length - 1; i >= 0; i--) {
      const fall = pendingFalls[i]
      if (showerElapsed >= fall.staggerOffset) {
        activeFalls.push(fall)
        pendingFalls.splice(i, 1)
        callbacks.onFallMarkerShow(fall)
      }
    }

    // Advance each active fall
    for (let i = activeFalls.length - 1; i >= 0; i--) {
      const fall = activeFalls[i]
      fall.elapsed += sceneDelta

      if (fall.phase === 'marker') {
        if (fall.elapsed >= fall.markerDuration) {
          fall.phase = 'falling'
          fall.elapsed = 0
          callbacks.onFallStart(fall)
        }
      } else if (fall.phase === 'falling') {
        if (fall.elapsed >= FALL_DURATION) {
          fall.phase = 'impacted'
          callbacks.onFallImpact(fall)
          activeFalls.splice(i, 1)
        }
      }
    }

    // Check if shower is complete
    if (
      scheduledShower.triggered
      && pendingFalls.length === 0
      && activeFalls.length === 0
      && !allFallsCompleted
    ) {
      allFallsCompleted = true
      callbacks.onShowerComplete()
      scheduledShower = null
    }
  }

  function dispose(): void {
    activeFalls.length = 0
    pendingFalls = []
    scheduledShower = null
  }

  return { tick, dispose }
}
