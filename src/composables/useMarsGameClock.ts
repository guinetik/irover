import { ref } from 'vue'

/**
 * Global simulation clock for the Martian site: sol / sky advance and optional full pause.
 *
 * - **Rover clock**: `timeOfDay` / sun only advance after `notifyRoverReady()` (rover under player control).
 * - **Pause**: `setClockPaused(true)` freezes simulation time — no sun movement, no rover movement,
 *   no power/thermal integration (caller must pass `sceneDelta === 0` from `getSceneDelta`).
 *
 * Intended for modal dialogs and scripted beats. Dialogs can call `useMarsGameClock()` and toggle pause.
 */
const roverClockRunning = ref(false)
const clockPaused = ref(false)

export function useMarsGameClock() {
  /**
   * Call once when the player gains control (e.g. SiteScene `roverState === 'ready'` after deployment).
   */
  function notifyRoverReady(): void {
    roverClockRunning.value = true
  }

  /**
   * When true, the game world should not advance (use `getSceneDelta(Δ) === 0` and frozen sim time).
   */
  function setClockPaused(paused: boolean): void {
    clockPaused.value = paused
  }

  /**
   * Delta for physics, power, thermal, instruments — zero while paused.
   */
  function getSceneDelta(rawDelta: number): number {
    return clockPaused.value ? 0 : rawDelta
  }

  /**
   * Delta for Mars sky / sol only — zero until rover ready, or while paused.
   */
  function getSkyDelta(rawDelta: number): number {
    if (clockPaused.value) return 0
    if (!roverClockRunning.value) return 0
    return rawDelta
  }

  return {
    roverClockRunning,
    clockPaused,
    notifyRoverReady,
    setClockPaused,
    getSceneDelta,
    getSkyDelta,
  }
}
