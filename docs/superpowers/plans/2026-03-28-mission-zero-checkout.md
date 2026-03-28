# Mission Zero: Systems Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mission m00-checkout — a sequential tutorial teaching power boot, UI inspection, movement, and LGA transmission flow, rewarding the microphone unlock.

**Architecture:** Three new objective types (`power-boot`, `ui-inspect`, `avionics-test`) using the existing notification-ref pattern in `useMissions.ts`. PowerHud gets a collapsed boot state persisted via localStorage. Transmission teaching uses two timed `showComm` toasts from `MartianSiteView.vue`.

**Tech Stack:** Vue 3, TypeScript, Vitest, localStorage

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/missions.ts` | Add 3 new objective types to `ObjectiveType` union |
| Modify | `src/composables/useMissions.ts` | Add notification refs, checkers, and notify functions for `power-boot`, `ui-inspect`, `avionics-test` |
| Modify | `src/components/PowerHud.vue` | Add collapsed boot state with BOOT POWER button |
| Modify | `src/views/MartianSiteView.vue` | Wire notify calls into keybind handlers, add transmission toasts, update first-mission delivery |
| Modify | `src/views/MarsSiteViewController.ts` | Track cumulative rover distance for avionics-test |
| Modify | `public/data/missions.json` | Add m00-checkout definition, reframe m01 briefing |
| Test | `src/composables/__tests__/useMissions.checkout.test.ts` | Test new objective checkers |

---

### Task 1: Add New Objective Types to TypeScript Union

**Files:**
- Modify: `src/types/missions.ts:1-14`

- [ ] **Step 1: Update ObjectiveType union**

In `src/types/missions.ts`, add the three new types to the union:

```typescript
export type ObjectiveType =
  | 'go-to'
  | 'gather'
  | 'sam-experiment'
  | 'apxs'
  | 'mastcam-tag'
  | 'chemcam'
  | 'dan-prospect'
  | 'transmit'
  | 'rtg-overdrive'
  | 'rtg-shunt'
  | 'rems-activate'
  | 'use-repair-kit'
  | 'install-upgrade'
  | 'power-boot'
  | 'ui-inspect'
  | 'avionics-test'
```

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/missions.ts
git commit -m "feat(missions): add power-boot, ui-inspect, avionics-test objective types"
```

---

### Task 2: Add Notification Refs and Checkers in useMissions.ts

**Files:**
- Modify: `src/composables/useMissions.ts`

This follows the exact pattern of `rtgOverdriveTriggered`/`notifyRtgOverdrive` (lines 397-406).

- [ ] **Step 1: Write failing tests**

Create `src/composables/__tests__/useMissions.checkout.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useMissions } from '../useMissions'

describe('Mission Zero objective checkers', () => {
  beforeEach(() => {
    useMissions().resetForTests()
  })

  it('power-boot checker returns false until notifyPowerBooted is called', () => {
    const m = useMissions()
    // Load a minimal catalog with a power-boot objective
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'pb-1', type: 'power-boot', label: 'Boot power', params: {}, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    // Before notify: objective should not be done
    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(false)

    // After notify: objective should be done
    m.notifyPowerBooted()
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[0].done).toBe(true)
  })

  it('ui-inspect checker completes when matching target is inspected', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'ui-1', type: 'ui-inspect', label: 'Inspect profile', params: { target: 'profile' }, sequential: true },
          { id: 'ui-2', type: 'ui-inspect', label: 'Inspect heater', params: { target: 'heater' }, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    // Inspect profile
    m.notifyUiInspected('profile')
    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(true)
    expect(state.objectives[1].done).toBe(false)

    // Inspect heater (different target)
    m.notifyUiInspected('heater')
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[1].done).toBe(true)
  })

  it('avionics-test checker completes when cumulative distance >= threshold', () => {
    const m = useMissions()
    m.loadCatalog({
      version: 1,
      missions: [{
        id: 'm00-test',
        name: 'Test',
        patron: null,
        description: '',
        briefing: '',
        reward: { sp: 0 },
        unlocks: [],
        chain: null,
        objectives: [
          { id: 'av-1', type: 'avionics-test', label: 'Move 5m', params: { distanceM: 5 }, sequential: true },
        ],
      }],
    })
    m.accept('m00-test', 1)

    // Move 3m — not enough
    m.addAvionicsDistance(3)
    m.checkAllObjectives(0, 0, [], 1)
    const state = m.missionStates.value.find(s => s.missionId === 'm00-test')!
    expect(state.objectives[0].done).toBe(false)

    // Move 2.5m more — total 5.5m, should pass
    m.addAvionicsDistance(2.5)
    m.checkAllObjectives(0, 0, [], 1)
    expect(state.objectives[0].done).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useMissions.checkout.test.ts`
Expected: FAIL — `notifyPowerBooted`, `notifyUiInspected`, `addAvionicsDistance` do not exist.

- [ ] **Step 3: Add notification refs and notify functions**

In `src/composables/useMissions.ts`, after the existing notification refs (around line 401), add:

```typescript
const powerBooted = ref(false)
const inspectedTargets = ref<Set<string>>(new Set())
const avionicsDistanceM = ref(0)

function notifyPowerBooted(): void {
  powerBooted.value = true
}

function notifyUiInspected(target: string): void {
  const next = new Set(inspectedTargets.value)
  next.add(target)
  inspectedTargets.value = next
}

function addAvionicsDistance(deltaM: number): void {
  avionicsDistanceM.value += deltaM
}
```

- [ ] **Step 4: Register checkers**

In the same file, after the existing `registerChecker('install-upgrade', ...)` call (around line 389), add:

```typescript
registerChecker('power-boot', () => powerBooted.value)

registerChecker('ui-inspect', (p) => {
  const target = p.target as string
  return inspectedTargets.value.has(target)
})

registerChecker('avionics-test', (p) => {
  const required = (p.distanceM as number) ?? 5
  return avionicsDistanceM.value >= required
})
```

- [ ] **Step 5: Update resetForTests**

In `resetForTests()` (around line 426), add resets:

```typescript
powerBooted.value = false
inspectedTargets.value = new Set()
avionicsDistanceM.value = 0
```

Also add the same three lines to `resetMissionProgressForDev()` (around line 442).

- [ ] **Step 6: Export new functions**

In the return object of `useMissions()` (around line 519), add:

```typescript
notifyPowerBooted,
notifyUiInspected,
addAvionicsDistance,
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/composables/__tests__/useMissions.checkout.test.ts`
Expected: All 3 tests PASS.

- [ ] **Step 8: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No new errors.

- [ ] **Step 9: Commit**

```bash
git add src/composables/useMissions.ts src/composables/__tests__/useMissions.checkout.test.ts
git commit -m "feat(missions): add power-boot, ui-inspect, avionics-test checkers with tests"
```

---

### Task 3: PowerHud Boot State

**Files:**
- Modify: `src/components/PowerHud.vue`

- [ ] **Step 1: Add booted prop and boot event**

In `PowerHud.vue`, update the script to add a `booted` prop and a `boot` emit:

```typescript
const props = defineProps<{
  batteryWh: number
  capacityWh: number
  generationW: number
  consumptionW: number
  netW: number
  socPct: number
  nightFactor?: number
  booted?: boolean
}>()

const emit = defineEmits<{
  boot: []
}>()
```

- [ ] **Step 2: Add collapsed template**

Wrap the existing panel content in a `v-if="booted !== false"` guard, and add the collapsed state. Replace the template:

```vue
<template>
  <div class="power-panel" :class="{ 'low-soc': booted !== false && socPct < 20 }">
    <div class="pp-label">PWR</div>
    <template v-if="booted !== false">
      <!-- existing content: bar track, wh row, dividers, tooltips, source icons, RTG -->
      <div class="pp-bar-track">
        <div
          class="pp-bar-fill"
          :class="barClass"
          :style="{ height: Math.min(100, socPct) + '%' }"
        />
        <div
          class="pp-bar-threshold"
          role="img"
          :aria-label="`Sleep threshold at ${POWER_SLEEP_THRESHOLD_PCT} percent charge`"
          :style="{ bottom: POWER_SLEEP_THRESHOLD_PCT + '%' }"
        />
      </div>
      <div class="pp-wh-row" aria-label="State of charge watt-hours">
        <span class="pp-wh-main">{{ whDisplay }}</span><span class="pp-wh-cap">/{{ capDisplay }}Wh</span>
      </div>
      <div class="pp-divider" />
      <HudCursorTooltip title="Net power" :body="tipNet" as="div">
        <div class="pp-net" :class="netPositive ? 'charge' : 'drain'">
          {{ netPositive ? '+' : '' }}{{ netW.toFixed(0) }}W
        </div>
      </HudCursorTooltip>
      <HudCursorTooltip title="Generation" :body="tipGeneration" as="div">
        <div class="pp-detail">
          <span class="pp-detail-val">{{ generationW.toFixed(0) }}</span>W gen
        </div>
      </HudCursorTooltip>
      <HudCursorTooltip title="Consumption" :body="tipConsumption" as="div">
        <div class="pp-detail pp-use" :class="useLevelClass">
          <span class="pp-detail-val">{{ consumptionW.toFixed(0) }}</span>W use
        </div>
      </HudCursorTooltip>
      <div class="pp-divider" />
      <HudCursorTooltip title="Solar at a glance" :body="tipSolarIcons" as="div">
        <div class="pp-source-icons">{{ solarIcons }}</div>
      </HudCursorTooltip>
      <HudCursorTooltip title="RTG" :body="tipRtg" as="div">
        <div class="pp-source-label">&#x25C9; RTG</div>
      </HudCursorTooltip>
    </template>
    <template v-else>
      <button type="button" class="pp-boot-btn" @click="emit('boot')">
        &#x26A1; BOOT POWER
      </button>
    </template>
  </div>
</template>
```

- [ ] **Step 3: Add boot button styles**

Add to the `<style scoped>` section:

```css
.pp-boot-btn {
  all: unset;
  cursor: pointer;
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  margin: 4px 0;
  width: 100%;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #e8a060;
  background: rgba(196, 117, 58, 0.1);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 4px;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.pp-boot-btn:hover {
  background: rgba(196, 117, 58, 0.25);
  border-color: rgba(196, 117, 58, 0.6);
}
```

- [ ] **Step 4: Remove pointer-events:none when in boot state**

The existing `.power-panel` has `pointer-events: none`. The boot button already sets `pointer-events: auto` on itself, which overrides the parent. No further change needed.

- [ ] **Step 5: Visual check**

Run: `npm run dev`
Open the app. With `booted={false}` you should see a compact panel with "PWR" header and the boot button. Clicking it should emit `boot`.

- [ ] **Step 6: Commit**

```bash
git add src/components/PowerHud.vue
git commit -m "feat(power): add collapsed boot state to PowerHud"
```

---

### Task 4: Wire PowerHud Boot State in MartianSiteView

**Files:**
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Add powerBooted ref and localStorage persistence**

In the `<script setup>` section of `MartianSiteView.vue`, near the other state refs (around line 250), add:

```typescript
const POWER_BOOTED_KEY = 'mars-power-booted'
const powerBooted = ref(localStorage.getItem(POWER_BOOTED_KEY) === '1')

function handlePowerBoot(): void {
  powerBooted.value = true
  try { localStorage.setItem(POWER_BOOTED_KEY, '1') } catch { /* ignore */ }
  useMissions().notifyPowerBooted()
  playUiCue('ui.switch')
}
```

- [ ] **Step 2: Update PowerHud template usage**

Find the `<PowerHud` usage in the template (around line 454) and add the booted prop and boot handler:

```vue
<PowerHud
  :battery-wh="batteryWh"
  :capacity-wh="capacityWh"
  :generation-w="generationW"
  :consumption-w="consumptionW"
  :net-w="netW"
  :soc-pct="socPct"
  :booted="powerBooted"
  @boot="handlePowerBoot"
/>
```

- [ ] **Step 3: Also call notifyPowerBooted on mount if already booted**

After the `powerBooted` ref declaration, add a one-shot sync so the checker knows about previously-booted state:

```typescript
if (powerBooted.value) {
  useMissions().notifyPowerBooted()
}
```

- [ ] **Step 4: Visual check**

Run: `npm run dev`
Clear `mars-power-booted` from localStorage. Verify the PowerHud shows the boot button. Click it. Verify the panel expands. Reload — verify it stays booted.

- [ ] **Step 5: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(power): wire PowerHud boot state with localStorage persistence"
```

---

### Task 5: Wire UI Inspect Notifications

**Files:**
- Modify: `src/views/MartianSiteView.vue`

The `ui-inspect` objective needs to fire `notifyUiInspected(target)` when the player opens each panel. Instrument-based targets (wheels, heater, LGA) all go through `activeInstrumentSlot`, so a single watcher covers both keyboard and button paths. Profile uses a boolean ref, so it gets a direct call.

- [ ] **Step 1: Add notify call to toggleProfilePanel**

In `toggleProfilePanel()` (around line 642), add the notify call when opening:

```typescript
function toggleProfilePanel(): void {
  playUiCue('ui.switch')
  profileOpen.value = !profileOpen.value
  if (profileOpen.value) useMissions().notifyUiInspected('profile')
}
```

Profile is not an instrument slot — it uses a boolean ref toggled by Digit0/Backquote and the button click, both of which call `toggleProfilePanel()`. This single change covers both paths.

- [ ] **Step 2: Add activeInstrumentSlot watcher for wheels, heater, LGA**

Add a watcher in the `<script setup>` section (near other watchers):

```typescript
watch(activeInstrumentSlot, (slot) => {
  if (slot === WHLS_SLOT) useMissions().notifyUiInspected('wheels')
  if (slot === HEATER_SLOT) useMissions().notifyUiInspected('heater')
  if (slot === 11) useMissions().notifyUiInspected('lga')
})
```

This covers both keyboard shortcuts (H/B/R in RoverController) and button clicks (toggleWheelsPanel/toggleHeaterPanel/CommToolbar @select), since all paths update `activeInstrumentSlot`. No changes needed to the toggle functions or CommToolbar handler.

- [ ] **Step 3: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(missions): wire ui-inspect notifications for profile, wheels, heater, LGA"
```

---

### Task 6: Wire Avionics Distance Tracking

**Files:**
- Modify: `src/views/MarsSiteViewController.ts`

The animation loop already updates `roverWorldX` and `roverWorldZ` each frame (around line 809). We track cumulative distance by comparing position deltas.

- [ ] **Step 1: Add distance tracking to the animation loop**

In `MarsSiteViewController.ts`, near the top of the `createMarsSiteViewController` function, after local variable declarations, add:

```typescript
let prevRoverX = 0
let prevRoverZ = 0
let roverPosInitialized = false
```

Then in the animation loop, after the existing position update (around line 810, after `roverWorldZ.value = siteScene.rover.position.z`), add:

```typescript
// Cumulative distance for avionics-test objective
if (roverPosInitialized) {
  const dx = siteScene.rover.position.x - prevRoverX
  const dz = siteScene.rover.position.z - prevRoverZ
  const dist = Math.sqrt(dx * dx + dz * dz)
  if (dist > 0.001) {
    missions.addAvionicsDistance(dist)
  }
}
prevRoverX = siteScene.rover.position.x
prevRoverZ = siteScene.rover.position.z
roverPosInitialized = true
```

Note: Scene units are roughly 1:1 with meters at site scale (terrain is 800x800 units for a site), so `dist` in scene units is approximately meters. If the site uses a different scale factor, adjust the value in the mission JSON `distanceM` param instead.

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Manual test**

Run: `npm run dev`. Accept a test mission with avionics-test objective. Use WASD to move. Verify the objective completes after ~5m of movement.

- [ ] **Step 4: Commit**

```bash
git add src/views/MarsSiteViewController.ts
git commit -m "feat(missions): track cumulative rover distance for avionics-test objective"
```

---

### Task 7: Add Mission Zero to missions.json

**Files:**
- Modify: `public/data/missions.json`

- [ ] **Step 1: Add m00-checkout as the first mission in the array**

Insert before the existing `m01-triangulate` entry. The mission must be `missions[0]` because the first-mission delivery code uses `catalog.value[0]`:

```json
{
  "id": "m00-checkout",
  "name": "Systems Checkout",
  "patron": null,
  "description": "EDL complete. Before ops clears you for field work, the bus needs a once-over.",
  "briefing": "Landing telemetry says you're intact. Landing telemetry is generated by the same firmware that once reported a successful parachute deploy while the chute was still packed. Trust, but verify — starting with the power bus.\n\nBoot the reactor. Check your profile to see what you're working with. Roll the wheels. Prove you can drive in something approximating a straight line. Confirm the heater isn't decorative.\n\nWhen all that's stamped, pull up the low-gain antenna. That's where your mission queue lives — and the transmit button is how Earth knows you did anything at all. Nothing counts until the paperwork reaches orbit.\n\nOne more thing: manifest shows an additional payload module that isn't on the standard packing list. Finish the checkout and we'll clear it for install. Catalogued under 'discretionary science hardware.' Nobody in procurement could explain it either.\n\nSP accrues as you complete objectives. Check the reward track — the rover gets better the more science it does. Think of it as compound interest, except the bank is on another planet.",
  "reward": { "sp": 10 },
  "unlocks": ["mic"],
  "chain": "m01-triangulate",
  "objectives": [
    { "id": "chk-1", "type": "power-boot", "label": "Boot power systems", "params": {}, "sequential": true },
    { "id": "chk-2", "type": "ui-inspect", "label": "Inspect rover profile [0]", "params": { "target": "profile" }, "sequential": true },
    { "id": "chk-3", "type": "ui-inspect", "label": "Inspect wheels [B]", "params": { "target": "wheels" }, "sequential": true },
    { "id": "chk-4", "type": "avionics-test", "label": "Test avionics \u2014 move 5\u202fm", "params": { "distanceM": 5 }, "sequential": true },
    { "id": "chk-5", "type": "ui-inspect", "label": "Inspect heater [H]", "params": { "target": "heater" }, "sequential": true },
    { "id": "chk-6", "type": "ui-inspect", "label": "Inspect LGA [R] \u2014 review transmit", "params": { "target": "lga" }, "sequential": true }
  ]
}
```

- [ ] **Step 2: Reframe m01-triangulate briefing**

Update the `m01-triangulate` briefing to acknowledge checkout completion. Replace the existing briefing:

```json
"briefing": "Checkout stamped. Systems nominal — or nominal enough for government work.\n\nDescent telemetry is filed as nominal. The spreadsheet says you're fine. Mars says spreadsheets lie. Three transponder stakes were emplaced pre-landing — Alpha, Beta, Gamma. Per LVOP checkout you need an echo off each before we can assign a map grid and pretend the insurance paperwork matches reality. Drive the circuit. Ping all three. After that, Section 1 of your onboarding packet is stamped complete. Section 2 is weather. Try to look excited on the inside."
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('public/data/missions.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add public/data/missions.json
git commit -m "feat(missions): add m00-checkout mission definition, reframe m01 briefing"
```

---

### Task 8: Transmission Teaching Toasts

**Files:**
- Modify: `src/views/MartianSiteView.vue`

When mission m00-checkout transitions to `awaiting-transmit`, fire two `showComm` toasts to teach the player how transmission works.

- [ ] **Step 1: Add a watcher for m00 awaiting-transmit state**

In `MartianSiteView.vue`, in the `<script setup>` section, add a watcher. Place it near other mission-related watchers:

```typescript
import { watch } from 'vue'

// Transmission teaching toasts for m00-checkout
watch(
  () => useMissions().awaitingTransmit.value,
  (awaiting) => {
    const isCheckout = awaiting.some(s => s.missionId === 'm00-checkout')
    if (!isCheckout) return

    // Toast 1: immediate guidance
    sampleToastRef.value?.showComm?.('Select the LGA [R] to transmit completed missions')

    // Toast 2: delayed flavor (after reward/achievement toasts settle)
    setTimeout(() => {
      sampleToastRef.value?.showComm?.('Transmission is how data becomes science. Get used to the uplink.')
    }, 10_000)
  },
)
```

- [ ] **Step 2: Verify the watcher only fires once**

The watcher fires whenever `awaitingTransmit` changes. Since m00-checkout transitions to `awaiting-transmit` once and then to `completed`, the watcher will see it once. The `some()` check ensures it only fires for m00. Once the mission completes (status changes to `completed`), it leaves `awaitingTransmit` and the check returns false. No debounce needed.

- [ ] **Step 3: Manual test**

Run: `npm run dev`. Complete all 6 checkout objectives. Verify:
1. Toast 1 appears immediately: "Select the LGA [R] to transmit completed missions"
2. Toast 2 appears ~10s later: "Transmission is how data becomes science. Get used to the uplink."
3. Transmit button on LGA is highlighted (existing behavior).

- [ ] **Step 4: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(missions): add transmission teaching toasts for m00-checkout completion"
```

---

### Task 9: Sync Power Boot on Load for Returning Players

**Files:**
- Modify: `src/views/MartianSiteView.vue`

If a player has already booted power (localStorage flag set), and they reload — the power-boot checker needs to know. This was partially handled in Task 4 Step 3, but we also need to make sure the notification fires *after* the catalog is loaded.

- [ ] **Step 1: Move the boot sync to after catalog load**

In `MartianSiteView.vue`, find where `createSiteControllerContext()` is called and the catalog is loaded. After `wireArchiveCheckers()` is called (the controller's mount sets this up), add a hook. The cleanest place is in the `onMounted` or the controller creation callback.

Look for the pattern in the MarsSiteViewController where `wireArchiveCheckers()` is called (around line 624). After that line, in the same block, the first mission delivery runs. The `notifyPowerBooted()` call from Task 4 Step 3 should be fine since `useMissions()` is a singleton — the call happens at script setup time, before catalog load, but the ref persists. The checker reads `powerBooted.value` which was set to `true`. When `checkAllObjectives` runs in the animation loop, it will see the ref as `true`. This is correct — no change needed.

- [ ] **Step 2: Verify**

Run: `npm run dev`. Set `mars-power-booted` to `1` in localStorage manually. Load the game. Accept m00-checkout. Verify the first objective (Boot power) auto-completes immediately.

- [ ] **Step 3: Commit (skip if no changes needed)**

If Step 1 determined no changes are needed, skip this commit.

---

### Task 10: Full Integration Test

**Files:** None (manual testing)

- [ ] **Step 1: Clean state test**

Clear all `mars-*` keys from localStorage. Run `npm run dev`. Verify:
1. PowerHud shows collapsed with BOOT POWER button
2. First LGA message arrives with m00-checkout mission
3. Accept mission — 6 sequential objectives appear
4. Click BOOT POWER — objective 1 completes, PowerHud expands
5. Press 0 — profile opens, objective 2 completes
6. Press B — wheels panel opens, objective 3 completes
7. WASD to move ~5m — objective 4 completes
8. Press H — heater panel opens, objective 5 completes
9. Press R — LGA opens, objective 6 completes
10. Mission goes to awaiting-transmit
11. Toast 1 appears immediately
12. Transmit button highlighted
13. Click transmit — mission completes
14. Toast 2 appears ~10s after step 10
15. +10 SP awarded
16. Microphone unlocked (M key and mic button now work)
17. m01-triangulate delivered via LGA ~3s after completion

- [ ] **Step 2: Returning player test**

Reload the page. Verify:
1. PowerHud starts booted (expanded)
2. m01-triangulate is active (or delivered if not yet accepted)
3. Microphone is available

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass, including the new checkout tests.

- [ ] **Step 4: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: integration fixups for m00-checkout"
```
