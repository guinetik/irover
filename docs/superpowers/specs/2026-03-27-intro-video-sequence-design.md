# Pre-Descent Video Intro Sequence

## Overview

Add a full-screen video intro (`public/intro.mp4`, ~41s, 854x480 H.264 w/ audio) that plays before the sky crane descent when a player first lands at a site. A transmission-style telemetry HUD overlays the video using the existing `ScrambleText` component. The terrain loads behind the video. When the video ends, it hard-cuts directly into the 3D sky crane descent.

As part of this work, extract all intro-related UI from `MartianSiteView.vue` into a new `IntroSequence.vue` wrapper component to reduce bloat.

## Constraints

- Returning players with `isSiteIntroSequenceSkipped() === true` see the existing flat black `LoadingOverlay` — no video, no descent, no deploy animation.
- First-time players see: video → hard cut → descent → deploy → ready.
- The video has audio and should play with sound.
- The scene loads concurrently behind the video. If the video ends before loading finishes, hold on the last frame until the scene is ready.

## New Component: `IntroVideoOverlay.vue`

### Props

| Prop | Type | Description |
|------|------|-------------|
| `siteId` | `string` | Landing site name (displayed in late-stage telemetry) |
| `latitude` | `number` | Site latitude (resolved in telemetry) |
| `longitude` | `number` | Site longitude (resolved in telemetry) |
| `archetypeName` | `string` | Player archetype from character creation |
| `sceneReady` | `boolean` | True when terrain + scene have finished loading |

### Emits

| Event | Description |
|-------|-------------|
| `complete` | Video ended (or ESC skip). Parent should begin descent. |

### Video Element

- `<video>` element: `autoplay`, `playsinline`, sound on, no controls.
- `object-fit: cover` to fill viewport regardless of aspect ratio.
- Fixed position, full viewport, highest z-index in the view (~70+, above LoadingOverlay's 60).

### State Machine

```
                          ┌─── video ends naturally ──▶ emit('complete')
                          │
[video-playing] ──sceneReady──▶ [skippable]
                                    │
                                    ├── ESC pressed ──▶ emit('complete')
                                    │
                                    └── video ends ──▶ emit('complete')

Edge case: video ends but sceneReady=false
  → hold on last frame, wait for sceneReady, then emit('complete')
```

### ESC Skip

- "ESC TO SKIP" text fades in at bottom-center only when `sceneReady && !videoEnded`.
- Styled: small monospace, amber (`rgba(228, 147, 62, 0.5)`), same aesthetic as other HUD text.
- Listens for `keydown` Escape; removes listener on unmount.

## Telemetry HUD Overlay

All elements visible from video start. Monospace text, amber color palette matching the game HUD. Low opacity (0.4–0.6) so the video remains the focus. Uses `ScrambleText` for the initial text-reveal effect on each readout, then values tick/update on intervals.

### Layout (four corners)

**Top-left — Mission designation + signal:**
- `MEC-7720 // MARS INSERTION` (ScrambleText reveal)
- `SIGNAL: 97.3%` (ticks randomly between 94–99%)
- `TRANSMISSION: ACTIVE`

**Top-right — Descent telemetry:**
- `VELOCITY: 5,842 m/s` (ticks down over video duration)
- `ALTITUDE: 125.4 km` (ticks down)
- `TRAJECTORY: NOMINAL`

**Bottom-left — Coordinates (generic → real):**
- Starts as `TARGET COORDINATES: RESOLVING...`
- At ~75% video progress, resolves to real site lat/lon via ScrambleText
- Then site name appears: e.g. `SITE: JEZERO CRATER`
- Operator archetype shown: e.g. `OPERATOR CLASS: MAKER`

**Bottom-right — Mission clock:**
- `T-00:00:XX` counting up from video start

### Styling

- All text: `font-family: monospace`, `letter-spacing: 0.1–0.15em`, `font-size: 10–12px`.
- Color: `rgba(228, 147, 62, 0.4–0.6)` — amber, translucent.
- Each corner group is `position: absolute` with appropriate inset.
- Optional: subtle CSS scanline effect (repeating-linear-gradient overlay, very low opacity) for CRT/transmission feel. Keep it cheap — CSS only, no canvas.

## Refactor: `IntroSequence.vue`

### Purpose

Extract all intro-lifecycle UI from `MartianSiteView.vue` into a single wrapper component. Props-down approach — the controller tick loop still manages roverState; MartianSiteView passes state to IntroSequence as props.

### Owns (moved from MartianSiteView)

- `IntroVideoOverlay` (new)
- `RoverDeployOverlays` (existing — descent label + deploy steps/progress bar)
- Visual gating: the component handles showing video → descent → deploy → done

### Props (from MartianSiteView)

| Prop | Type | Description |
|------|------|-------------|
| `skipIntro` | `boolean` | `isSiteIntroSequenceSkipped()` result |
| `siteLoading` | `boolean` | Scene still loading |
| `descending` | `boolean` | roverState === 'descending' |
| `deploying` | `boolean` | roverState === 'deploying' |
| `deployProgress` | `number` | 0–1 deploy progress |
| `siteId` | `string` | Site name |
| `latitude` | `number` | Site lat |
| `longitude` | `number` | Site lon |
| `archetypeName` | `string` | Player archetype |

### Emits

| Event | Description |
|-------|-------------|
| `intro-complete` | Entire intro sequence done (rover deployed or skipped). Parent uses this to flip a single `introComplete` ref. |

### Impact on MartianSiteView

- Remove `RoverDeployOverlays` import and template usage.
- The scattered `!deploying && !descending` guards in the template become `introComplete` checks (single boolean).
- `descending`, `deploying`, `deployProgress` refs remain (fed by controller) but are only passed as props to `<IntroSequence>`.
- `LoadingOverlay` stays in MartianSiteView (renders behind IntroSequence when video is active, still useful for skip-intro path).

## What stays unchanged

- `MarsSiteViewController.ts` tick loop (lines 954–981) — still reads `siteScene.roverState`, still writes `descending`/`deploying`/`deployProgress` refs.
- `SiteScene.ts` descent/deploy state machine — untouched.
- `siteIntroSequence.ts` skip/persist logic — untouched.
- `LoadingOverlay.vue` — untouched.
- Audio: landing sound, thrusters — still managed by controller tick.
