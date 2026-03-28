# Sky Crane Touchdown Tethers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a short late-descent touchdown beat with a visible descent stage, four tethers, a brief release moment, and immediate flyaway.

**Architecture:** A pure touchdown helper module owns the timing thresholds so the behavior is testable without Three.js scene setup. `SiteScene` consumes those helpers to show a lightweight descent-stage group, update four line tethers, release them on touchdown, and then resume the existing deploy flow.

**Tech Stack:** TypeScript, Three.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-22-sky-crane-touchdown-tethers-design.md`

---

### Task 1: Touchdown timing helper

**Files:**
- Create: `src/three/skyCraneTouchdown.ts`
- Test: `src/three/__tests__/skyCraneTouchdown.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- late descent visibility starts only near touchdown
- tether tension stays high before touchdown and drops during release
- release completes after a short flyaway window

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/three/__tests__/skyCraneTouchdown.test.ts`
Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add small exported constants and pure functions with TSDoc for:
- late descent phase check
- normalized release progress
- normalized tether tension

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/three/__tests__/skyCraneTouchdown.test.ts`
Expected: PASS

---

### Task 2: SiteScene touchdown tether visuals

**Files:**
- Modify: `src/three/SiteScene.ts`
- Modify: `src/three/skyCraneTouchdown.ts`

- [ ] **Step 1: Add descent-stage and tether scene members**

Create a lightweight group above the rover and four tether lines anchored to rover-space points.

- [ ] **Step 2: Update late-descent logic**

Use the helper functions to:
- show the descent stage only near touchdown
- keep tethers taut while descending
- release them immediately after touchdown
- move the descent stage up/out during the flyaway beat

- [ ] **Step 3: Delay deploy animation until release finishes**

Start the existing deployment animation after the tether release window, not on first ground contact.

- [ ] **Step 4: Clean up geometry and materials in dispose()**

Ensure all temporary touchdown visuals are disposed cleanly.

---

### Task 3: Regression verification

**Files:**
- Test: `src/three/__tests__/skyCraneTouchdown.test.ts`
- Modify: `src/views/MartianSiteView.vue` only if UI copy needs tuning

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- src/three/__tests__/skyCraneTouchdown.test.ts`
Expected: PASS

- [ ] **Step 2: Run typecheck/build verification**

Run: `npm run build`
Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Check the touchdown copy**

Keep the current `SKY CRANE DESCENT` overlay unless the new beat clearly needs extra wording.
