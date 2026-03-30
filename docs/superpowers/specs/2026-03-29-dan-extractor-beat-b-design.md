# Beat B — DAN Extractor Interaction
**Date:** 2026-03-29

## Overview

Beat B completes the DAN extractor loop. Beat A gave the player agency over *where* to deploy an extractor (confirm water / skip). Beat B gives the player the ability to dock with a deployed extractor, see its accumulated yield, and extract resources into inventory at a power cost.

The core loop: deploy extractor → drive away and do other science → return later → dock → extract.

---

## 1. New Inventory Items

Add to `public/data/inventory-items.json` under a new **`gas`** category:

```json
{
  "id": "co2-gas",
  "category": "gas",
  "label": "CO₂ Gas",
  "description": "Pressurised carbon dioxide captured from a subsurface CO₂ vent. Stored in the rover's onboard gas compartment.",
  "image": "/inventory/gas-co2.png",
  "weightPerUnit": 0.1,
  "maxStack": 100
},
{
  "id": "methane-gas",
  "category": "gas",
  "label": "Methane Gas",
  "description": "Pressurised methane captured from a subsurface vent. Possible biogenic origin — handle with care.",
  "image": "/inventory/gas-methane.png",
  "weightPerUnit": 0.1,
  "maxStack": 100
}
```

`weightPerUnit: 0.1` matches `ice`, keeping unit math consistent across fluid types (1 kg = 10 units). The rover's gas compartment is abstracted as regular inventory slots — no separate storage system.

---

## 2. New ProfileModifiers

Add three modifier keys to `ProfileModifiers` in `usePlayerProfile.ts`:

| Key | Label (ProfilePanel) | Base | Effect |
|---|---|---|---|
| `danChargeRate` | `DAN CHARGE RATE` | 1.0 | Multiplier on kg/sol accumulation |
| `danPowerCost` | `DAN PWR COST` | 1.0 | Multiplier on 5W base extraction cost |
| `danStorageCapacity` | `DAN STORAGE` | 1.0 | Multiplier on 1 kg base storage cap |

These follow the existing offset-then-multiply convention: a value of `0.2` in a patron definition means +20% → final multiplier `1.2`.

Add the three keys to `MOD_LABELS` in `ProfilePanel.vue`.

---

## 3. Archive Extensions

Both water extractors (DAN archive) and gas extractors (vent archive) need per-extractor accumulation state.

### `ArchivedDANProspect` (types/danArchive.ts)
Add optional fields:
```typescript
storedKg?: number        // kg of ice accumulated since deploy; undefined = not yet docked
lastChargedSol?: number  // sol at which storedKg was last updated
```

### `ArchivedVent` (types/ventArchive.ts)
Add the same optional fields:
```typescript
storedKg?: number
lastChargedSol?: number
```

### Persistence
- `storedKg` and `lastChargedSol` are written to localStorage **on every sol tick** (via the existing sol-save hook) and **on every docking event**.
- They are NOT written every frame.

---

## 4. Unified ExtractorDockTarget

A shared interface used by `DanTickHandler` to represent any dockable extractor regardless of archive type:

```typescript
// src/types/extractorDock.ts  (new file)
export type ExtractorFluidType = 'water' | 'co2' | 'methane'

export interface ExtractorDockTarget {
  archiveId: string
  archiveType: 'dan' | 'vent'
  fluidType: ExtractorFluidType
  x: number
  y: number
  z: number
  storedKg: number        // current accumulated value (default 0)
  lastChargedSol: number  // last update sol (default: deploy sol or 0)
  reservoirQuality: number  // 0–1; drives charge rate
}
```

The inventory item yielded per fluid type:

| `fluidType` | `itemId` |
|---|---|
| `water` | `ice` |
| `co2` | `co2-gas` |
| `methane` | `methane-gas` |

---

## 5. ProfilePanel — EXTERNAL INTERFACES

Add a new section to `ProfilePanel.vue` between the modifier list and the footer:

```
[ divider ]
EXTERNAL INTERFACES
DAN DOCK   [OFF] / [ON]   ← boolean toggle slider
```

ProfilePanel gains two new props:
- `danDockEnabled: boolean`
- `onToggleDanDock: () => void` (or `emit('update:danDockEnabled')`)

The toggle is **read/write**: the player turns it on to enable proximity docking; the undock action turns it off programmatically to prevent re-dock.

---

## 6. Docking Mechanic

### Proximity detection (DanTickHandler.tick)
- Guard: `danDockEnabled.value === true` and no existing dock (`pendingExtractorDock.value === null`)
- Call `getAllExtractorsForSite(siteId)` → `ExtractorDockTarget[]`
- For each target compute `dist = Vector2(rover.x - target.x, rover.z - target.z).length()`
- **Docking radius**: `DAN_DOCK_RADIUS = 1.0` (scene metres) — approximately the extractor model footprint
- If `dist <= DAN_DOCK_RADIUS`, pick nearest and initiate dock

### On dock
1. Calculate charge accumulation (see §8) → update `storedKg` / `lastChargedSol`
2. Persist updated values via `updateExtractorStorage` callback
3. Snap rover XZ to `(target.x, target.z)` via controller
4. Lock movement: `controller.criticalPowerMobilitySuspended = true`
5. Play dock SFX via `playDockSound` callback
6. Set `pendingExtractorDock.value` with current dock state

### On undock (from dialog)
1. `pendingExtractorDock.value = null`
2. `controller.criticalPowerMobilitySuspended = false`
3. `danDockEnabled.value = false` → prevents immediate re-dock

---

## 7. DANExtractorDialog.vue

New component. Visible when `pendingExtractorDock !== null`.

```
┌─────────────────────────────────────────────┐
│  DAN EXTRACTOR — WATER ICE                  │
├─────────────────────────────────────────────┤
│  STORED                                     │
│  [████████░░░░░░░] 0.34 / 1.0 kg           │
│                                             │
│  CHARGE RATE                                │
│  [████████████░░] 0.72 kg/sol              │
│                                             │
│  ┌──────────────────────────────────┐      │
│  │  EXTRACT (up to 1 kg)    5.0W   │      │
│  └──────────────────────────────────┘      │
│                                             │
│  [UNDOCK]                                   │
└─────────────────────────────────────────────┘
```

### Props
```typescript
defineProps<{
  visible: boolean
  fluidType: ExtractorFluidType
  storedKg: number
  maxStorageKg: number     // 1.0 × danStorageCapacity_mod
  chargeRateKgPerSol: number
  extractPowerW: number    // 5.0 × danPowerCost_mod
}>()
```

### Extract action
```
transferKg = min(storedKg, 1.0)
if transferKg <= 0: return (button disabled)
units = round(transferKg / weightPerUnit)   // ice: 0.1 → 10 units per kg
addInventoryItem(itemId, units)
deductRTGPower(extractPowerW)
emit('extracted', transferKg)               // parent updates archive
```

The Extract button is **disabled** when `storedKg <= 0`. No power gating — the cost is displayed clearly next to the button and the player decides.

### Undock action
Emits `'undock'`. Parent handles movement unlock and toggle reset.

---

## 8. Charge Accumulation Formula

Calculated on dock (and on sol-save):

```
chargeRate   = reservoirQuality × playerMod('danChargeRate')   // kg/sol
elapsedSols  = max(0, currentSol - lastChargedSol)
newCharge    = chargeRate × elapsedSols
maxStorage   = 1.0 × playerMod('danStorageCapacity')           // kg
storedKg     = min((storedKg ?? 0) + newCharge, maxStorage)
lastChargedSol = currentSol
```

**Charge rate examples** (base modifiers):

| reservoirQuality | kg/sol | Sols per 1 kg |
|---|---|---|
| 1.0 (Strong) | 1.0 | 1 sol |
| 0.5 (Moderate) | 0.5 | 2 sols (average) |
| 0.3 (Weak) | 0.3 | ~3.3 sols |

With a `danChargeRate: +0.5` buff: quality 0.5 site → 0.75 kg/sol → ~1.3 sols.
With a `danChargeRate: -0.3` nerf: quality 1.0 site → 0.7 kg/sol → ~1.4 sols.

---

## 9. DanTickHandler Changes

### New DanTickRefs
```typescript
danDockEnabled: Ref<boolean>
pendingExtractorDock: Ref<ExtractorDockState | null>
```

Where `ExtractorDockState` carries the current docked target's live values (storedKg updated after each extract action) plus computed `chargeRateKgPerSol` and `maxStorageKg` for the dialog.

### New DanTickCallbacks
```typescript
getAllExtractorsForSite(siteId: string): ExtractorDockTarget[]
updateExtractorStorage(archiveId: string, archiveType: 'dan' | 'vent', storedKg: number, lastChargedSol: number): void
deductRTGPower(watts: number): void
addInventoryItem(itemId: string, quantity: number): void
playDockSound(): void
setDanDockEnabled(enabled: boolean): void  // called on undock to reset toggle
```

`playerMod` already exists in `DanTickCallbacks` and covers the three new modifier keys.

---

## 10. Wiring (createMarsSiteTickHandlers + MartianSiteView)

### New refs in MartianSiteView
```typescript
const danDockEnabled = ref(false)
const pendingExtractorDock = ref<ExtractorDockState | null>(null)
```

### createMarsSiteTickHandlers callbacks
```typescript
getAllExtractorsForSite: (siteId) => {
  const danTargets = useDanArchive().getWaterExtractorsForSite(siteId)
  const ventTargets = useVentArchive().getVentsForSite(siteId)
  return [...danTargets, ...ventTargets]  // both shaped as ExtractorDockTarget
},
updateExtractorStorage: (archiveId, archiveType, storedKg, lastChargedSol) => {
  if (archiveType === 'dan') useDanArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
  else useVentArchive().updateExtractorStorage(archiveId, storedKg, lastChargedSol)
},
deductRTGPower: (watts) => { /* draw from RTG controller — verify against new instruments API */ },
addInventoryItem: (itemId, qty) => useInventory().addItem(itemId, qty),
playDockSound: () => ctx.playInstrumentActionSound('sfx.danDock'),
setDanDockEnabled: (v) => { danDockEnabled.value = v },
```

### New functions needed in useDanArchive
- `getWaterExtractorsForSite(siteId)` — returns water-confirmed entries with drillSite as `ExtractorDockTarget[]`
- `updateExtractorStorage(archiveId, storedKg, lastChargedSol)` — patches stored fields and persists

Same pair added to `useVentArchive`.

### Sol-save hook
On each new sol (wherever the existing sol-save fires), call charge accumulation for all extractors at the current site and persist updated values. This keeps storage state current without per-frame writes.

---

## 11. Open Implementation Notes

- **New instruments API**: `deductRTGPower` implementation must be verified against the new instrument provider API. It likely goes through `RTGController` or a power bus — confirm the correct injection point before wiring.
- **Dock SFX**: `sfx.danDock` needs to be added to the audio manifest.
- **Gas item images**: `/inventory/gas-co2.png` and `/inventory/gas-methane.png` need asset creation.
- **Docking radius tuning**: `DAN_DOCK_RADIUS = 1.0` is a starting point; tune against actual extractor model bounds once docking is playable.
