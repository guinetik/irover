# Epic: Power and thermal (GDD v0.4)

## Goal

Implement the core tension: **daylight is power; night is survival** — with a credible first-principles loop before full mission content.

## Phases

### Phase A — Power MVP (Tier 1)

- State: `batteryWh`, `capacityWh`, `generationW` (RTG + solar), `consumptionW`, `netW`.
- Inputs: `MarsSky` time / sun elevation, optional `roverInSunlight`, movement and instrument flags.
- Tick: integrate Wh from net power each frame (`dWh = netW * delta / 3600` for real-time feel, or scaled to match accelerated sol — see power spec).
- Deliverable: **persistent** HUD strip + sol clock; science readout + polish checklist — [tier1 battery plan](../../superpowers/plans/2026-03-22-tier1-battery-power-hud.md).

### Phase B — Instrument loads (Tier 2)

- Table from GDD: core 8W, drive 5W while moving, APXS 6W sustained while drilling, etc.
- UI: action slots reflect AVAILABLE / LOW / NO POWER when simulation is authoritative.
- **Plan:** [tier2 instrument power gating](../../superpowers/plans/2026-03-22-tier2-instrument-power-gating.md) (draw aggregation, gating rules, battery HUD bands).

### Phase C — Failure states (GDD)

- Yellow / red / blackout behavior; blackout is consequence, not game over.

### Phase D — Thermal ([priority roadmap](./2026-03-22-priority-roadmap.md) **Tier 3**)

- Ambient from site temps + time of day; heater **0–12 W** on the **same** power bus as Tier 1–2; zones **OPTIMAL / COLD / FRIGID / CRITICAL**.
- HUD: thermometer block on power panel — visual target: [mars_thermal_hud_mockup.html](../../../mars_thermal_hud_mockup.html) (combined **PWR + TEMP** left stack; [ui-reference-mockups](./ui-reference-mockups.md)).
- Penalties: start with **APXS in COLD**; full GDD matrix is backlog.
- **Plan:** [tier3 thermal environment](../../superpowers/plans/2026-03-22-tier3-thermal-environment.md).

## Dependencies

- `MarsSky.timeOfDay` and sun direction (existing).
- Site **`temperatureMinK` / `temperatureMaxK`** on `TerrainParams`, sourced from the **spawn landmark** — [`public/data/landmarks.json`](../../../public/data/landmarks.json) for **`geological`** features; landing sites use the same pipeline as [`MartianSiteView` `getTerrainParams()`](../../../src/views/MartianSiteView.vue) (fallback or lat-based model per [tier 3 thermal plan](../../superpowers/plans/2026-03-22-tier3-thermal-environment.md)).

## Out of scope (this epic)

- Full REMS/RAD passive loops (can stub draws).
- RTG repair mission reward (Mission 5) until progression epic lands.
