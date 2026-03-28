# MastCam & ChemCam gameplay — design

**Date:** 2026-03-22  
**Slots:** 1 (MastCam), 2 (ChemCam)  
**Depends on:** [rover-instrument-toolbar-design](./2026-03-22-rover-instrument-toolbar-design.md), `active` mode pattern from [APXS design](./2026-03-22-apxs-gameplay-inventory-design.md), [gdd-input-modes](./gdd-input-modes-design.md)

## Two instruments, two specs (same doc for convenience)

They are **not** the same tool or the same gameplay loop.

| Instrument | Job | Player fantasy |
|------------|-----|----------------|
| **MastCam** | **Passive survey / reconnaissance** | Find and **recognize** rocks from the mast: filter or browse by type (e.g. “show me basalt candidates”). Matching targets read as **survey highlights** — e.g. **wireframe shell**, outline, or translucent mesh over the rock so you see *which* boulders match before spending laser shots. Optional **IR / multispectral** channel (upgrade) nudges **mineral contrast** without vaporizing anything. |
| **ChemCam** | **Active standoff chemistry** | **Laser + spectrograph**: vaporize a tiny spot, read **elements**. Answers “**Is this rock chemically worth a SAM run or an APXS touch?**” — you get **composition detail** (and a stored readout) **before** committing drill powder, arm contact, or lab time. |

**Pipeline (cheap → expensive):** **MastCam** (identify / prioritize visually) → **ChemCam** (confirm elemental story at range) → **APXS / SAM** (contact or lab commitment). Power and ammo stay punitive on the right side of that chain ([GDD](../../../inspo/mars-rovers-gdd-v03.md)).

## Canonical copy (tool card — `InstrumentOverlay.vue`)

These strings are the **player-facing contract**; gameplay must support them or the card copy must be revised.

### Slot 1 — MastCam

| Field | Text |
|-------|------|
| **Name / type** | MASTCAM — SURVEY CAMERA |
| **Description** | Twin mast cameras for **wide-area survey** (visible + optional IR). Pick a **target lithology** (e.g. basalt) or sweep the field — **matching rocks are highlighted** (wireframe / outline) so you know what you are looking at **before** you spend laser or drill time. |
| **Power** | 3W |
| **Hint** | Choose survey mode, aim + hold [E] to **fix** a rock’s label on the compass. Scroll to zoom. Highlights update as you pan. |
| **Upgrade** | INFRARED / MULTISPECTRAL — Stronger **mineral contrast** in the survey view (still passive — no laser). (Requires: Science Pack Alpha drop) |

### Slot 2 — ChemCam

| Field | Text |
|-------|------|
| **Name / type** | CHEMCAM — LASER SPECTROGRAPH |
| **Description** | **Standoff chemistry:** laser vaporizes a pin spot; spectrograph reads **elemental** composition. Use this to judge **SAM** and **contact science** — get the numbers you need **before** you drill or drive the arm in. |
| **Power** | 12W |
| **Hint** | MastCam-tagged rock in range → [E] to fire **pulse train**; **wait** for spectrometer — full **spectrum result** opens when integration finishes (not instant). |
| **Temp** | Cold penalty — range reduced 20% |
| **Status (initial)** | 8/10 SHOTS (ammo + power budget fantasy per GDD) |
| **Upgrade** | MULTI-SHOT BURST — 3 shots on different spots for averaged reading. (Requires: Science Pack Alpha drop) |

## Science pipeline, then spend watts (core dynamic)

**Player loop:** **MastCam** (passive **identify** + **highlight** candidates) → **ChemCam** (**elemental** readout, **SAM / drill informed**) → **APXS** (contact) / **SAM** (lab). The game teaches power discipline: **survey is cheap**; **laser and lab work are costly** ([GDD](../../../inspo/mars-rovers-gdd-v03.md): MastCam **~3W** while scanning; ChemCam **12W** burst per shot; APXS **~6W** sustained).

| Action | Typical draw | Role |
|--------|----------------|------|
| **MastCam survey** | ~**3W** while fixing/tagging | **Classify** + **visual filter** (wireframe / outline for chosen type); sets `mastcamScanned` + compass POI. |
| **ChemCam shot** | **12W** during **pulse train** (+ optional lower W during **integration**) | **Standoff LIBS** — **pulses + plasma** at target, then **delayed** spectrometer processing; **spectrum UI** + peak labels — see [ChemCam laser & result UI spec](./2026-03-22-chemcam-laser-spectrograph-ui-design.md). |
| **APXS drill** | **~6W** sustained | Contact sample — only after you **know** what you are touching (MastCam min.; ChemCam feeds **chemistry** story). |
| **SAM** (later) | Heavy sustained | Should consume **ChemCam/APXS** context so the lab run is not blind. |

**Gating (authoritative):**

1. **ChemCam** — laser **only** on rocks that are **`mastcamScanned`** (crosshair green iff tagged + in range). You already **identified** the target with MastCam; ChemCam is the **second** step, not a duplicate of MastCam.
2. **APXS** — **require** `mastcamScanned` before drill (see [APXS design](./2026-03-22-apxs-gameplay-inventory-design.md)). **Optional Tier 4+:** warn or soft-gate if **`chemcamAnalyzed`** (or equivalent) is false when SAM pipeline is active — “get a laser readout before powdering this for SAM.”

**Optional later:** difficulty modes, partial data, or 1.25× drill time if unscanned — default remains **hard MastCam gate** for laser and drill.

## Shared `active` shell only (not shared gameplay)

- Extend the existing state machine: **`instrument` → ACTIVATE → `active`** for MastCam and ChemCam only after gameplay exists; set `canActivate = true` on each controller when ready.
- In **`active`**: rover movement locked; WASD may control **mast aim** (see below) or be unused v1; mouse drag orbits camera; **ESC** → instrument overlay.
- **Power** ([GDD](../../../inspo/mars-rovers-gdd-v03.md)): MastCam **~3W sustained** while a scan is in progress; ChemCam **12W burst ~3s** per shot. Wire through [useMarsPower](../../../src/composables/useMarsPower.ts) when extending the power composable (flags or registered loads).

## MastCam — gameplay (survey only)

### Intent

**Passive imaging:** the player **finds** and **labels** rocks from the mast. MastCam does **not** replace ChemCam — it does not output laser elemental tables. It **does** answer “**where is the basalt (etc.)**?” by **highlighting** candidates in the world and **locking** a compass tag when the player commits a scan.

### Survey modes

- **Lithology filter (MVP hook):** UI or key cycle: e.g. **ANY / BASALT / SEDIMENTARY / …** driven from [`RockTypes`](../../../src/three/terrain/RockTypes.ts) / `userData.rockType`. Rocks whose type **matches** the filter show a **persistent survey overlay** in MastCam `active` mode: **wireframe**, **rim outline**, or **translucent shell** (pick one style; must read clearly on regolith).
- **Center-target scan:** raycast **center** rock for **fixing** the tag and `mastcamScanned` (see below). Filter can still show **all** matching rocks in FOV for wayfinding.

### Targeting

- Raycast from camera through **screen center** (reuse [RockTargeting](../../../src/three/instruments/RockTargeting.ts): small rocks only, boulders policy TBD — large outcrops might be “survey only” without APXS).
- **Range:** **25–40m** LOS for recognition; tune from mast height.
- **Valid target:** shared rock list with APXS/ChemCam where sizes align.

### Scan interaction (tag + compass)

- **Hold [E]** on a rock under the reticle: **scan progress** ring (~1.5–2.5s MVP).
- On complete: **`userData.mastcamScanned = true`**, store **summary** (type label, interest tier) from `rockType` + rules table.
- **3W** only while progress advances.

### Zoom

- **Mouse wheel** in MastCam `active`: FOV or distance clamp — survey highlights scale with view.

### IR / multispectral (upgrade path)

- **Passive** channel: tweak highlight shader or add false-color **mineral hint** on highlighted meshes — still **no** laser, no ChemCam data. Gate behind drop / `INFRARED FILTER` upgrade.

### Compass tags

- Extend [SiteCompass.vue](../../../src/components/SiteCompass.vue): bearing ticks for **mastcamScanned** rocks.

### UI

- [InstrumentCrosshair.vue](../../../src/components/InstrumentCrosshair.vue): green/red + progress ring.
- Thin **readout strip**: target name, type, interest; optional **filter** indicator (“SURVEY: BASALT”).

### Deferred

- Full photo mode / SP rewards.
- Minimap POI density limits.

## ChemCam — gameplay

**Canonical detail (laser fidelity, plasma colors, phased delay, spectrum result UI):**  
[chemcam-laser-spectrograph-ui-design.md](./2026-03-22-chemcam-laser-spectrograph-ui-design.md)  
**Implementation checklist:** [chemcam-laser-results-implementation plan](../plans/2026-03-22-chemcam-laser-results-implementation.md)

### Intent

**Standoff LIBS-style** chemistry: **pulses** + short **integrate** beat (**~3–4 s** total to “ready”); **same toast stack as sample pickup** + **toolbar badge** on CHEM; **See results** opens the **spectrum** so you can **drill-or-drive** while still at the rock, or review the labeled target after moving.

### Prerequisites (card + power dynamic)

- **Require** **`userData.mastcamScanned`** before ChemCam crosshair is green / shot allowed. No unscanned laser on default difficulty.

### Targeting

- Raycast center; **≤ 7 m** from rover/mast; LOS clear.
- **Cold penalty:** when thermal exists, multiply max range by **0.8**; until then optional stub.

### Fire interaction (summary — see linked spec)

- **Tap [E]**: one **sequence** if valid target and `shotsRemaining > 0`.
- **Phases:** **`PULSE_TRAIN`** → **`INTEGRATING`** (short; see ChemCam spec timing) → **`READY`** (toast + badge + persist rock data) → **`RESULT_PANEL`** only via **See results** (not auto-blocking).
- **Power:** **~12 W** during laser activity; optional lower draw during integration (spec).
- **Cooldown** between sequences after shot reaches **READY** (~0.5–1 s minimum).

### Shots / status

- **`shotsRemaining` / `shotsMax`** on controller or composable; bind overlay **STATUS** (e.g. `5/10 SHOTS`).
- Align fantasy with ops pacing (~**dozen** quality observations per sol class) — tune `shotsMax` + integrate duration together.

### Deferred

- Multi-shot burst upgrade.
- PDAChem-style mini-game.
- Full LIBS physics / real wavelength libraries.

## File / ownership sketch

| Area | Likely files |
|------|----------------|
| Controllers | `MastCamController.ts`, `ChemCamController.ts` — `canActivate`, `handleInput`, `update`, targeting helpers |
| Shared | Optional `MastInstrumentTargeting.ts` or extend `RockTargeting` with range + LOS + “tagged only” predicate |
| View | `MartianSiteView.vue` — key E, wheel zoom MastCam, wire crosshair + readouts |
| UI | `ChemCamExperimentPanel.vue` (spectrum result) + integrate banner; optional `MastCamReadout.vue`; compass markers in `SiteCompass.vue` |
| Power | `useMarsPower.ts` — `mastcamScanning`, `chemcamBurst` inputs |

## Acceptance (playtest)

- Slot **1** / **2**: ACTIVATE → `active` → crosshair + interactions work; ESC back.
- MastCam: **filter** (or default ANY) shows **highlights** on matching rocks; hold **E** completes scan on one rock; compass shows its marker.
- ChemCam: only on **mastcamScanned** rock; **E** runs **pulse → integrate → READY** (toast + badge); spectrum via **See results**; **`chemcamAnalyzed`** at **READY**; power matches phase rules when sim wired.
