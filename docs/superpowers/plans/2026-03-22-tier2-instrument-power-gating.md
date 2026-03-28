# Tier 2 — Instrument draw integration & battery alerts (plan)

**Date:** 2026-03-22  
**Roadmap:** [2026-03-22-priority-roadmap.md](../../plans/gdd/2026-03-22-priority-roadmap.md) **Tier 2**  
**Depends on:** [gdd-power-simulation-mvp-design.md](../specs/gdd-power-simulation-mvp-design.md), [2026-03-22-tier1-battery-power-hud.md](./2026-03-22-tier1-battery-power-hud.md)  
**GDD:** [inspo/mars-rovers-gdd-v03.md](../../../inspo/mars-rovers-gdd-v03.md) — consumption table, HUD battery colors, **LOW POWER / NO POWER** action slots

## Intent

Make **`useMarsPower`** the **single authority** for both **simulation** and **UI eligibility**: every instrument **declares** how many watts it draws and **when**; the tick sums those draws into `consumptionW`. Separately, the **persistent HUD** and **toolbar slots** surface **battery stress** (SOC bands) and **per-tool power state** (available / low / blocked) so players learn the GDD loop: *“I have 8 shots but only enough power for 5 before I go yellow.”*

---

## 1. Instrument draw integration (roadmap **2.1**)

### 1.1 GDD reference — nominal draws (tune in code constants)

| System | W | When on | Sprint note |
|--------|---|---------|-------------|
| Core / life support | 8 | Always | Already in `useMarsPower` |
| Drive | 5 | While moving | Already in `tickPower` input |
| MastCam | 3 | MastCam **active** mode | Tier 4 |
| ChemCam | 12 | **Per shot** (burst ~3 s GDD) | Tier 4 — plan as spike + average option |
| APXS | 6 | Drill / analysis sustained | Today: `apxsDrilling` only |
| DAN | 10 | While scanning (sustained) | Tier 4 |
| SAM | 25 | Drill + analysis (heavy) | Tier 4 stub |
| REMS / RAD | 2 each | Passive when unlocked | Post-sprint unless stubbed |
| RTG (slot 6) | 0 | Special — overdrive / cooldown, not science bus load | Keep outside this table |

**Rule:** Any new instrument **must** contribute to `consumptionW` through the same path so the HUD **net** and toolbar **never disagree** with the sim.

### 1.2 Code shape (recommended)

**Problem today:** `tickPower` takes ad-hoc booleans (`apxsDrilling`). That will not scale to six tools + bursts.

**Target pattern:**

1. **`InstrumentController`** (or a tiny `PowerLoadContributor` interface) defines:
   - `getPowerDrawW(): number` — non-negative watts **this frame** (0 when instrument idle / not selected).
   - Optional: `getNominalActiveW(): number` — for **gating** UI (steady or peak label).
   - Optional: `getPowerGateProfile(): { sustainedW: number; burstW?: number; burstSeconds?: number }` for ChemCam-style tools (implement when ChemCam lands).

2. **`RoverController`** (or `MartianSiteView` after `controller.update`) computes:
   - `instrumentLoadW = sum(instrument.getPowerDrawW())` for all attached instruments, **or** only “active” instruments per product rule (GDD: MastCam draws **while in MastCam mode** — typically the **selected** instrument in active mode, not all slots at once).

   **Clarification for planning:** Loads apply for:
   - **Driving:** core + drive only (+ passives when implemented).
   - **Instrument selected + active mode:** core + drive_if_moving + **that instrument’s** draw (APXS drill, MastCam survey, DAN beam on, etc.).
   - **ChemCam:** during burst window, add burst W even if short.

3. **`useMarsPower.tickPower(delta, { nightFactor, roverInSunlight, moving, instrumentLoadW })`**  
   - Replace per-instrument booleans with one **`instrumentLoadW: number`** (computed externally).
   - `consumptionW = CORE_W + (moving ? DRIVE_W : 0) + instrumentLoadW`.

4. **Migration step:** First refactor APXS into `instrumentLoadW` via `APXSController.getPowerDrawW()` (drill active only), then delete `apxsDrilling` from `PowerTickInput`.

### 1.3 Toolbar / overlay — LOW POWER vs NO POWER (GDD § action slots)

GDD language:

- **LOW POWER:** Amber — player **can** activate; action **warns** it will tax the battery.
- **NO POWER:** Red — **cannot** sustain; slot **dimmed**; hotkey shows **INSUFFICIENT POWER** (toast or flash).

**Proposed eligibility (MVP — document constants next to `useMarsPower`):**

| State | Meaning (player) | Suggested rule (implement & tune) |
|-------|------------------|-----------------------------------|
| **AVAILABLE** | Green / neutral | `surplusW >= sustainedW` **or** battery can cover deficit for a minimum “science window” |
| **LOW** | Amber | `surplusW < sustainedW` but `batteryWh > lowSocThresholdWh` (e.g. ≥ **20%** capacity — aligns with GDD yellow band) |
| **NO** | Red / disabled | `batteryWh <= noPowerSocThresholdWh` **or** `(surplusW < sustainedW && batteryWh < minBufferWh)` |

Where:

- `surplusW = generationW - CORE_W - (moving ? DRIVE_W : 0)` (before adding the candidate instrument).
- `sustainedW` = that tool’s **nominal** active draw (APXS 6, MastCam 3, …). For **ChemCam**, use **burst** W for NO check if a shot is in progress; for idle “can I fire?”, use **12 W** vs surplus + **energy buffer** in Wh (optional v2).

**RTG cooldown / overdrive:** If instruments are **locked** by `RTGController` phase, treat as **NO POWER** (or dedicated **LOCKED** styling) — same dim + message, different reason string (“RTG COOLDOWN” vs “INSUFFICIENT POWER”).

### 1.4 UI work

| Surface | Change |
|---------|--------|
| `InstrumentToolbar` | Per-slot class: `power-ok` / `power-low` / `power-none` / `power-locked`; optional small **W** badge from `nominalActiveW`. |
| `InstrumentOverlay` | Line for **draw** + state text (“~6 W · LOW POWER” / “INSUFFICIENT POWER”). |
| `MartianSiteView` | Pass `powerStates: Record<slot, PowerSlotState>` or computed per slot from `useMarsPower` + controller. |
| Activation guard | `RoverController.activateInstrument(slot)` or view wrapper: if **NO**, flash toast and **no-op**; if **LOW**, allow with optional confirm later (MVP: allow + warn only). |

---

## 2. Battery alerts (roadmap **2.2**)

### 2.1 HUD SOC bands (GDD power panel)

Align **`PowerHud`** fill and optional border with GDD:

| SOC (`batteryWh / capacityWh`) | Color | Notes |
|--------------------------------|-------|--------|
| **> 50%** | Green family | Comfortable |
| **20% – 50%** | Amber / orange | Caution |
| **< 20%** | Red | Matches GDD “yellow alert” threshold on SOC (<20%) |

**Note:** GDD also names **YELLOW ALERT** as a **mode** (speed limit, MastCam-only) — that is **broader gameplay**. Tier 2 **minimum** is **visual** on the battery strip + optional **subtle pulse** under 20%. **Speed / instrument restrictions** for yellow alert can ship in the same tier if small, or defer to **Tier 3** thermal / later traversal with an explicit follow-up row in the roadmap.

### 2.2 Net flow emphasis

Keep **signed net W** as today; optional **pulse** when `netW < 0` and SOC in amber/red (GDD: *“the moment it goes red at night”*).

### 2.3 Blackout (informational only in Tier 2)

GDD **blackout** = consequence, not instant game-over. **Tier 2** can treat `batteryWh === 0` as:

- HUD **full red** + “BUS DEPLETED” micro-copy; and/or
- **Block** new instrument activations until `batteryWh > 0` again (charging from RTG).

Full **reboot mini-game** stays **out of scope** unless explicitly pulled in.

---

## 3. Definition of done — Tier 2

| # | Item | Done when |
|---|------|-----------|
| 2.1a | **Single draw pipeline** | `consumptionW` includes **summed instrument draws** via shared API; APXS migrated off `apxsDrilling` boolean. |
| 2.1b | **Slot states** | Toolbar + overlay show **AVAILABLE / LOW / NO** (and **LOCKED** when RTG says so) with GDD-aligned behavior on activate. |
| 2.2 | **Battery alerts** | `PowerHud` uses **green / amber / red** SOC bands; optional low-SOC pulse; `batteryWh === 0` handled distinctly. |

---

## 4. Verification

- Day + high solar: heavy tool shows AVAILABLE; net positive possible.
- Night + low solar: same tool moves to LOW then NO as SOC drops; activation blocked only on NO.
- APXS drilling increases `consumptionW` by 6 and matches HUD net.
- RTG cooldown: instruments blocked with clear copy.
- `npm run build`.

---

## 5. Out of scope (later tiers)

- Dust storms, mission-modified `capacityWh` / `solarPeakW`.
- Full **yellow alert** gameplay (50% speed, MastCam-only) — confirm in roadmap when implementing; may overlap **Tier 3** thermal.
- ChemCam **ammunition + power** combined UI — [mastcam-chemcam spec](../specs/2026-03-22-mastcam-chemcam-gameplay-design.md) when **Tier 4** ships.

---

## Related files (implementation touchpoints)

- [`src/composables/useMarsPower.ts`](../../../src/composables/useMarsPower.ts) — `tickPower` signature, thresholds export.
- [`src/three/instruments/InstrumentController.ts`](../../../src/three/instruments/InstrumentController.ts) — draw API.
- [`src/three/RoverController.ts`](../../../src/three/RoverController.ts) — aggregate loads, activation guard hook.
- [`src/components/InstrumentToolbar.vue`](../../../src/components/InstrumentToolbar.vue), [`src/components/InstrumentOverlay.vue`](../../../src/components/InstrumentOverlay.vue), [`src/components/PowerHud.vue`](../../../src/components/PowerHud.vue), [`src/views/MartianSiteView.vue`](../../../src/views/MartianSiteView.vue).
