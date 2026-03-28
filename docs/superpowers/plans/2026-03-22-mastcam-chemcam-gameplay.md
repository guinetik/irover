# MastCam & ChemCam gameplay — implementation plan

> **Goal:** Implement **distinct** `active` gameplay: **MastCam** = passive survey + lithology highlights + compass tag; **ChemCam** = **pulse laser + integration delay + spectrum result UI** + data persisted for **SAM**/drill decisions — [mastcam/chemcam spec](../specs/2026-03-22-mastcam-chemcam-gameplay-design.md), [ChemCam laser/UI spec](../specs/2026-03-22-chemcam-laser-spectrograph-ui-design.md), [ChemCam impl plan](./2026-03-22-chemcam-laser-results-implementation.md), aligned with `InstrumentOverlay.vue`.

**Spec:** [docs/superpowers/specs/2026-03-22-mastcam-chemcam-gameplay-design.md](../specs/2026-03-22-mastcam-chemcam-gameplay-design.md)

---

## Phase 0 — Shared prep

- [ ] **0.1** Implement **`requiresMastcamTag`** (or equivalent) in shared targeting: ChemCam and APXS use **scan-before-spend** — no laser/drill on unscanned rocks (see spec **Scan first**).
- [ ] **0.2** Add shared helper or extend `RockTargeting`: configurable **max range**, optional filter `requiresMastcamTag`, optional **ray origin** (rover vs mast node world position).
- [ ] **0.3** Ensure small-rock raycast list still excludes boulders; align with `TerrainGenerator.getSmallRocks()`.

---

## Phase 1 — MastCam

- [ ] **1.1** `MastCamController`: `override canActivate = true`; fields for scan progress, target rock ref; `handleInput` / `update` for hold-to-scan on **KeyE**.
- [ ] **1.2** Integrate targeting (center ray, MastCam range constant); green/red crosshair state; grace cancel on lost target.
- [ ] **1.3** On scan complete: set `userData.mastcamScanned` + derived label/interest from `userData.rockType` (table in controller or `RockTypes.ts` helper).
- [ ] **1.4** **Wheel zoom** in MastCam `active` only: adjust instrument camera distance or camera FOV (no conflict with driving).
- [ ] **1.5** `useMarsPower`: flag **`mastcamScanning`** while progress advancing (~3W) — extend `tickPower` input.
- [ ] **1.6** `MartianSiteView` / `InstrumentCrosshair`: show MastCam crosshair + ring when `mode === 'active' && mastcam`.
- [ ] **1.7** **SiteCompass:** add props or inject store for **scanned rock bearings**; render markers on strip (MVP: dots at computed offset from heading).
- [ ] **1.8** `InstrumentOverlay`: optional bind MastCam STATUS to scan state / last result one-liner (or keep static until data layer exists).
- [ ] **1.9** Manual test: scan 3 rocks; markers appear; power drains during scan.

---

## Phase 2 — ChemCam

- [ ] **2.1** `ChemCamController`: `override canActivate = true`; `shotsRemaining` / `shotsMax`; cooldown timer.
- [ ] **2.2** Targeting: **7m** range, LOS; if tag required, crosshair red until `mastcamScanned`.
- [ ] **2.3** **KeyE** tap: consume shot, spawn short beam/VFX to hit point (reuse `LaserDrill` patterns or lightweight `Line` + dispose).
- [ ] **2.4** `useMarsPower`: **12W** for **~3s** per shot (timer or pulse function on composable).
- [ ] **2.5** `ChemCamReadout.vue`: spectrograph mock UI; show on fire; auto-hide after timeout.
- [ ] **2.6** Cold penalty: hook **0.8× range** when thermal exists; else stub with `nightFactor > 0.85` or TODO constant.
- [ ] **2.7** Wire overlay STATUS to `shotsRemaining/shotsMax` when slot 2 selected (pass prop from view or shared composable).
- [ ] **2.8** Manual test: fire until empty; power spikes; **blocked when rock not MastCam-scanned**.

---

## Phase 2b — APXS coordination (same tier / adjacent PR)

- [ ] **2b.1** In [APXSController](../../../src/three/instruments/APXSController.ts) (or drill path): if target rock lacks **`userData.mastcamScanned`**, keep crosshair **red**, block drill start, optional **SCAN WITH MASTCAM FIRST** toast.
- [ ] **2b.2** Manual test: cannot drill unscanned rock; scan with slot 1 then drill succeeds.

---

## Phase 3 — Polish & docs

- [ ] **3.1** Update [gdd roadmap](../../plans/gdd/2026-03-22-priority-roadmap.md) if needed; tools 1–2 are **Tier 4** (after Tier 1–3).
- [ ] **3.2** Align tool card **hint** text with actual keys if anything differs (e.g. zoom).
- [ ] **3.3** `npm run build` + smoke on site scene.

---

## Out of scope (this plan)

- Drop-gated upgrades (IR filter, burst).
- SP / mission rewards for scans.
- DAN / SAM / slot 6 RTG behavior.
