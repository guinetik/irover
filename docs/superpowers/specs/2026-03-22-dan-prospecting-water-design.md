# DAN prospecting, HUD, and water-extractor arc — design

**Date:** 2026-03-22  
**Slot:** 4 (DAN — Dynamic Albedo of Neutrons)  
**UX reference:** Traverse-style science maps like [inspo/dan.png](../../../inspo/dan.png) (dual colormap strips along path: e.g. water vs secondary channel).

## Roadmap split ([priority roadmap](../../plans/gdd/2026-03-22-priority-roadmap.md))

| Phase | Tier | Scope |
|-------|------|--------|
| **DAN mechanics + prospect + tease** | **Tier 4** (with other tools, after Tier 1–3) | Toggle, power, **particle stream**, sampling, **toast** on signal hit (“Hydrogen signal …”), **Prospect** button when eligible, stopped + timer → **toast/copy only**: e.g. *Water extractor approved — delivery will follow via drop chute once mission control assigns the run* (**no** real drop, **no** install, **no** demarcation, **no** passive water). Persist `prospectCompletedAwaitingDrop` (or similar) for Tier 5.3. |
| **Full extractor arc** | **Tier 5.3** (progression) | Mission briefing, **real drop**, kit pickup, **install**, **demarcated** zone, **passive water**. Full `dan.png`-style HUD can ship here if skipped in Tier 4. **Scheduled in** [later tiers plan](../../plans/gdd/2026-03-22-later-tiers-post-sprint.md) — **out of current sprint** (sprint ends Tier 4). |

## Goals

1. **DAN usable while driving** — neutron instrument runs during normal traversal (no full `active` lock like APXS); player toggles DAN **on/off** or holds policy “on until disabled.”
2. **Power** — Assume [useMarsPower](../../../src/composables/useMarsPower.ts) (or successor) is authoritative: **~10 W sustained** while DAN is active ([GDD](../../../inspo/mars-rovers-gdd-v03.md)).
3. **Readable fiction** — **Low** probability of a strong “hit”; **even lower** probability that a hit represents **real subsurface water** (instrument ambiguity / gameplay license). Maps can look compelling even when partly **stylized** (“BS-adjacent”) — player fantasy > hard simulation.
4. **Location bias from data** — Use [public/data/landmarks.json](../../../public/data/landmarks.json) (via current **site** / `GeologicalFeature`) to bias priors, especially **`waterIceIndex`** (0–1) and optionally `featureType`, `silicateIndex`, polar-adjacent lat.
5. **Prospect** — When local signal crosses a threshold, show **Prospect**; requires **rover stopped** ~**2 Martian hours** (see time scaling below).
6. **Mission + drop (Tier 5.3 only)** — Successful prospect (**Tier 4**) leaves player **ready**; when progression fires **5.3**, unlock the real **mission**: orbital drop delivers **water extractor** hardware.
7. **Install + demarcation (Tier 5.3)** — Player places / confirms install **on the surveyed anomaly**; **region is demarcated** on terrain (ring, decal, or shader mask).
8. **Passive yield (Tier 5.3)** — After install, **steady water** (or water-equivalent resource) flow scaled by **reservoir quality** (derived from prospect strength + site index).

---

## Canonical tool card (overlay)

From `InstrumentOverlay.vue` (slot 4): *Fires neutrons into the ground, detects hydrogen. Maps subsurface water content while driving. Paints a heatmap trail on the terrain.* Hint: *Toggle on, then drive. Blue = water signal. Ping rate shows intensity. Mark anomalies with [E].*

Implementation may phase **heatmap-on-terrain** after **HUD strip map** MVP.

---

## Mode: driving + DAN on

- **Default camera:** driving / orbit unchanged.
- **Input:** e.g. **[4]** selects DAN panel focus optional; separate **toggle** (key or toolbar) for **DAN ACTIVE** so slot selection ≠ neutron fire.
- **Movement:** full WASD; no `active` movement lock.
- **VFX:** Short **particle stream** from `DAN_L` (or both DAN nodes) **downward** to ground — raycast `heightAt(x,z)` for impact point; pool of streak/billboard particles; subtle pulse when a sample tick fires.

---

## Sampling model (landmark-driven, low hit rate)

### Site prior

When the rover site is a **geological** landmark, `useMarsData` / route `siteId` resolves to [GeologicalFeature](../../../src/types/landmark.ts):

| Field | Role |
|-------|------|
| `waterIceIndex` | Primary prior for hydrogen / ice story (scale 0–1). |
| `featureType` | Multiplier table (e.g. `polar-cap` >> `basin` > `plain` > `volcano`). |
| `silicateIndex` | Optional noise / false-positive modifier (chlorine / compositional channel later). |

**Landing-only sites** (no geo indices): use **default low prior** or infer from nearest geological region (implementation choice; default = conservative prior).

### Two-layer outcome (honest ambiguity)

Each sample tick (on a timer and/or distance moved):

1. **P(signal)** — Base rate **low** (order **0.5–3%** per tick tunable), multiplied by `f(waterIceIndex, featureType)` capped ~**3–5×** at ice-rich sites.
2. **Given signal, P(waterTruth)** — **Sub-multiple** (e.g. **20–40%** of hits are “real water” for fiction; rest are “hydrogen / hydration ambiguous” still shown on HUD as weaker or alternate color).

**Display rule:** HUD primarily shows **hydrogen proxy / water-equivalent** strength (blue scale) like the reference image; copy can say “subsurface H signal” in science panel to excuse mismatch.

### Spatial continuity

- Maintain **rolling window** of recent samples (last **N** points or **R** meters).
- **Smooth** displayed value (EMA) so the strip map isn’t pure noise.
- **Threshold for Prospect:** e.g. smoothed value > **T** for **M** consecutive samples while inside a **radius** of a local maximum (cluster detection optional MVP: “max in last 50 m”).

---

## HUD: traverse map (“the hood”)

**MVP layout** (inspired by dan.png, simplified for screen space):

- **Panel** docked (e.g. upper-right or bottom): **local grid** or **stretched strip** showing **rover path** in **plan view** (XZ projected).
- **Dots / segments** along path colored by **scalar field** (blue ramp: low → high), numeric legend ticks optional.
- **Second channel (defer):** green ramp (e.g. “chlorine / regolith” proxy) — second strip like reference; same path, different colormap.
- **Ping rate:** audio or small UI cadence tied to sample rate; stronger cadence when rolling signal high.

**Not required for MVP:** real lat/lon grid; Russian labels; MOLA backdrop — can be **stylized topo** (reuse minimap height preview or flat brown texture).

---

## Prospect interaction

| Rule | Detail |
|------|--------|
| **Visibility** | **Prospect** button appears only when **in anomaly zone** (threshold logic above) **and** DAN has been on recently. |
| **Motion** | Rover **speed ≈ 0** (gate in `RoverController` or site view). |
| **Duration** | **~2 Martian hours** in-fiction. |
| **Time scale** | Map to gameplay: `prospectDurationRealSec = MARTIAN_HOURS * (acceleratedSolRealSeconds / 24.616)` or fixed **60–120 s** real for first playable; **constant in code**, documented. |
| **Progress** | Linear bar + “prospect comms” text; interruptible on drive. |
| **Completion** | Sets flags: `prospectComplete`, `anomalyWorldCenter`, `anomalyQuality` (0–1), `waterTruth` boolean (hidden or science log). |

---

## Mission: water extractor drop

**Trigger:** `prospectComplete && waterTruth` (or relaxed: any strong prospect if you want more drops — design default **require real water** for extractor fantasy).

**Mission beat:**

1. Briefing: *Package staged for drop — water extractor assembly.*
2. **Drop chute** marker at offset from rover (reuse drop epic).
3. Player drives, collects, **install** interaction.

---

## Install + demarcation

- **Demarcated area:** Circle **radius R** around `anomalyWorldCenter` (or ellipse along drive corridor — harder). **Decal**, **ring mesh**, or **terrain shader uniform** (center + radius).
- **Placement mini-game (optional):** confirm facing / “lower mast” — can be single button **INSTALL** if timeboxed.
- **State:** `waterExtractorInstalled`, `reservoirQuality` (from prospect roll + site `waterIceIndex`).

---

## Passive water stream

- **Tick** (per sol or real-time): add **waterUnits += rate * delta * quality**.
- **Rate** table keyed by `reservoirQuality` bands (low / med / high).
- **UI:** small resource readout; ties into future life-support / crafting (out of scope here).

---

## Persistence

- Save: DAN trail (compressed polyline + values), flags, install state, quality.
- New session: restore demarcation and yield.

---

## Dependencies

- Power sim extended with **DAN sustained** flag.
- Mission framework ([epic-progression-missions](../../plans/gdd/epic-progression-missions.md)).
- Optional: new keys in `landmarks.json` (e.g. `danMultiplier`) if designers want per-site overrides without changing `waterIceIndex`.

---

## Out of scope (initial doc)

- Full PBR neutron physics, epithermal modeling.
- Multiplayer sync.
- Legal use of real DAN data products.
