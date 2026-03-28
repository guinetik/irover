# Mars site game clock

## Sol 1 @ 06:00

- [`MarsSky`](src/three/MarsSky.ts) initializes `timeOfDay` to `MARS_TIME_OF_DAY_06_00`, matching **06:00** on the HUD [`SolClock`](src/components/SolClock.vue) (Martian sol length `24×60+37` minutes).
- `marsSol` starts at **1** in [`MartianSiteView.vue`](src/views/MartianSiteView.vue).

## Sky / sol advance only after rover control

- The sun and `timeOfDay` **do not advance** during sky-crane descent and deploy animation.
- When `SiteScene.roverState === 'ready'`, [`useMarsGameClock`](src/composables/useMarsGameClock.ts) calls `notifyRoverReady()` and the sky begins using the real frame delta.

## Pausing for dialogs

- `useMarsGameClock().setClockPaused(true)` stops **simulation** time:
  - Sky / sol frozen (`skyDelta === 0`).
  - Rover, instruments, thermal, and power integration use `sceneDelta === 0`.
  - Accumulated `simulationTime` (dust shader, RTG pulse, MastCam tag animation) stops advancing.
- Call `setClockPaused(false)` when the dialog closes.

Example from any component with `<script setup>`:

```ts
import { useMarsGameClock } from '@/composables/useMarsGameClock'

const { setClockPaused } = useMarsGameClock()

function openDialog() {
  setClockPaused(true)
}
function closeDialog() {
  setClockPaused(false)
}
```

## SiteScene API

[`SiteScene.update`](src/three/SiteScene.ts) takes `(simElapsed, delta, cameraPosition, skyDelta)` so deployment animation can run with `delta` while `skyDelta` is `0` before the rover clock starts.
