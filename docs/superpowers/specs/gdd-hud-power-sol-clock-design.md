# Power HUD and sol clock — design

**Date:** 2026-03-22

## Purpose

Surface [gdd-power-simulation-mvp-design.md](./gdd-power-simulation-mvp-design.md) on the rover site view and show **Martian time** derived from the existing sky cycle.

## UI references (static mockups)

- [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html) — full-frame HUD including **PWR** strip and compass/telemetry layout.
- [mars_rovers_day_night_hud.html](../../../mars_rovers_day_night_hud.html) — **sol clock** + time-of-sol presets (dawn through blackout). Indexed in [ui-reference-mockups](../../plans/gdd/ui-reference-mockups.md).

## Component

- **`PowerHud.vue`** (or inline block in `MartianSiteView.vue`): fixed **left edge**, matches instrument HUD styling (dark panel, `#c4753a` accent, monospace).

### Power block (MVP)

- Vertical **battery fill** or numeric **Wh / capacityWh**.
- **Net W** with sign (charging vs draining), color green / red.
- Optional one-line **GEN** / **USE** (collapsed vs expanded — [tier1 plan](../plans/2026-03-22-tier1-battery-power-hud.md) treats mockup parity as **Tier 1 polish**; [`PowerHud.vue`](../../../src/components/PowerHud.vue) may ship net-only first).

Data: props from `useMarsPower()` reactive refs (`generationW`, `consumptionW`, `netW` — no duplicate state).

### Integration status

- **Implemented:** [`PowerHud.vue`](../../../src/components/PowerHud.vue) on [`MartianSiteView.vue`](../../../src/views/MartianSiteView.vue), hidden during descent/deploy; sol + clock wired.
- **Polish:** GEN/USE row, **MT** label, spacing vs [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html) — see [tier1 battery plan](../plans/2026-03-22-tier1-battery-power-hud.md).

### Sol clock block

- **Time:** map `MarsSky.timeOfDay` (0–1) to **24h37m** Martian clock (matching GDD language). Formula: `totalMinutes = timeOfDay * (24 * 60 + 37)`, then hours and minutes.
- **Sol index:** `ref` starting at **1**, increment when `timeOfDay` wraps (detect decrease in timeOfDay between frames in the view or composable).
- Display example: `Sol 3` and `14:22 MT` (MT = Mars Time label optional).

## Layout (MVP)

```text
┌ PWR ────┐
│ ████░░  │
│ 42/50Wh │
│ +12W    │
├─────────┤
│ Sol 1   │
│ 14:22   │
└─────────┘
```

## Behavior

- Visible whenever the site scene is active (not during globe-only view).
- Does not steal pointer focus; pointer-events as needed for future “expand” (Tier 2 / UI mode).

## Related

- [MarsSky.ts](../../../src/three/MarsSky.ts) — `timeOfDay`, `nightFactor`
- [docs/plans/gdd/epic-power-thermal.md](../../plans/gdd/epic-power-thermal.md)
