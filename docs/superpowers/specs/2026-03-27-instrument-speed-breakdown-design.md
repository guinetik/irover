# Instrument Speed Breakdown Display

## Problem

The wheels HUD shows a detailed speed breakdown (MOVE SPD bar + buff list showing archetype, foundation, patron, reward track, night penalty, RTG overdrive contributions). Active instruments (Drill, ChemCam, MastCam, APXS) have equivalent speed modifiers via `durationMultiplier` but never surface them to the player. The wheel breakdown is also computed inline in MartianSiteView (~40 lines), contributing to view bloat.

## Goal

1. Show a speed breakdown for each active instrument matching the wheels display style.
2. Unify wheels and instrument breakdowns through a shared pure function.
3. Move speed breakdown logic out of MartianSiteView into `lib/`.

## Scope

### In scope
- Drill, ChemCam, MastCam, APXS speed breakdowns
- Refactor wheels speed breakdown to use the same system
- Display in InstrumentOverlay with matching visual style

### Out of scope
- Passive instruments (DAN, RAD, REMS, Mic) — no meaningful cycle time
- Durability factor — already shown as its own bar
- Changing actual speed calculations — display only

## Design

### New file: `src/lib/instrumentSpeedBreakdown.ts`

Pure function, no Vue/Three.js dependencies. Builds a speed breakdown from profile + context.

```ts
import type { ProfileModifiers } from '@/composables/usePlayerProfile'

export interface SpeedBuffEntry {
  label: string
  value: string   // e.g. "+10%", "-25%"
  color: string   // green (#5dc9a5), red (#e05030), or dim (rgba(196,117,58,0.6))
}

export interface SpeedBreakdown {
  /** Effective speed as percentage of baseline (100 = no buffs). */
  speedPct: number
  /** Contributing buff / debuff entries. */
  buffs: SpeedBuffEntry[]
}

export type ThermalZone = 'OPTIMAL' | 'COLD' | 'FRIGID' | 'CRITICAL'

/** Source definitions for archetype/foundation/patron lookup. */
export interface ProfileSource {
  id: string
  name: string
  modifiers: Partial<ProfileModifiers>
}

export interface SpeedBreakdownInput {
  /** Which modifier key to inspect: 'analysisSpeed' for instruments, 'movementSpeed' for wheels. */
  modifierKey: 'analysisSpeed' | 'movementSpeed'
  /** Player's selected archetype (null if not yet chosen). */
  archetype: ProfileSource | null
  /** Player's selected foundation (null if not yet chosen). */
  foundation: ProfileSource | null
  /** Player's selected patron (null if not yet chosen). */
  patron: ProfileSource | null
  /** Accumulated reward track modifiers. */
  trackModifiers: Partial<ProfileModifiers>
  /** Thermal zone — adds thermal speed modifier for instruments (omit for wheels/MastCam). */
  thermalZone?: ThermalZone
  /** Instrument-specific extras appended after standard entries (display-only). */
  extras?: SpeedBuffEntry[]
  /** Override computed speedPct when extras have multiplicative effects computed externally. */
  speedPctOverride?: number
}

export function buildSpeedBreakdown(input: SpeedBreakdownInput): SpeedBreakdown
```

#### Logic

1. For each of archetype, foundation, patron: look up `input.modifierKey` in its `modifiers`. If non-zero, push a `SpeedBuffEntry` with the source name as label.
2. Check `input.trackModifiers[input.modifierKey]`. If non-zero, push entry labeled `"REWARD TRACK"`.
3. If `input.thermalZone` is provided and not `'OPTIMAL'`, push a thermal entry:
   - `COLD` → `+18%` (green) — equipment runs faster when cold
   - `FRIGID` → `-20%` (red)
   - `CRITICAL` → `-50%` (red)
4. Append any `input.extras`.
5. Compute `speedPct`:
   - Start with 1.0
   - Multiply by `(1 + archetypeMod + foundationMod + patronMod + trackMod)` for the profile portion (additive stack within profile, same as `resolveModifiers`)
   - Multiply by thermal speed factor if thermalZone provided: OPTIMAL=1.0, COLD=1/0.85≈1.176, FRIGID=1/1.25=0.8, CRITICAL=1/2.0=0.5
   - Extras are display-only labels — they don't contribute to `speedPct` inside the builder. The caller passes a pre-computed `speedPctOverride` when extras with varying semantics are present (e.g. night penalty, RTG overdrive, MastCam scan buff are all multiplicative but computed externally). If override is provided, it replaces the computed value.
6. If no buffs were added, push a single `BASELINE 100%` entry (dim color).

#### Thermal speed mapping

The tick handlers use thermal multipliers on `durationMultiplier` (higher = slower):
- OPTIMAL: 1.0 → speed factor 1.0 (baseline)
- COLD: 0.85 → speed factor 1/0.85 ≈ 1.176 (+18%)
- FRIGID: 1.25 → speed factor 1/1.25 = 0.8 (-20%)
- CRITICAL: 2.0 → speed factor 1/2.0 = 0.5 (-50%)

Display rounds to nearest percent.

### Tick handler changes

Each tick handler already has access to `playerMod`, `thermalZone`, and the player profile (via callbacks). They will:

1. Import `buildSpeedBreakdown` from `@/lib/instrumentSpeedBreakdown`
2. Call it each frame (or when inputs change) with the appropriate parameters
3. Write the result to a new ref passed in via their `*TickRefs` interface

| Handler | modifierKey | thermalZone | extras |
|---|---|---|---|
| `DrillTickHandler` | `analysisSpeed` | yes | MastCam scan buff entry when drilling a tagged rock (`+40%`, green) |
| `ChemCamTickHandler` | `analysisSpeed` | yes | — |
| `MastCamTickHandler` | `analysisSpeed` | no (not used in its durationMultiplier) | — |
| `APXSTickHandler` | `analysisSpeed` | yes | — |

Each handler's `*TickRefs` interface gets a new field:
```ts
speedBreakdown: Ref<SpeedBreakdown | null>
```

The ref is written every tick when the instrument is active, cleared to `null` when inactive.

### Wheels refactor

The existing `wheelsOverlayHud` computed in MartianSiteView.vue calls `buildSpeedBreakdown` with:
- `modifierKey: 'movementSpeed'`
- archetype/foundation/patron from player profile
- trackModifiers from reward track
- No thermalZone
- extras: night penalty entry, RTG overdrive entry (built inline as today)

This replaces the ~40-line inline buff-building block. The `WheelsHudDisplay` interface keeps `speedPct` and `speedBuffs` — they just come from `buildSpeedBreakdown()` now.

### InstrumentOverlay changes

#### New prop
```ts
instrumentSpeedHud?: SpeedBreakdown | null
```

#### Template

Rendered for active instruments (Drill slot 3, ChemCam slot 2, MastCam slot 1, APXS slot 4) when `instrumentSpeedHud` is provided. Uses the same markup structure as the wheels speed section:

```vue
<div v-if="instrumentSpeedHud && isAnalysisInstrument" class="ov-whls-speed">
  <div class="ov-whls-speed-row">
    <span class="ov-whls-speed-label">{{ speedLabel }}</span>
    <span class="ov-whls-speed-value" :style="{ color: speedColor }">{{ speedStr }}</span>
  </div>
  <div class="ov-whls-speed-bar-track">
    <div class="ov-whls-speed-bar-fill" :style="{ width: barPct + '%', background: speedColor }" />
  </div>
  <div class="ov-whls-buffs">
    <div v-for="buff in instrumentSpeedHud.buffs" :key="buff.label" class="ov-whls-buff">
      <span class="ov-whls-buff-label">{{ buff.label }}</span>
      <span class="ov-whls-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
    </div>
  </div>
</div>
```

#### Speed labels per instrument
- Drill (slot 3): `DRILL SPD`
- ChemCam (slot 2): `SCAN SPD`
- MastCam (slot 1): `SURVEY SPD`
- APXS (slot 4): `ANALYSIS SPD`

#### Reuse existing CSS
The wheels speed CSS classes (`ov-whls-speed`, `ov-whls-speed-row`, etc.) are reused directly. Rename them to generic names (`ov-inst-speed`, etc.) since they'll serve both wheels and instruments now.

### Data flow summary

```
lib/instrumentSpeedBreakdown.ts  (pure function)
        ↓
tick handlers call buildSpeedBreakdown() → write to Ref<SpeedBreakdown>
        ↓
MartianSiteView passes ref as prop to InstrumentOverlay
        ↓
InstrumentOverlay renders speed bar + buff list
```

For wheels, MartianSiteView calls `buildSpeedBreakdown()` in its existing computed and passes via `wheelsHud` prop (unchanged interface, just refactored internals).

### File changes summary

| File | Change |
|---|---|
| `src/lib/instrumentSpeedBreakdown.ts` | **New** — `buildSpeedBreakdown()` pure function + types |
| `src/views/site-controllers/DrillTickHandler.ts` | Add `speedBreakdown` ref, call builder |
| `src/views/site-controllers/ChemCamTickHandler.ts` | Add `speedBreakdown` ref, call builder |
| `src/views/site-controllers/MastCamTickHandler.ts` | Add `speedBreakdown` ref, call builder |
| `src/views/site-controllers/APXSTickHandler.ts` | Add `speedBreakdown` ref, call builder |
| `src/views/MartianSiteView.vue` | Refactor `wheelsOverlayHud` to use builder; wire instrument speed refs; pass new prop |
| `src/components/InstrumentOverlay.vue` | Add `instrumentSpeedHud` prop; generalize speed display template + CSS class names |

### Testing

- **Unit tests** for `buildSpeedBreakdown()` in `src/lib/__tests__/instrumentSpeedBreakdown.test.ts`:
  - No modifiers → baseline 100%
  - Single archetype modifier → correct label, value, color, speedPct
  - Stacked archetype + foundation + patron → additive profile, correct speedPct
  - Thermal zones → correct entries and speed factors
  - Extras appended correctly
  - Negative modifiers show red, positive show green
- Existing tick handler tests remain unchanged (breakdown is additive, not replacing logic)
