# ChemCam — laser mechanics, plasma color, and experiment result UI

**Date:** 2026-03-22  
**Parent:** [MastCam & ChemCam gameplay](./2026-03-22-mastcam-chemcam-gameplay-design.md) (slot 2)  
**Implementation plan:** [2026-03-22-chemcam-laser-results-implementation.md](../plans/2026-03-22-chemcam-laser-results-implementation.md)

## Reference visuals (outreach + science slide)

Keep copies under repo **`inspo/`** (e.g. `inspo/chemcam-how-it-works.png`, `inspo/chemcam-spectral-result.jpg`) for art/UI alignment. Sources: NASA / mission “How does ChemCam work?” style diagram (laser path, pulses, spectrometer); Curiosity ChemCam spectral slide (multi-line plot, **Fe** / **Mn** peak labels, comparison spectra, target photo).

---

## Real instrument → game abstractions

| Real behavior | In-game representation |
|---------------|-------------------------|
| Laser is **IR** — **not visible** to human eye | **No** long glowing beam in-world. Player **aid**: optional **HUD bore-sight** or faint **teal/green guide** (clearly labeled “AIM ASSIST” or diegetic “RANGING LASER”) so gameplay stays readable. |
| **Series of pulses** at the rock | Short **pulse train** (several flashes at impact, ~50–150 ms apart) + brief **power draw** spikes aligned to pulses (or smoothed **12 W** envelope for MVP). |
| Impact produces **visible plasma flash** (element-dependent color) | **Spark** at hit: color **tinted** by dominant element / rock class (see table below). |
| Light returns to **mast telescope** → fiber → **body spectrometer** | No player micromanagement; use **INTEGRATING** phase copy: *“Body spectrometer processing…”* |
| Analysis is **not instant** | Short **integrate** beat so the player is still **at the rock** when they get feedback; **full spectrum** opens **on demand** (see below) so driving away does not lose “what was I shooting?” |
| Result is a **spectrum** (intensity vs wavelength), peaks = elements | **Experiment result panel** = simplified **line plot** + **peak labels** — opened via **See results**, not a forced modal the instant processing ends. |

---

## Time budget (gameplay priority)

The player is **parked in front of the target** deciding **drill or drive**. If integration drags, they leave — then the **spatial link** to “which rock was that?” is gone.

**Default targets (tune in code):**

| Phase | Duration (guideline) |
|-------|----------------------|
| **PULSE_TRAIN** | **≈0.6–1.2 s** |
| **INTEGRATING** | **≈1.5–2.5 s** gameplay default — enough to feel like instrument work, not a minigame wait |
| **Toast + badge** | Immediate when integrate completes |

**Total** from **[E]** to **“results ready”** feedback: aim **≤ ~3–4 s** so they are usually **still beside the rock**. Longer modes belong in **hard / simulation** options only.

**If they drive away early:** processing still completes in the background; **toast + toolbar badge** + **See results** carry the payload (**rock id + MastCam label** on the readout) so the spectrum panel always names the correct target.

---

## Phase state machine (authoritative)

ChemCam `active` shot is **not** “fire → blocking modal.” Use explicit phases:

```text
ARMED
  │  [E] valid target, shots > 0
  ▼
PULSE_TRAIN     (≈0.6–1.2 s)   — pulses + impact flashes + laser power window
  ▼
INTEGRATING     (≈1.5–2.5 s)  — compact banner / mast readout; player can cancel aim but sequence continues
  ▼
READY           — persist spectrum data on rock + queue **unread readout**; fire **toast**; set **ChemCam toolbar badge**
  ▼
IDLE            — player may drive; open spectrum when convenient
  │
  │  User opens ChemCam (instrument or overlay) + taps SEE RESULTS
  ▼
RESULT_PANEL    — full spectrum view + element callouts; ACK clears **unread** for this readout (badge off if queue empty)
```

**Do not** auto-open a full-screen graph the frame integrate ends unless a future accessibility toggle requests it — default is **toast + badge + See results** so flow matches **inventory pickup** (notify, then inspect when ready).

**Power (`useMarsPower`):**

- **MVP:** **12 W** for full **`PULSE_TRAIN` + `INTEGRATING`** window (simplest single flag `chemcamSequenceActive`).
- **Better:** **12 W** during **pulses only**, **~2–4 W** during **integrating** (“instrument idle draw”) — matches fiction of laser off but DSP on.

---

## Results ready — toast, badge, See results (inventory parity)

**Toast:** When entering **READY**, show a notification using the **same component and chrome** as the sample pickup toast ([`SampleToast.vue`](../../../src/components/SampleToast.vue)): same stack position, `.sample-toast` styling, dot + label. **Extend** the component (or a thin `ScienceToast` wrapper) so ChemCam can show e.g. **`CHEMCAM`** line + **rock label** / one-line summary **without** a kg weight row — still reads as the same “drop” language as **+ sample** toasts.

**Toolbar badge:** Slot **2** (**CHEM**) shows a small **notification dot** (or numeric badge if multiple unread) while **`unreadChemCamReadouts.length > 0`**. Cleared when the player opens the **RESULT_PANEL** for that readout (or “mark all read” if you batch).

**See results:** When ChemCam is **selected** (`instrument` or `active` overlay), if there is at least one **unread** readout, show a primary **SEE RESULTS** control next to **ACTIVATE** (or above it) in [`InstrumentOverlay.vue`](../../../src/components/InstrumentOverlay.vue). It opens **`ChemCamExperimentPanel`** for the **latest** or a **picker** if multiple queued.

**Readout payload (store in composable or controller):** `rockId` / mesh uuid, **`mastcamLabel`** (or `rockType` display name), `timestamp`, spectrum blob + flags — so **RESULT** header is correct even if the rover has moved.

---

## Plasma / flash colors (element fingerprints)

Use for **impact VFX** and **RESULT** panel **accent** (borders, peak highlights). Not exhaustive — map from `rockType` / generated composition.

| Signature (game) | Plasma / UI accent | Notes |
|------------------|-------------------|--------|
| Aluminum-rich | Cool **blue-white** | Outreach infographic |
| Copper-bearing (rare gameplay tag) | **Green** | Outreach infographic |
| Basaltic / Si-rich | **Magenta / purple-pink** | Outreach infographic |
| Iron-heavy | **Orange-yellow** spark | Common Martian rocks |
| **Manganese** detection (special roll/tag) | **Pink–magenta** peak + caption | Spectral slide “Mn-rich phases”; unlocks science flavor text |

**SAM suitability:** if readout shows **Mn-rich**, **hydration proxy**, or **Si + Fe** baseline, set `userData.chemcamElementSummary` + flags consumed by SAM/APXS docs.

---

## Experiment result screen (spectral slide fidelity)

**Layout (dark, mission-lab aesthetic):**

1. **Header** — **rock label from readout payload** (MastCam tag / type) + “CHEMCAM LIBS — SOL N” — must not depend on current crosshair.
2. **Hero plot** — **multi-line** optional (this shot = bright; ghost = calibration or “previous site average” stub). **Y:** relative intensity (0–1 or small float). **X:** wavelength **nm**, **narrow band** for MVP (e.g. **380–450** or **400–440** like slide) **or** fictional index — **must** read as spectroscopy, not a bar chart.
3. **Peak labels** — `Fe`, `Mn`, `Si`, `Mg`, … placed near local maxima (hand-tuned per rock template or procedural bump placement).
4. **Callout** — optional zoom inset (black box) on one peak pair for “discovery” moment.
5. **Science blurb** — one line from template: e.g. *“Mn enrichment suggests strongly oxidizing conditions”* when Mn flag set.
6. **Actions** — `ACK` / `STORE` closes panel, marks readout **read**, updates badge; rock `userData` already persisted at **READY**.

**Animation:** during **INTEGRATING**, light **sweeping baseline** or thin progress (keep **subtle** — short phase). When **RESULT_PANEL** opens from **See results**, **draw peaks** over **~0.5–1.0 s**.

---

## Interaction recap

- **Range:** **≤ 7 m** (unchanged).
- **Prerequisite:** `mastcamScanned` (unchanged).
- **Shots:** decrement at **start of `PULSE_TRAIN`** (commit on fire) or at end of **RESULT** — pick one rule; recommend **on fire** to prevent spam-cancel.

---

## Out of scope (later)

- Full physics LIBS simulation, real wavelength databases.
- Multi-shot burst upgrade (separate spec).
- PDAChem mini-game.

---

## Acceptance

- **READY** fires within **~3–4 s** of **[E]** (default tuning); **toast** matches **SampleToast** look; **CHEM** toolbar shows **badge**.
- ChemCam overlay shows **SEE RESULTS** when unread queue non-empty; panel shows correct **rock label** after driving away.
- Pulse train + colored flash read clearly at 7 m.
- Result panel shows **line spectrum** + **≥2 labeled peaks** + persists `chemcamAnalyzed` + summary on rock.
