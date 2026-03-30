# Shelter Buildable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a data-driven buildables framework and implement the Shelter as the first buildable — a driveable structure that protects the rover from all environmental hazards.

**Architecture:** A `buildables.json` data file drives the system (mirroring `instruments.json`). A `BuildableRegistry` resolves controller type strings to classes. `useBuildables()` composable owns placement, persistence, and the `isShielded` flag. `HabitatController` manages the shelter's 3D model, door animation, and inside-detection. Hazard systems and postfx passes read `isShielded` to suppress effects.

**Tech Stack:** Vue 3, Three.js (GLTFLoader, MeshBasicMaterial), Vitest, TypeScript

---

### Task 1: Buildable Types & Data Files

**Files:**
- Create: `src/types/buildables.ts`
- Create: `public/data/buildables.json`
- Modify: `public/data/inventory-items.json`
- Modify: `src/types/inventory.ts:10` (InventoryItemCategory union)
- Modify: `src/types/inventory.ts:13-26` (InventoryItemDefJson interface)
- Test: `src/types/__tests__/buildables.test.ts`

- [ ] **Step 1: Create `src/types/buildables.ts`**

```typescript
// src/types/buildables.ts
import buildablesJson from '../../public/data/buildables.json'

/* ── JSON sub-shapes ── */

export interface BuildableDoorDef {
  meshName: string
  axis: 'x' | 'y' | 'z'
  openAngle: number
  speed: number
  triggerDistance: number
}

export interface BuildableFootprint {
  x: number
  z: number
}

/* ── One row from buildables.json ── */

export interface BuildableDef {
  id: string
  label: string
  desc: string
  image: string
  model: string
  category: string
  placement: 'exterior' | 'interior'
  footprint: BuildableFootprint
  maxPlacementSlope: number
  scale: number
  door?: BuildableDoorDef
  controllerType: string
  inventoryItemId: string
  features: string[]
}

export interface BuildablesFile {
  version: number
  buildables: BuildableDef[]
}

/* ── Persistence shape (localStorage) ── */

export interface PlacedBuildable {
  id: string
  siteId: string
  position: { x: number; y: number; z: number }
  rotationY: number
}

export interface BuildablesSaveData {
  buildables: PlacedBuildable[]
}

/* ── Catalog ── */

const data = buildablesJson as BuildablesFile

export const BUILDABLE_CATALOG: Record<string, BuildableDef> = {}
for (const b of data.buildables) {
  BUILDABLE_CATALOG[b.id] = b
}

export function getBuildableDef(id: string): BuildableDef | undefined {
  return BUILDABLE_CATALOG[id]
}
```

- [ ] **Step 2: Create `public/data/buildables.json`**

```json
{
  "version": 1,
  "buildables": [
    {
      "id": "shelter",
      "label": "Shelter",
      "desc": "Pressurized shelter. Protects the rover from all environmental hazards. Drive inside to activate.",
      "image": "/inventory/shelter-kit.png",
      "model": "/habitat.glb",
      "category": "shelter",
      "placement": "exterior",
      "footprint": { "x": 20, "z": 20 },
      "maxPlacementSlope": 0.3,
      "scale": 0.5,
      "door": {
        "meshName": "Cube012__0",
        "axis": "x",
        "openAngle": 1.57,
        "speed": 2.0,
        "triggerDistance": 8
      },
      "controllerType": "HabitatController",
      "inventoryItemId": "shelter-kit",
      "features": ["hazard-shield"]
    }
  ]
}
```

- [ ] **Step 3: Add `buildable` to InventoryItemCategory and add `action` to InventoryItemDefJson**

In `src/types/inventory.ts:10`, change the category union:

```typescript
export type InventoryItemCategory = 'rock' | 'component' | 'trace' | 'refined' | 'buildable'
```

In `src/types/inventory.ts:13-26`, add the optional `action` field to `InventoryItemDefJson`:

```typescript
export interface InventoryItemDefJson {
  id: string
  category: InventoryItemCategory
  label: string
  description: string
  image: string
  weightRange?: [number, number]
  weightPerUnit?: number
  maxStack?: number
  /** Optional action string. When present, clicking the item in inventory triggers a registered handler. */
  action?: string
}
```

Also add the `action` field to the runtime `InventoryItemDef` interface (lines 29-38):

```typescript
export interface InventoryItemDef {
  id: string
  category: InventoryItemCategory
  label: string
  description: string
  image: string
  weightRange: [number, number] | null
  weightPerUnit: number | null
  maxStack: number | null
  action: string | null
}
```

Update the catalog builder (the code that converts `InventoryItemDefJson` → `InventoryItemDef`) to map `action: raw.action ?? null`.

- [ ] **Step 4: Add `shelter-kit` to `public/data/inventory-items.json`**

Append to the `items` array:

```json
{
  "id": "shelter-kit",
  "category": "buildable",
  "label": "Shelter Kit",
  "description": "Prefab pressurized shelter module. Activate to construct.",
  "image": "/inventory/shelter-kit.png",
  "action": "place-buildable:shelter",
  "weightPerUnit": 50.0,
  "maxStack": 1
}
```

- [ ] **Step 5: Widen the `addComponent` category gate**

In `src/composables/useInventory.ts:165`, change the category check to include `'buildable'`:

```typescript
if (!def || (def.category !== 'component' && def.category !== 'trace' && def.category !== 'refined' && def.category !== 'buildable') || def.weightPerUnit == null || def.maxStack == null) {
```

- [ ] **Step 6: Write tests for buildable types**

```typescript
// src/types/__tests__/buildables.test.ts
import { describe, it, expect } from 'vitest'
import { BUILDABLE_CATALOG, getBuildableDef } from '@/types/buildables'

describe('buildable catalog', () => {
  it('loads shelter from buildables.json', () => {
    const shelter = getBuildableDef('shelter')
    expect(shelter).toBeDefined()
    expect(shelter!.id).toBe('shelter')
    expect(shelter!.model).toBe('/habitat.glb')
    expect(shelter!.controllerType).toBe('HabitatController')
    expect(shelter!.inventoryItemId).toBe('shelter-kit')
    expect(shelter!.features).toContain('hazard-shield')
  })

  it('has required fields on shelter door def', () => {
    const shelter = getBuildableDef('shelter')!
    expect(shelter.door).toBeDefined()
    expect(shelter.door!.meshName).toBe('Cube012__0')
    expect(shelter.door!.axis).toBe('x')
    expect(shelter.door!.openAngle).toBeCloseTo(1.57)
    expect(shelter.door!.speed).toBe(2.0)
    expect(shelter.door!.triggerDistance).toBe(8)
  })

  it('catalog keys match buildable ids', () => {
    for (const [key, def] of Object.entries(BUILDABLE_CATALOG)) {
      expect(key).toBe(def.id)
    }
  })
})
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/types/__tests__/buildables.test.ts`
Expected: 3 tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/types/buildables.ts src/types/__tests__/buildables.test.ts public/data/buildables.json public/data/inventory-items.json src/types/inventory.ts src/composables/useInventory.ts
git commit -m "feat(buildables): add types, data files, and inventory category gate"
```

---

### Task 2: BuildableRegistry

**Files:**
- Create: `src/three/buildables/BuildableRegistry.ts`
- Create: `src/three/buildables/BuildableController.ts`
- Test: `src/three/buildables/__tests__/BuildableRegistry.test.ts`

- [ ] **Step 1: Create the `BuildableController` interface**

```typescript
// src/three/buildables/BuildableController.ts
import type * as THREE from 'three'
import type { BuildableDef, BuildableFootprint } from '@/types/buildables'

/**
 * Contract for all buildable controllers.
 * Each buildable loads its own model and manages per-frame logic.
 */
export interface BuildableController {
  readonly id: string
  readonly def: BuildableDef
  readonly position: THREE.Vector3
  readonly footprint: BuildableFootprint
  readonly features: string[]
  readonly isRoverInside: boolean

  init(scene: THREE.Scene): Promise<void>
  update(roverPosition: THREE.Vector3, dt: number): void
  dispose(): void
}

export type BuildableControllerConstructor = new (
  def: BuildableDef,
  position: THREE.Vector3,
  rotationY: number,
  heightAt: (x: number, z: number) => number,
) => BuildableController
```

- [ ] **Step 2: Create the `BuildableRegistry`**

```typescript
// src/three/buildables/BuildableRegistry.ts
import type { BuildableControllerConstructor } from './BuildableController'

const registry: Record<string, BuildableControllerConstructor> = {}

export const BuildableRegistry = {
  register(name: string, ctor: BuildableControllerConstructor): void {
    registry[name] = ctor
  },

  resolve(name: string): BuildableControllerConstructor {
    const ctor = registry[name]
    if (!ctor) throw new Error(`BuildableRegistry: unknown controller "${name}"`)
    return ctor
  },

  has(name: string): boolean {
    return name in registry
  },
}
```

- [ ] **Step 3: Write tests**

```typescript
// src/three/buildables/__tests__/BuildableRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BuildableRegistry } from '../BuildableRegistry'
import type { BuildableController, BuildableControllerConstructor } from '../BuildableController'

// Minimal stub constructor
class StubController {
  readonly id = 'stub'
  readonly def: any
  readonly position: any
  readonly footprint = { x: 10, z: 10 }
  readonly features: string[] = []
  readonly isRoverInside = false
  constructor(def: any, pos: any, rot: number, heightAt: any) {
    this.def = def
    this.position = pos
  }
  async init() {}
  update() {}
  dispose() {}
}

describe('BuildableRegistry', () => {
  beforeEach(() => {
    // Register fresh for each test
    BuildableRegistry.register('StubController', StubController as unknown as BuildableControllerConstructor)
  })

  it('resolves a registered controller', () => {
    const Ctor = BuildableRegistry.resolve('StubController')
    expect(Ctor).toBe(StubController)
  })

  it('throws on unknown controller', () => {
    expect(() => BuildableRegistry.resolve('NonExistent')).toThrow('unknown controller')
  })

  it('reports has() correctly', () => {
    expect(BuildableRegistry.has('StubController')).toBe(true)
    expect(BuildableRegistry.has('NonExistent')).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/three/buildables/__tests__/BuildableRegistry.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/three/buildables/BuildableController.ts src/three/buildables/BuildableRegistry.ts src/three/buildables/__tests__/BuildableRegistry.test.ts
git commit -m "feat(buildables): add BuildableController interface and BuildableRegistry"
```

---

### Task 3: HabitatController

**Files:**
- Create: `src/three/buildables/HabitatController.ts`
- Test: `src/three/buildables/__tests__/HabitatController.test.ts`

- [ ] **Step 1: Write failing test for HabitatController**

```typescript
// src/three/buildables/__tests__/HabitatController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { HabitatController } from '../HabitatController'
import type { BuildableDef } from '@/types/buildables'

// Mock GLTFLoader so tests don't load real GLB files
vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const doorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  )
  doorMesh.name = 'Cube012__0'

  const scene = new THREE.Group()
  scene.add(doorMesh)

  return {
    GLTFLoader: class {
      loadAsync() {
        return Promise.resolve({ scene, animations: [] })
      }
    },
  }
})

const SHELTER_DEF: BuildableDef = {
  id: 'shelter',
  label: 'Shelter',
  desc: 'Test shelter',
  image: '/test.png',
  model: '/habitat.glb',
  category: 'shelter',
  placement: 'exterior',
  footprint: { x: 20, z: 20 },
  maxPlacementSlope: 0.3,
  scale: 0.5,
  door: {
    meshName: 'Cube012__0',
    axis: 'x',
    openAngle: 1.57,
    speed: 2.0,
    triggerDistance: 8,
  },
  controllerType: 'HabitatController',
  inventoryItemId: 'shelter-kit',
  features: ['hazard-shield'],
}

describe('HabitatController', () => {
  let controller: HabitatController
  const heightAt = vi.fn().mockReturnValue(0)
  const position = new THREE.Vector3(50, 0, 50)

  beforeEach(async () => {
    controller = new HabitatController(SHELTER_DEF, position.clone(), 0, heightAt)
    const scene = new THREE.Scene()
    await controller.init(scene)
  })

  it('exposes correct id and features', () => {
    expect(controller.id).toBe('shelter')
    expect(controller.features).toContain('hazard-shield')
  })

  it('detects rover inside footprint', () => {
    // Rover at shelter center — should be inside
    const roverInside = new THREE.Vector3(50, 0, 50)
    controller.update(roverInside, 0.016)
    expect(controller.isRoverInside).toBe(true)
  })

  it('detects rover outside footprint', () => {
    // Rover far away — should be outside
    const roverOutside = new THREE.Vector3(200, 0, 200)
    controller.update(roverOutside, 0.016)
    expect(controller.isRoverInside).toBe(false)
  })

  it('opens door when rover is within trigger distance', () => {
    // Rover just outside the shelter but within 8 units of the door
    const roverNear = new THREE.Vector3(50, 0, 50)
    // Tick several frames to animate the door open
    for (let i = 0; i < 60; i++) {
      controller.update(roverNear, 0.016)
    }
    expect(controller.doorOpenFraction).toBeGreaterThan(0)
  })

  it('keeps door closed when rover is far away', () => {
    const roverFar = new THREE.Vector3(200, 0, 200)
    controller.update(roverFar, 0.016)
    expect(controller.doorOpenFraction).toBe(0)
  })

  it('disposes without error', () => {
    expect(() => controller.dispose()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/three/buildables/__tests__/HabitatController.test.ts`
Expected: FAIL — `HabitatController` doesn't exist yet

- [ ] **Step 3: Implement HabitatController**

```typescript
// src/three/buildables/HabitatController.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BuildableController } from './BuildableController'
import type { BuildableDef, BuildableFootprint } from '@/types/buildables'

export class HabitatController implements BuildableController {
  readonly id: string
  readonly def: BuildableDef
  readonly position: THREE.Vector3
  readonly footprint: BuildableFootprint
  readonly features: string[]

  private group = new THREE.Group()
  private doorMesh: THREE.Object3D | null = null
  private doorOpen = 0 // 0 = closed, 1 = fully open
  private scene: THREE.Scene | null = null
  private heightAt: (x: number, z: number) => number
  private rotationY: number
  private _isRoverInside = false

  constructor(
    def: BuildableDef,
    position: THREE.Vector3,
    rotationY: number,
    heightAt: (x: number, z: number) => number,
  ) {
    this.def = def
    this.id = def.id
    this.position = position.clone()
    this.footprint = def.footprint
    this.features = [...def.features]
    this.rotationY = rotationY
    this.heightAt = heightAt
  }

  get isRoverInside(): boolean {
    return this._isRoverInside
  }

  /** Fraction 0–1 of door open progress, exposed for testing. */
  get doorOpenFraction(): number {
    return this.doorOpen
  }

  async init(scene: THREE.Scene): Promise<void> {
    this.scene = scene
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(this.def.model)

    const model = gltf.scene
    model.scale.setScalar(this.def.scale)
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    // Find door mesh
    if (this.def.door) {
      this.doorMesh = model.getObjectByName(this.def.door.meshName) ?? null
    }

    this.group.add(model)
    const groundY = this.heightAt(this.position.x, this.position.z)
    this.group.position.set(this.position.x, groundY, this.position.z)
    this.group.rotation.y = this.rotationY
    // Store the actual Y in position for footprint checks
    this.position.y = groundY

    scene.add(this.group)
  }

  update(roverPosition: THREE.Vector3, dt: number): void {
    // Inside check — axis-aligned bounding box from footprint
    const halfX = (this.footprint.x * this.def.scale) / 2
    const halfZ = (this.footprint.z * this.def.scale) / 2
    const dx = roverPosition.x - this.position.x
    const dz = roverPosition.z - this.position.z

    // Rotate delta into shelter local space to handle rotated placement
    const cos = Math.cos(-this.rotationY)
    const sin = Math.sin(-this.rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos

    this._isRoverInside = Math.abs(localX) < halfX && Math.abs(localZ) < halfZ

    // Door animation
    if (this.doorMesh && this.def.door) {
      const distToShelter = Math.sqrt(dx * dx + dz * dz)
      const shouldOpen = distToShelter < this.def.door.triggerDistance
      const target = shouldOpen ? 1 : 0
      const step = (this.def.door.speed / this.def.door.openAngle) * dt

      if (this.doorOpen < target) {
        this.doorOpen = Math.min(this.doorOpen + step, target)
      } else if (this.doorOpen > target) {
        this.doorOpen = Math.max(this.doorOpen - step, target)
      }

      const angle = this.doorOpen * this.def.door.openAngle
      const axis = this.def.door.axis
      if (axis === 'x') this.doorMesh.rotation.x = angle
      else if (axis === 'y') this.doorMesh.rotation.y = angle
      else if (axis === 'z') this.doorMesh.rotation.z = angle
    }
  }

  dispose(): void {
    if (this.scene && this.group.parent) {
      this.scene.remove(this.group)
    }
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose())
        } else {
          mesh.material?.dispose()
        }
      }
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/three/buildables/__tests__/HabitatController.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Register HabitatController in the BuildableRegistry**

Add to `src/three/buildables/BuildableRegistry.ts`:

```typescript
import { HabitatController } from './HabitatController'

// ... existing registry code ...

// Auto-register built-in controllers
BuildableRegistry.register('HabitatController', HabitatController)
```

- [ ] **Step 6: Commit**

```bash
git add src/three/buildables/HabitatController.ts src/three/buildables/__tests__/HabitatController.test.ts src/three/buildables/BuildableRegistry.ts
git commit -m "feat(buildables): implement HabitatController with door animation and inside detection"
```

---

### Task 4: useBuildables Composable — Persistence & isShielded

**Files:**
- Create: `src/composables/useBuildables.ts`
- Modify: `src/views/MartianSiteView.vue:739-761` (add `mars-buildables-v1` to progression keys)
- Test: `src/composables/__tests__/useBuildables.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/composables/__tests__/useBuildables.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub localStorage
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

import { useBuildables } from '../useBuildables'

describe('useBuildables', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    // Reset composable singleton state
    const { clearAll } = useBuildables()
    clearAll()
  })

  it('starts with no placed buildables', () => {
    const { placedBuildables, isShielded } = useBuildables()
    expect(placedBuildables.value).toEqual([])
    expect(isShielded.value).toBe(false)
  })

  it('persists placement to localStorage', () => {
    const { savePlacement } = useBuildables()
    savePlacement({
      id: 'shelter',
      siteId: 'curiosity',
      position: { x: 10, y: 0, z: 20 },
      rotationY: 0,
    })
    const raw = JSON.parse(store['mars-buildables-v1'])
    expect(raw.buildables).toHaveLength(1)
    expect(raw.buildables[0].id).toBe('shelter')
  })

  it('loads placements for current site', () => {
    store['mars-buildables-v1'] = JSON.stringify({
      buildables: [
        { id: 'shelter', siteId: 'curiosity', position: { x: 10, y: 0, z: 20 }, rotationY: 0 },
        { id: 'shelter', siteId: 'gale', position: { x: 5, y: 0, z: 5 }, rotationY: 1 },
      ],
    })
    const { loadForSite } = useBuildables()
    const placements = loadForSite('curiosity')
    expect(placements).toHaveLength(1)
    expect(placements[0].siteId).toBe('curiosity')
  })

  it('clearAll removes storage', () => {
    const { savePlacement, clearAll } = useBuildables()
    savePlacement({
      id: 'shelter',
      siteId: 'curiosity',
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
    })
    clearAll()
    expect(store['mars-buildables-v1']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useBuildables.test.ts`
Expected: FAIL — `useBuildables` doesn't exist yet

- [ ] **Step 3: Implement `useBuildables`**

```typescript
// src/composables/useBuildables.ts
import { ref, computed } from 'vue'
import type { PlacedBuildable, BuildablesSaveData } from '@/types/buildables'
import type { BuildableController } from '@/three/buildables/BuildableController'

const STORAGE_KEY = 'mars-buildables-v1'

const placedBuildables = ref<PlacedBuildable[]>([])
const activeControllers = ref<BuildableController[]>([])

/** True when the rover is inside any buildable with the 'hazard-shield' feature. */
const isShielded = computed(() =>
  activeControllers.value.some(
    (b) => b.isRoverInside && b.features.includes('hazard-shield'),
  ),
)

function persist(): void {
  const data: BuildablesSaveData = { buildables: placedBuildables.value }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full — silently ignore */ }
}

function savePlacement(entry: PlacedBuildable): void {
  placedBuildables.value = [...placedBuildables.value, entry]
  persist()
}

function loadForSite(siteId: string): PlacedBuildable[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw) as BuildablesSaveData
    const filtered = data.buildables.filter((b) => b.siteId === siteId)
    placedBuildables.value = filtered
    return filtered
  } catch {
    return []
  }
}

function registerController(controller: BuildableController): void {
  activeControllers.value = [...activeControllers.value, controller]
}

function unregisterController(controller: BuildableController): void {
  activeControllers.value = activeControllers.value.filter((c) => c !== controller)
}

function clearAll(): void {
  placedBuildables.value = []
  activeControllers.value = []
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

export function useBuildables() {
  return {
    placedBuildables,
    activeControllers,
    isShielded,
    savePlacement,
    loadForSite,
    registerController,
    unregisterController,
    clearAll,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useBuildables.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Add `mars-buildables-v1` to game-over wipe**

In `src/views/MartianSiteView.vue`, find the `PROGRESSION_KEYS` array inside `clearProgressionStorage()` (around line 739). Add `'mars-buildables-v1'` to the array:

```typescript
const PROGRESSION_KEYS = [
  'mars-active-site-v1',
  'mars-apxs-archive-v1',
  'mars-buildables-v1',     // ← add this line
  'mars-chemcam-archive-v1',
  // ... rest unchanged
]
```

- [ ] **Step 6: Commit**

```bash
git add src/composables/useBuildables.ts src/composables/__tests__/useBuildables.test.ts src/views/MartianSiteView.vue
git commit -m "feat(buildables): add useBuildables composable with persistence and isShielded flag"
```

---

### Task 5: Inventory Action System

**Files:**
- Create: `src/composables/useInventoryActions.ts`
- Modify: `src/components/InventoryPanel.vue` (add action click handler)
- Modify: `src/views/MartianSiteView.vue` (wire action emit)
- Test: `src/composables/__tests__/useInventoryActions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/composables/__tests__/useInventoryActions.test.ts
import { describe, it, expect, vi } from 'vitest'
import { useInventoryActions } from '../useInventoryActions'

describe('useInventoryActions', () => {
  it('registers and invokes an action handler', () => {
    const { registerAction, invokeAction } = useInventoryActions()
    const handler = vi.fn()
    registerAction('test-action', handler)

    invokeAction('test-action')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('parses place-buildable:<id> action format', () => {
    const { registerAction, invokeAction } = useInventoryActions()
    const handler = vi.fn()
    registerAction('place-buildable', handler)

    invokeAction('place-buildable:shelter')
    expect(handler).toHaveBeenCalledWith('shelter')
  })

  it('returns false for unregistered action', () => {
    const { invokeAction } = useInventoryActions()
    const result = invokeAction('unknown-action')
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useInventoryActions.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement `useInventoryActions`**

```typescript
// src/composables/useInventoryActions.ts

type ActionHandler = (...args: string[]) => void

const handlers: Record<string, ActionHandler> = {}

function registerAction(key: string, handler: ActionHandler): void {
  handlers[key] = handler
}

function invokeAction(actionString: string): boolean {
  // Support "key:arg1:arg2" format — split on first colon
  const colonIdx = actionString.indexOf(':')
  let key: string
  let args: string[]
  if (colonIdx >= 0) {
    key = actionString.slice(0, colonIdx)
    args = [actionString.slice(colonIdx + 1)]
  } else {
    key = actionString
    args = []
  }
  const handler = handlers[key]
  if (!handler) return false
  handler(...args)
  return true
}

export function useInventoryActions() {
  return { registerAction, invokeAction }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/composables/__tests__/useInventoryActions.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Add `action` emit to InventoryPanel.vue**

In `src/components/InventoryPanel.vue`, add a new emit and handler. Update the emits definition (line 93):

```typescript
const emit = defineEmits<{
  dump: [itemId: string]
  action: [itemId: string, actionString: string]
}>()
```

Add an action click handler function after `emitDump`:

```typescript
function emitAction(itemId: string, action: string): void {
  playUiCue('ui.switch')
  emit('action', itemId, action)
}
```

In the template, add a conditional action button to each inventory slot. Inside the `<template v-if="cell">` block (after the dump button at line 44), add:

```html
<button
  v-if="getAction(cell.itemId)"
  type="button"
  class="inv-action-btn"
  title="Activate"
  @click.stop="emitAction(cell.itemId, getAction(cell.itemId)!)"
>
  ▶
</button>
```

Add the helper in `<script setup>`:

```typescript
function getAction(itemId: string): string | null {
  const def = getInventoryItemDef(itemId)
  return def?.action ?? null
}
```

- [ ] **Step 6: Wire the action emit in MartianSiteView.vue**

In `src/views/MartianSiteView.vue`, update the `<InventoryPanel>` usage (around line 239) to handle the new `@action` emit:

```html
<InventoryPanel
  :open="inventoryOpen"
  :stacks="inventoryStacks"
  :current-weight-kg="currentWeightKg"
  :capacity-kg="capacityKg"
  :is-full="isFull"
  @dump="removeInventoryStack"
  @action="handleInventoryAction"
/>
```

Add the handler function in the script section:

```typescript
import { useInventoryActions } from '@/composables/useInventoryActions'

const { invokeAction } = useInventoryActions()

function handleInventoryAction(itemId: string, actionString: string): void {
  const { consumeItem } = useInventory()
  const invoked = invokeAction(actionString)
  if (invoked) {
    consumeItem(itemId, 1)
    inventoryOpen.value = false
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/composables/useInventoryActions.ts src/composables/__tests__/useInventoryActions.test.ts src/components/InventoryPanel.vue src/views/MartianSiteView.vue
git commit -m "feat(buildables): add inventory action system with place-buildable handler"
```

---

### Task 6: Placement Flow — Preview & Confirm

**Files:**
- Create: `src/three/buildables/BuildablePlacementPreview.ts`
- Modify: `src/views/MartianSiteView.vue` (register place-buildable action, manage preview state)
- Modify: `src/views/MarsSiteViewController.ts` (wire preview into frame loop)
- Test: `src/three/buildables/__tests__/BuildablePlacementPreview.test.ts`

- [ ] **Step 1: Write failing test for placement preview**

```typescript
// src/three/buildables/__tests__/BuildablePlacementPreview.test.ts
import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'
import { BuildablePlacementPreview } from '../BuildablePlacementPreview'
import type { BuildableDef } from '@/types/buildables'

vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
  return {
    GLTFLoader: class {
      loadAsync() {
        return Promise.resolve({ scene, animations: [] })
      }
    },
  }
})

const DEF: BuildableDef = {
  id: 'shelter',
  label: 'Shelter',
  desc: 'Test',
  image: '/test.png',
  model: '/habitat.glb',
  category: 'shelter',
  placement: 'exterior',
  footprint: { x: 20, z: 20 },
  maxPlacementSlope: 0.3,
  scale: 0.5,
  controllerType: 'HabitatController',
  inventoryItemId: 'shelter-kit',
  features: ['hazard-shield'],
}

describe('BuildablePlacementPreview', () => {
  it('creates a wireframe preview group', async () => {
    const scene = new THREE.Scene()
    const heightAt = vi.fn().mockReturnValue(0)
    const slopeAt = vi.fn().mockReturnValue(0)

    const preview = new BuildablePlacementPreview(DEF, heightAt, slopeAt)
    await preview.init(scene)

    expect(preview.group.parent).toBe(scene)
  })

  it('marks placement invalid on steep slope', async () => {
    const scene = new THREE.Scene()
    const heightAt = vi.fn().mockReturnValue(0)
    const slopeAt = vi.fn().mockReturnValue(0.5) // > maxPlacementSlope of 0.3

    const preview = new BuildablePlacementPreview(DEF, heightAt, slopeAt)
    await preview.init(scene)

    preview.updatePosition(new THREE.Vector3(0, 0, 0), 0)
    expect(preview.isValid).toBe(false)
  })

  it('marks placement valid on flat ground', async () => {
    const scene = new THREE.Scene()
    const heightAt = vi.fn().mockReturnValue(0)
    const slopeAt = vi.fn().mockReturnValue(0.1) // < maxPlacementSlope of 0.3

    const preview = new BuildablePlacementPreview(DEF, heightAt, slopeAt)
    await preview.init(scene)

    preview.updatePosition(new THREE.Vector3(0, 0, 0), 0)
    expect(preview.isValid).toBe(true)
  })

  it('disposes cleanly', async () => {
    const scene = new THREE.Scene()
    const heightAt = vi.fn().mockReturnValue(0)
    const slopeAt = vi.fn().mockReturnValue(0)

    const preview = new BuildablePlacementPreview(DEF, heightAt, slopeAt)
    await preview.init(scene)
    preview.dispose()

    expect(preview.group.parent).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/three/buildables/__tests__/BuildablePlacementPreview.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement `BuildablePlacementPreview`**

```typescript
// src/three/buildables/BuildablePlacementPreview.ts
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { BuildableDef } from '@/types/buildables'

const VALID_COLOR = 0x00ff00
const INVALID_COLOR = 0xff0000
const PREVIEW_DISTANCE = 12 // units in front of rover

export class BuildablePlacementPreview {
  readonly group = new THREE.Group()
  readonly def: BuildableDef
  private scene: THREE.Scene | null = null
  private heightAt: (x: number, z: number) => number
  private slopeAt: (x: number, z: number) => number
  private wireframeMaterial = new THREE.MeshBasicMaterial({
    color: VALID_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.6,
  })
  private _isValid = true
  private _position = new THREE.Vector3()
  private _rotationY = 0

  constructor(
    def: BuildableDef,
    heightAt: (x: number, z: number) => number,
    slopeAt: (x: number, z: number) => number,
  ) {
    this.def = def
    this.heightAt = heightAt
    this.slopeAt = slopeAt
  }

  get isValid(): boolean {
    return this._isValid
  }

  get position(): THREE.Vector3 {
    return this._position
  }

  get rotationY(): number {
    return this._rotationY
  }

  async init(scene: THREE.Scene): Promise<void> {
    this.scene = scene
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(this.def.model)
    const model = gltf.scene
    model.scale.setScalar(this.def.scale)

    // Replace all materials with wireframe
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        ;(child as THREE.Mesh).material = this.wireframeMaterial
      }
    })

    this.group.add(model)
    scene.add(this.group)
  }

  /** Reposition preview in front of rover at given position and heading. */
  updatePosition(roverPosition: THREE.Vector3, roverHeading: number): void {
    // Place at fixed distance in front of rover along heading
    const x = roverPosition.x + Math.sin(roverHeading) * PREVIEW_DISTANCE
    const z = roverPosition.z + Math.cos(roverHeading) * PREVIEW_DISTANCE
    const y = this.heightAt(x, z)
    const slope = this.slopeAt(x, z)

    this._position.set(x, y, z)
    this._rotationY = roverHeading
    this.group.position.set(x, y, z)
    this.group.rotation.y = roverHeading

    // Validate slope
    this._isValid = slope <= this.def.maxPlacementSlope

    // Update wireframe color
    this.wireframeMaterial.color.setHex(this._isValid ? VALID_COLOR : INVALID_COLOR)
  }

  dispose(): void {
    if (this.scene) {
      this.scene.remove(this.group)
    }
    this.wireframeMaterial.dispose()
    this.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        ;(child as THREE.Mesh).geometry?.dispose()
      }
    })
    this.scene = null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/three/buildables/__tests__/BuildablePlacementPreview.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Wire placement flow into MartianSiteView.vue**

In `src/views/MartianSiteView.vue`, register the `place-buildable` action and manage the preview lifecycle. Add in the script section after the existing inventory wiring:

```typescript
import { getBuildableDef } from '@/types/buildables'
import { useBuildables } from '@/composables/useBuildables'
import { useInventoryActions } from '@/composables/useInventoryActions'
import { BuildablePlacementPreview } from '@/three/buildables/BuildablePlacementPreview'
import { BuildableRegistry } from '@/three/buildables/BuildableRegistry'
import * as THREE from 'three'

const { registerAction, invokeAction } = useInventoryActions()
const { savePlacement, registerController } = useBuildables()

const activePlacementPreview = ref<BuildablePlacementPreview | null>(null)
const pendingPlacementItemId = ref<string | null>(null)

// Register the place-buildable action
registerAction('place-buildable', (buildableId: string) => {
  const def = getBuildableDef(buildableId)
  if (!def || !siteScene) return

  const preview = new BuildablePlacementPreview(
    def,
    (x, z) => siteScene!.terrain.heightAt(x, z),
    (x, z) => siteScene!.terrain.slopeAt(x, z),
  )
  preview.init(siteScene!.scene).then(() => {
    activePlacementPreview.value = preview
  })
})
```

Update `handleInventoryAction` to defer item consumption until placement confirms:

```typescript
function handleInventoryAction(itemId: string, actionString: string): void {
  pendingPlacementItemId.value = itemId
  const invoked = invokeAction(actionString)
  if (!invoked) {
    pendingPlacementItemId.value = null
  }
  inventoryOpen.value = false
}
```

Add confirm/cancel handlers:

```typescript
function confirmPlacement(): void {
  const preview = activePlacementPreview.value
  if (!preview || !preview.isValid || !siteScene) return

  const def = preview.def
  const pos = preview.position.clone()
  const rot = preview.rotationY

  // Spawn the real buildable
  const heightAt = (x: number, z: number) => siteScene!.terrain.heightAt(x, z)
  const Ctor = BuildableRegistry.resolve(def.controllerType)
  const controller = new Ctor(def, pos, rot, heightAt)
  controller.init(siteScene!.scene)

  registerController(controller)

  // Persist
  const siteId = activeSiteId.value ?? ''
  savePlacement({ id: def.id, siteId, position: { x: pos.x, y: pos.y, z: pos.z }, rotationY: rot })

  // Consume inventory item
  if (pendingPlacementItemId.value) {
    const { consumeItem } = useInventory()
    consumeItem(pendingPlacementItemId.value, 1)
    pendingPlacementItemId.value = null
  }

  // Clean up preview
  preview.dispose()
  activePlacementPreview.value = null
}

function cancelPlacement(): void {
  activePlacementPreview.value?.dispose()
  activePlacementPreview.value = null
  pendingPlacementItemId.value = null
}
```

Add keyboard listeners for confirm (Enter/click) and cancel (Escape) in the existing `onGlobalKeyDown` handler — when `activePlacementPreview.value` is non-null, intercept Enter for confirm and Escape for cancel.

- [ ] **Step 6: Update preview position each frame in MarsSiteViewController.ts**

In the frame loop of `MarsSiteViewController.ts` (around line 986, after `controller?.update(effSceneDelta)`), add:

```typescript
// Update buildable placement preview position
if (activePlacementPreview?.value && controller) {
  activePlacementPreview.value.updatePosition(
    siteScene.rover!.position,
    controller.heading,
  )
}

// Update active buildable controllers
for (const b of activeControllers.value) {
  b.update(siteScene.rover!.position ?? new THREE.Vector3(), effSceneDelta)
}
```

The `activePlacementPreview` and `activeControllers` refs are imported from the composables. Alternatively, these can be passed into the view controller setup function as refs — follow the existing pattern for how `roverWorldX`/`roverWorldZ` refs are used.

- [ ] **Step 7: Commit**

```bash
git add src/three/buildables/BuildablePlacementPreview.ts src/three/buildables/__tests__/BuildablePlacementPreview.test.ts src/views/MartianSiteView.vue src/views/MarsSiteViewController.ts
git commit -m "feat(buildables): add placement preview with slope validation and confirm/cancel flow"
```

---

### Task 7: Restore Buildables on Site Load

**Files:**
- Modify: `src/views/MartianSiteView.vue` or `src/views/MarsSiteViewController.ts` (restore saved buildables on init)

- [ ] **Step 1: Add restoration logic after site scene init**

In `src/views/MarsSiteViewController.ts`, after the site scene is initialized and the terrain is ready (after `await siteScene.init(params)`), add restoration of saved buildables:

```typescript
import { useBuildables } from '@/composables/useBuildables'
import { BuildableRegistry } from '@/three/buildables/BuildableRegistry'
import { getBuildableDef } from '@/types/buildables'

// After siteScene.init(params) completes:
const { loadForSite, registerController } = useBuildables()
const savedBuildables = loadForSite(params.siteId)

for (const saved of savedBuildables) {
  const def = getBuildableDef(saved.id)
  if (!def) continue
  const Ctor = BuildableRegistry.resolve(def.controllerType)
  const pos = new THREE.Vector3(saved.position.x, saved.position.y, saved.position.z)
  const controller = new Ctor(def, pos, saved.rotationY, (x, z) => siteScene.terrain.heightAt(x, z))
  await controller.init(siteScene.scene)
  registerController(controller)
}
```

- [ ] **Step 2: Verify manually**

1. Run `npm run dev`
2. Use dev console to add a `shelter-kit` to inventory: call the inventory dev spawn
3. Click the shelter-kit → see green wireframe preview
4. Confirm placement → shelter appears on terrain
5. Refresh page → shelter reappears at saved position

- [ ] **Step 3: Commit**

```bash
git add src/views/MarsSiteViewController.ts
git commit -m "feat(buildables): restore saved buildables on site load"
```

---

### Task 8: Hazard Suppression — isShielded Integration

**Files:**
- Modify: `src/views/MarsSiteViewController.ts:992-1009` (hazard decay block)
- Modify: `src/views/MarsSiteViewController.ts:1347-1370` (postfx passes)
- Modify: `src/views/MarsSiteViewController.ts:~250` (dust particles update in SiteScene)
- Modify: `src/views/site-controllers/MeteorTickHandler.ts:42-43` (meteor exclusion)
- Test: `src/views/site-controllers/__tests__/meteorExclusion.test.ts`

- [ ] **Step 1: Write failing test for meteor footprint exclusion**

```typescript
// src/views/site-controllers/__tests__/meteorExclusion.test.ts
import { describe, it, expect } from 'vitest'
import { isInsideBuildableFootprint } from '@/lib/buildableFootprint'

describe('meteor buildable exclusion', () => {
  const buildables = [
    {
      position: { x: 50, z: 50 },
      footprint: { x: 20, z: 20 },
      scale: 0.5,
      rotationY: 0,
    },
  ]

  it('rejects impact inside footprint', () => {
    expect(isInsideBuildableFootprint(50, 50, buildables)).toBe(true)
    expect(isInsideBuildableFootprint(54, 54, buildables)).toBe(true)
  })

  it('allows impact outside footprint', () => {
    expect(isInsideBuildableFootprint(100, 100, buildables)).toBe(false)
    expect(isInsideBuildableFootprint(0, 0, buildables)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/views/site-controllers/__tests__/meteorExclusion.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Create the footprint check helper**

```typescript
// src/lib/buildableFootprint.ts

export interface FootprintEntry {
  position: { x: number; z: number }
  footprint: { x: number; z: number }
  scale: number
  rotationY: number
}

/**
 * Returns true if world position (x, z) falls inside any buildable's footprint.
 * Used by meteor spawn to reject impact points that would hit a buildable.
 */
export function isInsideBuildableFootprint(
  x: number,
  z: number,
  buildables: FootprintEntry[],
): boolean {
  for (const b of buildables) {
    const halfX = (b.footprint.x * b.scale) / 2
    const halfZ = (b.footprint.z * b.scale) / 2
    const dx = x - b.position.x
    const dz = z - b.position.z
    const cos = Math.cos(-b.rotationY)
    const sin = Math.sin(-b.rotationY)
    const localX = dx * cos - dz * sin
    const localZ = dx * sin + dz * cos
    if (Math.abs(localX) < halfX && Math.abs(localZ) < halfZ) return true
  }
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/views/site-controllers/__tests__/meteorExclusion.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Integrate meteor exclusion into MeteorTickHandler**

In `src/views/site-controllers/MeteorTickHandler.ts`, inside `generateFalls()` (around line 42-45), after calculating `targetX`, `targetZ`, and `groundY`, add a rejection check:

```typescript
import { isInsideBuildableFootprint } from '@/lib/buildableFootprint'
```

Add a `getFootprints` callback to `MeteorTickCallbacks`:

```typescript
// Add to MeteorTickCallbacks interface:
getPlacedFootprints: () => FootprintEntry[]
```

Then in the loop body, after `if (Number.isNaN(groundY)) continue`:

```typescript
if (isInsideBuildableFootprint(targetX, targetZ, callbacks.getPlacedFootprints())) continue
```

Wire the callback in `createMarsSiteHudControllers.ts` where the meteor handler is created — it should read from `useBuildables().activeControllers` to build the footprint entries.

- [ ] **Step 6: Suppress hazard decay when shielded**

In `src/views/MarsSiteViewController.ts`, around lines 992-1009 where hazard events are built and decay is applied, wrap the block with the `isShielded` check:

```typescript
import { useBuildables } from '@/composables/useBuildables'
const { isShielded } = useBuildables()

// In the frame loop, replace the hazard decay block:
if (controller) {
  if (isShielded.value) {
    // Inside shelter — no hazard decay
    for (const inst of controller.instruments) {
      inst.hazardDecayMultiplier = 1
    }
  } else {
    const sw = siteWeather.value
    const dustStormEvent: HazardEvent = {
      source: 'dust-storm',
      active: sw.dustStormPhase === 'active',
      level: sw.dustStormLevel ?? 0,
    }
    const radHazardLevel = Math.ceil(radLevel.value * 5)
    const radiationEvent: HazardEvent = {
      source: 'radiation',
      active: radLevel.value > 0.25,
      level: hasPerk('lead-lined') ? Math.ceil(radHazardLevel * 0.5) : radHazardLevel,
    }
    const hazardEvents = [dustStormEvent, radiationEvent]
    for (const inst of controller.instruments) {
      inst.hazardDecayMultiplier = computeDecayMultiplier(hazardEvents, inst.tier)
      inst.applyPassiveDecay(solDelta)
    }
  }
}
```

- [ ] **Step 7: Suppress postfx passes when shielded**

In `src/views/MarsSiteViewController.ts`, around lines 1347-1370, wrap the dust and rad pass updates:

```typescript
if (dustPass) {
  dustPass.uniforms.uTime.value = simulationTime
  if (isShielded.value) {
    dustPass.setWeather(0, 0)
    dustPass.setStormGlitch(0, 0)
  } else {
    dustPass.setWeather(sw.renderWindMs, sw.renderDustStormLevel)
    const glitchIntensity = sw.dustStormPhase === 'active' && sw.dustStormLevel != null
      ? sw.dustStormLevel / 5
      : 0
    const incomingFactor = sw.dustStormPhase === 'incoming' ? 1.0 : 0.0
    dustPass.setStormGlitch(glitchIntensity, incomingFactor)
  }
}

if (radPass) {
  radPass.uniforms.uTime.value = simulationTime
  if (isShielded.value) {
    radPass.setRadiation(0)
  } else {
    radPass.setRadiation(radLevel.value)
    const isInstrumentCamera = controller?.mode === 'active'
      && (controller.activeInstrument?.id === 'mastcam' || controller.activeInstrument?.id === 'chemcam')
    radPass.setInstrumentCamera(isInstrumentCamera ? 1.0 : 0.0)
  }
}
```

- [ ] **Step 8: Suppress dust particles when shielded**

In `src/three/SiteScene.ts`, in the `update()` method where `this.dust?.update(...)` is called (around line 250), the dust particles need to be hidden. The cleanest approach is to toggle the dust mesh visibility:

In `MarsSiteViewController.ts`, after the buildable update loop, add:

```typescript
if (siteScene.dust) {
  siteScene.dust.mesh.visible = !isShielded.value
}
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/buildableFootprint.ts src/views/site-controllers/__tests__/meteorExclusion.test.ts src/views/site-controllers/MeteorTickHandler.ts src/views/site-controllers/createMarsSiteHudControllers.ts src/views/MarsSiteViewController.ts src/three/SiteScene.ts
git commit -m "feat(buildables): integrate hazard suppression, postfx suppression, and meteor exclusion"
```

---

### Task 9: Type Check & Build Verification

**Files:** No new files — verification only.

- [ ] **Step 1: Run type checker**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run full test suite**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test**

1. `npm run dev`
2. Load any site
3. Dev-spawn `shelter-kit` into inventory
4. Open inventory → see shelter-kit with ▶ action button
5. Click ▶ → green wireframe preview appears in front of rover
6. Move to flat ground → green wireframe. Move toward cliff → red wireframe
7. Press Enter on flat ground → shelter spawns, preview disappears, item consumed
8. Drive toward shelter → door opens automatically
9. Drive inside → door stays open, dust particles disappear, postfx disabled
10. Drive out → effects resume, door closes
11. Refresh → shelter reappears from localStorage

- [ ] **Step 5: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix(buildables): smoke test fixes"
```
