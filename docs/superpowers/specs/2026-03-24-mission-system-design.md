# Mission System Design

## Overview

A data-driven mission system that serves as the tutorial/progression spine of the game. Missions arrive as messages through the LGA antenna, are accepted by the player, tracked via objectives, and completed to unlock instruments one by one. The system also upgrades the LGA mailbox to support expandable message dialogs for all message types.

Late-game sponsor missions (ISF/TRC/MSI quiz-style contracts from the kernel doc) will layer on top of this system later.

## Game Modes

A `sandbox` boolean is added to `PlayerProfile` in `usePlayerProfile.ts`. Chosen during character creation (alongside Archetype/Foundation/Patron). Note: the character creation UI does not yet exist and is a separate prerequisite.

- **Guided** (`sandbox: false`) — Instrument toolbar starts empty (only RTG after m02). Instruments unlock progressively via mission completion. LGA opens automatically on first launch with the first mission message arriving.
- **Sandbox** (`sandbox: true`) — All instruments available from the start. Missions still deliver and can be completed, but nothing is gated.

## Data Model

### Mission Definition (JSON — `public/data/missions.json`)

```jsonc
{
  "version": 1,
  "missions": [
    {
      "id": "m01-triangulate",
      "name": "Triangulate Position",
      "patron": null,
      "description": "Navigate to three survey markers to establish your position on the Martian surface.",
      "briefing": "Rover, we're receiving your signal but need to confirm coordinates. We've placed three transponder markers in a triangle around your landing zone. Drive to each one so we can triangulate your exact position.",
      "reward": { "sp": 25, "items": [] },
      "unlocks": [],
      "chain": "m02-rtg",
      "objectives": [
        {
          "id": "tri-1",
          "type": "go-to",
          "label": "Reach marker Alpha",
          "params": { "poiId": "tri-alpha" },
          "sequential": false
        },
        {
          "id": "tri-2",
          "type": "go-to",
          "label": "Reach marker Beta",
          "params": { "poiId": "tri-beta" },
          "sequential": false
        },
        {
          "id": "tri-3",
          "type": "go-to",
          "label": "Reach marker Gamma",
          "params": { "poiId": "tri-gamma" },
          "sequential": false
        }
      ]
    }
  ]
}
```

### Objective Types

| Type | `params` | Completion Check | Depends On |
|------|----------|-----------------|------------|
| `go-to` | `{ poiId: string }` | Rover within 5 units of POI XZ position | `roverWorldX/Z` refs from `MarsSiteViewController`, `useSiteMissionPois` |
| `gather` | `{ itemId: string, quantity: number }` | Inventory count >= quantity | `useInventory` |
| `sam-experiment` | `{ mode: string, rockType?: string }` | SAM archive contains matching result | `useSamArchive` |
| `apxs` | `{ rockType: string }` | APXS archive contains matching result | `useApxsArchive` (prerequisite — does not exist yet) |
| `mastcam-tag` | `{ rockType: string, count?: number }` | MastCam tags of type >= count (default 1) | MastCam tag archive (prerequisite — tags tracked in 3D layer, not yet exposed as composable) |
| `chemcam` | `{ rockType: string }` | ChemCam archive contains matching result | `useChemCamArchive` |
| `dan-prospect` | `{ minWaterChance: number }` | DAN archive has result >= threshold | `useDanArchive` |
| `transmit` | `{ count?: number }` | Transmission count >= count (default 1) | `useTransmissionQueue` |

**Note:** `apxs` and `mastcam-tag` objective checkers will be stubbed until their archive composables exist. The APXS spec is in progress. MastCam tagging needs a `useMastCamArchive` composable to expose tag counts to the composable layer.

### Reward Structure

```typescript
interface MissionReward {
  sp?: number
  items?: Array<{ id: string; quantity: number }>
}
```

SP rewards use `useSciencePoints.award()`. Item rewards use `useInventory`. This supports both pure-SP tutorial rewards and future item drops for sponsor missions.

### Runtime Mission State

```typescript
interface MissionState {
  missionId: string
  status: 'active' | 'completed'
  acceptedAtSol: number
  completedAtSol?: number
  objectives: Array<{ id: string; done: boolean }>  // ordered array preserves sequence
}
```

Objectives stored as an ordered array (not Record) to preserve sequential ordering through serialization round-trips.

### Persistence

Mission state persists to `localStorage` under key `mars-missions-v1`, consistent with the existing `mars-*-v1` key convention used by `useLGAMailbox`, `useSciencePoints`, `useDanArchive`, etc. Serialized as JSON array of `MissionState`.

## Architecture — Three Layers

### Layer 1: LGA Mailbox Upgrade

The existing `LGAMessage` interface (`src/types/lgaMailbox.ts`) is extended with optional fields. Existing messages continue to work unchanged.

```typescript
// Additive changes to existing LGAMessage interface
interface LGAMessage {
  // existing fields preserved:
  id: string
  direction: 'sent' | 'received'
  sol: number
  timeOfDay: number
  subject: string
  body: string
  read: boolean

  // new optional fields:
  type?: 'info' | 'mission' | 'alert'   // defaults to 'info' if absent
  from?: string                           // "Mission Control", "ISF", etc.
  missionId?: string                      // links to mission definition if type='mission'
}
```

New method added to `useLGAMailbox`:

```typescript
/** Push an arbitrary message into the mailbox (used by mission engine). */
function pushMessage(msg: Omit<LGAMessage, 'id' | 'read'>): void {
  const next = [...messages.value, { ...msg, id: newId(), read: false }]
  messages.value = next
  saveToStorage(next)
}
```

This supplements the existing `sendHeartbeat()` and `receiveMessage()` methods, which remain unchanged for their sol-based deterministic behavior.

Changes:
- All messages clickable -> opens `MessageDialog.vue`
- Mission messages show "Accept Mission" + "Maybe Later" buttons
- Unread badge on LGA icon (existing `unreadCount` computed already works)
- Message history persists (already persists via `mars-lga-mailbox-v1`)

### Layer 2: Mission Engine — `useMissions.ts`

Singleton composable. Responsibilities:

- **Mission catalog** — loads `public/data/missions.json` at startup
- **Active missions** — reactive `MissionState[]`
- **Completed missions** — history log (persisted alongside active)
- **Unlocked instruments** — `computed<string[]>` derived from completed missions' `unlocks` fields
- **Tracked mission** — `trackedMissionId` ref. Auto-set when only one active mission. Manually switchable via mission log when multiple active.
- **accept(missionId)** — creates MissionState, registers POIs for go-to objectives via `useSiteMissionPois`, starts tracking
- **checkObjectives(roverX, roverZ)** — evaluates incomplete objectives via resolver layer. Accepts rover position as parameters to bridge the 3D/composable layer gap.
- **complete(missionId)** — awards SP reward, applies instrument unlocks, delivers chained mission after short delay via `pushMessage()`

### Layer 3: Objective Resolvers — `useObjectiveTrackers.ts`

Registry of checker functions, one per objective type:

```typescript
type ObjectiveChecker = (params: Record<string, any>, ctx: CheckerContext) => boolean

interface CheckerContext {
  roverX: number
  roverZ: number
  pois: SiteMissionPoi[]
}

const checkers: Record<string, ObjectiveChecker> = {
  'go-to':          (p, ctx) => poiDistance(ctx, p.poiId) < 5,
  'gather':         (p) => inventoryCount(p.itemId) >= p.quantity,
  'sam-experiment': (p) => samArchiveHas(p.mode, p.rockType),
  'apxs':           (p) => false, // stub until useApxsArchive exists
  'mastcam-tag':    (p) => false, // stub until MastCam archive exposed
  'chemcam':        (p) => chemcamArchiveHas(p.rockType),
  'dan-prospect':   (p) => danArchiveHasAbove(p.minWaterChance),
  'transmit':       (p) => transmissionCount() >= (p.count ?? 1),
}
```

**Rover position bridging:** `MarsSiteViewController` already exposes `roverWorldX` and `roverWorldZ` as reactive refs (updated every tick at line 700-701). The site view tick handler passes these values into `checkObjectives(roverX, roverZ)` each frame. This is cheap — checkers are simple comparisons, not GPU work.

**Evaluation strategy:** `checkObjectives()` is called from the site view's existing tick loop. The `go-to` checker runs every tick (rover moves continuously). Archive-based checkers (`sam-experiment`, `chemcam`, `dan-prospect`, `transmit`, `gather`) are inherently cheap since they just read reactive refs — no need for a separate watch/debounce layer.

Sequential objectives: when `sequential: true`, the checker only evaluates if all prior objectives in the array are already `done`.

## UI Components

### MessageDialog.vue

Full overlay dialog (Teleport + Transition, same pattern as SAMDialog):

- **Header:** From line + subject
- **Body:** Scrollable message text
- **Footer:** Type-dependent buttons
  - `info` / `alert` -> "Close"
  - `mission` -> "Accept Mission" + "Maybe Later"
- Opens from mailbox message list click

### MissionLogDialog.vue

Navbar button placed before achievements in the `hud-actions` div of `MartianSiteView.vue`. Full panel showing:

- **Active missions** — name, objective checklist with checkmarks, "Track" button per mission
- **Completed missions** — collapsed list, expandable to show objectives + rewards earned
- Tracked mission highlighted

### MissionTracker.vue

Persistent HUD overlay, top-right below navbar (opposite side from sol clock):

- Mission name as header
- Objective list with checkboxes (checked = done, unchecked = pending)
- Sequential objectives not yet reachable shown dimmed
- Compact (max ~4-5 lines visible, scrolls if more)
- Auto-assigned when one active mission, manually set via mission log
- Fades in/out on mission change/completion
- Small pin icon to untrack (hides tracker, does not abandon mission)

### LGA Mailbox Upgrade

Existing mailbox list becomes clickable:
- Unread dot per message
- From + subject preview
- Click -> opens MessageDialog
- Mission messages show a small mission icon badge

### Component Tree

```
MartianSiteView.vue
  hud-actions div (existing navbar)
    [Mission Log button]         <- new, before achievements
    ...
  MissionTracker.vue             <- new, top-right persistent HUD
  MissionLogDialog.vue           <- new, opens from navbar
  MessageDialog.vue              <- new, opens from mailbox click
  LGAMailbox.vue (upgraded)      <- existing, messages now clickable
```

## Mission Progression Flow

### First Launch (Guided Mode)

1. Rover deploys, instrument toolbar is empty
2. LGA highlighted, mailbox opens automatically
3. First mission message ("Triangulate Position") arrives visually
4. Player reads briefing in MessageDialog, accepts mission
5. Toolbar remains empty (m01 unlocks nothing)
6. Waypoints appear on compass/map

### Steady-State Lifecycle

1. Mission engine calls `useLGAMailbox.pushMessage()` with type `'mission'`
2. LGA notification appears (radio crackle, icon pulse)
3. Player opens mailbox, clicks message -> MessageDialog opens
4. Player accepts -> MissionState created, objectives tracked, POIs registered
5. Mission auto-tracked on HUD
6. Player completes objectives (checked each tick against game state)
7. All objectives done -> mission completed -> SP awarded -> instrument unlocked
8. Chained mission delivered moments later via LGA
9. Cycle repeats

### Tutorial Progression

| # | Mission | Unlocks |
|---|---------|---------|
| m01 | Triangulate Position | *(nothing)* |
| m02 | RTG Management | RTG |
| m03 | MastCam Survey | MastCam |
| m04 | ChemCam Analysis | ChemCam |
| m05 | First Core Sample | Drill |
| m06 | APXS Elemental Scan | APXS |
| m07 | DAN Prospecting | DAN |
| m08 | SAM Laboratory | SAM |
| m09 | First Transmission | UHF Antenna |

### Always-Available Instruments

The following are never gated, even in Guided mode:
- **Wheels** — rover must always be drivable
- **Heater** — thermal management is a survival mechanic
- **REMS** — environmental sensor (passive)
- **RAD** — radiation dosimeter (passive)
- **LGA Antenna** — message delivery mechanism (antenna bar, always visible)

UHF Antenna is visible in the antenna bar but disabled until m09 completes.

### Instrument Toolbar Gating

- Antenna bar (LGA + UHF) always visible in its own bar below sol clock.
- Instrument toolbar: empty at start in Guided mode. Each mission completion adds the unlocked instrument.
- `useMissions` exposes a `unlockedInstruments: Computed<string[]>` derived from all completed missions' `unlocks` arrays.
- `InstrumentToolbar.vue` filters its rendered instruments list against `unlockedInstruments` (plus always-available instruments above).
- Sandbox mode: all instruments available, missions still delivered but toolbar is not filtered.
- `sandbox` flag stored as a boolean on `PlayerProfile`, defaulting to `true` until character creation UI exists.

## Files To Create

| File | Purpose |
|------|---------|
| `public/data/missions.json` | Mission definitions catalog |
| `src/types/missions.ts` | TypeScript interfaces (MissionDef, ObjectiveDef, MissionState, MissionReward) |
| `src/composables/useMissions.ts` | Mission engine singleton |
| `src/composables/useObjectiveTrackers.ts` | Objective resolver registry |
| `src/components/MessageDialog.vue` | Expandable message overlay |
| `src/components/MissionLogDialog.vue` | Mission log panel (navbar) |
| `src/components/MissionTracker.vue` | HUD quest tracker (top-right) |

## Files To Modify

| File | Change |
|------|--------|
| `src/types/lgaMailbox.ts` | Add optional `type`, `from`, `missionId` fields to `LGAMessage` |
| `src/composables/useLGAMailbox.ts` | Add `pushMessage()` method |
| `src/composables/usePlayerProfile.ts` | Add `sandbox: boolean` to `PlayerProfile` |
| `src/views/MartianSiteView.vue` | Wire up new components, first-launch LGA highlight, add Mission Log button to `hud-actions` div, call `checkObjectives()` in tick loop |
| `src/components/InstrumentToolbar.vue` | Filter instruments against `unlockedInstruments` from `useMissions` (Guided mode) |
| `src/components/LGAMailbox.vue` | Make messages clickable, emit event to open MessageDialog |

## Prerequisites (not in scope but required)

- **`useApxsArchive.ts`** — APXS spec is in progress; archive composable needed before `apxs` objectives work
- **MastCam tag archive** — Tag counts need to be exposed from the 3D layer to a composable for `mastcam-tag` objectives
- **Character creation UI** — Needed for `sandbox` toggle; until then, default `sandbox: true`
