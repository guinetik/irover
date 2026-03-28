# Orbital drop debug commands

## Purpose

Orbital payload deliveries can be tested from the browser developer console on the Martian site view.

The runtime uses the existing site waypoint system from `src/composables/useSiteMissionPois.ts`, so landed payloads appear on the compass like other POIs and are removed when the payload is fully claimed.

## Console API

Available in development builds only:

```ts
OrbitalDrop.listComponentItems()
OrbitalDrop.dropItem('welding-wire', { quantity: 5, x: 120, z: -80 })
OrbitalDrop.dropRandom({ quantity: 3 })
```

## Notes

- Supported drop items are inventory entries whose category is `component`.
- If `x` and `z` are omitted, the payload spawns near the rover.
- After landing, drive into range and press `E` in driving mode to open the payload box.
- If cargo is full, the payload remains on the map with its untransferred contents.
