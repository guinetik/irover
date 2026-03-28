# Rover Microphone — Ambient Audio Instrument

## Overview

A new passive instrument (slot 11, **MIC**) that exposes the rover to Mars ambient audio. When enabled, layered sound loops play with volumes driven by weather state, time of day, and storm intensity each frame.

Audio sourced from NASA's Perseverance rover microphone recordings (2021), cut from a 3-hour supercut into themed loops stored in `public/sound/`.

## Instrument Registration

**MicController** extends `InstrumentController`:

| Property | Value |
|----------|-------|
| `id` | `'mic'` |
| `name` | `'Microphone'` |
| `slot` | `11` |
| `passiveSubsystemOnly` | `true` |
| `passiveSubsystemEnabled` | `false` (starts STANDBY) |
| `canActivate` | `false` |
| `billsPassiveBackgroundPower` | `true` |
| Passive power | 1W |
| Focus node | Body fallback (no dedicated mesh) |

Selecting the slot opens the standard overlay card. Pressing E toggles `passiveSubsystemEnabled` (STANDBY / LISTENING), same pattern as REMS, RAD, and DAN.

## Audio Manifest Entries

Six new entries, all `category: 'ambient'`, `load: 'lazy'`, `playback: 'single-instance'`:

| Sound ID | File | Condition | Volume Driver |
|----------|------|-----------|---------------|
| `ambient.base` | `ambient.mp3` | Always (mic on) | Fixed ~0.15 (lowest layer) |
| `ambient.day` | `day.mp3` | `nightFactor < 0.5` | Fades in at dawn, out at dusk |
| `ambient.night` | `night.mp3` | `nightFactor >= 0.5` | Fades in at dusk, out at dawn |
| `ambient.winds` | `winds.mp3` | Always (mic on) | Volume normalized to `windMs` |
| `ambient.storm` | `wind.mp3` | `dustStormPhase === 'active'` | Ramps with storm intensity |
| `ambient.quake` | `marsquake.mp3` | `dustStormLevel >= 4` | Rumble layer for severe storms |

All entries loop via `options.loop: true` and are stopped/started by the tick handler.

## MicTickHandler

New tick handler implementing `SiteTickHandler` interface, created in `createMarsSiteTickHandlers`.

### Inputs

- `micEnabled` — derived from MicController's `passiveSubsystemEnabled`
- From `SiteFrameContext` or passed refs: `nightFactor`, `windMs`, `dustStormPhase`, `dustStormLevel`

### Tick Logic

1. **Mic off** (`!micEnabled`): stop all active ambient handles, clear state, return early.
2. **Mic just enabled** (handles are null): start all 6 loops via `audioManager.play(id, { loop: true })`.
3. **Per-frame volume update** (each tick while mic is on):
   - `ambient.base`: constant 0.15
   - `ambient.day`: lerp toward 1.0 when `nightFactor < 0.5`, toward 0 otherwise
   - `ambient.night`: lerp toward 1.0 when `nightFactor >= 0.5`, toward 0 otherwise
   - `ambient.winds`: scale 0.05–0.6 mapped from `windMs` range (calm ~1 m/s to gust ~15 m/s)
   - `ambient.storm`: 0 when no storm; ramps 0.3–0.8 proportional to storm level during `'active'` phase
   - `ambient.quake`: 0 when `dustStormLevel < 4`; 0.4–0.7 for levels 4–5
4. Volume changes applied per-frame via Howl `volume(vol, id)` — smooth enough without explicit fades at 60fps.

### Dispose

Stop all ambient handles, null out state.

## UI — Button

Inline `<button>` in `.power-hud-side-controls` below the HTR button in `MartianSiteView.vue`.

- Keyboard shortcut: **M**
- Icon: unicode microphone `\u{1F399}` (or fallback `\u25C9`)
- Label: **MIC**
- CSS class: `wheels-hud-btn wheels-hud-btn--mic`
- Enabled glow: cyan/blue tint animation (same pattern as HTR thermostat glow but cold-colored)
- Blocked when `wheelsHudBlocked` (sleeping), same as WHLS/HTR

## Overlay Card

Standard `InstrumentOverlay` card when slot 11 is selected:

- Header: icon, "Microphone", "Audio Sensor"
- Status: **STANDBY** or **LISTENING**
- Power: 1W when enabled, 0W in standby
- E key label: "ENABLE" / "DISABLE"
- No additional stats or progress bars

## Wiring Summary

| File | Change |
|------|--------|
| `src/three/instruments/MicController.ts` | New controller class |
| `src/three/instruments/index.ts` | Export `MIC_SLOT` |
| `src/audio/audioManifest.ts` | 6 new ambient sound definitions |
| `src/audio/audioTypes.ts` | Add sound IDs to `AUDIO_SOUND_IDS` |
| `src/views/site-controllers/MicTickHandler.ts` | New tick handler |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Create and wire mic handler |
| `src/views/MartianSiteView.vue` | MIC button in template + script refs |
| `src/views/MartianSiteView.css` | Mic button glow styles |
| `src/components/InstrumentOverlay.vue` | Mic card case |

## Out of Scope

- No recording/playback UI, spectrum visualizer, or gain slider
- No new sound files — uses existing `public/sound/` assets only
- `night2.mp3` not used
- No integration with MastCam active mode — mic is fully independent
