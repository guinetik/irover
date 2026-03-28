# Character Creation Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 5-step TUI-style character creation form that collects archetype, motivation, origin, and foundation, then commits to `usePlayerProfile`, with route guards and localStorage persistence.

**Architecture:** Single `CharacterCreateView.vue` orchestrates 7 internal steps (5 selection + processing + acceptance) via a `currentStep` ref. Child components render each step. `usePlayerProfile` is extended with origin/motivation fields and localStorage persistence. Route guards enforce profile progression.

**Tech Stack:** Vue 3 Composition API, Vue Router, TypeScript, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-character-creation-design.md`

---

### Task 1: Extend usePlayerProfile — data model

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`
- Modify: `src/composables/__tests__/usePlayerProfile.sandbox.test.ts`

- [ ] **Step 1: Write failing tests for new types and fields**

Add to the existing test file:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import {
  usePlayerProfile,
  ORIGINS,
  MOTIVATIONS,
  type OriginId,
  type MotivationId,
} from '../usePlayerProfile'

describe('PlayerProfile origin & motivation', () => {
  it('profile has origin and motivation fields defaulting to null', () => {
    const { profile } = usePlayerProfile()
    expect(profile.origin).toBeNull()
    expect(profile.motivation).toBeNull()
  })

  it('ORIGINS has earth, metropolis, lunar entries', () => {
    expect(Object.keys(ORIGINS)).toEqual(['earth', 'metropolis', 'lunar'])
    expect(ORIGINS.earth.name).toBe('Earth')
  })

  it('MOTIVATIONS has legacy, therapist, commute entries', () => {
    expect(Object.keys(MOTIVATIONS)).toEqual(['legacy', 'therapist', 'commute'])
    expect(MOTIVATIONS.therapist.name).toBe('Therapist')
  })

  it('setIdentity stores origin and motivation without affecting modifiers', () => {
    const { profile, setIdentity, mod } = usePlayerProfile()
    setIdentity('earth', 'commute')
    expect(profile.origin).toBe('earth')
    expect(profile.motivation).toBe('commute')
    expect(mod('movementSpeed')).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: FAIL — `ORIGINS`, `MOTIVATIONS`, `setIdentity` not exported.

- [ ] **Step 3: Implement origin and motivation types and definitions**

In `src/composables/usePlayerProfile.ts`, add after the `FOUNDATIONS` block (after line 103):

```typescript
// --- Origins (Step 3 — flavor only, no modifiers) ---

export type OriginId = 'earth' | 'metropolis' | 'lunar'

export interface OriginDef {
  id: OriginId
  name: string
  description: string
}

export const ORIGINS: Record<OriginId, OriginDef> = {
  earth: {
    id: 'earth',
    name: 'Earth',
    description:
      'Born and raised on the homeworld. You know what real weather feels like. Familiar with natural terrain, organic geology, and open skies.',
  },
  metropolis: {
    id: 'metropolis',
    name: 'Metropolis Colony',
    description:
      "A generation station in the belt. Steel floors, recycled air, artificial gravity. You've never seen a horizon that wasn't a viewport.",
  },
  lunar: {
    id: 'lunar',
    name: 'Lunar Settlement',
    description:
      'Low gravity, long shadows, and silence. The Moon teaches patience. You understand regolith. You understand isolation.',
  },
}

// --- Motivations (Step 2 — flavor only, no modifiers) ---

export type MotivationId = 'legacy' | 'therapist' | 'commute'

export interface MotivationDef {
  id: MotivationId
  name: string
  description: string
}

export const MOTIVATIONS: Record<MotivationId, MotivationDef> = {
  legacy: {
    id: 'legacy',
    name: 'Legacy',
    description:
      "I believe humanity's future depends on becoming a multi-planetary species, and I want to contribute to that legacy.",
  },
  therapist: {
    id: 'therapist',
    name: 'Therapist',
    description:
      "My therapist suggested I find a hobby that 'gets me out of the house.' This seemed like the logical extreme.",
  },
  commute: {
    id: 'commute',
    name: 'Commute',
    description:
      "I heard the commute is only 7 months and there's no traffic.",
  },
}
```

- [ ] **Step 4: Extend PlayerProfile interface and singleton**

In the same file, update `PlayerProfile`:

```typescript
export interface PlayerProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  origin: OriginId | null
  motivation: MotivationId | null
  /** Final stacked modifiers as multipliers (1.0 = no change, 1.15 = +15%) */
  modifiers: ProfileModifiers
  /** True until character creation is completed; enables unrestricted play */
  sandbox: boolean
}
```

Update `createNeutralProfile()`:

```typescript
export function createNeutralProfile(): PlayerProfile {
  return {
    archetype: null,
    foundation: null,
    patron: null,
    origin: null,
    motivation: null,
    modifiers: { ...NEUTRAL_MODIFIERS },
    sandbox: false,
  }
}
```

Update `createPlayerProfile()`:

```typescript
export function createPlayerProfile(
  archetype: ArchetypeId,
  foundation: FoundationId,
  patron: PatronId,
): PlayerProfile {
  return {
    archetype,
    foundation,
    patron,
    origin: null,
    motivation: null,
    modifiers: resolveModifiers(
      ARCHETYPES[archetype].modifiers,
      FOUNDATIONS[foundation].modifiers,
      PATRONS[patron].modifiers,
    ),
    sandbox: false,
  }
}
```

Add `setIdentity` to the composable return, and add the refs + function inside `usePlayerProfile()`:

```typescript
const chosenOrigin = ref<OriginId | null>(null)
const chosenMotivation = ref<MotivationId | null>(null)

function setIdentity(origin: OriginId, motivation: MotivationId): void {
  chosenOrigin.value = origin
  chosenMotivation.value = motivation
  profile.origin = origin
  profile.motivation = motivation
}
```

Update `recomputeModifiers` to also sync origin/motivation from refs:

```typescript
function recomputeModifiers(): void {
  profile.origin = chosenOrigin.value
  profile.motivation = chosenMotivation.value
  if (!chosenArchetype.value || !chosenFoundation.value || !chosenPatron.value) {
    profile.archetype = null
    profile.foundation = null
    profile.patron = null
    Object.assign(profile.modifiers, resolveModifiers(rewardTrackLayer.value))
    return
  }
  // ... rest unchanged
}
```

Update the composable return to include new exports:

```typescript
return {
  profile,
  setProfile,
  setIdentity,
  applyRewardTrack,
  mod,
  ARCHETYPES,
  FOUNDATIONS,
  PATRONS,
  ORIGINS,
  MOTIVATIONS,
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/composables/usePlayerProfile.ts src/composables/__tests__/usePlayerProfile.sandbox.test.ts
git commit -m "feat(profile): add origin and motivation types, definitions, and setIdentity"
```

---

### Task 2: localStorage persistence for profile

**Files:**
- Modify: `src/composables/usePlayerProfile.ts`
- Modify: `src/composables/__tests__/usePlayerProfile.sandbox.test.ts`

- [ ] **Step 1: Write failing tests for persistence**

Add to the test file:

```typescript
describe('PlayerProfile localStorage persistence', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-profile-v1')
    // Reset profile to neutral state
    const { setProfile, setIdentity } = usePlayerProfile()
    setProfile(null, null, null)
    setIdentity(null as any, null as any)
  })

  it('saves profile to localStorage on setProfile', () => {
    const { setProfile } = usePlayerProfile()
    setProfile('maker', 'technologist', 'trc')
    const stored = JSON.parse(localStorage.getItem('mars-profile-v1')!)
    expect(stored.archetype).toBe('maker')
    expect(stored.foundation).toBe('technologist')
    expect(stored.patron).toBe('trc')
  })

  it('saves identity to localStorage on setIdentity', () => {
    const { setIdentity } = usePlayerProfile()
    setIdentity('earth', 'commute')
    const stored = JSON.parse(localStorage.getItem('mars-profile-v1')!)
    expect(stored.origin).toBe('earth')
    expect(stored.motivation).toBe('commute')
  })

  it('hydrates profile from localStorage on init', async () => {
    localStorage.setItem(
      'mars-profile-v1',
      JSON.stringify({
        archetype: 'maker',
        foundation: 'technologist',
        patron: 'trc',
        origin: 'earth',
        motivation: 'legacy',
        sandbox: false,
      }),
    )
    // Re-import to trigger hydration — use resetProfileForTests helper
    const { hydrateProfile, profile } = usePlayerProfile()
    hydrateProfile()
    expect(profile.archetype).toBe('maker')
    expect(profile.origin).toBe('earth')
    expect(profile.motivation).toBe('legacy')
    // Modifiers should be recomputed, not stored
    expect(profile.modifiers.movementSpeed).toBe(1.05)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: FAIL — no persistence logic, no `hydrateProfile`.

- [ ] **Step 3: Implement persistence**

In `src/composables/usePlayerProfile.ts`, add persistence helpers:

```typescript
const STORAGE_KEY = 'mars-profile-v1'

interface StoredProfile {
  archetype: ArchetypeId | null
  foundation: FoundationId | null
  patron: PatronId | null
  origin: OriginId | null
  motivation: MotivationId | null
  sandbox: boolean
}

function saveToStorage(): void {
  const data: StoredProfile = {
    archetype: chosenArchetype.value,
    foundation: chosenFoundation.value,
    patron: chosenPatron.value,
    origin: chosenOrigin.value,
    motivation: chosenMotivation.value,
    sandbox: profile.sandbox,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function hydrateProfile(): void {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const data: StoredProfile = JSON.parse(raw)
    chosenArchetype.value = data.archetype
    chosenFoundation.value = data.foundation
    chosenPatron.value = data.patron
    chosenOrigin.value = data.origin ?? null
    chosenMotivation.value = data.motivation ?? null
    profile.sandbox = data.sandbox ?? false
    recomputeModifiers()
  } catch {
    // Corrupted data — ignore
  }
}

function clearProfile(): void {
  chosenArchetype.value = null
  chosenFoundation.value = null
  chosenPatron.value = null
  chosenOrigin.value = null
  chosenMotivation.value = null
  profile.sandbox = false
  recomputeModifiers()
  localStorage.removeItem(STORAGE_KEY)
}
```

Add `saveToStorage()` calls at the end of `setProfile()`, `setIdentity()`, and `applyRewardTrack()`.

Run hydration on module load (after the singleton is created):

```typescript
// Hydrate from storage on first load
hydrateProfile()
```

Add `hydrateProfile` and `clearProfile` to the composable return.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/usePlayerProfile.sandbox.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/usePlayerProfile.ts src/composables/__tests__/usePlayerProfile.sandbox.test.ts
git commit -m "feat(profile): add localStorage persistence, hydration, and clearProfile"
```

---

### Task 3: Active site persistence

**Files:**
- Create: `src/composables/useActiveSite.ts`
- Create: `src/composables/__tests__/useActiveSite.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useActiveSite } from '../useActiveSite'

describe('useActiveSite', () => {
  beforeEach(() => {
    localStorage.removeItem('mars-active-site-v1')
    const { clear } = useActiveSite()
    clear()
  })

  it('returns null when no site is saved', () => {
    const { activeSite } = useActiveSite()
    expect(activeSite.value).toBeNull()
  })

  it('saves and retrieves siteId + seed', () => {
    const { activeSite, setSite } = useActiveSite()
    setSite('jezero-crater', 42)
    expect(activeSite.value).toEqual({ siteId: 'jezero-crater', seed: 42 })
  })

  it('persists to localStorage', () => {
    const { setSite } = useActiveSite()
    setSite('gale-crater', 99)
    const stored = JSON.parse(localStorage.getItem('mars-active-site-v1')!)
    expect(stored.siteId).toBe('gale-crater')
    expect(stored.seed).toBe(99)
  })

  it('hydrates from localStorage', () => {
    localStorage.setItem(
      'mars-active-site-v1',
      JSON.stringify({ siteId: 'syrtis-major', seed: 7 }),
    )
    const { hydrate, activeSite } = useActiveSite()
    hydrate()
    expect(activeSite.value).toEqual({ siteId: 'syrtis-major', seed: 7 })
  })

  it('clear removes site and localStorage entry', () => {
    const { setSite, clear, activeSite } = useActiveSite()
    setSite('jezero-crater', 42)
    clear()
    expect(activeSite.value).toBeNull()
    expect(localStorage.getItem('mars-active-site-v1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/composables/__tests__/useActiveSite.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement useActiveSite**

Create `src/composables/useActiveSite.ts`:

```typescript
import { ref } from 'vue'

export interface ActiveSiteData {
  siteId: string
  seed: number
}

const STORAGE_KEY = 'mars-active-site-v1'

const activeSite = ref<ActiveSiteData | null>(null)

function hydrate(): void {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return
  try {
    const data: ActiveSiteData = JSON.parse(raw)
    if (data.siteId && typeof data.seed === 'number') {
      activeSite.value = data
    }
  } catch {
    // Corrupted — ignore
  }
}

// Hydrate on first load
hydrate()

export function useActiveSite() {
  function setSite(siteId: string, seed: number): void {
    const data: ActiveSiteData = { siteId, seed }
    activeSite.value = data
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  function clear(): void {
    activeSite.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    activeSite,
    setSite,
    clear,
    hydrate,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useActiveSite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/composables/useActiveSite.ts src/composables/__tests__/useActiveSite.test.ts
git commit -m "feat: add useActiveSite composable with localStorage persistence"
```

---

### Task 4: Routes and guards

**Files:**
- Modify: `src/router/index.ts`

- [ ] **Step 1: Add `/create` and `/patron` routes**

```typescript
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/create',
      name: 'create',
      component: () => import('@/views/CharacterCreateView.vue'),
    },
    {
      path: '/patron',
      name: 'patron',
      component: () => import('@/views/PatronSelectView.vue'),
    },
    {
      path: '/globe',
      name: 'globe',
      component: () => import('@/views/GlobeView.vue'),
    },
    {
      path: '/site/:siteId',
      name: 'site',
      component: () => import('@/views/MartianSiteView.vue'),
    },
  ],
})
```

- [ ] **Step 2: Add route guards**

Below the router definition in the same file:

```typescript
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useActiveSite } from '@/composables/useActiveSite'

router.beforeEach((to) => {
  const { profile, clearProfile } = usePlayerProfile()
  const { clear: clearSite } = useActiveSite()

  // Entering /create resets profile + active site (fresh start)
  if (to.name === 'create') {
    clearProfile()
    clearSite()
    return true
  }

  // /patron requires creation done (archetype + foundation + origin set)
  if (to.name === 'patron') {
    if (!profile.archetype || !profile.foundation || !profile.origin) {
      return { name: 'home' }
    }
    return true
  }

  // /globe requires patron set
  if (to.name === 'globe') {
    if (!profile.patron) {
      return { name: 'home' }
    }
    return true
  }

  // /site requires full profile
  if (to.name === 'site') {
    if (!profile.archetype || !profile.foundation || !profile.patron) {
      return { name: 'home' }
    }
    return true
  }

  return true
})
```

- [ ] **Step 3: Create PatronSelectView placeholder**

Create `src/views/PatronSelectView.vue`:

```vue
<template>
  <div class="patron-placeholder">
    <p>PATRON SELECTION — COMING SOON</p>
    <button @click="$router.push('/globe')">[ SKIP TO GLOBE ]</button>
  </div>
</template>

<style scoped>
.patron-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  gap: 24px;
}

button {
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 8px 24px;
  cursor: pointer;
}

button:hover {
  border-color: rgba(196, 149, 106, 0.6);
  color: rgba(196, 149, 106, 1);
}
</style>
```

- [ ] **Step 4: Verify dev server loads without errors**

Run: `npx vite --open` (or the running dev server)
Navigate to `/create` — should show empty page (view not built yet).
Navigate to `/patron` — should redirect to `/` (no profile).
Navigate to `/globe` — should redirect to `/` (no patron).

- [ ] **Step 5: Commit**

```bash
git add src/router/index.ts src/views/PatronSelectView.vue
git commit -m "feat: add /create and /patron routes with profile-based guards"
```

---

### Task 5: CreateOptionCard component

**Files:**
- Create: `src/components/create/CreateOptionCard.vue`

- [ ] **Step 1: Build the shared option card component**

```vue
<template>
  <button
    class="option"
    :class="{ selected }"
    @click="$emit('select')"
  >
    <span class="radio">{{ selected ? '\u25CF' : '\u25CB' }}</span>
    <span class="label">
      <span class="name">{{ name }}</span>
      <span class="desc">"{{ description }}"</span>
    </span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  description: string
  selected: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<style scoped>
.option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.5);
  transition: color 0.15s ease;
}

.option:hover {
  color: rgba(255, 255, 255, 0.75);
}

.option.selected {
  color: #c4956a;
}

.radio {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.6;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.6;
  opacity: 0.7;
  padding-left: 2px;
}
</style>
```

- [ ] **Step 2: Verify component renders in isolation**

Temporarily import in any existing view or use Vite's HMR to confirm it renders. Check that click toggles the selected state visually.

- [ ] **Step 3: Commit**

```bash
git add src/components/create/CreateOptionCard.vue
git commit -m "feat(create): add CreateOptionCard shared component"
```

---

### Task 6: Step components (1-5)

**Files:**
- Create: `src/components/create/StepArchetype.vue`
- Create: `src/components/create/StepMotivation.vue`
- Create: `src/components/create/StepOrigin.vue`
- Create: `src/components/create/StepFoundation.vue`
- Create: `src/components/create/StepPosition.vue`

- [ ] **Step 1: Create StepArchetype.vue**

```vue
<template>
  <div class="step">
    <p class="prompt">Which best describes your approach to problem-solving?</p>
    <div class="options">
      <CreateOptionCard
        v-for="a in archetypes"
        :key="a.id"
        :name="a.name"
        :description="a.description"
        :selected="modelValue === a.id"
        @select="$emit('update:modelValue', a.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { ARCHETYPES, type ArchetypeId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: ArchetypeId | null }>()
defineEmits<{ 'update:modelValue': [value: ArchetypeId] }>()

const archetypes = Object.values(ARCHETYPES)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
```

- [ ] **Step 2: Create StepMotivation.vue**

```vue
<template>
  <div class="step">
    <p class="prompt">What drives your interest in Mars exploration?</p>
    <div class="options">
      <CreateOptionCard
        v-for="m in motivations"
        :key="m.id"
        :name="m.name"
        :description="m.description"
        :selected="modelValue === m.id"
        @select="$emit('update:modelValue', m.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { MOTIVATIONS, type MotivationId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: MotivationId | null }>()
defineEmits<{ 'update:modelValue': [value: MotivationId] }>()

const motivations = Object.values(MOTIVATIONS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
```

- [ ] **Step 3: Create StepOrigin.vue**

```vue
<template>
  <div class="step">
    <p class="prompt">Where did you grow up?</p>
    <div class="options">
      <CreateOptionCard
        v-for="o in origins"
        :key="o.id"
        :name="o.name"
        :description="o.description"
        :selected="modelValue === o.id"
        @select="$emit('update:modelValue', o.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { ORIGINS, type OriginId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: OriginId | null }>()
defineEmits<{ 'update:modelValue': [value: OriginId] }>()

const origins = Object.values(ORIGINS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
```

- [ ] **Step 4: Create StepFoundation.vue**

```vue
<template>
  <div class="step">
    <p class="prompt">What are your professional foundations?</p>
    <div class="options">
      <CreateOptionCard
        v-for="f in foundations"
        :key="f.id"
        :name="f.name"
        :description="f.description"
        :selected="modelValue === f.id"
        @select="$emit('update:modelValue', f.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { FOUNDATIONS, type FoundationId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: FoundationId | null }>()
defineEmits<{ 'update:modelValue': [value: FoundationId] }>()

const foundations = Object.values(FOUNDATIONS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
```

- [ ] **Step 5: Create StepPosition.vue**

```vue
<template>
  <div class="step">
    <p class="prompt">What is your desired position within the Mars Exploration Consortium?</p>
    <div class="options">
      <CreateOptionCard
        v-for="p in positions"
        :key="p.id"
        :name="p.name"
        :description="p.description"
        :selected="modelValue === p.id"
        @select="$emit('update:modelValue', p.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'

export type PositionId = 'ceo' | 'personality' | 'operator'

interface PositionDef {
  id: PositionId
  name: string
  description: string
}

const positions: PositionDef[] = [
  {
    id: 'ceo',
    name: 'CEO of a Multiplanetary Startup',
    description: 'You have a pitch deck. You have a vision. You have absolutely no relevant experience.',
  },
  {
    id: 'personality',
    name: 'Personality Hire',
    description: "You're a people person. You have great energy. You were told that counts for something.",
  },
  {
    id: 'operator',
    name: 'Remote Rover Operator',
    description: 'You read the job listing. You meet the qualifications. You applied for the actual job.',
  },
]

defineProps<{ modelValue: PositionId | null }>()
defineEmits<{ 'update:modelValue': [value: PositionId] }>()
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/create/
git commit -m "feat(create): add step components 1-5 (archetype, motivation, origin, foundation, position)"
```

---

### Task 7: ProcessingSequence and AcceptanceScreen

**Files:**
- Create: `src/components/create/ProcessingSequence.vue`
- Create: `src/components/create/AcceptanceScreen.vue`

- [ ] **Step 1: Create ProcessingSequence.vue**

```vue
<template>
  <div class="processing">
    <p v-for="(line, i) in visibleLines" :key="i" class="line" :class="{ dim: line.dim }">
      {{ line.text }}
    </p>
    <p v-if="showSnark" class="snark">{{ snarkText }}</p>
    <button v-if="showContinue" class="btn" @click="$emit('continue')">[ CONTINUE ]</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { PositionId } from './StepPosition.vue'

const props = defineProps<{ positionChoice: PositionId }>()
defineEmits<{ continue: [] }>()

interface Line { text: string; dim: boolean }

const lines: Line[] = [
  { text: 'PROCESSING APPLICATION...', dim: false },
  { text: '', dim: true },
  { text: '> Cross-referencing credentials with available positions...', dim: true },
  { text: '> Evaluating 2,847 concurrent applications...', dim: true },
  { text: '> Running background check...', dim: true },
  { text: '> Background check passed.', dim: true },
  { text: '> Matching to open positions...', dim: true },
  { text: '', dim: true },
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591 78%', dim: false },
]

const finalLines: Line[] = [
  { text: '\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588 100%', dim: false },
  { text: '', dim: true },
  { text: 'RESULT:', dim: false },
  { text: '', dim: true },
  { text: 'All positions matching your qualifications are currently filled.', dim: false },
]

const snarkMap: Record<PositionId, string> = {
  ceo: 'We noticed you applied for CEO. That position requires 200 years of experience and a net worth exceeding the GDP of Mars. You currently have neither. May we suggest an alternative?',
  personality: "The Personality Hire position has been permanently filled by a chatbot. It has better metrics than any human candidate. We're sure you understand.",
  operator: 'Well. At least one of you reads the job listing.',
}

const visibleLines = ref<Line[]>([])
const showSnark = ref(false)
const showContinue = ref(false)

const snarkText = snarkMap[props.positionChoice] ?? snarkMap.operator

onMounted(async () => {
  // Reveal initial lines one at a time
  for (const line of lines) {
    visibleLines.value.push(line)
    await delay(200)
  }
  await delay(800)
  // Show final lines
  for (const line of finalLines) {
    visibleLines.value.push(line)
    await delay(150)
  }
  await delay(400)
  showSnark.value = true
  await delay(1000)
  showContinue.value = true
})

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
</script>

<style scoped>
.processing {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
  color: rgba(196, 149, 106, 0.9);
}

.line.dim {
  color: rgba(196, 149, 106, 0.5);
}

.snark {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.7);
  max-width: 64ch;
}

.btn {
  margin-top: 32px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: #c4956a;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(196, 149, 106, 0.7);
  color: rgba(196, 149, 106, 1);
}
</style>
```

- [ ] **Step 2: Create AcceptanceScreen.vue**

```vue
<template>
  <div class="acceptance">
    <p class="line dim">> Application #MEC-2187-{{ appNumber }} APPROVED.</p>
    <p class="line">&nbsp;</p>
    <p class="line bright">Congratulations, Operator.</p>
    <p class="line">&nbsp;</p>
    <p class="line">You have been assigned to ROVER UNIT {{ roverId }}.</p>
    <p class="line dim">Vehicle: MSL-class Curiosity (refurbished)</p>
    <p class="line">&nbsp;</p>
    <p class="line dim">Please report to your local Spaceport</p>
    <p class="line dim">on Monday at 0600 for credential processing</p>
    <p class="line dim">and neural uplink calibration.</p>
    <p class="line">&nbsp;</p>
    <p class="line dim">Pack light. Mars provides the rest.</p>

    <button class="btn" @click="$emit('accept')">[ ACCEPT APPLICATION ]</button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ accept: [] }>()

const appNumber = String(Math.floor(Math.random() * 90000) + 10000)
const roverId = `MSL-2187-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 900) + 100}`
</script>

<style scoped>
.acceptance {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
  color: rgba(196, 149, 106, 0.9);
}

.line.dim {
  color: rgba(196, 149, 106, 0.5);
}

.line.bright {
  color: #c4956a;
  font-weight: 600;
}

.btn {
  margin-top: 40px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.4);
  color: #c4956a;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 10px 32px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(196, 149, 106, 0.8);
  color: rgba(196, 149, 106, 1);
}
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/create/ProcessingSequence.vue src/components/create/AcceptanceScreen.vue
git commit -m "feat(create): add ProcessingSequence and AcceptanceScreen components"
```

---

### Task 8: CharacterCreateView orchestrator

**Files:**
- Create: `src/views/CharacterCreateView.vue`

- [ ] **Step 1: Create the view**

```vue
<template>
  <div class="create-view">
    <header v-if="currentStep <= 5" class="header">
      <p class="org">MARS EXPLORATION CONSORTIUM — OPERATOR APPLICATION PORTAL v7.3.1</p>
      <p class="form">Form MEC-7720-B | Remote Vehicle Operations Division</p>
      <p class="section">SECTION {{ currentStep }} OF 5 — {{ sectionTitle }}</p>
    </header>

    <main class="content">
      <Transition name="fade" mode="out-in">
        <StepArchetype
          v-if="currentStep === 1"
          key="archetype"
          v-model="archetype"
        />
        <StepMotivation
          v-else-if="currentStep === 2"
          key="motivation"
          v-model="motivation"
        />
        <StepOrigin
          v-else-if="currentStep === 3"
          key="origin"
          v-model="origin"
        />
        <StepFoundation
          v-else-if="currentStep === 4"
          key="foundation"
          v-model="foundation"
        />
        <StepPosition
          v-else-if="currentStep === 5"
          key="position"
          v-model="position"
        />
        <ProcessingSequence
          v-else-if="currentStep === 6"
          key="processing"
          :position-choice="position!"
          @continue="currentStep = 7"
        />
        <AcceptanceScreen
          v-else-if="currentStep === 7"
          key="acceptance"
          @accept="onAccept"
        />
      </Transition>
    </main>

    <footer v-if="currentStep <= 5" class="nav">
      <button
        v-if="currentStep > 1"
        class="nav-btn"
        @click="currentStep--"
      >[ &lt; BACK ]</button>
      <span v-else />
      <button
        class="nav-btn"
        :disabled="!canAdvance"
        @click="currentStep++"
      >[ NEXT &gt; ]</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile, type ArchetypeId, type FoundationId, type OriginId, type MotivationId } from '@/composables/usePlayerProfile'
import StepArchetype from '@/components/create/StepArchetype.vue'
import StepMotivation from '@/components/create/StepMotivation.vue'
import StepOrigin from '@/components/create/StepOrigin.vue'
import StepFoundation from '@/components/create/StepFoundation.vue'
import StepPosition from '@/components/create/StepPosition.vue'
import type { PositionId } from '@/components/create/StepPosition.vue'
import ProcessingSequence from '@/components/create/ProcessingSequence.vue'
import AcceptanceScreen from '@/components/create/AcceptanceScreen.vue'

const router = useRouter()
const { setProfile, setIdentity } = usePlayerProfile()

const currentStep = ref(1)
const archetype = ref<ArchetypeId | null>(null)
const motivation = ref<MotivationId | null>(null)
const origin = ref<OriginId | null>(null)
const foundation = ref<FoundationId | null>(null)
const position = ref<PositionId | null>(null)

const sectionTitles: Record<number, string> = {
  1: 'OPERATOR PROFILE',
  2: 'PSYCHOLOGICAL EVALUATION',
  3: 'BIOGRAPHICAL DATA',
  4: 'PROFESSIONAL BACKGROUND',
  5: 'POSITION PREFERENCE',
}

const sectionTitle = computed(() => sectionTitles[currentStep.value] ?? '')

const canAdvance = computed(() => {
  switch (currentStep.value) {
    case 1: return archetype.value !== null
    case 2: return motivation.value !== null
    case 3: return origin.value !== null
    case 4: return foundation.value !== null
    case 5: return position.value !== null
    default: return false
  }
})

function onAccept(): void {
  setIdentity(origin.value!, motivation.value!)
  setProfile(archetype.value!, foundation.value!, null)
  router.push('/patron')
}
</script>

<style scoped>
.create-view {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #000;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 48px 64px;
  box-sizing: border-box;
  overflow-y: auto;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 40px;
}

.org {
  font-size: 11px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.4);
  margin: 0;
}

.form {
  font-size: 11px;
  color: rgba(196, 149, 106, 0.25);
  margin: 0;
}

.section {
  margin-top: 16px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(196, 149, 106, 0.6);
}

.content {
  flex: 1;
}

.nav {
  display: flex;
  justify-content: space-between;
  padding-top: 32px;
}

.nav-btn {
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: #c4956a;
  cursor: pointer;
  padding: 8px 0;
  letter-spacing: 0.1em;
  transition: color 0.15s;
}

.nav-btn:hover {
  color: rgba(196, 149, 106, 1);
}

.nav-btn:disabled {
  color: rgba(196, 149, 106, 0.2);
  cursor: not-allowed;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
```

- [ ] **Step 2: Verify the full flow in the browser**

Run the dev server. Navigate to `/create`. Walk through all 7 steps:
1. Select an archetype → NEXT
2. Select a motivation → NEXT
3. Select an origin → NEXT
4. Select a foundation → NEXT
5. Select a position → NEXT
6. Watch processing animation → CONTINUE
7. See acceptance screen → ACCEPT APPLICATION
8. Should navigate to `/patron`

Verify: BACK button works on steps 2-5. NEXT is disabled until selection is made.

- [ ] **Step 3: Commit**

```bash
git add src/views/CharacterCreateView.vue
git commit -m "feat(create): add CharacterCreateView orchestrator with 7-step flow"
```

---

### Task 9: Update HomeView — state-aware navigation

**Files:**
- Modify: `src/views/HomeView.vue`

- [ ] **Step 1: Update HomeView with continue/new mission logic**

Replace the entire file:

```vue
<template>
  <div class="home">
    <div class="hero">
      <h1 class="title">I, ROVER</h1>
      <p class="subtitle">Explore the Red Planet</p>
      <div class="actions">
        <button v-if="continueTarget" class="cta" @click="router.push(continueTarget)">
          CONTINUE
        </button>
        <button class="cta" :class="{ secondary: continueTarget }" @click="startNew">
          {{ continueTarget ? 'NEW MISSION' : 'BEGIN MISSION' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useActiveSite } from '@/composables/useActiveSite'

const router = useRouter()
const { profile, clearProfile } = usePlayerProfile()
const { activeSite, clear: clearSite } = useActiveSite()

const continueTarget = computed<string | null>(() => {
  // No profile at all — no continue
  if (!profile.archetype) return null

  // Creation done but no patron
  if (!profile.patron) return '/patron'

  // Profile complete + active site
  if (activeSite.value) return `/site/${activeSite.value.siteId}`

  // Profile complete, no site
  return '/globe'
})

function startNew(): void {
  clearProfile()
  clearSite()
  router.push('/create')
}
</script>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #1a0e08 0%, #000 70%);
}

.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.title {
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 200;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  animation: fadeUp 1s ease-out both;
}

.subtitle {
  font-size: clamp(0.7rem, 1.2vw, 0.9rem);
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  margin: 12px 0 0;
  animation: fadeUp 1s ease-out 0.3s both;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 48px;
  animation: fadeUp 0.8s ease-out 0.6s both;
}

.cta {
  padding: 12px 56px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0;
  cursor: pointer;
  transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease;
}

.cta:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.04);
}

.cta.secondary {
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.35);
  font-size: 10px;
  padding: 8px 40px;
}

.cta.secondary:hover {
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.6);
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
```

- [ ] **Step 2: Verify state-aware behavior**

1. Clear localStorage, go to `/` — should show "BEGIN MISSION" only
2. Click BEGIN MISSION — should go to `/create`
3. Complete creation, land on `/patron` placeholder
4. Go back to `/` — should show "CONTINUE" (→ `/patron`) + "NEW MISSION"
5. Click NEW MISSION — should clear state and go to `/create`

- [ ] **Step 3: Commit**

```bash
git add src/views/HomeView.vue
git commit -m "feat(home): add state-aware continue/new mission buttons"
```

---

### Task 10: Run full test suite and type check

**Files:** None (verification only)

- [ ] **Step 1: Run type check**

Run: `npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including new profile and active site tests.

- [ ] **Step 3: Manual end-to-end walkthrough**

1. Clear localStorage
2. Navigate to `/` → see "BEGIN MISSION"
3. Click → arrive at `/create`
4. Walk through all 5 steps, selecting one option each
5. Watch processing animation with correct snark for position choice
6. Accept application → arrive at `/patron`
7. Refresh page → navigate to `/` → see "CONTINUE" pointing to `/patron`
8. Click NEW MISSION → state cleared, back to `/create`
9. Navigate directly to `/globe` → redirected to `/`
10. Navigate directly to `/site/jezero` → redirected to `/`

- [ ] **Step 4: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix: address issues found during full verification"
```
