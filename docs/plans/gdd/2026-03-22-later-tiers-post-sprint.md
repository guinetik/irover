# Later tiers — post–current sprint (Tier 5+)

**Status:** **Out of scope** for the current sprint. Work here only after closing [2026-03-22-priority-roadmap.md](./2026-03-22-priority-roadmap.md) through **Tier 4**.

**Continues from:** sprint roadmap **Tier 4** (tools) complete.

Source GDD: [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md).

---

## Where this picks up

```text
… Tier 4 done (MastCam, ChemCam, DAN prospect slice, SAM lab — Drill/APXS split)
            │
            ▼
         Tier 5: Progression (missions, drops, storms, DAN extractor payoff)
            │
            ▼
         Tier 6: Traversal depth (slope, wheels, …)
            │
            ▼
         Tier 7: Meta (SP progression, mission log)
```

---

## Tier 5 — Progression

| # | Item | Definition of done |
|---|------|---------------------|
| 5.1 | Mission + drop framework | One mission + one pod + stat flags (`+Wh`, `+solarPeak`) |
| 5.2 | Dust storm event | Solar multiplier + visibility tweak |
| 5.3 | **DAN → prospect → water extractor (payoff)** | After **Tier 4** prospect + `prospectCompletedAwaitingDrop`: real **mission**, **drop chute**, **install**, **demarcated zone**, **passive water** — [dan-prospecting-water spec](../../superpowers/specs/2026-03-22-dan-prospecting-water-design.md), **Phase E** in [dan plan](../../superpowers/plans/2026-03-22-dan-prospecting-water.md). Full `inspo/dan.png` traverse HUD can ship here if skipped in Tier 4. |

**Epic / narrative:** [epic-progression-missions.md](./epic-progression-missions.md) (mission cadence, GDD missions 1–5, DAN branch).

---

## Tier 6 — Traversal depth

| # | Item | Definition of done |
|---|------|---------------------|
| 6.1 | Slope speed + power | Heightmap normal affects max speed and motor draw |
| 6.2 | Wheel damage | State + repair from drops |

**Epic:** [epic-traversal.md](./epic-traversal.md).

---

## Tier 7 — Meta

| # | Item | Definition of done |
|---|------|---------------------|
| 7.1 | SP + mission log | **Analyze → earn SP → accumulate → unlock rewards** (thresholds / bonus content); mission log. **SAM + DAN** carry endgame SP weight — align with [DAN spec](../../superpowers/specs/2026-03-22-dan-prospecting-water-design.md) payoff. Spec: [gdd-science-points-sp-design.md](../../superpowers/specs/gdd-science-points-sp-design.md). |

---

## Milestones (post-sprint)

| Name | Through |
|------|---------|
| **Progression MVP** | End of **Tier 5** (including **5.3**) |
| **GDD traversal slice** | Through **Tier 6** |
| **Full meta** | **Tier 7** |

When this plan is active, refresh horizons in [README](./README.md) if the sprint boundary moves.
