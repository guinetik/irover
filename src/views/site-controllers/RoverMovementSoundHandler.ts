import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface RoverMovementSoundCallbacks {
  startDriveLoop: () => AudioPlaybackHandle
  startTurnLoop: () => AudioPlaybackHandle
  playTurnOut: () => void
}

/**
 * Manages rover chassis movement sounds:
 * - Drive loop while W/S is held (forward/backward)
 * - Turn loop while A/D is held (steering)
 * - Turn-out one-shot when A/D is released
 */
export function createRoverMovementSoundHandler(
  callbacks: RoverMovementSoundCallbacks,
): SiteTickHandler {
  const { startDriveLoop, startTurnLoop, playTurnOut } = callbacks

  let drivePlayback: AudioPlaybackHandle | null = null
  let turnPlayback: AudioPlaybackHandle | null = null
  let wasTurning = false

  function tick(fctx: SiteFrameContext): void {
    const { rover } = fctx
    const isMoving = rover?.mode === 'driving' && rover.isMoving
    const isTurning = rover?.mode === 'driving' && (rover as { isTurning?: boolean }).isTurning

    // Drive sound: held while W/S moves the chassis
    if (isMoving) {
      drivePlayback ??= startDriveLoop()
    } else if (drivePlayback) {
      drivePlayback.stop()
      drivePlayback = null
    }

    // Turn sound: held while A/D steers
    if (isTurning) {
      turnPlayback ??= startTurnLoop()
    } else if (turnPlayback) {
      turnPlayback.stop()
      turnPlayback = null
    }

    // Turn-out one-shot on release edge
    if (wasTurning && !isTurning) {
      playTurnOut()
    }
    wasTurning = !!isTurning
  }

  function dispose(): void {
    drivePlayback?.stop()
    drivePlayback = null
    turnPlayback?.stop()
    turnPlayback = null
    wasTurning = false
  }

  return { tick, dispose }
}
