# Epic: Progression, drops, missions (GDD v0.4)

**Scheduling:** Most of this epic aligns with **[later tiers (Tier 5+)](./2026-03-22-later-tiers-post-sprint.md)** — **out of the current sprint** (sprint roadmap ends at Tier 4). Keep for design reference; implement when that plan opens.

## Goal

Replace cosmetic “drop” copy in overlays with **real progression**: mission objectives, supply pod sites, and stat changes to the rover (power hardware, batteries, upgrades).

## Mission cadence (sponsor schedule)

**Briefing timing:** At the **start of each sol** (treat as “morning / post–wake-up” in fiction), the player receives a **mission briefing** from whoever is sponsoring the campaign (Mission Control, agency, etc.). That briefing is the formal hand-off of the **current** directive.

**One mission at a time (early game):** Only **one** sponsored mission is active at a time. There is no stack of two simultaneous sponsor objectives while the game is still in its opening progression. (Later chapters could relax this; default is strict single-focus.)

**Intentional gap after early completion:** If the player **finishes** that mission **mid-sol** (e.g. at noon), the **sponsor has nothing new to assign until the next morning**. This is **by design**, not a bug:

- It creates **player-owned time**: transit, site recon, power budgeting, optional science, inventory/APXS errands, parking for thermal/solar, UI planning, or simply enjoying the loop without a new comms ping.
- It reinforces the fantasy that **Earth-side planning and uplink** run on a **daily cadence**, not instant quest spam.

**Implementation note:** The mission system should key off **sol boundaries + briefing flag** (e.g. “briefing consumed for Sol *n*” / “next briefing available when sol index advances after dawn window”), not “instant next mission on complete.” Optional: a short **end-of-mission acknowledgement** comms line, then radio silence until next sol briefing.

## Mission spine (from GDD)

| Mission | Theme | Drop highlight |
|---------|--------|----------------|
| 1 First Light | Survival + MastCam | Solar + battery + MastCam calibration |
| 2 What’s in the Rock | ChemCam | Solar extension + ChemCam regulator |
| 3 Touch the Past | APXS + night | Batteries + APXS module + thermal + dust coating |
| 4 Beneath the Dust | DAN | Large solar + DAN extender + wheels |
| 5 Signs of Life | SAM + storm | RTG repair + SAM + batteries |

### DAN → prospect → water extractor (branch mission)

Documented in [dan-prospecting-water spec](../../superpowers/specs/2026-03-22-dan-prospecting-water-design.md), split across roadmap tiers:

- **Tier 4 ([priority roadmap](./2026-03-22-priority-roadmap.md)):** DAN toggle, particles, hits, **toast** on signal, **Prospect** completes → **tease only** (extractor approved, delivery pending) — **no drop yet**.
- **Tier 5.3:** Full payoff — **mission**, **drop chute**, **install**, **demarcation**, **passive water** (traverse HUD like `inspo/dan.png` can land here if deferred from Tier 4).

Site bias still uses [landmarks.json](../../../public/data/landmarks.json) `waterIceIndex` on geological features.

**Cadence:** Whether **5.3** fires same sol or next morning is a mission-system choice (see mission cadence section above).

## Technical milestones

1. **Mission state** — active directive text, objectives checklist, completion flag.
2. **Drop entity** — world marker within 200–500 m (scaled to site units), interaction range, “install” UI.
3. **Inventory of upgrades** — apply modifiers to power sim (capacity, peak solar, regulator flags).
4. **SP** — score for science actions; not currency for unlocks (GDD: reputation / ranking).

## Acceptance criteria (MVP)

- Completing a test mission spawns one pod; driving to it applies at least one numeric change visible on power HUD.
- Mission text can be driven from data (JSON or TS constant).

## Dependencies

- Power simulation MVP (epic-power-thermal Phase A).
- Site scene navigation and minimap (future HUD components per GDD).
