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
import { isInsideBuildableFootprint, type FootprintEntry } from '@/lib/buildableFootprint'

/** Markers appear within this window so the player sees the full shower scope at once. */
const MARKER_STAGGER_SEC = 2
/** Falls are spread over this window so they rain down in a wave, not all at once. */
const FALL_STAGGER_SEC = 12

export interface MeteorTickCallbacks {
  meteorRisk: number
  heightAt: (x: number, z: number) => number
  meteorSenseBonus: number
  getPlacedFootprints: () => FootprintEntry[]
  onShowerScheduled: (shower: MeteorShower) => void
  onFallMarkerShow: (fall: MeteorFall) => void
  onFallStart: (fall: MeteorFall) => void
  onFallImpact: (fall: MeteorFall) => void
  onShowerComplete: () => void
}

function generateFalls(
  shower: MeteorShower,
  heightAt: (x: number, z: number) => number,
  meteorSenseBonus: number,
  getPlacedFootprints: () => FootprintEntry[],
): MeteorFall[] {
  const half = TERRAIN_SCALE / 2
  const footprints = getPlacedFootprints()
  const falls: MeteorFall[] = []
  for (let i = 0; i < shower.meteorCount; i++) {
    const targetX = (Math.random() - 0.5) * half * 1.6
    const targetZ = (Math.random() - 0.5) * half * 1.6
    if (isInsideBuildableFootprint(targetX, targetZ, footprints)) continue
    const groundY = heightAt(targetX, targetZ)
    if (Number.isNaN(groundY)) continue

    const t = i / Math.max(1, shower.meteorCount - 1)
    // Markers appear near-simultaneously; falls stagger so they rain down in a wave.
    const fallStagger = t * FALL_STAGGER_SEC
    falls.push({
      id: `${shower.id}-fall-${i}`,
      showerId: shower.id,
      variant: pickMeteoriteVariant(),
      targetX,
      targetZ,
      groundY,
      markerDuration: rollMarkerDuration() + meteorSenseBonus + fallStagger,
      entryAngle: rollEntryAngle(),
      azimuth: rollAzimuth(),
      phase: 'marker',
      elapsed: 0,
      staggerOffset: t * MARKER_STAGGER_SEC,
    })
  }
  return falls
}

export function createMeteorTickHandler(
  callbacks: MeteorTickCallbacks,
): SiteTickHandler & { forceShower: (severity: MeteorShower['severity']) => void } {
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

    const shower: MeteorShower = {
      id: `shower-${sol}-${Date.now()}`,
      severity,
      meteorCount,
      startSol: sol,
      triggerAtSolFraction: triggerFraction,
    }

    pendingFalls = generateFalls(shower, heightAt, callbacks.meteorSenseBonus, callbacks.getPlacedFootprints)
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

  /**
   * Dev: force-trigger a meteor shower immediately, bypassing the per-sol probability roll.
   * The shower starts on the current frame (no sol-fraction wait).
   */
  function forceShower(severity: MeteorShower['severity']): void {
    const meteorCount = rollMeteorCount(severity)

    const shower: MeteorShower = {
      id: `shower-dev-${Date.now()}`,
      severity,
      meteorCount,
      startSol: lastSol,
      triggerAtSolFraction: 0,
    }

    pendingFalls = generateFalls(shower, heightAt, callbacks.meteorSenseBonus, callbacks.getPlacedFootprints)
    showerElapsed = 0
    allFallsCompleted = false
    scheduledShower = { ...shower, triggered: true, warningFired: true }
    callbacks.onShowerScheduled(shower)
  }

  return { tick, dispose, forceShower }
}
