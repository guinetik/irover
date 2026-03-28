# DAN + prospect + water extractor — implementation plan

> **Goal:** Driving-safe DAN with VFX, landmark-biased sampling, optional traverse HUD, Prospect gate; **Tier 4** ends at prospect + **tease toast**; **Tier 5.3** adds real drop, install, demarcation, passive water.

**Spec:** [docs/superpowers/specs/2026-03-22-dan-prospecting-water-design.md](../specs/2026-03-22-dan-prospecting-water-design.md)

**Roadmap:** [Sprint roadmap](../../plans/gdd/2026-03-22-priority-roadmap.md) **Tier 4.3** vs [post-sprint plan](../../plans/gdd/2026-03-22-later-tiers-post-sprint.md) **Tier 5.3**.

**Reference image:** [inspo/dan.png](../../../inspo/dan.png)

---

## Tier 4 (sprint) — Phases A through D (+ toast)

## Phase A — DAN core (driving, power, VFX)

- [ ] **A.1** Add **DAN enabled** toggle state (composable or `SiteScene` / view) independent of instrument slot; optional bind to key (e.g. `G`) when slot 4 “focused” or global policy.
- [ ] **A.2** Extend **power tick**: +**10 W** while DAN active ([GDD](../../../inspo/mars-rovers-gdd-v03.md)).
- [ ] **A.3** `DANController` (or sibling `DANSurvey`): particle **stream** from `DAN_L` world position toward ground hit; start/stop with toggle; pool + dispose in `dispose()`.
- [ ] **A.4** **Sample scheduler**: fire every **Δt** seconds and/or every **Δs** meters moved; read rover position from `SiteScene`.
- [ ] **A.5** Wire **site prior**: pass `waterIceIndex`, `featureType` from [getTerrainParams / landmark](../../../src/views/MartianSiteView.vue) into sampler.

---

## Phase B — RNG + trail data

- [ ] **B.0** On **signal hit** (per sample tick): **toast** / ephemeral banner with location flavour text (e.g. “Hydrogen signal registered at this position”) — Tier 4 UX minimum.
- [ ] **B.1** Implement **P(signal)** and **P(waterTruth)** with tunable constants; log roll for debug overlay.
- [ ] **B.2** **Trail store:** append `{ x, z, displayValue, rawHit, isWaterTruth }`; cap length / merge by grid cell for perf.
- [ ] **B.3** **Smoothing** (EMA) for display scalar; compute **prospect eligibility** boolean + strength.

---

## Phase C — HUD traverse map (optional in Tier 4)

- [ ] **C.1** `DanTraverseHud.vue`: plan-view path, **blue** colormap dots/segments, legend (min/max labels). **Defer to Tier 5.3** if shipping a minimal Tier 4.
- [ ] **C.2** Optional **stylized topo** background (procedural brown + contour fake or blurred height preview).
- [ ] **C.3** **Second channel** (green) — defer or stub behind flag.
- [ ] **C.4** Bind visibility: show when DAN on or “review mode” after session.

---

## Phase D — Prospect (Tier 4)

- [ ] **D.1** `ProspectButton` / panel section: visible iff **eligible** + DAN context.
- [ ] **D.2** Gate: **rover not moving** (`isMoving === false` or speed epsilon).
- [ ] **D.3** **Timer** 2h Martian → implement `PROSPECT_DURATION_SEC` constant per spec; progress UI.
- [ ] **D.4** On complete: write **anomaly center**, **quality**, **`waterTruth`** (hidden or log); persist **`prospectCompletedAwaitingDrop`** (or equivalent).
- [ ] **D.5 (Tier 4 only)** **Toast / banner:** inform player the **water extractor will arrive by drop chute once mission control runs the delivery** — **do not** spawn drop, mission object, or kit yet. That is **Tier 5.3**.

---

## Tier 5.3 — Phase E — Mission + drop + install **(post-sprint — not current sprint)**

See [later tiers plan](../../plans/gdd/2026-03-22-later-tiers-post-sprint.md).

- [ ] **E.1** Mission definition data: *Water extractor en route*; trigger when **5.3** content activates (player has `prospectCompletedAwaitingDrop` and mission framework assigns this beat — not automatically on same frame as D.5).
- [ ] **E.2** Spawn **drop marker**; pickup adds `hasWaterExtractorKit`.
- [ ] **E.3** **Install** at anomaly: UI prompt when in radius; consume kit; set `waterExtractorInstalled`.
- [ ] **E.4** **Demarcation** render: ring/decal/shader using stored center + radius.
- [ ] **E.5** **Passive tick:** `waterRate * reservoirQuality` → resource composable.

---

## Phase F — Polish

- [ ] **F.1** Instrument overlay **STATUS** live: ON/OFF, samples count, last peak.
- [ ] **F.2** Save/load trail + install state (localStorage or game save module).
- [ ] **F.3** Balance pass on polar vs volcanic sites using real `landmarks.json` values.

---

## Testing checklist

- [ ] DAN off: no particles, no power draw.
- [ ] Drive with DAN on: trail grows; rare blue spikes at Hellas-like sites vs Olympus-like.
- [ ] Threshold region: Prospect appears; driving cancels progress.
- [ ] Full chain: prospect → mission → drop → install → demarcation visible → water ticks up.

---

## Dependencies

- Power MVP done.
- Mission / drop framework (can stub mission with `alert` until epic lands).
