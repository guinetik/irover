# DAN Tier 4 — implementation design

**Date:** 2026-03-23
**Slot:** 4 (DAN — Dynamic Albedo of Neutrons)
**Parent spec:** [2026-03-22-dan-prospecting-water-design.md](./2026-03-22-dan-prospecting-water-design.md)
**Roadmap ref:** [priority-roadmap § Tier 4.3](../../plans/gdd/2026-03-22-priority-roadmap.md)

## Scope — Tier 4 only

Ships: toggle, power draw, particle VFX, sampling, toasts, SP rewards, prospect interaction, cone marker, DAN dialog with placeholder graphic.

Deferred to Tier 5.3: strip map HUD, drop chute mission, extractor hardware, demarcated zone shader, passive water yield.

---

## 1. Activation flow

```text
Press [4]  -->  Camera orbits to DAN node, overlay shows tool description
               "Activate" button in overlay
                    |
               Click Activate  -->  Label flips to "Turn Off"
                                    Neutron stream starts (10W draw)
                    |
               Press [Esc]  -->  Back to driving mode
                                 DAN stays active in background
                                 Toolbar slot 4 shows persistent badge icon
                    |
               Press [4] again  -->  Can view DAN panel, click "Turn Off"
```

### Activation semantics

DAN sets `canActivate = true` but **does not lock movement** on activation — unlike APXS/ChemCam which enter a movement-locked `active` mode. DAN's "active" means "toggled on, sampling in background." The overlay button cycles: **ACTIVATE** (when off) → **TURN OFF** (when on), rather than the one-shot activate pattern used by other instruments. The `InstrumentOverlay` needs to handle this toggle label for slot 4.

### Toolbar badge

When DAN is active and the player is not viewing slot 4, the toolbar shows a small persistent indicator on the DAN slot — a pulsing dot or neutron icon. Similar to ChemCam's shot-count badge but iconic rather than numeric.

---

## 2. Power

**10W sustained** while DAN is active. Constant draw — no phased power like ChemCam.

- Exposed via `powerDrawW` getter on `DANController` (0 when off, 10 when on)
- **Pattern break:** unlike MastCam/ChemCam which only draw power when they are the active instrument, DAN draws power whenever toggled on regardless of which slot is selected. The `instrumentW` calculation in `MartianSiteView.vue` must add DAN's draw unconditionally (similar to how `heaterW` is a separate always-on term on `PowerTickInput`). Add a `danW` field to `PowerTickInput`, or sum DAN draw into `instrumentW` outside the active-slot conditional.
- DAN draw persists across mode changes (driving, instrument view, other tool selected) — it only stops when explicitly turned off or rover enters sleep mode

---

## 3. Particle stream VFX

**Visible only when DAN slot is selected** (instrument view). Not shown during driving to keep the view clean.

- Particle stream from `DAN_L` node downward to ground
- Raycast or `heightAt(x, z)` for ground impact point
- Short streak/billboard particles, subtle pulse on sample tick
- Additive blending, blue-tinted (hydrogen/water theme)
- ~20-30 particles, recycled ring buffer

---

## 4. Sampling model

### Tick rate

- **One sample every ~3 seconds** while DAN is active and rover is moving (distance-gated: must have moved >0.5m since last sample)
- Stationary rover: sample every ~5 seconds (slower, DAN is a traverse instrument)

### Hit probability

Each sample tick rolls against:

```
P(hit) = BASE_RATE * siteMultiplier * featureMultiplier
```

| Constant | Value |
|----------|-------|
| `BASE_RATE` | 0.02 (2% per tick) |

**siteMultiplier** from `waterIceIndex` (0–1) in `landmarks.json`:

| waterIceIndex | Multiplier |
|---------------|------------|
| 0.0–0.1 | 1.0 (base) |
| 0.1–0.3 | 1.5 |
| 0.3–0.5 | 2.5 |
| 0.5–0.8 | 3.5 |
| 0.8–1.0 | 5.0 |

**featureMultiplier** from `featureType` (matches `GeologicalFeature.featureType` union):

| featureType | Multiplier |
|-------------|------------|
| `polar-cap` | 3.0 |
| `canyon` | 1.5 |
| `basin` | 1.5 |
| `plain` | 1.0 |
| `volcano` | 0.5 |

Landing-only sites (no geo indices): default `waterIceIndex = 0.1`, `featureMultiplier = 1.0`.

### On hit

- Toast: "Hydrogen signal detected" (+ signal strength qualifier)
- **+100 SP**
- Hit is stored: `{ worldPosition, signalStrength, timestamp }`
- **"Prospect" button** appears next to Activate in the DAN overlay (like ChemCam's "See Results")
- Only one pending hit at a time — new hit replaces old if not yet prospected. Toast: "New hydrogen signal — previous marker updated" so the player knows. If a blue disc was already placed (Prospect pressed), it moves to the new location.

### Signal strength

Each hit rolls a strength value (0.3–1.0), biased by `waterIceIndex`:

```
strength = clamp(0.3 + random() * 0.5 + waterIceIndex * 0.15, 0.3, 1.0)
```

Note: the `waterIceIndex` coefficient is 0.15 (not 0.3) so that Weak signals remain possible even at ice-rich sites. At `waterIceIndex=1.0`: range is [0.45..0.95], so Weak is still reachable. This strength determines the prospect quality and water probability.

---

## 5. Prospect interaction

### Step 1 — Press Prospect

- **Prospect button** visible in DAN overlay when a hit exists
- Clicking Prospect:
  - Opens **DAN Dialog** (see section 7)
  - A **blue disc** (CircleGeometry + MeshBasicMaterial, emissive blue, semi-transparent) appears on the terrain at the hit's world position
  - Disc radius: ~5m game units

### Step 2 — Drive to the zone

- Player exits overlay, drives to the blue disc
- When rover enters the disc area (distance from center < 5m):
  - An **inverse progress bar** appears (fills downward / counts down) — label: "Initiating DAN Prospecting"
  - If rover leaves the area, progress resets

### Step 3 — Prospecting timer

- When inverse progress bar completes (~3-5 real seconds, short approach confirmation):
  - Rover **auto-stops** (movement locked)
  - A **progress bar appears under the compass** — "Prospecting subsurface..."
  - Duration: **2 Martian hours** scaled to real time
    - Formula: `durationRealSec = (120 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION`
    - With current constants: `(120 / 1477) * 180 ≈ 14.6 real seconds`
    - Exposed as `const PROSPECT_DURATION_MARS_HOURS = 2` — tunable if 14.6s feels too short in playtesting
  - Player can look around but cannot drive
  - **Sleep mode safety:** if sleep triggers during prospecting (battery drops below 5%), the prospect is cancelled, rover is unlocked, DAN is turned off. Toast: "Prospect interrupted — insufficient power."

### Step 4 — Completion

- Toast notification with results
- **+100 SP** for completing the prospect
- **Water probability roll** (see section 6)
- Blue disc fades out
- Rover movement unlocked

---

## 6. Water roll

Prospect quality is derived from signal strength:

| Quality | Strength range | Water chance | Toast copy |
|---------|---------------|--------------|------------|
| **Weak** | 0.3–0.5 | 15% | "Marginal hydrogen — mineral-bound likely" |
| **Moderate** | 0.5–0.7 | 40% | "Significant subsurface hydrogen detected" |
| **Strong** | 0.7–1.0 | 70% | "Strong ice-consistent anomaly confirmed" |

Water chance is further biased by `waterIceIndex`:

```
finalChance = baseChance * (0.5 + waterIceIndex)
```

So a strong signal (70% base) at an ice-rich site (waterIceIndex=0.8) → `70% * 1.3 = 91%`. A weak signal at a volcanic site (0.1) → `15% * 0.6 = 9%`.

### If water confirmed

- **+100 SP bonus**
- Toast: "Subsurface ice confirmed — marking drill site"
- A **gray cone** (ConeGeometry, ~0.3m tall, gray material) is placed at the hit position on the terrain — this is the pilot drill marker for Tier 5.3 extractor hookup
- Persist state: `drillSitePosition`, `reservoirQuality` (= signal strength), `waterConfirmed = true`

### If no water

- Toast: "Analysis inconclusive — hydrogen likely mineral-bound. Continue surveying."
- No cone placed
- DAN can generate new hits going forward

---

## 7. DAN Dialog

Opened when pressing Prospect or reviewing results. Layout:

- **Left panel**: `dan.png` reference image as a static placeholder graphic (the traverse strip map visualization — placeholder until Tier 5.3 builds the real one)
- **Right panel**: live gameplay data
  - Signal strength (bar + percentage)
  - Prospect quality (Weak / Moderate / Strong)
  - Site water ice index
  - Samples taken count
  - Status: "Pending" / "Prospecting..." / "Complete — Water confirmed" / "Complete — Inconclusive"

---

## 8. SP rewards summary

| Event | SP | Condition |
|-------|-----|-----------|
| Signal hit | +100 | Each hit while driving |
| Prospect completed | +100 | Finished the 2h prospect timer |
| Water confirmed | +100 | Water roll succeeds |

---

## 9. State persistence (for Tier 5.3 handoff)

Flags to persist (localStorage or save system):

```typescript
interface DANPersistState {
  /** Whether DAN has completed at least one prospect */
  prospectComplete: boolean
  /** World position of placed drill cone (if any) */
  drillSitePosition: THREE.Vector3 | null
  /** 0–1 quality derived from signal strength */
  reservoirQuality: number
  /** Whether the water roll succeeded */
  waterConfirmed: boolean
  /** Total samples taken this session */
  totalSamples: number
  /** Total hits this session */
  totalHits: number
}
```

Tier 5.3 reads `prospectComplete && waterConfirmed` to trigger the extractor drop mission.

**Blue disc** is ephemeral (not persisted). On reload, the disc is gone — player would need a new hit to place another. The gray cone (if placed) is persisted via `drillSitePosition` and restored on load.

---

## 10. Files to create / modify

### New files

| File | Purpose |
|------|---------|
| `src/components/DANDialog.vue` | Prospect dialog with dan.png placeholder + live data |
| `src/components/DANProspectBar.vue` | Progress bar under compass during prospecting |

### Modified files

| File | Changes |
|------|---------|
| `src/three/instruments/DANController.ts` | Full implementation: toggle, power, sampling, VFX, hit/prospect state |
| `src/views/MartianSiteView.vue` | DAN power draw in tick, prospect flow orchestration, cone placement, progress bar |
| `src/components/InstrumentOverlay.vue` | Prospect button next to Activate for slot 4, Turn Off label toggle |
| `src/components/InstrumentToolbar.vue` | Persistent badge on slot 4 when DAN active |
| `src/components/SampleToast.vue` | New `showDAN(message, strength?)` method for DAN-specific toasts |

---

## 11. Dependencies

- `useMarsPower` — `instrumentW` accumulation (existing)
- `useSciencePoints` — SP grant API (existing)
- `MarsSky.SOL_DURATION` and `MARS_SOL_CLOCK_MINUTES` — prospect timer scaling
- `SiteScene` — terrain height for particle ground impact + blue disc placement
- `RoverController` — `isMoving`, position, movement lock during prospect
- `landmarks.json` — `waterIceIndex`, `featureType` for sampling priors
