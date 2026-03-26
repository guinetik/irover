# Patron Selection Form — Design Spec

## Overview

Three side-by-side patron cards in the form area below the particle skull on `/patron`. Each card shows full faction info. Click a card to select patron and navigate to `/globe`. Keyboard: left/right to highlight, Enter to select.

## Components

### PatronCard.vue

**File:** `src/components/patron/PatronCard.vue`

Single patron card. Props:
- `patron: PatronDef` — from PATRONS in usePlayerProfile
- `motto: string` — faction motto (not in PatronDef, passed separately)
- `highlighted: boolean` — keyboard/hover highlight state

Emits: `select`

**Card content (top to bottom):**
- Full name (e.g. "Technocrats")
- Abbreviation (e.g. "TRC")
- Identity label (e.g. "The Prospector")
- Motto in quotes (e.g. "Improvement at all cost.")
- Description (from PatronDef.description)
- Buff/debuff list derived from `patron.modifiers` — positive values as buffs, negative as debuffs

**Styling:**
- Monospace, amber text on dark
- Subtle border, rounded corners
- Highlighted state: brighter border, subtle glow
- Hover also triggers highlight appearance
- Cursor pointer

### PatronSelectView.vue modifications

**File:** `src/views/PatronSelectView.vue`

Replace placeholder form area content with:
- Header text: "PATRON SELECTION — MISSION SPONSORSHIP"
- Subtext from GDD: "Your mission requires institutional backing..."
- Three `PatronCard` instances side by side in a flex row
- Keyboard listener: ArrowLeft/ArrowRight to move highlight, Enter to select

**Form area CSS adjustment:**
- Move up: `top: 48%` (was 55%)
- Wider: `width: 65%` (was 40%)
- Remove dashed border (was placeholder calibration)

**On select:**
- `setProfile(profile.archetype, profile.foundation, patronId)`
- `router.push('/globe')`

## Patron Data

The three patrons with their mottos (motto not in PatronDef, kept as local data):

| ID | Motto |
|----|-------|
| trc | "Improvement at all cost." |
| isf | "Understanding before exploitation." |
| msi | "Home is where you build it." |

Buff/debuff labels are derived from `patron.modifiers` — each key maps to a human-readable label, positive values shown as buffs with `+`, negative as debuffs with `-`.

## Modifier Labels

```typescript
const MODIFIER_LABELS: Record<string, string> = {
  movementSpeed: 'Movement',
  analysisSpeed: 'Analysis',
  powerConsumption: 'Power draw',
  heaterDraw: 'Heater draw',
  spYield: 'SP yield',
  inventorySpace: 'Inventory',
  instrumentAccuracy: 'Accuracy',
  repairCost: 'Repair cost',
  upgradeCost: 'Upgrade cost',
  weatherWarning: 'Weather warning',
  batteryCapacity: 'Battery',
  danScanRadius: 'DAN radius',
  buildSpeed: 'Build speed',
  structureDurability: 'Durability',
}
```

## Keyboard Navigation

- `ArrowLeft` / `A` — highlight previous card (wraps)
- `ArrowRight` / `D` — highlight next card (wraps)
- `Enter` — select highlighted card

Highlight index starts at -1 (none highlighted). First keypress highlights index 0 (TRC).

## Not Included

- Confirmation step (single click selects)
- Expanded/collapsed card states
- Intro/outro animations for the form
- Tooltip or hover details
