# Mission Zero: Systems Checkout — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

Mission Zero is the first mission delivered to the player after landing. It teaches core UI mechanics through a sequential post-EDL systems checkout: power boot, profile/wheels/heater inspection, avionics test, and LGA transmission. The reward is the microphone instrument unlock, hinted at in the briefing but not named.

## Mission Definition (missions.json)

```json
{
  "id": "m00-checkout",
  "name": "Systems Checkout (Post-Landing Diagnostic)",
  "patron": null,
  "description": "EDL complete. Before ops clears you for field work, the bus needs a once-over — power, wheels, heater, and the part where you prove you can move in a straight line.",
  "briefing": "TBD — see Briefing Text section below for direction",
  "reward": { "sp": 10 },
  "unlocks": ["mic"],
  "chain": "m01-triangulate",
  "objectives": [
    { "id": "chk-1", "type": "power-boot",    "label": "Boot power systems",                    "params": {},                        "sequential": true },
    { "id": "chk-2", "type": "ui-inspect",     "label": "Inspect rover profile [0]",             "params": { "target": "profile" },   "sequential": true },
    { "id": "chk-3", "type": "ui-inspect",     "label": "Inspect wheels [B]",                    "params": { "target": "wheels" },    "sequential": true },
    { "id": "chk-4", "type": "avionics-test",  "label": "Test avionics — move 5 m",             "params": { "distanceM": 5 },        "sequential": true },
    { "id": "chk-5", "type": "ui-inspect",     "label": "Inspect heater [H]",                   "params": { "target": "heater" },    "sequential": true },
    { "id": "chk-6", "type": "ui-inspect",     "label": "Inspect LGA [R] — review transmit",    "params": { "target": "lga" },       "sequential": true }
  ]
}
```

### Chain Update

- `m00-checkout` chains to `m01-triangulate`.
- `m01-triangulate` text gets a minor reframe: acknowledge checkout is done, position triangulation as the first real field task.

## New Objective Types

### 1. `power-boot`

**Trigger:** Player clicks the BOOT POWER button on the collapsed PowerHud.

**Checker registration:** `registerChecker('power-boot', ...)` in `useMissions.ts`. Listens for a `notifyPowerBooted()` call from the view layer.

**Persistence:** Boot state saved in localStorage (alongside player profile or as its own flag). On subsequent loads, PowerHud starts in booted state — no re-boot required.

### 2. `ui-inspect`

**Params:** `{ target: 'profile' | 'wheels' | 'heater' | 'lga' }`

**Trigger:** Player opens the matching panel or selects the matching instrument slot:
- `profile` — press 0 or backtick (toggles profile panel)
- `wheels` — press B (selects wheels instrument slot 13)
- `heater` — press H (selects heater instrument slot 10)
- `lga` — press R (selects LGA antenna instrument slot 11)

**Checker registration:** Single `registerChecker('ui-inspect', ...)` that reads `params.target` and checks against a notification set. View layer calls `notifyUiInspected(target)` when the relevant keybind fires or panel opens.

### 3. `avionics-test`

**Params:** `{ distanceM: number }` (default 5)

**Trigger:** Cumulative rover movement distance >= `distanceM` meters since the objective became active.

**Checker registration:** `registerChecker('avionics-test', ...)` that accumulates distance from rover position deltas each frame. Resets on mission load (not persisted mid-objective).

## PowerHud Changes

### Collapsed (Pre-Boot) State

- Same panel footprint and position as the full PowerHud
- Shows "PWR" label at top
- All detail rows (bar, Wh, net, gen, consumption, solar, RTG) hidden
- Single button: lightning emoji + "BOOT POWER" text
- Styled to match existing HUD aesthetic (dark bg, orange border tones)
- `pointer-events: auto` on the button (rest of panel stays `pointer-events: none`)

### Boot Transition

- On click: save booted state to localStorage, emit event for mission system, expand to full panel
- Transition: simple fade/expand, nothing elaborate

### Persistence

- Read `powerBooted` flag from localStorage on mount
- If true: render full panel immediately (skip boot state)
- Key: store inside existing `player-profile-v1` object or as standalone `mars-power-booted` key (implementation choice)

## Transmission Teaching Flow

When objective 6 (Inspect LGA) completes, the mission transitions to `awaiting-transmit` state. Three things happen:

1. **Transmit button highlights** — already works via existing mission system behavior
2. **Toast 1 (immediate):** `showComm("Select the LGA to transmit completed missions")` — guidance toast using existing comm variant
3. **Toast 2 (~10s delay):** Flavor toast about how transmission closes the loop — delayed to avoid collision with reward track / achievement toasts that may fire on mission completion. Uses `showComm()` with text like "Transmission confirmed — this is how data becomes science. Get used to the uplink."

### Implementation Note

The toasts fire from the mission completion handler in the view layer (MartianSiteView or its controller), not from the mission composable. The 10s delay on toast 2 accounts for SP award toasts, potential reward track milestone unlocks, and achievement popups that fire on mission completion.

## Briefing Text Direction

### m00-checkout Briefing

Voice: dry, bureaucratic, Consortium ops. Frame as mandatory post-EDL self-check before field clearance. Key beats:
- Power bus needs manual boot confirmation (someone in procurement thought a button was safer than auto-start)
- Run through the checklist: profile, wheels, drive test, thermal
- End with the LGA — "the part that actually matters" — because nothing counts until Earth gets the paperwork
- Hint at "additional hardware in the manifest that isn't on the standard packing list" — microphone foreshadowing without naming it
- Reward track mention: "SP accrues per mission. Check the track — the rover improves with the science it does."

### m01-triangulate Briefing Reframe

Minor text update to acknowledge checkout completion. Something like opening with "Checkout stamped. Systems nominal — or nominal enough for government work." before the existing triangulation briefing content. The rest of the briefing stays largely the same.

## Reward

- **SP:** 10 (small — this is orientation, not science)
- **Unlocks:** `["mic"]` — microphone instrument becomes available
- **No item rewards** — items are an Act 2 concern

## What This Does NOT Include

- No new UI panels or overlays beyond the PowerHud boot state
- No changes to the intro sequence (Mission Zero is delivered via LGA after intro completes, as all missions are)
- No microphone tutorial (that's the player's reward to discover)
- No reward track rebalancing (deferred per project decision)
- No changes to the mission system's core objective checking architecture (just new checker registrations)
