# Level Progression & Site Difficulty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-tier site progression gated by a legacy counter, with full geological data for all sites, future hazard stubs, and globe view lock UI.

**Architecture:** `landmarks.json` becomes the single source of truth for tier, difficulty, and hazard data. A `useLegacy` composable reads/writes `mars-legacy` from localStorage. The globe view reads legacy level to gate the SELECT SITE button. `getTerrainParamsForSite` reads geological fields from all landmark types (not just `type === 'geological'`). Legacy increments when m13 completes, detected via a watcher in `MartianSiteView.vue`.

**Tech Stack:** Vue 3, TypeScript, Vitest, localStorage

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `public/data/landmarks.json` | Remove Schiaparelli; add tier/radiationIndex/meteorRisk to all; add geological fields to landing sites |
| Modify | `src/types/landmark.ts` | Add shared fields (tier, radiationIndex, meteorRisk, geological fields) to types |
| Create | `src/composables/useLegacy.ts` | Read/write `mars-legacy` from localStorage |
| Test | `src/composables/__tests__/useLegacy.test.ts` | Test legacy composable |
| Modify | `src/views/MarsSiteViewController.ts` | Update `getTerrainParamsForSite` to read geological fields from any landmark type |
| Modify | `src/components/LandmarkInfoCard.vue` | Disable SELECT SITE when tier locked; add tooltip |
| Modify | `src/views/GlobeView.vue` | Pass legacy level to LandmarkInfoCard |
| Modify | `src/components/MarsCanvas.vue` | Fly to Acidalia Planitia on mount |
| Modify | `src/views/MartianSiteView.vue` | Watch for m13 completion and increment legacy |
| Modify | `src/three/terrain/GlbTerrainGenerator.ts` | Remove schiaparelli from GLB_TERRAIN_SITES |
| Delete | `public/terrain/schiaparelli.glb` | Remove unused terrain file |
| Modify | `src/types/__tests__/missionsData.test.ts` | Update landmark validation tests |

---

### Task 1: Update Landmark Types

**Files:**
- Modify: `src/types/landmark.ts`

- [ ] **Step 1: Add shared fields and geological fields to LandingSite**

Replace the full contents of `src/types/landmark.ts`:

```typescript
export interface LandmarkBase {
  id: string
  name: string
  lat: number
  lon: number
  description: string
  accent: string
  tier: 1 | 2 | 3
  radiationIndex: number
  meteorRisk: number
}

/** Geological fields shared by both landmark types. */
export interface GeologicalData {
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap'
  diameterKm: number
  elevationKm: number
  surfacePressureMbar: number
  temperatureMinK: number
  temperatureMaxK: number
  waterIceIndex: number
  ironOxideIndex: number
  silicateIndex: number
  basaltIndex: number
  roughness: number
  dustCover: number
  craterDensity: number
  geologicalAge: 'noachian' | 'hesperian' | 'amazonian'
}

export interface LandingSite extends LandmarkBase, GeologicalData {
  type: 'landing-site'
  mission: string
  agency: string
  year: number
  status: 'operational' | 'completed' | 'failed' | 'lost'
}

export interface GeologicalFeature extends LandmarkBase, GeologicalData {
  type: 'geological'
}

export type Landmark = LandingSite | GeologicalFeature

export interface LandmarkHoverEvent {
  landmark: Landmark
  screenX: number
  screenY: number
}
```

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: Errors about missing fields in landmark data — that's expected, we'll fix the JSON next. Just confirm the types themselves compile.

- [ ] **Step 3: Commit**

```bash
git add src/types/landmark.ts
git commit -m "feat(landmarks): add tier, radiation, meteor, and geological fields to all landmark types"
```

---

### Task 2: Update landmarks.json

**Files:**
- Modify: `public/data/landmarks.json`

This is a large data task. The full JSON is provided in the spec. Here's what to do:

- [ ] **Step 1: Remove Schiaparelli entry**

Delete the entire `schiaparelli` object from the missions array (the entry with `"id": "schiaparelli"`).

- [ ] **Step 2: Add tier, radiationIndex, meteorRisk to all existing geological features**

For each geological feature, add the three new fields. Values from the spec:

| ID | tier | radiationIndex | meteorRisk |
|----|------|---------------|------------|
| acidalia-planitia | 1 | 0.15 | 0.10 |
| hellas-basin | 1 | 0.10 | 0.08 |
| utopia-planitia | 1 | 0.15 | 0.10 |
| argyre-basin | 2 | 0.20 | 0.15 |
| syrtis-major | 2 | 0.30 | 0.25 |
| arsia-mons | 3 | 0.70 | 0.55 |
| ascraeus-mons | 3 | 0.75 | 0.60 |
| elysium-mons | 3 | 0.60 | 0.50 |
| north-polar-cap | 3 | 0.85 | 0.70 |
| olympus-mons | 3 | 0.80 | 0.65 |
| pavonis-mons | 3 | 0.65 | 0.55 |
| south-polar-cap | 3 | 0.90 | 0.75 |
| valles-marineris | 3 | 0.25 | 0.15 |

- [ ] **Step 3: Add full geological fields to all landing sites**

Each landing site gets `tier`, `radiationIndex`, `meteorRisk`, plus all geological fields. Example for Insight:

```json
{
  "id": "insight",
  "name": "InSight",
  "lat": 4.50,
  "lon": 135.62,
  "description": "...(existing)...",
  "accent": "#66bb6a",
  "type": "landing-site",
  "mission": "InSight",
  "agency": "NASA",
  "year": 2018,
  "status": "completed",
  "tier": 1,
  "radiationIndex": 0.20,
  "meteorRisk": 0.12,
  "featureType": "plain",
  "diameterKm": 0,
  "elevationKm": -2.5,
  "surfacePressureMbar": 645,
  "temperatureMinK": 170,
  "temperatureMaxK": 285,
  "waterIceIndex": 0.15,
  "ironOxideIndex": 0.55,
  "silicateIndex": 0.35,
  "basaltIndex": 0.70,
  "roughness": 0.15,
  "dustCover": 0.50,
  "craterDensity": 0.20,
  "geologicalAge": "hesperian"
}
```

Full landing site geological values from the spec:

| ID | tier | rad | meteor | rough | dust | crater | tempMin/MaxK | elevKm | waterIce | ironOx | sili | basalt | feature | geoAge |
|----|------|-----|--------|-------|------|--------|-------------|--------|----------|--------|------|--------|---------|--------|
| insight | 1 | 0.20 | 0.12 | 0.15 | 0.50 | 0.20 | 170/285 | -2.5 | 0.15 | 0.55 | 0.35 | 0.70 | plain | hesperian |
| zhurong | 1 | 0.15 | 0.10 | 0.15 | 0.60 | 0.25 | 160/270 | -4.0 | 0.45 | 0.55 | 0.40 | 0.55 | plain | hesperian |
| beagle-2 | 2 | 0.25 | 0.20 | 0.25 | 0.40 | 0.30 | 165/280 | -3.5 | 0.20 | 0.60 | 0.40 | 0.65 | plain | hesperian |
| curiosity | 2 | 0.25 | 0.18 | 0.50 | 0.45 | 0.40 | 163/280 | -4.5 | 0.25 | 0.60 | 0.50 | 0.55 | basin | noachian |
| mars-3 | 2 | 0.30 | 0.22 | 0.35 | 0.50 | 0.35 | 148/260 | 0.5 | 0.30 | 0.50 | 0.40 | 0.50 | plain | noachian |
| mars-6 | 2 | 0.25 | 0.20 | 0.30 | 0.55 | 0.30 | 160/275 | -1.0 | 0.20 | 0.55 | 0.45 | 0.55 | plain | noachian |
| mars-polar-lander | 2 | 0.40 | 0.30 | 0.30 | 0.40 | 0.20 | 145/230 | 1.0 | 0.65 | 0.20 | 0.25 | 0.20 | plain | amazonian |
| opportunity | 2 | 0.20 | 0.15 | 0.20 | 0.50 | 0.35 | 168/290 | -1.4 | 0.15 | 0.80 | 0.35 | 0.40 | plain | noachian |
| pathfinder | 2 | 0.20 | 0.18 | 0.35 | 0.60 | 0.45 | 163/278 | -3.7 | 0.10 | 0.65 | 0.40 | 0.50 | plain | hesperian |
| perseverance | 2 | 0.22 | 0.18 | 0.40 | 0.45 | 0.40 | 165/285 | -2.0 | 0.30 | 0.55 | 0.50 | 0.50 | basin | noachian |
| phoenix | 2 | 0.45 | 0.30 | 0.20 | 0.35 | 0.15 | 140/225 | -4.1 | 0.80 | 0.15 | 0.20 | 0.15 | plain | amazonian |
| spirit | 2 | 0.22 | 0.18 | 0.35 | 0.55 | 0.50 | 163/280 | -1.9 | 0.20 | 0.60 | 0.45 | 0.55 | basin | noachian |
| viking-1 | 2 | 0.22 | 0.18 | 0.30 | 0.55 | 0.35 | 160/260 | -3.6 | 0.20 | 0.60 | 0.40 | 0.50 | plain | hesperian |
| viking-2 | 2 | 0.30 | 0.22 | 0.25 | 0.50 | 0.30 | 150/245 | -4.5 | 0.50 | 0.50 | 0.35 | 0.45 | plain | hesperian |
| mars-2 | 3 | 0.50 | 0.35 | 0.55 | 0.60 | 0.50 | 145/255 | 2.0 | 0.35 | 0.50 | 0.40 | 0.45 | plain | noachian |

For `surfacePressureMbar` on landing sites, use the formula: `610 - elevationKm * 14` (approximation from the weather system). For negative elevations, this gives higher pressure.

For `diameterKm` on landing sites: use 0 for plain-type sites, use the actual crater diameter for basin-type sites (Curiosity/Gale Crater = 154, Perseverance/Jezero = 45, Spirit/Gusev = 166).

- [ ] **Step 4: Validate JSON**

Run: `node -e "const d = JSON.parse(require('fs').readFileSync('public/data/landmarks.json','utf8')); console.log(d.length + ' landmarks'); console.log(d.filter(l => !l.tier).map(l => l.id))"`
Expected: `28 landmarks` and empty array (no landmarks missing tier).

- [ ] **Step 5: Commit**

```bash
git add public/data/landmarks.json
git commit -m "feat(landmarks): add tier/geological data to all sites, remove Schiaparelli"
```

---

### Task 3: Create useLegacy Composable

**Files:**
- Create: `src/composables/useLegacy.ts`
- Create: `src/composables/__tests__/useLegacy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/composables/__tests__/useLegacy.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useLegacy } from '../useLegacy'

describe('useLegacy', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-legacy')
  })

  it('starts at 0 when no localStorage value', () => {
    const { legacyLevel } = useLegacy()
    expect(legacyLevel.value).toBe(0)
  })

  it('reads existing value from localStorage', () => {
    localStorage.setItem('mars-legacy', '2')
    const { legacyLevel } = useLegacy()
    expect(legacyLevel.value).toBe(2)
  })

  it('incrementLegacy bumps from 0 to 1 when completing on tier 1', () => {
    const { legacyLevel, incrementLegacy } = useLegacy()
    incrementLegacy(1)
    expect(legacyLevel.value).toBe(1)
    expect(localStorage.getItem('mars-legacy')).toBe('1')
  })

  it('incrementLegacy bumps from 1 to 2 when completing on tier 2', () => {
    localStorage.setItem('mars-legacy', '1')
    const { legacyLevel, incrementLegacy } = useLegacy()
    incrementLegacy(2)
    expect(legacyLevel.value).toBe(2)
    expect(localStorage.getItem('mars-legacy')).toBe('2')
  })

  it('does not increment when completing on same or lower tier', () => {
    localStorage.setItem('mars-legacy', '1')
    const { legacyLevel, incrementLegacy } = useLegacy()
    incrementLegacy(1)
    expect(legacyLevel.value).toBe(1)
  })

  it('does not increment beyond 2', () => {
    localStorage.setItem('mars-legacy', '2')
    const { legacyLevel, incrementLegacy } = useLegacy()
    incrementLegacy(3)
    expect(legacyLevel.value).toBe(2)
  })

  it('isTierUnlocked returns true for tier <= legacy + 1', () => {
    localStorage.setItem('mars-legacy', '1')
    const { isTierUnlocked } = useLegacy()
    expect(isTierUnlocked(1)).toBe(true)
    expect(isTierUnlocked(2)).toBe(true)
    expect(isTierUnlocked(3)).toBe(false)
  })

  it('tier 1 is always unlocked', () => {
    const { isTierUnlocked } = useLegacy()
    expect(isTierUnlocked(1)).toBe(true)
    expect(isTierUnlocked(2)).toBe(false)
    expect(isTierUnlocked(3)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useLegacy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useLegacy**

Create `src/composables/useLegacy.ts`:

```typescript
import { ref } from 'vue'

const STORAGE_KEY = 'mars-legacy'

function readLegacy(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : 0
  } catch {
    return 0
  }
}

const legacyLevel = ref(readLegacy())

function incrementLegacy(completedSiteTier: number): void {
  // Completing m13 on tier N unlocks tier N+1 (legacy = N)
  // Tier 1 completion → legacy 1, Tier 2 completion → legacy 2
  if (completedSiteTier >= 3) return // tier 3 doesn't unlock anything new
  const newLevel = completedSiteTier as 1 | 2
  if (newLevel <= legacyLevel.value) return // already at or above this level
  legacyLevel.value = newLevel
  try {
    localStorage.setItem(STORAGE_KEY, String(newLevel))
  } catch { /* ignore */ }
}

function isTierUnlocked(tier: number): boolean {
  if (tier <= 1) return true
  return legacyLevel.value >= tier - 1
}

export function useLegacy() {
  return {
    legacyLevel,
    incrementLegacy,
    isTierUnlocked,
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/composables/__tests__/useLegacy.test.ts`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useLegacy.ts src/composables/__tests__/useLegacy.test.ts
git commit -m "feat(legacy): add useLegacy composable with tier gating"
```

---

### Task 4: Update getTerrainParamsForSite

**Files:**
- Modify: `src/views/MarsSiteViewController.ts:156-198`

- [ ] **Step 1: Update to read geological fields from any landmark type**

Replace the `getTerrainParamsForSite` function (lines 156-198):

```typescript
export function getTerrainParamsForSite(siteId: string, landmarks: Ref<readonly Landmark[]>): TerrainParams {
  const site = landmarks.value.find((l) => l.id === siteId)
  if (!site) {
    return {
      roughness: 0.4, craterDensity: 0.3, dustCover: 0.6,
      elevation: 0.5, elevationKm: 0, ironOxide: 0.6, basalt: 0.5,
      seed: hashString(siteId) + Math.floor(Date.now() / 1000),
      siteId, featureType: 'plain' as const,
      waterIceIndex: 0.1, silicateIndex: 0.3,
      temperatureMaxK: 280, temperatureMinK: 160,
    }
  }

  return {
    roughness: site.roughness,
    craterDensity: site.craterDensity,
    dustCover: site.dustCover,
    elevation: Math.min(1, Math.max(0, (site.elevationKm + 8) / 30)),
    elevationKm: site.elevationKm,
    ironOxide: site.ironOxideIndex,
    basalt: site.basaltIndex,
    seed: hashString(site.id) + Math.floor(Date.now() / 1000),
    siteId: site.id,
    featureType: site.featureType,
    waterIceIndex: site.waterIceIndex,
    silicateIndex: site.silicateIndex,
    temperatureMaxK: site.temperatureMaxK,
    temperatureMinK: site.temperatureMinK,
    latDeg: site.lat,
    lonDeg: site.lon,
  }
}
```

Now both `geological` and `landing-site` landmarks have the same geological fields, so we read them uniformly. The only fallback is when the landmark isn't found at all.

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors (assuming landmarks.json is updated).

- [ ] **Step 3: Commit**

```bash
git add src/views/MarsSiteViewController.ts
git commit -m "feat(terrain): read geological fields from all landmark types uniformly"
```

---

### Task 5: Globe View — Lock UI & Default Camera

**Files:**
- Modify: `src/components/LandmarkInfoCard.vue`
- Modify: `src/views/GlobeView.vue`
- Modify: `src/components/MarsCanvas.vue`

- [ ] **Step 1: Add legacy prop and lock logic to LandmarkInfoCard**

In `src/components/LandmarkInfoCard.vue`, update the props to accept `legacyLevel`:

```typescript
const props = defineProps<{
  landmark: Landmark | null
  legacyLevel?: number
}>()
```

Replace the SELECT SITE button in the template:

```vue
<button
  class="select-site-btn"
  :class="{ locked: !siteUnlocked }"
  :disabled="!siteUnlocked"
  :title="lockTooltip"
  @click="$emit('select-site', landmark!)"
>
  {{ siteUnlocked ? 'SELECT SITE' : 'LOCKED' }}
</button>
```

Add computed properties in the script:

```typescript
import { computed } from 'vue'

const siteUnlocked = computed(() => {
  if (!props.landmark) return false
  const tier = props.landmark.tier
  const legacy = props.legacyLevel ?? 0
  if (tier <= 1) return true
  return legacy >= tier - 1
})

const lockTooltip = computed(() => {
  if (siteUnlocked.value) return ''
  const tier = props.landmark?.tier ?? 2
  const requiredTier = tier - 1
  return `Complete the Deep Signal mission on a Tier ${requiredTier} site to unlock`
})
```

- [ ] **Step 2: Add locked button styles**

Add to the `<style scoped>` section:

```css
.select-site-btn.locked {
  background: rgba(120, 120, 120, 0.3);
  color: rgba(200, 200, 200, 0.5);
  cursor: not-allowed;
  border: 1px solid rgba(120, 120, 120, 0.3);
}

.select-site-btn.locked:hover {
  background: rgba(120, 120, 120, 0.3);
}
```

- [ ] **Step 3: Pass legacyLevel from GlobeView to LandmarkInfoCard**

In `src/views/GlobeView.vue`, import and use the legacy composable:

```typescript
import { useLegacy } from '@/composables/useLegacy'

const { legacyLevel } = useLegacy()
```

Update the template:

```vue
<LandmarkInfoCard
  :landmark="selectedLandmark"
  :legacy-level="legacyLevel"
  @close="selectedLandmark = null"
  @select-site="onSelectSite"
/>
```

- [ ] **Step 4: Default globe camera to Acidalia Planitia**

In `src/components/MarsCanvas.vue`, after `emit('ready')` (line 64), add a fly-to for the default landmark:

```typescript
// Default camera to Acidalia Planitia
const acidalia = marsScene.landmarks.getLandmarkTarget('acidalia-planitia')
if (acidalia) flyTo(acidalia.position, acidalia.distance)
```

The full onMounted block's end becomes:

```typescript
  emit('ready')

  // Default camera to Acidalia Planitia
  const acidalia = marsScene.landmarks.getLandmarkTarget('acidalia-planitia')
  if (acidalia) flyTo(acidalia.position, acidalia.distance)
})
```

- [ ] **Step 5: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/LandmarkInfoCard.vue src/views/GlobeView.vue src/components/MarsCanvas.vue
git commit -m "feat(globe): add tier lock UI, legacy gating, default camera to Acidalia"
```

---

### Task 6: Legacy Increment on m13 Completion

**Files:**
- Modify: `src/views/MartianSiteView.vue`

When mission m13-deep-signal completes, check the current site's tier and increment legacy.

- [ ] **Step 1: Add legacy watcher**

In `MartianSiteView.vue`, in the `<script setup>` section, import and use the composable, then add a watcher on completed missions:

```typescript
import { useLegacy } from '@/composables/useLegacy'

const { incrementLegacy } = useLegacy()
```

Add a watcher that detects m13 completion:

```typescript
watch(
  () => useMissions().completedMissions.value,
  (completed, prev) => {
    // Check if m13-deep-signal just completed (wasn't in previous list)
    const wasCompleted = prev?.some(s => s.missionId === 'm13-deep-signal') ?? false
    const nowCompleted = completed.some(s => s.missionId === 'm13-deep-signal')
    if (nowCompleted && !wasCompleted) {
      const { landmarks } = useMarsData()
      const site = landmarks.value.find(l => l.id === siteId)
      if (site) {
        incrementLegacy(site.tier)
      }
    }
  },
)
```

Note: `siteId` is already available in scope (from `route.params.siteId`). `useMarsData` is already imported.

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(legacy): increment legacy level when m13 completes based on site tier"
```

---

### Task 7: Cleanup — Remove Schiaparelli GLB and Update Tests

**Files:**
- Delete: `public/terrain/schiaparelli.glb`
- Modify: `src/three/terrain/GlbTerrainGenerator.ts`
- Modify: `src/types/__tests__/missionsData.test.ts` (if it validates landmarks)

- [ ] **Step 1: Remove Schiaparelli from GLB_TERRAIN_SITES**

In `src/three/terrain/GlbTerrainGenerator.ts`, remove `'schiaparelli',` from the `GLB_TERRAIN_SITES` set.

- [ ] **Step 2: Delete the GLB file**

```bash
rm public/terrain/schiaparelli.glb
```

- [ ] **Step 3: Update landmark validation test if needed**

Check if `src/types/__tests__/missionsData.test.ts` or any other test validates landmark count or IDs. If it does, update the expected count from 30 to 28 (29 minus Schiaparelli). Also check for any test that validates landmark fields — it may need updating to expect `tier`, `radiationIndex`, `meteorRisk` on all landmarks.

- [ ] **Step 4: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 5: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "chore: remove Schiaparelli site and GLB, update tests"
```

---

### Task 8: Full Integration Test

**Files:** None (manual testing + automated)

- [ ] **Step 1: Run all tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 2: Type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Globe view test**

Run: `npm run dev`. Navigate to globe view. Verify:
1. Camera flies to Acidalia Planitia on load
2. Click Acidalia Planitia — SELECT SITE button enabled
3. Click a Tier 2 site (e.g., Viking-1) — SELECT SITE shows "LOCKED" with tooltip
4. Click a Tier 3 site (e.g., Olympus Mons) — SELECT SITE shows "LOCKED" with tooltip
5. All 28 pins visible on globe (no Schiaparelli)

- [ ] **Step 4: Site terrain test**

Navigate to a Tier 1 landing site (e.g., `/site/insight`). Verify:
1. Terrain loads from GLB
2. Weather system uses site-specific temperature values (not generic defaults)
3. Power/thermal systems respond to site conditions

- [ ] **Step 5: Legacy persistence test**

Set `mars-legacy` to `1` in localStorage. Reload globe view. Verify:
1. Tier 1 sites — SELECT SITE enabled
2. Tier 2 sites — SELECT SITE enabled
3. Tier 3 sites — SELECT SITE shows "LOCKED"

- [ ] **Step 6: Final commit (if fixups needed)**

```bash
git add -A
git commit -m "fix: integration fixups for level progression"
```
