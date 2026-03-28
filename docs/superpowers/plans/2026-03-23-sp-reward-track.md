# SP Reward Track — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cumulative lifetime Science Points milestones that grant permanent `ProfileModifiers` (stacking with archetype / foundation / patron) plus unlock **perk ids** for qualitative gameplay hooks, with banners and achievements UI consistent with existing LIBS calibration.

**Source spec:** [`inspo/mars-rovers-sp-reward-track.md`](../../../inspo/mars-rovers-sp-reward-track.md)

**Tech stack:** Vue 3, TypeScript, existing `AchievementBanner`, `achievements.json` fetch pattern in `MartianSiteView.vue`.

---

## Architecture

### Dependency graph (no cycles)

```
src/lib/rewardTrack.ts          ← pure math, zero Vue imports
        ↑
src/composables/useRewardTrack.ts  ← new composable; imports lib + useSciencePoints
        ↑
src/views/MartianSiteView.vue      ← calls useRewardTrack(), passes data to dialog
```

**Cycle avoidance:** `useSciencePoints` imports `usePlayerProfile` (for `mod('spYield')`). The new `useRewardTrack` composable imports `useSciencePoints` (for `totalSP`) but **never** imports `usePlayerProfile`. Instead, `useRewardTrack` exposes a computed `Partial<ProfileModifiers>` that the **view** passes into `usePlayerProfile.applyRewardTrack()`. This keeps the dependency arrow one-directional.

### Profile modifier stacking (4 layers)

`resolveModifiers` already accepts `...layers: Partial<ProfileModifiers>[]` (variadic). No signature change needed. The change is in **state management**: `usePlayerProfile` must store the three choice IDs as refs so it can re-resolve whenever the reward track layer changes.

**Concrete state shape inside `usePlayerProfile`:**

```typescript
// New refs (replace the current "assign and forget" pattern)
const chosenArchetype = ref<ArchetypeId | null>(null)
const chosenFoundation = ref<FoundationId | null>(null)
const chosenPatron = ref<PatronId | null>(null)
const rewardTrackLayer = ref<Partial<ProfileModifiers>>({})

function recomputeModifiers(): void {
  if (!chosenArchetype.value || !chosenFoundation.value || !chosenPatron.value) {
    Object.assign(profile.modifiers, NEUTRAL_MODIFIERS)
  } else {
    Object.assign(profile.modifiers, resolveModifiers(
      ARCHETYPES[chosenArchetype.value].modifiers,
      FOUNDATIONS[chosenFoundation.value].modifiers,
      PATRONS[chosenPatron.value].modifiers,
      rewardTrackLayer.value,  // ← fourth layer
    ))
  }
}

function setProfile(a, f, p) { chosenArchetype.value = a; /* ... */ recomputeModifiers() }
function applyRewardTrack(partial) { rewardTrackLayer.value = partial; recomputeModifiers() }
```

`setProfile` preserves the reward track layer (lifetime SP is build-independent). `applyRewardTrack` preserves the three choices.

### Flush-order rule for SP awards

When SP is awarded, `mod('spYield')` is read **synchronously** inside `award()`. The reward track watcher updates **asynchronously** (Vue `watchEffect` runs after the synchronous call). This means:

**Rule:** The award that *crosses* a milestone uses the *pre-crossing* modifier. Example: going from 140 → 155 SP, the `+5% spYield` from the 150-SP milestone does NOT apply to this award. It applies to the *next* award. This is the correct behavior — Vue's microtask flush guarantees it naturally. No special handling needed, but tests should verify this.

### Scope exclusion: instrument calibration tracks

The GDD source spec defines `mastcam-calibration`, `apxs-calibration`, `dan-calibration`, and `sam-calibration` tracks alongside `reward-track`. **These are explicitly out of scope for this plan.** LIBS calibration is already implemented; the other instrument tracks will be added in separate plans when each instrument's gameplay is finalized. Only the `reward-track` category is added to `achievements.json` here.

---

## Codebase reality check (vs GDD)

| GDD assumption | Actual in repo | Action |
|----------------|----------------|--------|
| Fourth layer in `resolveModifiers` | Function already accepts `...layers` (variadic) — no signature change. But `setProfile` bakes choices into a final object and doesn't store them as refs. | Refactor: store choice IDs as refs + `recomputeModifiers()` helper. |
| `getTrackModifiers(currentSP)` | Not implemented. | Add as pure function in `src/lib/rewardTrack.ts`. |
| `reward-track` in `achievements.json` | Missing — file has `libs-calibration`, `dan-prospecting`, `mars-survival`, `sam-analysis`. | Add `reward-track` array (26 rows) to `achievements.json`. |
| Same `watch(totalSP)` as LIBS | LIBS uses `watchEffect` on `totalSP` in `MartianSiteView.vue` (lines 862–869). | New `useRewardTrack` composable owns the watcher (not the view). |
| `AchievementsDialog` lists all categories | Dialog shows LIBS, Mars survival, DAN only — SAM rows not rendered (data exists in JSON). | Add reward-track section with modifier + perk row rendering. |
| Lifetime SP persists | `totalSP` is session-only (`useSciencePoints.ts` line 7). Reload resets to 0. | Add `localStorage` persistence in Phase 1 — a "lifetime" track that resets on reload is a UX contradiction. |
| All 11 perks have gameplay hooks | Many systems not present or partial. | Phase perks: Night Vision first (existing code path), others as dependencies land. |

---

## Phases

### Phase 1 — Modifiers + data + UX + persistence (shippable core)

Deliver the **15 modifier-only milestones** (all rows with `modifierKey`/`modifierValue`) so pacing and stacking work end-to-end. Include all 26 rows in data (perk rows appear locked in UI but no gameplay hook yet).

- `reward-track` array (26 rows, sorted by `sp`) in `public/data/achievements.json`.
- `computeRewardTrackModifiers(lifetimeSp, milestones)` in `src/lib/rewardTrack.ts` (pure, no Vue).
- `usePlayerProfile` refactor: store choice IDs as refs, expose `applyRewardTrack(partial)`, recompute on either call.
- `useRewardTrack` composable: owns fetch, SP watcher, modifier sync, banner firing, perk set.
- `SciencePointsDialog`: "VIEW REWARD TRACK" footer button linking to the dedicated track view.
- `RewardTrackDialog` (new): full reward track progress view with tier sections, progress bar, modifier/perk row rendering. Opened from SP ledger dialog.
- `AchievementsDialog`: compact "SP reward track" section for completeness.
- `localStorage` persistence for `totalSP` + `unlockedAchievementIds` so the track survives page reload.
- Unit tests at 100 / 250 / 500 / 750 / 1000 SP vs GDD cumulative table.

### Phase 2 — Perk registry + Night Vision (first qualitative perk)

- `unlockedPerks: ComputedRef<Set<string>>` derived from `totalSP` + milestone list in `useRewardTrack` (computed = no desync).
- `hasPerk(perkId): boolean` helper exposed from `useRewardTrack`.
- **Night Vision (200 SP):** `MarsSiteViewController.ts` line 624 uses `nightPenalty = 1.0 - nightFactor * 0.5` — change `0.5` → `0.35` when `hasPerk('night-vision')`. This establishes the perk-check pattern for all future perks.
- Banner type `PERK` uses distinct styling (already supported via string `type`).

### Phase 3 — Perks requiring new or larger systems

Schedule with product priority (each is a mini-feature):

| Perk | SP | Dependency |
|------|----|------------|
| Second Wind | 100 | Battery % + RTG + sol-scoped cooldown (`missionCooldowns` exists). |
| Dust Shaker | 340 | Solar panel dust accumulation model (if absent, defer). |
| Echo Scan | 400 | DAN visualization / persistent overlay. |
| Overclock | 500 | Instrument burst + power surcharge + per-sol cooldown. |
| Storm Rider | 590 | Dust storm movement penalty in rover tick. |
| Multi-Scan | 680 | MastCam targeting — UI + heuristics. |
| Bulk Analysis | 750 | SAM queue supporting chained samples. |
| Solar Surplus | 860 | Midday solar generation window. |
| Ghost Tracks | 950 | Minimap or trail rendering. |
| Full Autonomy | 1000 | Mission directives / narrative / freeplay gating — **content + systems**. |

---

## File map

| File | Role |
|------|------|
| `src/lib/rewardTrack.ts` (new) | `RewardTrackMilestone` type, `computeRewardTrackModifiers()`, `milestonesUnlockedBetween()`, `perksUnlockedAt()`. Pure functions, no Vue. |
| `src/lib/__tests__/rewardTrack.test.ts` (new) | Cumulative modifier sums at GDD thresholds, milestone-crossing logic, perk set derivation. |
| `src/composables/useRewardTrack.ts` (new) | Fetches `reward-track` data, watches `totalSP`, computes modifier partial + perk set, fires banners, exposes `hasPerk()`. Calls `usePlayerProfile().applyRewardTrack()`. |
| `src/composables/usePlayerProfile.ts` | Refactor: store choice IDs as refs, add `applyRewardTrack()`, add `recomputeModifiers()` helper. |
| `src/composables/useSciencePoints.ts` | Add `localStorage` read/write for `totalSP` (persist on award, restore on load). |
| `public/data/achievements.json` | Add `reward-track` array (26 rows with `sp`, `id`, `icon`, `title`, `description`, `type`, optional `modifierKey`/`modifierValue`, optional `perkId`). |
| `src/components/SciencePointsDialog.vue` | Add "VIEW REWARD TRACK" footer button that emits `open-track` event. |
| `src/components/RewardTrackDialog.vue` (new) | Dedicated reward track progress dialog — tier sections, progress bar to next milestone, modifier/perk row rendering. Opened from SP ledger dialog. |
| `src/components/AchievementsDialog.vue` | New props + section for reward-track summary rows (compact, links to full track dialog). |
| `src/views/MartianSiteView.vue` | Imports `useRewardTrack`, wires both dialogs, manages `rewardTrackOpen` state. Lighter than before — watcher logic lives in composable. |
| `src/views/MarsSiteViewController.ts` | Night Vision perk check (Phase 2). |

---

## Tasks

### Task 1: Pure reward-track math + tests

**Files:**

- Create: `src/lib/rewardTrack.ts`
- Create: `src/lib/__tests__/rewardTrack.test.ts`

- [ ] **Step 1:** Define `RewardTrackMilestone` interface:

```typescript
export interface RewardTrackMilestone {
  sp: number
  id: string
  icon: string
  title: string
  description: string
  type: string               // 'REWARD TRACK' | 'PERK'
  modifierKey?: keyof ProfileModifiers
  modifierValue?: number     // percentage offset (e.g. 0.05 = +5%, -0.05 = -5%)
  perkId?: string            // e.g. 'night-vision', 'second-wind'
}
```

Import `ProfileModifiers` type from `usePlayerProfile.ts` (type-only import — no runtime dependency).

- [ ] **Step 2:** Implement `computeRewardTrackModifiers(lifetimeSp: number, milestones: RewardTrackMilestone[]): Partial<ProfileModifiers>`. Iterate sorted milestones, sum `modifierValue` into matching `modifierKey`; skip rows without `modifierKey`. Return partial with only non-zero keys.

- [ ] **Step 3:** Implement `milestonesUnlockedBetween(prevSp: number, nextSp: number, milestones: RewardTrackMilestone[]): RewardTrackMilestone[]`. Strict crossing: return milestones where `sp` is in `(prevSp, nextSp]`.

- [ ] **Step 4:** Implement `perksUnlockedAt(lifetimeSp: number, milestones: RewardTrackMilestone[]): Set<string>`. Return set of `perkId` values for all milestones with `sp <= lifetimeSp` that have a `perkId`.

- [ ] **Step 5:** Write tests:
  - Cumulative modifier sums at 100, 250, 500, 750, 1000 SP match GDD table (float tolerance 0.001).
  - `milestonesUnlockedBetween(140, 155, ...)` returns the 150-SP milestone only.
  - `milestonesUnlockedBetween(50, 50, ...)` returns nothing (non-inclusive lower bound).
  - `perksUnlockedAt(200, ...)` returns `{'second-wind', 'night-vision'}`.
  - `perksUnlockedAt(199, ...)` returns `{'second-wind'}` only.

- [ ] **Step 6:** Run `npm run test -- rewardTrack`.

- [ ] **Step 7:** Commit: `feat: add reward track modifier computation`

---

### Task 2: Refactor `usePlayerProfile` for 4-layer stacking

**Files:**

- Modify: `src/composables/usePlayerProfile.ts`

- [ ] **Step 1:** Add private refs for the three choice IDs inside the module scope (alongside `profile`):

```typescript
const chosenArchetype = ref<ArchetypeId | null>(null)
const chosenFoundation = ref<FoundationId | null>(null)
const chosenPatron = ref<PatronId | null>(null)
const rewardTrackLayer = ref<Partial<ProfileModifiers>>({})
```

- [ ] **Step 2:** Extract `recomputeModifiers()` helper that reads all four sources:

```typescript
function recomputeModifiers(): void {
  if (!chosenArchetype.value || !chosenFoundation.value || !chosenPatron.value) {
    profile.archetype = null
    profile.foundation = null
    profile.patron = null
    Object.assign(profile.modifiers, NEUTRAL_MODIFIERS)
    return
  }
  profile.archetype = chosenArchetype.value
  profile.foundation = chosenFoundation.value
  profile.patron = chosenPatron.value
  Object.assign(
    profile.modifiers,
    resolveModifiers(
      ARCHETYPES[chosenArchetype.value].modifiers,
      FOUNDATIONS[chosenFoundation.value].modifiers,
      PATRONS[chosenPatron.value].modifiers,
      rewardTrackLayer.value,
    ),
  )
}
```

- [ ] **Step 3:** Rewrite `setProfile` to store IDs and call `recomputeModifiers()`:

```typescript
function setProfile(
  archetype: ArchetypeId | null,
  foundation: FoundationId | null,
  patron: PatronId | null,
): void {
  chosenArchetype.value = archetype
  chosenFoundation.value = foundation
  chosenPatron.value = patron
  recomputeModifiers()
}
```

`setProfile` does NOT clear `rewardTrackLayer` — the track is lifetime, not build-dependent.

- [ ] **Step 4:** Add `applyRewardTrack` to the composable's return:

```typescript
function applyRewardTrack(partial: Partial<ProfileModifiers>): void {
  rewardTrackLayer.value = partial
  recomputeModifiers()
}
```

- [ ] **Step 5:** Verify existing behavior: with empty `rewardTrackLayer`, `resolveModifiers` receives `{}` as fourth layer, which contributes nothing. All existing call sites behave identically.

- [ ] **Step 6:** Run `npm run build` and `npm run test` — ensure no regressions.

- [ ] **Step 7:** Commit: `feat: support reward track as fourth modifier layer`

---

### Task 3: Reward track data + `useRewardTrack` composable + SP persistence

**Files:**

- Modify: `public/data/achievements.json`
- Create: `src/composables/useRewardTrack.ts`
- Modify: `src/composables/useSciencePoints.ts` (persistence)
- Modify: `src/views/MartianSiteView.vue` (import composable, wire to dialog/banner)

#### Part A: Achievement data

- [ ] **Step 1:** Add `reward-track` array (26 rows) to `achievements.json` per GDD. Format:

```json
{ "sp": 20, "id": "track-swift-wheels", "icon": "⚡", "title": "SWIFT WHEELS", "description": "Your driving algorithms are optimizing. Paths feel smoother.", "type": "REWARD TRACK", "modifierKey": "movementSpeed", "modifierValue": 0.05 }
```

For perk rows:

```json
{ "sp": 100, "id": "track-second-wind", "icon": "💨", "title": "SECOND WIND", "description": "When battery drops below 15%, RTG output boosts +20% for 5 minutes. Once per sol.", "type": "PERK", "perkId": "second-wind" }
```

All 26 rows from GDD tiers 1–5. Sorted ascending by `sp`.

#### Part B: SP persistence

- [ ] **Step 2:** In `useSciencePoints.ts`, restore `totalSP` from `localStorage` on module init and write on every award:

```typescript
const SP_STORAGE_KEY = 'mars-lifetime-sp'
const stored = Number(localStorage.getItem(SP_STORAGE_KEY))
const totalSP = ref(Number.isFinite(stored) && stored > 0 ? stored : 0)

// After every totalSP mutation:
function persistSP(): void {
  localStorage.setItem(SP_STORAGE_KEY, String(totalSP.value))
}
```

Call `persistSP()` at the end of `award`, `awardAck`, `awardDAN`, `awardSAM`, `awardSurvival`, and `devAwardSciencePoints`. Update `resetSciencePointsForTests` to also clear the storage key.

#### Part C: Composable

- [ ] **Step 3:** Create `src/composables/useRewardTrack.ts`:

```typescript
import { ref, watchEffect, computed } from 'vue'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'
import {
  computeRewardTrackModifiers,
  milestonesUnlockedBetween,
  perksUnlockedAt,
} from '@/lib/rewardTrack'
import { useSciencePoints } from './useSciencePoints'

// Singleton state
const milestones = ref<RewardTrackMilestone[]>([])
const loaded = ref(false)
const prevSP = ref(0)
const unlockedTrackIds = ref<string[]>([])

export function useRewardTrack() {
  const { totalSP } = useSciencePoints()

  async function loadRewardTrack(data: RewardTrackMilestone[]): Promise<void> {
    milestones.value = data
    loaded.value = true
  }

  const trackModifiers = computed(() =>
    computeRewardTrackModifiers(totalSP.value, milestones.value),
  )

  const unlockedPerks = computed(() =>
    perksUnlockedAt(totalSP.value, milestones.value),
  )

  function hasPerk(perkId: string): boolean {
    return unlockedPerks.value.has(perkId)
  }

  return {
    milestones,
    loaded,
    trackModifiers,
    unlockedPerks,
    unlockedTrackIds,
    prevSP,
    hasPerk,
    loadRewardTrack,
  }
}
```

- [ ] **Step 4:** In `MartianSiteView.vue`, wire the composable:
  1. Import `useRewardTrack` and `usePlayerProfile`.
  2. In the existing `achievements.json` fetch, extract `data['reward-track']` and pass to `loadRewardTrack()`.
  3. Add a `watchEffect` that calls `applyRewardTrack(trackModifiers.value)` when track modifiers change.
  4. Add a `watchEffect` for banner firing: compare `prevSP` to `totalSP`, call `milestonesUnlockedBetween`, fire `achievementRef.show()` for each, append to `unlockedTrackIds` and `unlockedAchievementIds`, update `prevSP`.

- [ ] **Step 5:** Manual test: run dev, use `devAwardSciencePoints(25)` in console, verify:
  - 20-SP banner fires for "SWIFT WHEELS".
  - Reload page — `totalSP` persists from localStorage.
  - `profile.modifiers.movementSpeed` reflects the +5% bonus (1.05 or stacked with archetype).

- [ ] **Step 6:** Commit: `feat: wire SP reward track with persistence and banners`

---

### Task 4: Reward track UI (SP dialog link + dedicated dialog + achievements section)

The reward track is accessible from **two places**:

1. **SP button → SP ledger dialog → "VIEW REWARD TRACK" button** — the primary discovery path. Player clicks the SP counter in the HUD, sees their recent gains, and a persistent footer button opens the full reward track progress view.
2. **Achievements dialog** — a compact summary section so the trophy view stays complete.

**Files:**

- Modify: `src/components/SciencePointsDialog.vue`
- Create: `src/components/RewardTrackDialog.vue`
- Modify: `src/components/AchievementsDialog.vue`
- Modify: `src/views/MartianSiteView.vue` (wire dialogs + state)

#### Part A: SP ledger dialog — add footer link

- [ ] **Step 1:** In `SciencePointsDialog.vue`, add a sticky footer below the ledger list with a "VIEW REWARD TRACK" button. The button emits a new `open-track` event:

```html
<div class="sp-ledger-footer">
  <button type="button" class="sp-track-btn" @click="$emit('open-track')">
    <span class="sp-track-icon" aria-hidden="true">◆</span>
    VIEW REWARD TRACK
  </button>
</div>
```

Style the footer with the existing teal accent (`#66ffee`) to match the SP dialog's color palette. The button should feel like a navigation action, not a primary CTA — subtle border, no fill, teal text.

- [ ] **Step 2:** Add `'open-track'` to the component's `defineEmits`.

#### Part B: Reward track progress dialog (new component)

- [ ] **Step 3:** Create `src/components/RewardTrackDialog.vue`. This is the main reward track view. Structure:

**Props:**

```typescript
defineProps<{
  open: boolean
  milestones: RewardTrackMilestone[]
  unlockedIds: string[]
  totalSp: number
}>()
```

**Layout:**

- Header: "SP REWARD TRACK" + close button (same `science-head` pattern as other dialogs).
- **Progress summary** at top: current SP, next milestone name + SP threshold, progress bar showing percentage toward next milestone. Use the warm amber palette (`#e8b060`) from `AchievementsDialog` to distinguish from the teal SP ledger.
- **Tier sections** (Tier 1: First Steps, Tier 2: Getting Comfortable, etc.) as collapsible or scrollable groups.
- Each milestone row uses the `ach-row` / `ach-row--locked` pattern:
  - **Modifier rows** (has `modifierKey`): Icon + title always visible. Unlocked: show description + modifier badge (e.g. `+5% movementSpeed`). Locked: show `Reach ${sp} SP`.
  - **Perk rows** (has `perkId`): Icon + title always visible (perk names are evocative, not spoilers). Unlocked: show full effect description with a `PERK` type badge. Locked: show `Reach ${sp} SP to unlock this perk.`
- **Visual progress:** Unlocked rows have a subtle left-border accent or checkmark. The "current progress" row (next to unlock) should stand out with a glow or highlight.

**Styling:** Match the existing dialog system (`Teleport to="body"`, `science-fade` transition, dark glass background). Use amber accent colors (reward-track identity) rather than teal (SP identity) to give the dialog its own feel.

- [ ] **Step 4:** Add a "back to SP ledger" or simple close button. The dialog replaces / overlays the SP ledger (closing the SP dialog first is fine, or stack them — implementer's choice, but closing first is simpler).

#### Part C: Achievements dialog — compact summary section

- [ ] **Step 5:** In `AchievementsDialog.vue`, add a new prop and section:

```typescript
rewardTrack: RewardTrackMilestone[]   // or minimal pick type
```

Add a `rewardTrackLockedHint` function (mirrors `libsLockedHint`):

```typescript
function rewardTrackLockedHint(a: RewardTrackMilestone): string {
  if (props.totalSp >= a.sp) return a.description
  return `Reach ${a.sp} SP (currently ${props.totalSp}).`
}
```

Add section "SP reward track" positioned after LIBS calibration. This is a **compact** view — show all 26 rows in the same `ach-row` style as LIBS/DAN/survival. No tier grouping, no progress bar (the full view lives in `RewardTrackDialog`).

- [ ] **Step 6:** Update the empty-state check (`libs.length === 0 && dan.length === 0 && survival.length === 0`) to also consider `rewardTrack.length`.

#### Part D: View wiring

- [ ] **Step 7:** In `MartianSiteView.vue`:
  1. Add `rewardTrackOpen = ref(false)` alongside existing dialog state refs.
  2. Import and mount `RewardTrackDialog` with props from `useRewardTrack()`.
  3. Handle `SciencePointsDialog`'s `@open-track` event: close SP dialog, open reward track dialog.
  4. Pass `rewardTrack` prop to `AchievementsDialog` from `useRewardTrack().milestones`.
  5. Update `totalAchievementCount` to include reward-track length.

- [ ] **Step 8:** Commit: `feat: reward track dialog accessible from SP ledger and achievements`

---

### Task 5: Night Vision perk (Phase 2 — first qualitative perk)

**Prerequisite:** Tasks 1–3 complete (perk set is computed and exposed).

**Files:**

- Modify: `src/views/MarsSiteViewController.ts`
- Modify: `src/composables/useRewardTrack.ts` (if `hasPerk` not yet wired to controller)

- [ ] **Step 1:** Expose `hasPerk` from `useRewardTrack` to the site controller's frame context. In `MartianSiteView.vue`, pass `hasPerk` (or a reactive `hasNightVision` boolean) into the controller setup or `SiteFrameContext`.

- [ ] **Step 2:** In `MarsSiteViewController.ts` around line 624, change:

```typescript
// Before:
const nightPenalty = 1.0 - nightFactor * 0.5
// After:
const nightPenaltyFactor = hasNightVision ? 0.35 : 0.5
const nightPenalty = 1.0 - nightFactor * nightPenaltyFactor
```

This establishes the pattern for all future perk checks in the controller.

- [ ] **Step 3:** Add unit test or inline doc: at full night (`nightFactor=1`), base penalty = 0.5 (50% speed), with Night Vision = 0.65 (35% penalty).

- [ ] **Step 4:** Manual test: grant 200+ SP in dev, verify movement at night is faster.

- [ ] **Step 5:** Commit: `feat: night vision reward track perk`

---

## Risks and mitigations

1. **Circular imports:** `useRewardTrack` imports `useSciencePoints` (for `totalSP`) but NOT `usePlayerProfile`. `useSciencePoints` imports `usePlayerProfile` (for `mod`). The view bridges: `useRewardTrack().trackModifiers` → `usePlayerProfile().applyRewardTrack()`. No cycle.

2. **Modifier double-application:** Reward track applies as additive percentage offsets (same convention as archetype/foundation/patron layers). `resolveModifiers` sums all four layers then converts to multipliers. One call, one conversion.

3. **Flush order on SP award:** `mod('spYield')` is read synchronously in `award()`. The reward-track `watchEffect` fires asynchronously after the call stack clears. The crossing award uses pre-crossing modifiers. This is correct behavior. Tests should verify: award that crosses 150 SP (unlocking `+5% spYield`) does NOT receive the +5% bonus on itself.

4. **localStorage race / corruption:** Use `try/catch` around `localStorage` reads (private browsing may throw). Fall back to 0 on parse failure. Write is fire-and-forget.

5. **Scope creep:** Implement Tasks 1–4 (Phase 1) before Task 5 (Phase 2). Do not build perk gameplay hooks (Second Wind, Dust Shaker, etc.) until the systems they depend on exist.

---

## Verification commands

```bash
npm run test
npm run build
```

Manual checklist:
- [ ] Grant SP via `devAwardSciencePoints(25)` — banner fires at 20 SP.
- [ ] Check `profile.modifiers.movementSpeed` in console — reflects +5%.
- [ ] Click SP button in HUD — ledger shows the 25 SP gain, "VIEW REWARD TRACK" button visible at bottom.
- [ ] Click "VIEW REWARD TRACK" — reward track dialog opens, 20-SP "SWIFT WHEELS" row unlocked, progress bar shows current SP vs next milestone (50 SP "KEEN EYE").
- [ ] Scroll through tiers — locked rows show SP hints, perk rows show titles but locked descriptions.
- [ ] Open achievements dialog (trophy button) — reward track section visible with compact row list.
- [ ] Reload page — `totalSP` persists, unlocked rows still show in both dialogs.
- [ ] Grant 200+ SP — perk banner fires for Night Vision (Phase 2).
- [ ] Drive at night — movement noticeably faster with perk.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-03-23-sp-reward-track.md`.

**1. Subagent-driven (recommended)** — Fresh subagent per task, review between tasks.

**2. Inline execution** — Run tasks in this session with checkpoints.

Which approach do you want for implementation?
