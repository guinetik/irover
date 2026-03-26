export const TOUCHDOWN_RELEASE_DURATION = 0.24
export const TOUCHDOWN_TETHER_RETRACT_DURATION = 0.32

/**
 * Returns whether the touchdown tether rig should be visible during descent.
 */
export function isInTouchdownTetherWindow(descentProgress: number): boolean {
  return descentProgress >= 0
}

/**
 * Returns normalized post-touchdown release progress clamped to 0..1.
 */
export function getTouchdownReleaseProgress(releaseElapsed: number): number {
  if (TOUCHDOWN_RELEASE_DURATION <= 0) return 1
  return Math.min(1, Math.max(0, releaseElapsed / TOUCHDOWN_RELEASE_DURATION))
}

/**
 * Returns normalized tether tension during release, from taut (1) to fully cut (0).
 */
export function getTouchdownTetherTension(releaseElapsed: number): number {
  return 1 - getTouchdownReleaseProgress(releaseElapsed)
}

/**
 * Returns normalized tether retraction progress after the release cut is complete.
 */
export function getTouchdownTetherRetractProgress(releaseElapsed: number): number {
  if (TOUCHDOWN_TETHER_RETRACT_DURATION <= 0) return 1
  const retractElapsed = Math.max(0, releaseElapsed - TOUCHDOWN_RELEASE_DURATION)
  return Math.min(1, retractElapsed / TOUCHDOWN_TETHER_RETRACT_DURATION)
}
