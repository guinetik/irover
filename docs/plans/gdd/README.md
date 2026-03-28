# GDD implementation planning

This folder tracks prioritization and epics for [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md) (game design: power, temperature, missions, HUD).

## Sprint vs later work

| Plan | Scope |
|------|--------|
| **[2026-03-22-priority-roadmap.md](./2026-03-22-priority-roadmap.md)** | **Current sprint:** **Tier 0–4** (through **tools**; **Tier 3** = thermal). |
| **[2026-03-22-later-tiers-post-sprint.md](./2026-03-22-later-tiers-post-sprint.md)** | **Deferred:** **Tier 5+** (progression, DAN extractor payoff, traversal depth, meta). **Out of this sprint.** |

## Where the roadmap starts (product today)

**Tier 0 is implemented:** **`active` instrument mode**, **`useInventory`**, **rock variety** ([`RockTypes.ts`](../../../src/three/terrain/RockTypes.ts)), and two arm tools: **Drill** (slot 3 — laser drill, rock targeting, samples, MastCam/ChemCam pipeline) and **APXS** (slot 4 — separate [`DrillController.ts`](../../../src/three/instruments/DrillController.ts) / [`APXSController.ts`](../../../src/three/instruments/APXSController.ts): contact spectrometer uses its own arm/turret animation and power; drilling and inventory collection live on **Drill** only). Historical plan: [apxs plan](../../superpowers/plans/2026-03-22-apxs-gameplay-inventory.md) (written before the split — treat **Drill** as the gameplay carrier for former “APXS drill” flows).

**Also in the build (cross-cutting, not only Tier 0–4 labels):** **LGA mailbox + UHF uplink** (transmission queue, orbital pass timing, SP bonuses), **SP reward track** (persistence, modifier layer, night-vision perk entry points), **`MarsSiteViewController`** + per-instrument tick handlers (Drill, DAN, ChemCam, MastCam, antennas, orbital drop). See recent `git log` for detail.

**This sprint ordering:** **Tier 1** (power) → **Tier 2** (instrument economy) → **Tier 3** (thermal) → **Tier 4** (MastCam, ChemCam, DAN prospect slice, SAM lab).

**Horizons (sprint):**

| Name | Through |
|------|---------|
| **Systems MVP** | Tiers **1–2** (+ Tier 0) |
| **Thermal slice** | Through **Tier 3** |
| **Tools MVP** | Through **Tier 4** |
| **Sprint target** | Through **Tier 4** |

**After the sprint:** progression, full DAN water extractor, slope/wheels, SP — see [later tiers plan](./2026-03-22-later-tiers-post-sprint.md).

## Documents

| Doc | Purpose |
|-----|---------|
| [2026-03-22-priority-roadmap.md](./2026-03-22-priority-roadmap.md) | **Sprint** backlog (Tier 0–4) |
| [2026-03-22-later-tiers-post-sprint.md](./2026-03-22-later-tiers-post-sprint.md) | **Post-sprint** Tier 5–7 |
| [ui-reference-mockups.md](./ui-reference-mockups.md) | **UI:** links to root HTML mockups (HUD, day/night, thermal) |
| [epic-power-thermal.md](./epic-power-thermal.md) | Power + thermal delivery phases |
| [epic-progression-missions.md](./epic-progression-missions.md) | Drops, missions — mostly **post-sprint** |
| [epic-traversal.md](./epic-traversal.md) | Slope, wheels — **post-sprint** |

## Related specs (`docs/superpowers/specs/`)

- [2026-03-22-dan-prospecting-water-design.md](../../superpowers/specs/2026-03-22-dan-prospecting-water-design.md) — DAN (sprint = **Tier 4** slice; payoff = post-sprint **5.3**)
- [2026-03-22-mastcam-chemcam-gameplay-design.md](../../superpowers/specs/2026-03-22-mastcam-chemcam-gameplay-design.md) — **MastCam** (survey / highlights) + **ChemCam** (laser / SAM prep); one file, **two** instruments
- [2026-03-22-chemcam-laser-spectrograph-ui-design.md](../../superpowers/specs/2026-03-22-chemcam-laser-spectrograph-ui-design.md) — ChemCam **pulse laser**, **integration delay**, **spectrum result** UI (inspo-aligned)
- [2026-03-22-apxs-gameplay-inventory-design.md](../../superpowers/specs/2026-03-22-apxs-gameplay-inventory-design.md) — APXS, inventory
- [gdd-input-modes-design.md](../../superpowers/specs/gdd-input-modes-design.md)
- [gdd-power-simulation-mvp-design.md](../../superpowers/specs/gdd-power-simulation-mvp-design.md)
- [gdd-hud-power-sol-clock-design.md](../../superpowers/specs/gdd-hud-power-sol-clock-design.md)
- [gdd-science-points-sp-design.md](../../superpowers/specs/gdd-science-points-sp-design.md) — **SP**: analyze → bank → meta rewards; **SAM/DAN** endgame yield; **Tier 7** / post-sprint

## Related plans (`docs/superpowers/plans/`)

- [2026-03-22-tier1-battery-power-hud.md](../../superpowers/plans/2026-03-22-tier1-battery-power-hud.md) — **Tier 1:** battery + persistent PWR HUD + sol (polish vs MVP)
- [2026-03-22-tier2-instrument-power-gating.md](../../superpowers/plans/2026-03-22-tier2-instrument-power-gating.md) — **Tier 2:** instrument draws + LOW/NO POWER + battery alerts
- [2026-03-22-tier3-thermal-environment.md](../../superpowers/plans/2026-03-22-tier3-thermal-environment.md) — **Tier 3:** thermal sim + heater on bus + HUD + first penalty
- [2026-03-22-mastcam-chemcam-gameplay.md](../../superpowers/plans/2026-03-22-mastcam-chemcam-gameplay.md)
- [2026-03-22-chemcam-laser-results-implementation.md](../../superpowers/plans/2026-03-22-chemcam-laser-results-implementation.md) — ChemCam laser VFX + delayed spectrum panel
- [2026-03-22-dan-prospecting-water.md](../../superpowers/plans/2026-03-22-dan-prospecting-water.md) — Phases A–D sprint; **Phase E** post-sprint
- [2026-03-22-apxs-gameplay-inventory.md](../../superpowers/plans/2026-03-22-apxs-gameplay-inventory.md)
