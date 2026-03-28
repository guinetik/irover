# ChemCam — laser VFX + delayed spectrum result (implementation plan)

**Date:** 2026-03-22  
**Spec:** [2026-03-22-chemcam-laser-spectrograph-ui-design.md](../specs/2026-03-22-chemcam-laser-spectrograph-ui-design.md)  
**Code today:** [`ChemCamController.ts`](../../../src/three/instruments/ChemCamController.ts) (skeleton only)

## Goals

1. **Phase machine:** **PULSE_TRAIN → INTEGRATING → READY → (player) RESULT_PANEL** — no forced full-screen graph on READY.
2. **Laser:** invisible IR in-world; **HUD assist line** optional; **pulsed** impact flashes; **element-tinted** plasma color.
3. **Short loop:** integrate **~1.5–2.5 s** default; **toast + badge** on READY; **See results** opens spectrum.
4. **Result UI:** `ChemCamExperimentPanel.vue` — **line spectrum**, header from **readout payload** (rock label survives driving away).
5. **Power:** wire `chemcamSequenceActive` / phase-aware W into [`useMarsPower`](../../../src/composables/useMarsPower.ts) when Tier 2 aggregation exists.

## Tasks (ordered)

- [ ] **C.1** Extend `ChemCamController` (or `useChemCamReadout()` composable) with phase enum, timers, `shotsRemaining`, **readout queue** (`rockId`, label, spectrum data, `read: boolean`).
- [ ] **C.2** `MartianSiteView`: on **E**, validate range + `mastcamScanned`, run **PULSE_TRAIN** → **INTEGRATING** → **READY**; block new shot until **IDLE**.
- [ ] **C.3** VFX: pulse flashes at hit point (pool); optional HUD-only aim assist from mast to target.
- [ ] **C.4** **INTEGRATING** UI: compact banner + progress; constant **~2 s** default (see spec — not 6 s).
- [ ] **C.5** **READY:** persist on rock `userData`; push unread readout; call **toast** API (extend [`SampleToast.vue`](../../../src/components/SampleToast.vue) with a **ChemCam line** variant — same `.sample-toast` stack, no kg field).
- [ ] **C.6** [`InstrumentToolbar.vue`](../../../src/components/InstrumentToolbar.vue): prop `chemCamUnreadCount` (or boolean) → **badge** on slot 2.
- [ ] **C.7** [`InstrumentOverlay.vue`](../../../src/components/InstrumentOverlay.vue): when slot **2** selected and queue non-empty, **SEE RESULTS** button → opens panel for latest (or list).
- [ ] **C.8** **ChemCamExperimentPanel:** spectrum SVG/Canvas; **ACK** marks read, clears badge when queue empty.
- [ ] **C.9** Audio optional: pulse ticks + ready chirp.
- [ ] **C.10** Reference art in **`inspo/chemcam/`**.

## Verification

- Fire → pulses → **~2 s** integrate → **toast** appears → **CHEM** badge → drive away → open ChemCam → **SEE RESULTS** → header shows **original rock** + spectrum.
- `npm run build`.

## Dependencies

- MastCam `mastcamScanned` gating (existing design).
- Tier 2 power registration when instrument load API lands; until then local flag in `tickPower` input is fine.
