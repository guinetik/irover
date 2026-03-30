# Instrument System

This document describes how the instrument system works end-to-end: data model, performance resolution, tick handlers, HUD display, power, upgrades, and mission unlock progression.

---

## Single Source of Truth: `instruments.json`

Every instrument is defined in `public/data/instruments.json`. This file drives:

- What the overlay shows (name, desc, icon, type, hint, stats, help)
- How hazard penalties scale (`tier`)
- Power draw (`idlePowerW`, `activePowerW`)
- Which tick handler runs each frame (`tickHandlerType`)
- Which controller class to instantiate (`controllerType`)
- Passive bonuses emitted to other instruments (`provides`)
- Chain effects on drilled rocks (`chainBonuses`)
- Available upgrades (`upgrade`)

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable identifier, e.g. `"drill"`, `"chemcam"` |
| `slot` | number | Toolbar position (1-14) |
| `tier` | `"rugged" \| "standard" \| "sensitive"` | Hazard vulnerability — determines storm/radiation penalty severity |
| `idlePowerW` | number | Always-on power draw when instrument is selected or passive-enabled |
| `activePowerW` | number | Additional power draw during active use (drilling, laser pulse, transmitting) |
| `tickHandlerType` | string | Key into `TICK_HANDLER_REGISTRY` — resolves to a domain tick handler factory |
| `stats` | `InstrumentStatDef[]` | Which modifier-driven stats to show in the overlay (order = display order) |
| `provides` | `InstrumentPassiveBonus[]?` | Passive bonuses emitted when this instrument is active (e.g. REMS +5% spYield) |
| `chainBonuses` | `InstrumentChainBonus[]?` | Effects applied to rocks when this instrument is used on them |
| `upgrade` | `InstrumentUpgradeDef \| null` | Upgrade definition with inventory item cost, or null if no upgrade available |

### Editing instruments.json

Changing a value in the JSON changes behavior everywhere. Examples:

- Change `tier` from `"sensitive"` to `"rugged"` → storm/radiation penalties decrease for that instrument, durability decays slower
- Change `activePowerW` from `100` to `80` → drill draws 80W while drilling
- Add a `provides` entry → passive bonus appears in stat bars and affects `mod()` when instrument is active
- Change `chainBonuses[].baseValue` → chain effect strength changes (e.g. MastCam drill speed bonus)
- Set `upgrade` from `null` to `{ name, desc, req, itemId }` → UPGRADE button appears on the instrument card

---

## Architecture Layers

```
instruments.json
      |
      v
InstrumentFactory (creates controllers + tick handlers, sets tier/power/upgrade from JSON)
      |
      +---> InstrumentController (Three.js layer — 3D nodes, attach, gameplay state)
      |         Properties set by factory: tier, selectionIdlePowerW, activePowerW, upgradeItemId
      |
      +---> TickHandler (domain layer — per-frame performance resolution)
      |         Calls resolveInstrumentPerformance, sets controller properties
      |
      +---> InstrumentTickController (orchestrator — ticks all handlers, collects provides)
                Called once per frame with (delta, env)
                Pushes active provides to usePlayerProfile
```

### Layer Separation

| Layer | Location | Responsibility |
|-------|----------|---------------|
| **Domain tick handlers** | `src/instruments/tickHandlers/` | Call `resolveInstrumentPerformance`, set controller properties (speedFactor, accuracyMod, etc.) |
| **View HudControllers** | `src/views/site-controllers/*HudController.ts` | Crosshairs, audio playback, toasts, progress bars — read from controller, never compute performance |
| **View scene handlers** | `src/views/site-controllers/*TickHandler.ts` | Meteor spawning, ambient audio, VFX — no performance logic |
| **InstrumentOverlay** | `src/components/InstrumentOverlay.vue` | Renders instrument card from `defBySlot()` + `resolveInstrumentStats()` — pure renderer |

---

## Performance Resolution

### `resolveInstrumentPerformance(tier, durability, env, speedMod, accuracyMod)`

Pure function in `src/lib/instrumentPerformance.ts`. Computes composite performance factors from:

- **Profile modifiers** — `mod('analysisSpeed')`, `mod('instrumentAccuracy')` from archetype/foundation/patron/reward track
- **Durability** — instrument condition (clamped to min 0.1)
- **Thermal zone** — OPTIMAL/COLD/FRIGID/CRITICAL (affects speed only, not accuracy)
- **Storm level** — scaled by tier (sensitive > standard > rugged)
- **Radiation level** — above 0.25 safe threshold, scaled by tier

Returns `InstrumentPerformanceContext`:
```ts
{
  speedFactor: number      // >1 faster, <1 slower
  accuracyFactor: number   // same scale
  thermalZone: string      // raw zone for controller decisions
  thermalMult: number      // raw thermal multiplier
  stormPenalty: number     // raw storm multiplier
  radiationPenalty: number // raw radiation multiplier
}
```

Controllers decide how to use these factors:
- Drill: `drillDurationMultiplier = 1 / speedFactor`
- MastCam: `surveyRange = 5 * accuracyFactor`
- APXS: uses `thermalZone` for custom duration table + CRITICAL block

### `resolveInstrumentStats(input)`

Display-side resolver in `src/composables/useResolvedInstrumentStats.ts`. For each stat in `def.stats[]`, calls `buildSpeedBreakdown` with profile + environment + tier. Returns per-stat breakdowns with buff/debuff entries for the overlay.

Also collects `provides[]` bonuses from active instruments as display extras (e.g. "REMS ACTIVE +5%").

---

## Tick Handlers (Domain Layer)

Every instrument has a registered tick handler in `TICK_HANDLER_REGISTRY`. The handler runs each frame via `InstrumentTickController.tick(delta, env)`.

### Active handlers (set controller properties):

| Handler | Controller Properties Set |
|---------|------------------------|
| `drillTickHandler` | `drillDurationMultiplier`, `accuracyMod`, `chainDrillBonusBase`, `chainLootBonusBase`, `apxsTraceDropBase` |
| `mastCamTickHandler` | `durationMultiplier`, `surveyRange` |
| `chemCamTickHandler` | `durationMultiplier`, `accuracyMod` |
| `danTickHandler` | `accuracyMod`, `analysisSpeedMod`, `scanRadiusMod` |
| `apxsTickHandler` | `perfSpeedFactor`, `perfThermalMult`, `perfThermalZone` |
| `samTickHandler` | `perfSpeedFactor` |
| `antennaLGTickHandler` | `accuracyMod` |
| `antennaUHFTickHandler` | `accuracyMod` |
| `roverWheelsTickHandler` | `movementSpeedMod`, `durabilityMod` (per-instrument) |
| `radTickHandler` | `toleranceMod` |
| `heaterTickHandler` | `efficiencyMod` |

### Passive handlers (no-op, exist for system uniformity):

`rtgTickHandler`, `remsTickHandler`, `micTickHandler`

---

## Provides System

Instruments can declare `provides[]` in the JSON — passive bonuses emitted when the instrument's subsystem is active.

Example: REMS provides `{ key: "spYield", value: 0.05, label: "REMS ACTIVE" }`

**How it works:**
1. `InstrumentTickController.tick()` iterates all instruments each frame
2. Collects `provides[]` from instruments with `passiveSubsystemEnabled === true`
3. `setInstrumentProvides()` pushes the collected bonuses to `usePlayerProfile`
4. `mod()` automatically includes the bonus: `profile.modifiers[key] + instrumentBonus`
5. Every `mod('spYield')` call across the codebase picks it up — zero consumer changes

REMS off → bonus disappears next frame. Any instrument can declare `provides`.

---

## Chain Bonuses

Instruments can declare `chainBonuses[]` — effects applied to rock targets when the instrument is used, realized when the target is subsequently drilled.

| Instrument | Chain Bonus | Key | Base Value |
|------------|-------------|-----|------------|
| MastCam | Tagged rocks drill faster | `chainDrillBonus` | 0.4 (40%) |
| ChemCam | Analyzed rocks yield heavier samples | `chainLootBonus` | 0.3 (+30%) |
| APXS | Analyzed rocks drop trace elements | `instrumentAccuracy` | 2 (up to 2 drops) |

The `drillTickHandler` reads these `baseValue` entries from the JSON at creation time and sets them on `DrillController`. The controller uses them in its formulas:

```
scanSpeedMult = scanned ? (1 - chainDrillBonusBase * mod('chainDrillBonus')) : 1.0
weightMult += chainLootBonusBase * mod('chainLootBonus')
dropCount = 1 + floor(random * apxsTraceDropBase * accuracyMod)
```

Profile modifiers (`chainDrillBonus`, `chainLootBonus`) scale these effects via the reward track.

---

## Power System

| Field | When it draws | Where consumed |
|-------|--------------|---------------|
| `idlePowerW` | Instrument selected or passive-enabled | `useMarsPower` via `getPassiveBackgroundPowerW()` or `wheelsIdlePowerW` |
| `activePowerW` | Active use (drilling, laser, transmitting, experiment) | Controller's `getInstrumentBusPowerW()` or power tick input |

Both are set by `InstrumentFactory` from the JSON. Controllers read `this.selectionIdlePowerW` and `this.activePowerW`.

Special cases:
- **ChemCam**: Pulse phase = `activePowerW`, integration = `activePowerW * 0.275`, armed = `idlePowerW`
- **MastCam**: Idle + actuator (9W shared mast) + scan (derived from active - idle - actuator)
- **Wheels**: `idlePowerW` = core avionics (always on), `activePowerW` = drive motors (while moving)
- **Heater**: `activePowerW` = max thermostat output, ramped proportionally to temperature deficit

---

## Durability

Two modifier layers:

| Modifier | Scope | Source |
|----------|-------|--------|
| `structureDurability` | All instruments | Patron (MSI +25%), set by `InstrumentTickController` on every controller each frame |
| `instrumentDurability` | Per-instrument opt-in | Reward track, applied by individual tick handlers that opt in |

They stack multiplicatively in the decay formula:
```
decay = passiveDecayPerSol * hazardDecayMultiplier * solDelta / durabilityMod
```

Where `durabilityMod = mod('structureDurability')` for most instruments, and `mod('structureDurability') * mod('instrumentDurability')` for instruments whose tick handlers apply the per-instrument layer.

---

## Upgrades

Each instrument has `upgrade: InstrumentUpgradeDef | null` in the JSON.

When `upgrade` is not null:
- The UPGRADE button appears on the instrument card
- `upgrade.itemId` specifies the inventory item consumed
- `upgrade.itemQty` (default 1) specifies the quantity
- `applyUpgrade()` increments `upgradeLevel`
- Upgrade state persists in `localStorage`

Currently only LGA has a real upgrade: DSN Archaeology Module.

---

## Mission Unlock Progression

Instruments are gated behind mission completion. The unlock chain:

| Mission | Unlocks |
|---------|---------|
| `m00-checkout` | (core systems only) |
| `m01-triangulate` | mic |
| `m02-repair` | inventory |
| `m03-rems` | map, rems |
| `m04-rtg` | rtg |
| `m05-mastcam` | mastcam |
| `m06-chemcam` | chemcam |
| `m07-drill` | drill |
| `m08-apxs` | apxs |
| `m09-dan` | dan |
| `m10-sam` | sam |
| `m12-rad` | rad, antenna-uhf |
| `m13-deep-signal` | dsn-archaeology |

**Always available** (no unlock required): `heater`, `wheels`, `antenna-lg`

Gating applies to:
- Instrument toolbar buttons (hidden until unlocked)
- Bottom bar buttons (MIC, MAP — hidden until unlocked)
- Comm toolbar (UHF — hidden until unlocked)
- Inventory button (hidden until unlocked)
- Keyboard shortcuts (blocked until unlocked)
- Digit1-9, H/R/T/B slot keybinds via `RoverController.allowedInstrumentIds`

Sandbox mode bypasses all gating.

---

## Adding a New Instrument

1. Add the entry to `instruments.json` with all required fields
2. Create the controller class in `src/three/instruments/`
3. Register the controller in `CONTROLLER_REGISTRY` (`src/instruments/InstrumentRegistry.ts`)
4. Create a tick handler in `src/instruments/tickHandlers/`
5. Register the tick handler in `TICK_HANDLER_REGISTRY`
6. Add the mission that unlocks it to `missions.json`
7. The overlay, stat bars, power system, and performance resolution work automatically from the JSON
