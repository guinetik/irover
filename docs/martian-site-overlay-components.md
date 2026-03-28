# Martian site overlay extractions

Active instrument HUD strips are being moved out of `MartianSiteView.vue` into focused components under `src/components/` so the main template stays readable.

## Done

- **`ChemCamActiveHud.vue`** — ChemCam active-mode strip, firing/progress row, and “see results” CTA. Styles live in the component (`scoped`); removed from `MartianSiteView.css`.
- **`MastCamActiveHud.vue`** — MastCam strip + scan bar; `.mastcam-hud` / `.mc-*` styles moved to scoped CSS in the component.
- **`RtgStatusBanners.vue`** — RTG overdrive / cooldown / power shunt / shunt cooldown / heater overdrive; `.rtg-banner*` styles moved to scoped CSS.
- **`RoverDeployOverlays.vue`** — sky-crane descent + deploying steps / progress; `.deploy-*` styles moved to scoped CSS.

## Likely next (same pattern)

The large **`InstrumentOverlay`** card already encapsulates passive instrument UI; further splits can happen inside that file later if needed.
