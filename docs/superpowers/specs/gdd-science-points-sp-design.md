# Science Points (SP) — design

**Date:** 2026-03-22  
**Status:** **Not implemented in code** — scheduled with **[Tier 7](../../plans/gdd/2026-03-22-later-tiers-post-sprint.md)** (meta / mission log).  
**Source:** [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md) § SP ECONOMY.

## What SP is

**SP** = **Science Points** — a measure of **scientific contribution** (score / reputation / mission-log value). It is **not** the currency that **unlocks instruments on the rover** (power and pod drops do that per GDD). SP is the **meta progression** layer: you **earn** it by analyzing targets, **bank** it across the run or save, and **spend or threshold** it to **gain stuff** — rarer directives, richer bonus drops, prestige in the log, optional leaderboard framing.

## Progression loop (product intent)

```text
Analyze rocks / sites (MastCam → ChemCam / APXS → …)
        │
        ▼
   +SP (per action + multi-instrument bonus)
        │
        ▼
Accumulate SP ──► thresholds / unlocks ──► rewards (“stuff”)
```

**Endgame weight — SAM and DAN:** Early instruments add modest SP (scouting and contact science). **SAM** (organics) and **DAN** (subsurface / **ice** and related payoffs) are modeled as the **high-yield** science outcomes in the GDD table — they are the main **SP engines** that make accumulation feel like a real arc, especially once **DAN’s full prospect → extractor branch** exists in parallel with SAM’s big detections. Design DAN and SAM scoring together so both feel like “finisher” science, not afterthoughts.

## What SP is for (intended)

- **Meta progression** — SP totals gate or improve **what you get** (bonus drop tiers, directive variety, optional cosmetics / log badges — exact list TBD at Tier 7).
- **Mission rankings** — how thorough the run was.
- **Leaderboard** (optional social / async compare).
- **Bonus objectives** — higher SP can mean richer **bonus** drop content (not the core instrument gate).
- **Freeplay** — SP thresholds unlock rarer **directive** types.

## Multi-instrument bonus

- **×1.5** when **2+** applicable instruments used on the **same target**.
- **×3.0** when **all five** main instruments apply on one target.  
  Ties to **power management**: stacking instruments is expensive in watts.

## Example yield table (from GDD — tune at implementation)

| Source | SP range (indicative) |
|--------|------------------------|
| MastCam scan (per rock) | 5 – 15 |
| ChemCam analysis | 15 – 40 |
| ChemCam anomaly bonus | +25 |
| APXS contact analysis | 30 – 80 |
| APXS water-alteration find | +50 |
| DAN subsurface detection | 20 – 60 |
| DAN ice discovery | +100 |
| SAM organic detection | 200 – 500 |
| Mission completion | 100 – 1000 |

## UI reference

- GDD component tree: **`SciencePoints.vue`** — right edge, SP counter.
- [mars_rovers_hud_mockup.html](../../../mars_rovers_hud_mockup.html) — “SCIENCE POINTS” block on the right.

## Implementation notes (when Tier 7 starts)

- Single reactive store (e.g. composable) incremented by instrument controllers / mission hooks.
- Idempotent scoring rules per action type to avoid double-count on replay bugs.
- Persist with save game if sessions matter.
