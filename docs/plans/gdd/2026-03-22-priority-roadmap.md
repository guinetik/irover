# GDD priority roadmap — **current sprint** (2026-03-22)

**Sprint scope:** **Tier 0 → Tier 4** only. **Tier 5 and above** live in a separate plan — [2026-03-22-later-tiers-post-sprint.md](./2026-03-22-later-tiers-post-sprint.md) — **not in this sprint**.

Source GDD: [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md).

## How to read this (start → finish)

```text
START ──► Tier 0: Drill + APXS / active / inventory / rock types ✅
            │      (Drill = sampling + laser drill; APXS = own controller)
            ▼
         Tier 1: Power sim + minimal HUD + sol clock      ✅
            │
            ▼
         Tier 2: Instrument draws + battery alerts        ✅
            │
            ▼
         Tier 3: Thermal + first penalties                ✅
            │
            ▼
         Tier 4: Remaining instruments (“tools”)         ✅ (slice)
            │      MastCam ✅, ChemCam ✅, DAN prospect slice ✅, SAM lab ✅
            │      (DAN: full mission/drop/install payoff = post-sprint 5.3)
            ╳  Tier 5–7 deferred → later-tiers plan
```

**Milestone shorthand (this sprint):**

| Name | Through | Status |
|------|---------|--------|
| **Systems MVP** | End of **Tier 2** | **Complete** |
| **Thermal slice** | End of **Tier 3** | **Complete** |
| **Sprint target** | Through **Tier 4** (tools) | **Largely complete** — tools slice shipped; DAN **Tier 4** prospect/archive in; SAM mini-games + power; **Tier 5.3** DAN payoff still post-sprint |

---

## Tier 0 — Instrument bridge **(implemented)**

| # | Item | Status |
|---|------|--------|
| 0.1a | **`active` mode + inventory + rock-linked samples (Drill)** | **Done** — [DrillController.ts](../../src/three/instruments/DrillController.ts) (slot 3): [RockTargeting.ts](../../src/three/instruments/RockTargeting.ts), [LaserDrill.ts](../../src/three/instruments/LaserDrill.ts), [useInventory.ts](../../src/composables/useInventory.ts), [RockTypes.ts](../../src/three/terrain/RockTypes.ts). [DrillTickHandler.ts](../../src/views/site-controllers/DrillTickHandler.ts) wires HUD, SP, thermal duration mult. |
| 0.1b | **APXS (separate tool)** | **Done** — [APXSController.ts](../../src/three/instruments/APXSController.ts) (slot 4): arm aim, turret head rotation when activated, own `getInstrumentBusPowerW` (no sample/drill logic — that is **Drill**). |
| 0.2 | Input binding documented | **Done** — [gdd-input-modes-design](../../superpowers/specs/gdd-input-modes-design.md). |

Reference: [apxs-gameplay-inventory](../../superpowers/plans/2026-03-22-apxs-gameplay-inventory.md).

---

## Tier 1 — Power fantasy foundation **(implemented)**

**Prerequisite for Tier 2–4:** instruments must draw from a real budget.

**Implementation plan (storage, charge, persistent HUD, sol):** [2026-03-22-tier1-battery-power-hud.md](../../superpowers/plans/2026-03-22-tier1-battery-power-hud.md) — science readout framing, as-built map, polish vs MVP.

| # | Item | Status |
|---|------|--------|
| 1.1 | Power simulation MVP | **Done** — [useMarsPower.ts](../../src/composables/useMarsPower.ts): Wh budget, RTG + solar vs consumption, tick integration, sleep mode. |
| 1.2 | Persistent power HUD | **Done** — [PowerHud.vue](../../src/components/PowerHud.vue): PWR bar, SOC%, net W, GEN/USE breakdown, source icons. |
| 1.3 | Sol clock readout | **Done** — [SolClock.vue](../../src/components/SolClock.vue): `Sol n` + Mars-length HH:MM clock from `MarsSky.timeOfDay`. |

---

## Tier 2 — Instrument economy **(implemented)**

**Plan:** [2026-03-22-tier2-instrument-power-gating.md](../../superpowers/plans/2026-03-22-tier2-instrument-power-gating.md) — draw pipeline, slot gating, HUD SOC bands.

| # | Item | Status |
|---|------|--------|
| 2.1 | Instrument draw integration | **Done** — `tickPower` uses `instrumentLines` from [buildInstrumentPowerLines](../../src/views/MarsSiteViewController.ts) + `rockDrilling` adds [ROCK_DRILL_BASE_W](../../src/composables/useMarsPower.ts) while the bit cuts; per-tool draws include MastCam/ChemCam phases, Drill **active** arm bus (~6W) vs **APXS active** (~18W), DAN passive when enabled, SAM when `experimentRunning`. Focused tools draw in **active** only ([InstrumentController](../../src/three/instruments/InstrumentController.ts) default). |
| 2.2 | Battery alerts | **Done** — PowerHud green/amber/red by SOC, `low-soc` pulse class, sleep mode at 15%/wake at 50%. |

---

## Tier 3 — Thermal **(implemented)**

**Plan:** [2026-03-22-tier3-thermal-environment.md](../../superpowers/plans/2026-03-22-tier3-thermal-environment.md) — ambient, internal temp, heater on power bus, HUD, first penalty.

| # | Item | Status |
|---|------|--------|
| 3.1 | Temperature MVP | **Done** — [useMarsThermal.ts](../../src/composables/useMarsThermal.ts): internal + ambient + heater 0–12W on power bus, OPTIMAL/COLD/FRIGID/CRITICAL zones, thermal display in [InstrumentOverlay.vue](../../src/components/InstrumentOverlay.vue) (heater slot). |
| 3.2 | First penalty | **Done** — **Drill** `drillDurationMultiplier` from thermal zone (+ profile) in [DrillTickHandler.ts](../../src/views/site-controllers/DrillTickHandler.ts); ChemCam thermal mult in site view (COLD=0.85, FRIGID=1.25, CRITICAL=2.0). |

---

## Tier 4 — Remaining tools (after Tier 1–3)

Implement **slots 1, 2, 4, 5** (and RTG slot 6 if treated as a tool) per card copy and specs. **Order is flexible** within the tier; suggested: **1 → 2 → 4 → 5** so DAN lands after MastCam/ChemCam if you want tag gating.

| # | Item | Status |
|---|------|--------|
| 4.1 | **MastCam** | **Done** — [MastCamController.ts](../../src/three/instruments/MastCamController.ts): survey mode, lithology filter, scan with IDLE 3W / SCAN 8W, pan/tilt/zoom, shared mast state. |
| 4.2 | **ChemCam** | **Done** — [ChemCamController.ts](../../src/three/instruments/ChemCamController.ts): pulse train + integration delay, 12W/3W/2W phase power, beam VFX, spectrum results via [ChemCamExperimentPanel.vue](../../src/components/ChemCamExperimentPanel.vue), calibration system. |
| 4.3 | **DAN — Tier 4 slice** | **Done (slice)** — [DANController.ts](../../src/three/instruments/DANController.ts) + [DanTickHandler.ts](../../src/views/site-controllers/DanTickHandler.ts): passive scan / hits, prospect state machine, VFX, archiving, toasts, ~10W passive when STANDBY. **Post-sprint:** mission + drop + water extractor install (**Tier 5.3**). |
| 4.4 | **SAM** (lab) | **Done (Tier 4 slice)** — [SAMController.ts](../../src/three/instruments/SAMController.ts): covers + [SAMDialog.vue](../../src/components/SAMDialog.vue) with **pyrolysis**, **wet chemistry**, **isotope analysis** mini-games; **`experimentRunning`** bills **~25W** on the bus. |

**Survey → chemistry → contact:** **MastCam** **identify + highlight** → **ChemCam** **element readout** (feeds **SAM** planning) → **Drill** **powder sample** (`mastcamScanned`, optional `chemcamAnalyzed`) — **APXS** is a separate arm tool for contact spectrometer play, not the drill ([spec § pipeline](../../superpowers/specs/2026-03-22-mastcam-chemcam-gameplay-design.md), [inventory / drill flows](../../superpowers/specs/2026-03-22-apxs-gameplay-inventory-design.md), [plan 2b](../../superpowers/plans/2026-03-22-mastcam-chemcam-gameplay.md)).

**Not in this sprint:** DAN **payoff** (mission, drop, install, water stream) — see [later tiers plan](./2026-03-22-later-tiers-post-sprint.md) **Tier 5.3**.

---

## After Tier 4

Continue with **[2026-03-22-later-tiers-post-sprint.md](./2026-03-22-later-tiers-post-sprint.md)** (Tier 5 progression, Tier 6 traversal, Tier 7 meta).
