# Storm-Reactive Glitch FX

Camera-feed interference effects that scale with dust storm severity.

## Overview

The Martian site view renders through a `DustAtmospherePass` that mimics a drone camera feed. During dust storms this pass now escalates its signal-interference effects in proportion to the storm's FSM phase and level, giving the player a visceral visual read on atmospheric severity — independent of the REMS instrument readout.

## Effect Tiers

| Phase / Level | `uStormGlitchIntensity` | `uStormPhaseIncoming` | Active effects |
|---|---|---|---|
| Idle / cooldown | `0.0` | `0.0` | Baseline: low-freq burst, baseline noise |
| **Incoming** (any level) | `0.0` | `1.0` | Heavier desaturation, scan-line contrast up, CA fringe, burst threshold drops to ~0.992 |
| **Active, Level 1–2** | `0.2–0.4` | `0.0` | More burst bands, CA spread grows, noise ×1.5 |
| **Active, Level 3–4** | `0.6–0.8` | `0.0` | Horizontal UV tearing (scanline rows snap laterally), strong CA, burst ×2 |
| **Active, Level 5** | `1.0` | `0.0` | All above + signal roll artifact (vertical row jump), blackout bands (signal loss), extreme CA spread |

## GLSL Uniforms

Both uniforms are set by `DustAtmospherePass.setStormGlitch()` every render frame.

| Uniform | Type | Range | Description |
|---|---|---|---|
| `uStormGlitchIntensity` | `float` | 0.0–1.0 | Composite glitch drive. Equals `stormLevel / 5` while FSM is `active`, 0 otherwise. |
| `uStormPhaseIncoming` | `float` | 0.0 or 1.0 | Pre-storm warning flag. 1.0 during FSM `incoming` phase only. |

## Architecture

```
siteWeather.value (SiteWeatherSnapshot)
  .dustStormPhase  ('none' | 'incoming' | 'active')
  .dustStormLevel  (number | null)
        │
        ▼
MarsSiteViewController.ts  (animate loop)
  dustPass.setStormGlitch(glitchIntensity, incomingFactor)
        │
        ▼
DustAtmospherePass.ts
  uniforms.uStormGlitchIntensity
  uniforms.uStormPhaseIncoming
        │
        ▼
dust-atmosphere.frag.glsl
  ├─ Chromatic aberration boost
  ├─ Scan-line contrast increase
  ├─ Desaturation ramp
  ├─ Sensor noise scale-up
  ├─ Burst threshold / frequency
  ├─ Horizontal UV tearing (Tier 3+)
  ├─ Signal roll artifact (Tier 4)
  └─ Blackout bands (Tier 4)
```

## Key Design Decisions

- **No extra render pass** — all effects live in the existing `DustAtmospherePass` shader, keeping the post-processing cost flat.
- **`incoming` phase uses `dustStormPhase` directly** — `renderDustStormLevel` is 0 during `incoming` by design (storm visuals don't start until `active`), so a separate `incomingFactor` scalar was added rather than changing the existing render-wind contract.
- **Snap-frame time** — tearing and blackout use `floor(uTime * rate)` so artifacts snap discretely rather than sliding smoothly, which reads more like real signal corruption.
- **No lib/ changes** — glitch scalar derivation is pure presentation math, lives in the view controller, not in the domain model.

## Related Files

- `src/three/shaders/dust-atmosphere.frag.glsl` — GLSL implementation
- `src/three/DustAtmospherePass.ts` — uniform registration, `setStormGlitch()` API
- `src/views/MarsSiteViewController.ts` — drives glitch uniforms from `siteWeather`
- `src/lib/weather/siteWeather.ts` — storm FSM, `SiteWeatherSnapshot`
- `docs/rems-weather-system.md` — storm FSM design
