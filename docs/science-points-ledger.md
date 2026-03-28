# Science Points ledger

Session Science Points (SP) totals and an append-only **ledger** of gains live in [`src/composables/useSciencePoints.ts`](../src/composables/useSciencePoints.ts).

## Behavior

- All SP changes go through `award` (Mastcam / ChemCam / Drill per rock), `awardAck` (ChemCam readout review), `awardDAN` (DAN events), or `awardSurvival` (Mars survival milestones). Each successful call appends a row to `spLedger` (newest first).
- Duplicate instrument scores on the same rock or duplicate readout acknowledgements do not add SP or ledger rows.
- The ledger is in-memory for the session only (aligned with `sessionSP`).

## UI

- [`SciencePointsDialog.vue`](../src/components/SciencePointsDialog.vue) reads `spLedger` from the composable and lists amount, source label, detail, time, and optional multi-instrument bonus multiplier.
- On the Martian site HUD, the navbar SP tally opens this dialog.

## Data shape

See exported type `SPLedgerEntry`: `id`, `atMs`, `amount`, `source`, `detail`, `bonusMult`.

## Verification

When changing SP or ledger behavior, run:

- `npm run test` — Vitest unit tests (including [`src/composables/__tests__/useSciencePoints.test.ts`](../src/composables/__tests__/useSciencePoints.test.ts))
- `npm run build` — `vue-tsc` typecheck and Vite production build

These are the expected checks before merging SP-related work.
