# REMS geometry spec (Curiosity GLB)

The Rover Environmental Monitoring Station (REMS) on MSL is implemented on the **Remote Sensing Mast** as the two horizontal sensor booms, not as deck hardware.

## Asset reality

In `public/nasa_curiosity_clean.glb`, a node named `REMS` still exists under `Chassis` with a tiny `REMS_0` mesh. That placement is a **modeling / labeling error** relative to the real rover.

## In-app binding

- **Orbit / focus anchor:** `mast_01.001` (lower mast group).
- **Selection highlight roots (first match):** `mast_01000` (Three.js / editor naming: child mesh `mast_01000_0`, example uuid `e234e0ce-09ac-4809-8a32-55e9fe2810e4`), else `mast_01.000` for glTF `nasa_curiosity_clean.glb` (`mast_01.000_0`). The main lower mast mesh `mast_01.001_0` is the full column — never use it for REMS glow.
- **Camera focus:** still uses the `mast_01.001` group origin (see `getWorldFocusPosition` override) so the orbit stays on the mast, not on the small highlight subtree alone.

Code: `src/three/instruments/REMSController.ts`, multi-root support in `src/three/instruments/InstrumentController.ts` (`selectionHighlightRootNames` / `getSelectionHighlightRoots`).

## Reference tree (GLTF nodes)

`REMS` (incorrect deck) is a sibling of `mast_p` under `Chassis`. The mast hierarchy includes `mast_01.001` → `mast_01.001_0`, `mast_02.001`, `mast_01.000`, etc.

If a future GLTF renames nodes, update `REMSController` and this doc together.
