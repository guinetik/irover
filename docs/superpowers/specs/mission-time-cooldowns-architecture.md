# Mission time & cooldown registry

**Date:** 2026-03-23

## Mission time (`src/lib/missionTime.ts`)

- **Source of truth for sol length in real seconds:** `SOL_DURATION` in `src/three/MarsSky.ts` (drives `timeOfDay` advance).
- **HUD sol length:** `MARS_SOL_CLOCK_MINUTES` (24h 37m per sol).
- Use **`sceneSecondsFromSolFraction(0.5)`** for “half a sol” of scene time, **`sceneSecondsFromMarsClockHours(3)`** for “three Mars-clock hours,” etc.
- **RTG tuning:** edit **`RTG_MISSION_DURATIONS`** only; resolved lengths come from **`getRtgPhaseSceneSeconds()`**.

## Game clock bridge (`src/composables/useMarsGameClock.ts`)

- Re-exports mission-time helpers and **`missionCooldowns`** so Vue code can pull everything from one composable.
- **Always** advance cooldowns with the same delta as simulation: `missionCooldowns.tick(getSceneDelta(rawDelta))`.

## Cooldowns (`src/lib/missionCooldowns.ts`)

- Singleton **`missionCooldowns`**: `start(id, durationSec, onComplete?)`, `tick`, `isActive`, `remaining`, progress helpers.
- Stable ids: **`MISSION_COOLDOWN_ID`** — extend here for new instruments.
- **`onComplete`** runs after the entry is removed so chains can `start` the next timer safely.

## Site loop

`MartianSiteView` animate: `getSceneDelta` → **`missionCooldowns.tick(sceneDelta)`** → `controller.update(sceneDelta)` → power/thermal ticks.
