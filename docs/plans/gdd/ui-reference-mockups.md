# UI reference mockups (static HTML)

Self-contained layout experiments at the **repository root** (open in a browser; no build step). Use them when implementing Vue HUD components so **typography, spacing, and panel structure** stay aligned with the intended look.

| File | What it shows | Tie-in |
|------|----------------|--------|
| [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html) | Full rover HUD frame: mode badge, compass + POI ticks, telemetry strip, **power panel** (battery / net W), action bar, directive line, controls legend | General site HUD, [PowerHud](../../../src/components/PowerHud.vue), [gdd-hud-power-sol-clock](../../superpowers/specs/gdd-hud-power-sol-clock-design.md) |
| [mars_rovers_day_night_hud.html](../../../mars_rovers_day_night_hud.html) | Same family with **time-of-sol controls** (dawn / day / dusk / night / blackout), sol clock, driving vs parked, scene tint shifts | [day-night lighting spec](../../superpowers/specs/2026-03-22-day-night-lighting-design.md), `MarsSky` / `MartianSiteView` feel |
| [mars_thermal_hud_mockup.html](../../../mars_thermal_hud_mockup.html) | **Combined left-edge PWR + TEMP** stack: battery, gen/use, solar icons, **thermometer**, ambient vs internal temp, heater W, zone labels (COLD / FRIGID / cold shutdown), site difficulty selector | [epic-power-thermal](./epic-power-thermal.md) Phase D (Tier 4 thermal HUD), GDD power+temperature panel |

## Conventions echoed in mockups

- **Font:** `Courier New`, uppercase micro-labels, `#c4753a` / `#e8a060` accent family (matches `InstrumentOverlay` / toolbar).
- **Panels:** dark glass `rgba(10,5,2,0.75–0.88)`, thin `rgba(196,117,58,…)` borders, optional `backdrop-filter: blur`.

## Maintenance

When the **canonical in-game HUD** changes deliberately, update these HTML files **or** note drift here so implementers know which source wins.
