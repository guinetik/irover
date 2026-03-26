/**
 * In-game Martian day length and HUD sol-clock alignment.
 * Single source of truth for mission time math; rendering (`MarsSky`) imports these values.
 */

/** Full in-game sol in real-time seconds (accelerated — e.g. 3 real minutes = 1 sol). */
export const SOL_DURATION = 180

/** Martian sol length in minutes — must match `SolClock` display math. */
export const MARS_SOL_CLOCK_MINUTES = 24 * 60 + 37

/**
 * `timeOfDay` in 0..1 that corresponds to 06:00 on the HUD sol clock.
 */
export const MARS_TIME_OF_DAY_06_00 = (6 * 60) / MARS_SOL_CLOCK_MINUTES
