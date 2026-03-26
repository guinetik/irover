import { ref } from 'vue'
import {
  getRtgPhaseSceneSeconds,
  getHeaterOverdriveSceneSeconds,
  RTG_MISSION_DURATIONS,
  HEATER_MISSION_DURATIONS,
  sceneSecondsFromMarsClockHours,
  sceneSecondsFromSolFraction,
  secondsPerSol,
} from '@/lib/missionTime'
import { missionCooldowns, MISSION_COOLDOWN_ID } from '@/lib/missionCooldowns'

/**
 * Global simulation clock for the Martian site: sol / sky advance and optional full pause.
 *
 * - **Rover clock**: `timeOfDay` / sun only advance after `notifyRoverReady()` (rover under player control).
 * - **Pause**: `setClockPaused(true)` freezes simulation time — no sun movement, no rover movement,
 *   no power/thermal integration (caller must pass `sceneDelta === 0` from `getSceneDelta`).
 * - **Mission time**: use `secondsPerSol` / `sceneSecondsFromSolFraction` / `sceneSecondsFromMarsClockHours`,
 *   {@link RTG_MISSION_DURATIONS} / {@link getRtgPhaseSceneSeconds}, and
 *   {@link HEATER_MISSION_DURATIONS} / {@link getHeaterOverdriveSceneSeconds} for balance knobs;
 *   tick {@link missionCooldowns} with the same `sceneDelta` from {@link getSceneDelta}.
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
    /** Sol-relative duration helpers (backed by `SOL_DURATION` in `@/lib/marsTimeConstants`). */
    secondsPerSol,
    sceneSecondsFromSolFraction,
    sceneSecondsFromMarsClockHours,
    /** RTG balance knobs (Mars hours / sol fractions) and resolved scene-second lengths. */
    RTG_MISSION_DURATIONS,
    getRtgPhaseSceneSeconds,
    /** Heater overdrive (Mars-clock heat window + sol lockout) as scene seconds. */
    HEATER_MISSION_DURATIONS,
    getHeaterOverdriveSceneSeconds,
    /** Central cooldown / timed windows — tick every frame with `getSceneDelta(rawDelta)`. */
    missionCooldowns,
    MISSION_COOLDOWN_ID,
  }
}

export type { MissionCooldownId } from '@/lib/missionCooldowns'
