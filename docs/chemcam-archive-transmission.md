# ChemCam archive & future LGA transmission

When the player **Acknowledges** a spectrum in the ChemCam experiment panel, the game appends an **ArchivedChemCamSpectrum** row via `useChemCamArchive()`:

- Full **LIBS peak list** and calibration (copy of the readout)
- **Rock** type, label, and mesh UUID
- **Capture time**: `capturedSol` and `capturedAtMs` (Unix ms) when the spectrum finished processing — from the readout at fire time
- **Acknowledge time**: `solAcknowledged` and `acknowledgedAtMs` when the player confirmed the panel
- **Site id** and **approximate latitude / longitude** (landmark lat/lon plus flat tangent offset from the rover’s first `ready` spawn position)
- **Rover XZ** at acknowledge time
- **`transmitted: false`** until downlink is implemented

Older `localStorage` rows that only had `sol` are migrated on load into `solAcknowledged` / `capturedSol` / `capturedAtMs`.

Data is stored in **localStorage** under `mars-chemcam-archive-v1`.

For **AntennaLGController** (and UHF), use `useChemCamArchive().pendingTransmission` for rows where `transmitted === false`, then call **`markTransmitted(archiveId)`** after a successful simulated uplink to drive funding / mission report UI.

Tangent math lives in `approximateLatLonFromTangentOffset` (`src/lib/areography/siteTangent.ts`); scene convention is **+X east, +Z north** in site space with **1 unit ≈ 1 m** by default (`siteUnitsPerMeter` in the composable if that changes).

**UI:** On the site HUD, **SCIENCE** appears next to the SP counter when at least one archived spectrum exists (`ScienceLogDialog.vue` — left accordion **CHEMCAM** expands to list all scans; right pane is spectrum + metadata only).
