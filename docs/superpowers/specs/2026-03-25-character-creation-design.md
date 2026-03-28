# Character Creation Flow — Design Spec

## Overview

A full-screen TUI-style 5-step form for operator onboarding, feeding into `usePlayerProfile.ts`. Slots between the title screen and patron selection as `/create`. Pure terminal aesthetic — monospace text on black, no UI chrome.

## Flow

```
/ (HomeView) → /create (5 steps + processing + acceptance) → /patron (placeholder) → /globe → /site/:siteId
```

## Data Model Changes

### New types in `usePlayerProfile.ts`

```typescript
export type OriginId = 'earth' | 'metropolis' | 'lunar'
export type MotivationId = 'legacy' | 'therapist' | 'commute'
```

### Origin definitions

| ID | Name | Description |
|----|------|-------------|
| earth | Earth | Born and raised on the homeworld. Real weather, natural terrain, open skies. |
| metropolis | Metropolis Colony | Generation station in the belt. Steel floors, recycled air, artificial gravity. |
| lunar | Lunar Settlement | Low gravity, long shadows, silence. The Moon teaches patience. |

No modifiers. Stored for dialog variations and future questline hooks.

### Motivation definitions

| ID | Label | Text |
|----|-------|------|
| legacy | Legacy | "I believe humanity's future depends on becoming a multi-planetary species..." |
| therapist | Therapist | "My therapist suggested I find a hobby that 'gets me out of the house'..." |
| commute | Commute | "I heard the commute is only 7 months and there's no traffic." |

No modifiers. Stored for dialog callbacks.

### Extended PlayerProfile interface

```typescript
export interface PlayerProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  origin: OriginId | null
  motivation: MotivationId | null
  modifiers: ProfileModifiers
  sandbox: boolean
}
```

`origin` and `motivation` do not feed into `resolveModifiers()`.

## localStorage Persistence

### Profile — key: `mars-profile-v1`

- Save the full `PlayerProfile` on every mutation (setProfile, setIdentity, applyRewardTrack)
- On composable init: if saved data exists, hydrate the reactive singleton
- Includes archetype, foundation, patron, origin, motivation, sandbox flag
- Modifiers are recomputed on load (not stored), to stay consistent with definition changes

### Active site — key: `mars-active-site-v1`

- Stores an object: `{ siteId: string, seed: number }` (site ID + procedural seed)
- The seed is generated when the player selects a site on the globe — it defines the terrain/content for that session
- Set when player selects a site and begins descent
- Read by HomeView to determine continue destination and restore the exact session

## Route Guards — `router.beforeEach`

| Route | Requires | Redirect |
|-------|----------|----------|
| `/` | — | Always accessible |
| `/create` | — | Always accessible. Entering this route resets profile + active site in localStorage (fresh start). |
| `/patron` | archetype + foundation + origin set | `/` |
| `/globe` | patron set | `/` |
| `/site/:siteId` | full profile (archetype + foundation + patron) | `/` |

## HomeView Changes

State-aware buttons based on profile + active site:

| State | Button | Destination |
|-------|--------|-------------|
| No profile | BEGIN MISSION | `/create` |
| Creation done, no patron | CONTINUE | `/patron` |
| Profile complete, no site | CONTINUE | `/globe` |
| Profile complete + site | CONTINUE | `/site/:siteId` |

Always show a secondary "NEW MISSION" option that clears profile + site from localStorage and navigates to `/create`.

## Character Create View

### Route: `/create`

Single view component `CharacterCreateView.vue` with internal step state.

### Internal steps

| Step | Section Header | Content | Stores |
|------|---------------|---------|--------|
| 1 | SECTION 1 OF 5 — OPERATOR PROFILE | Archetype selection (3 options) | `archetype` |
| 2 | SECTION 2 OF 5 — PSYCHOLOGICAL EVALUATION | Motivation troll question (3 options) | `motivation` |
| 3 | SECTION 3 OF 5 — BIOGRAPHICAL DATA | Origin selection (3 options) | `origin` |
| 4 | SECTION 4 OF 5 — PROFESSIONAL BACKGROUND | Foundation selection (3 options) | `foundation` |
| 5 | SECTION 5 OF 5 — POSITION PREFERENCE | Desired position troll question (3 options) | `positionChoice` (local) |
| 6 | — | Processing animation + snarky response | — |
| 7 | — | Acceptance screen | Commits profile, navigates to `/patron` |

### State management

- All answers held as local refs in the view during creation
- Nothing touches `usePlayerProfile` until step 7 acceptance
- On accept: calls setters on `usePlayerProfile`, then `router.push('/patron')`

### Navigation

- `[ NEXT > ]` advances to next step (disabled until an option is selected)
- `[ < BACK ]` returns to previous step
- Steps 6-7 have no back button

### Transitions

- Steps 1-5: CSS fade transition (~200ms), opacity + slight translateY
- Step 5 → 6: immediate cut (no transition)

## Component Structure

```
src/views/CharacterCreateView.vue
src/components/create/
  CreateOptionCard.vue        — reusable radio option (title + description)
  StepArchetype.vue           — step 1
  StepMotivation.vue          — step 2
  StepOrigin.vue              — step 3
  StepFoundation.vue          — step 4
  StepPosition.vue            — step 5
  ProcessingSequence.vue      — step 6
  AcceptanceScreen.vue        — step 7
```

### CreateOptionCard.vue

Reused by all 5 step components. Props:
- `id: string` — option value
- `name: string` — display title (caps)
- `description: string` — quoted flavor text
- `selected: boolean`

Emits: `select`

Renders as plain text lines:
```
  ○ MAKER
    "I build things. I fix things. If it's broken, I don't file a report — I grab a wrench."
```

Selected state: ● filled dot, amber text color.

### Step components (1-5)

Each step component:
- Receives current selection as prop, emits selection changes
- Renders the prompt text + 3 `CreateOptionCard` instances
- Content comes from definition objects (ARCHETYPES, ORIGINS, MOTIVATIONS, FOUNDATIONS, plus local position data)

### ProcessingSequence.vue (step 6)

- Lines appear one at a time with brief delays (CSS animation)
- Fake progress bar: `████████████████████░░░░ 78%` then `██████████████████████████ 100%`
- Snarky response varies by position choice:
  - CEO: "We noticed you applied for CEO. That position requires 200 years of experience..."
  - Personality Hire: "The Personality Hire position has been permanently filled by a chatbot..."
  - Remote Rover Operator: "Well. At least one of you reads the job listing."
- `[ CONTINUE ]` button appears after animation completes

### AcceptanceScreen.vue (step 7)

- Static terminal readout: application approved, rover assignment, deployment info
- Generated rover ID (simple format: `MSL-2187-XXXXX`)
- Single CTA: `[ ACCEPT APPLICATION ]`
- On click: commits choices to profile, navigates to `/patron`

## Visual Design — TUI Aesthetic

- **Full viewport** — black background, edge-to-edge, generous padding
- **Left-aligned** — no centering, content flows from top-left
- **IBM Plex Mono** — monospace everything, no sans-serif anywhere
- **Amber accent** — `#c4956a` / existing HUD warm color for selections and interactive elements
- **Dim gray** — secondary text, descriptions
- **No borders, cards, or decorative elements** — just text
- **Persistent header lines:**
  ```
  MARS EXPLORATION CONSORTIUM — OPERATOR APPLICATION PORTAL v7.3.1
  Form MEC-7720-B | Remote Vehicle Operations Division
  ```
- **Section indicator:** `SECTION 1 OF 5 — OPERATOR PROFILE` (hidden on steps 6-7)
- **Navigation:** `[ < BACK ]` and `[ NEXT > ]` as text buttons, bottom of viewport
- **Cursor blink** on active section for flavor (CSS animation)

## Out of Scope

- Patron selection UI (separate task, `/patron` registered as route placeholder only)
- Dialog system / motivation callbacks in gameplay
- Origin questline hooks
- Typewriter effects beyond the processing sequence
- Gameplay effect tooltips on archetype/foundation cards (just flavor text for now)
