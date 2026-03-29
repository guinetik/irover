# Meteor Shower Pass 3: DAN Crater Mode + Vent Placement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DAN Crater Mode scanning of meteor craters, a discovery table with vent placement, crater revert mechanics, map markers for vents, and storm cleanup of non-vent craters.

**Architecture:** The existing DAN tick handler state machine gets two new phases (`crater-confirm`, `crater-scanning`) as a parallel branch that never crosses the normal prospect flow. MeteorController tracks crater metadata so DAN can query proximity. Terrain generators gain `revertCrater()` via stored deform data. Vent persistence follows the `useDanArchive` localStorage pattern. The Vue layer handles the confirmation dialog (same pattern as RTG power shunt).

**Tech Stack:** Vue 3, Three.js, TypeScript, Vitest, localStorage

---

## File Layout

### New Files

| File | Purpose |
|------|---------|
| `src/lib/meteor/craterDiscovery.ts` | Discovery table definitions, weighted roll function, vent type mapping |
| `src/lib/meteor/__tests__/craterDiscovery.test.ts` | Tests for discovery roll weights and outcomes |
| `src/types/ventArchive.ts` | `ArchivedVent` interface |
| `src/composables/useVentArchive.ts` | Vent persistence in localStorage (singleton composable) |
| `src/composables/__tests__/useVentArchive.test.ts` | Tests for vent archive CRUD |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/meteor/meteorTypes.ts` | Add `MeteorCrater` interface |
| `src/lib/meteor/index.ts` | Re-export `craterDiscovery` |
| `src/three/terrain/TerrainGenerator.ts` | Change `deformCrater` return type to `CraterDeformData`, add `revertCrater()` to interface |
| `src/three/terrain/TerrainGenerator.ts` (DefaultTerrainGenerator) | Implement return + revert |
| `src/three/terrain/GlbTerrainGenerator.ts` | Implement return + revert |
| `src/three/terrain/MarsGlobalTerrainGenerator.ts` | Implement return + revert (with fallback delegation) |
| `src/three/terrain/ElevationTerrainGenerator.ts` | Implement return + revert |
| `src/views/site-controllers/MeteorController.ts` | Track craters array, expose `getCraterAtPosition()`, `unregisterMeteoriteRock()`, storm revert, vent placement |
| `src/types/danArchive.ts` | Add optional `craterDiscovery` field to `ArchivedDANProspect` |
| `src/three/instruments/DANController.ts` | Add `'crater-confirm' \| 'crater-scanning'` to `DANProspectPhase` |
| `src/views/site-controllers/DanTickHandler.ts` | Crater detection on DAN activate, crater-confirm/crater-scanning phases, vent placement on discovery |
| `src/views/site-controllers/createMarsSiteTickHandlers.ts` | Wire new DAN callbacks (meteorHandler, ventArchive) |
| `src/views/MartianSiteView.vue` | Crater confirm dialog, vent map markers, vent restoration on load |
| `src/components/MapOverlay.vue` | No changes needed (already supports `markers` prop with `pulse`) |

---

## Task 1: `CraterDeformData` Type + `revertCrater` Interface

Add the return type for `deformCrater` and the `revertCrater` method to the terrain interface. This is the prerequisite from Section 0 of the spec.

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts` (interface at lines 26-46)

- [ ] **Step 1: Add `CraterDeformData` interface above `ITerrainGenerator`**

In `src/three/terrain/TerrainGenerator.ts`, add above the `ITerrainGenerator` interface (before line 26):

```typescript
export interface CraterDeformData {
  cells: Array<{ gx: number; gz: number; originalY: number }>
  meshVertices: Array<{ meshIndex: number; vertexIndex: number; originalY: number }>
}
```

- [ ] **Step 2: Change `deformCrater` return type and add `revertCrater`**

In the `ITerrainGenerator` interface, change `deformCrater` from `void` to `CraterDeformData | null`, and add `revertCrater`:

```typescript
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): CraterDeformData | null
  revertCrater(data: CraterDeformData): void
```

- [ ] **Step 3: Verify the project still compiles (expect errors in implementations)**

Run: `npx vue-tsc --noEmit 2>&1 | head -40`

Expected: Type errors in the four terrain generator classes (return type mismatch, missing `revertCrater`). This confirms the interface change propagated.

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts
git commit -m "feat(terrain): add CraterDeformData type and revertCrater to ITerrainGenerator"
```

---

## Task 2: Implement `deformCrater` Return + `revertCrater` in DefaultTerrainGenerator

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts` (DefaultTerrainGenerator class, `deformCrater` at lines 857-897)

- [ ] **Step 1: Update `deformCrater` to capture and return original values**

Replace the `deformCrater` method body (lines 857-897). The key change: before modifying each heightmap cell and mesh vertex, record its original Y value. The method signature changes to return `CraterDeformData | null`. The `meshIndex` is `0` since DefaultTerrainGenerator has a single mesh.

```typescript
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): CraterDeformData | null {
    if (!this.heightmap || !this.terrainMesh) return null
    const hm = this.heightmap
    const influenceRadius = radius * 1.3
    const cellSize = SCALE / (GRID_SIZE - 1)
    const gxCenter = Math.round((x / SCALE + 0.5) * (GRID_SIZE - 1))
    const gzCenter = Math.round((z / SCALE + 0.5) * (GRID_SIZE - 1))
    const cellSpan = Math.ceil(influenceRadius / cellSize) + 1

    const gxMin = Math.max(0, gxCenter - cellSpan)
    const gxMax = Math.min(GRID_SIZE - 1, gxCenter + cellSpan)
    const gzMin = Math.max(0, gzCenter - cellSpan)
    const gzMax = Math.min(GRID_SIZE - 1, gzCenter + cellSpan)

    const cells: CraterDeformData['cells'] = []
    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const wx = (gx / (GRID_SIZE - 1) - 0.5) * SCALE
        const wz = (gz / (GRID_SIZE - 1) - 0.5) * SCALE
        const dx = wx - x
        const dz = wz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        const idx = gz * GRID_SIZE + gx
        cells.push({ gx, gz, originalY: hm[idx] })
        hm[idx] += offset
      }
    }

    const meshVertices: CraterDeformData['meshVertices'] = []
    const pos = this.terrainMesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)
      const dx = vx - x
      const dz = vz - z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > influenceRadius) continue
      const offset = computeCraterDepth(dist, radius, depth, rimHeight)
      meshVertices.push({ meshIndex: 0, vertexIndex: i, originalY: pos.getY(i) })
      pos.setY(i, pos.getY(i) + offset)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()

    return { cells, meshVertices }
  }
```

- [ ] **Step 2: Add `revertCrater` method after `deformCrater`**

```typescript
  revertCrater(data: CraterDeformData): void {
    if (!this.heightmap || !this.terrainMesh) return
    const hm = this.heightmap
    for (const c of data.cells) {
      hm[c.gz * GRID_SIZE + c.gx] = c.originalY
    }
    const pos = this.terrainMesh.geometry.attributes.position
    for (const v of data.meshVertices) {
      pos.setY(v.vertexIndex, v.originalY)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()
  }
```

- [ ] **Step 3: Verify existing crater tests still pass**

Run: `npx vitest run src/lib/meteor/__tests__/craterProfile.test.ts`

Expected: All tests pass (crater math is unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts
git commit -m "feat(terrain): implement deformCrater return + revertCrater in DefaultTerrainGenerator"
```

---

## Task 3: Implement `deformCrater` Return + `revertCrater` in GlbTerrainGenerator

**Files:**
- Modify: `src/three/terrain/GlbTerrainGenerator.ts` (`deformCrater` at lines 503-545)

- [ ] **Step 1: Update `deformCrater` to capture originals and return them**

Same pattern as DefaultTerrainGenerator but iterates `this.terrainMeshes` (plural). Each mesh gets its own `meshIndex` (the loop index).

```typescript
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): CraterDeformData | null {
    if (!this.heightmap) return null
    const hm = this.heightmap
    const influenceRadius = radius * 1.3
    const cellSize = SCALE / (GRID_SIZE - 1)
    const gxCenter = Math.round((x / SCALE + 0.5) * (GRID_SIZE - 1))
    const gzCenter = Math.round((z / SCALE + 0.5) * (GRID_SIZE - 1))
    const cellSpan = Math.ceil(influenceRadius / cellSize) + 1

    const gxMin = Math.max(0, gxCenter - cellSpan)
    const gxMax = Math.min(GRID_SIZE - 1, gxCenter + cellSpan)
    const gzMin = Math.max(0, gzCenter - cellSpan)
    const gzMax = Math.min(GRID_SIZE - 1, gzCenter + cellSpan)

    const cells: CraterDeformData['cells'] = []
    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const wx = (gx / (GRID_SIZE - 1) - 0.5) * SCALE
        const wz = (gz / (GRID_SIZE - 1) - 0.5) * SCALE
        const dx = wx - x
        const dz = wz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        const idx = gz * GRID_SIZE + gx
        cells.push({ gx, gz, originalY: hm[idx] })
        hm[idx] += offset
      }
    }

    const meshVertices: CraterDeformData['meshVertices'] = []
    for (let mi = 0; mi < this.terrainMeshes.length; mi++) {
      const mesh = this.terrainMeshes[mi]
      const pos = mesh.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i)
        const vz = pos.getZ(i)
        const dx = vx - x
        const dz = vz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        meshVertices.push({ meshIndex: mi, vertexIndex: i, originalY: pos.getY(i) })
        pos.setY(i, pos.getY(i) + offset)
      }
      mesh.geometry.attributes.position.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    }

    return { cells, meshVertices }
  }
```

- [ ] **Step 2: Add `revertCrater` method**

```typescript
  revertCrater(data: CraterDeformData): void {
    if (!this.heightmap) return
    const hm = this.heightmap
    for (const c of data.cells) {
      hm[c.gz * GRID_SIZE + c.gx] = c.originalY
    }
    for (const v of data.meshVertices) {
      const mesh = this.terrainMeshes[v.meshIndex]
      if (!mesh) continue
      mesh.geometry.attributes.position.setY(v.vertexIndex, v.originalY)
    }
    for (const mesh of this.terrainMeshes) {
      mesh.geometry.attributes.position.needsUpdate = true
      mesh.geometry.computeVertexNormals()
    }
  }
```

- [ ] **Step 3: Add `CraterDeformData` import at top of file**

```typescript
import type { CraterDeformData } from './TerrainGenerator'
```

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/GlbTerrainGenerator.ts
git commit -m "feat(terrain): implement deformCrater return + revertCrater in GlbTerrainGenerator"
```

---

## Task 4: Implement `deformCrater` Return + `revertCrater` in MarsGlobalTerrainGenerator

**Files:**
- Modify: `src/three/terrain/MarsGlobalTerrainGenerator.ts` (`deformCrater` at lines 333-377)

- [ ] **Step 1: Update `deformCrater` — delegate to fallback or capture originals**

The fallback path delegates to `this.fallback.deformCrater(...)` which already returns `CraterDeformData | null` from Task 2. The primary path uses the same single-mesh pattern as DefaultTerrainGenerator.

```typescript
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): CraterDeformData | null {
    if (this.fallback) {
      return this.fallback.deformCrater(x, z, radius, depth, rimHeight)
    }
    if (!this.heightmap || !this.terrainMesh) return null
    const hm = this.heightmap
    const influenceRadius = radius * 1.3
    const cellSize = SCALE / (GRID_SIZE - 1)
    const gxCenter = Math.round((x / SCALE + 0.5) * (GRID_SIZE - 1))
    const gzCenter = Math.round((z / SCALE + 0.5) * (GRID_SIZE - 1))
    const cellSpan = Math.ceil(influenceRadius / cellSize) + 1

    const gxMin = Math.max(0, gxCenter - cellSpan)
    const gxMax = Math.min(GRID_SIZE - 1, gxCenter + cellSpan)
    const gzMin = Math.max(0, gzCenter - cellSpan)
    const gzMax = Math.min(GRID_SIZE - 1, gzCenter + cellSpan)

    const cells: CraterDeformData['cells'] = []
    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const wx = (gx / (GRID_SIZE - 1) - 0.5) * SCALE
        const wz = (gz / (GRID_SIZE - 1) - 0.5) * SCALE
        const dx = wx - x
        const dz = wz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        const idx = gz * GRID_SIZE + gx
        cells.push({ gx, gz, originalY: hm[idx] })
        hm[idx] += offset
      }
    }

    const meshVertices: CraterDeformData['meshVertices'] = []
    const pos = this.terrainMesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)
      const dx = vx - x
      const dz = vz - z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > influenceRadius) continue
      const offset = computeCraterDepth(dist, radius, depth, rimHeight)
      meshVertices.push({ meshIndex: 0, vertexIndex: i, originalY: pos.getY(i) })
      pos.setY(i, pos.getY(i) + offset)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()

    return { cells, meshVertices }
  }
```

- [ ] **Step 2: Add `revertCrater` method — delegate to fallback or restore**

```typescript
  revertCrater(data: CraterDeformData): void {
    if (this.fallback) {
      this.fallback.revertCrater(data)
      return
    }
    if (!this.heightmap || !this.terrainMesh) return
    const hm = this.heightmap
    for (const c of data.cells) {
      hm[c.gz * GRID_SIZE + c.gx] = c.originalY
    }
    const pos = this.terrainMesh.geometry.attributes.position
    for (const v of data.meshVertices) {
      pos.setY(v.vertexIndex, v.originalY)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()
  }
```

- [ ] **Step 3: Add `CraterDeformData` import at top of file**

```typescript
import type { CraterDeformData } from './TerrainGenerator'
```

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/MarsGlobalTerrainGenerator.ts
git commit -m "feat(terrain): implement deformCrater return + revertCrater in MarsGlobalTerrainGenerator"
```

---

## Task 5: Implement `deformCrater` Return + `revertCrater` in ElevationTerrainGenerator

**Files:**
- Modify: `src/three/terrain/ElevationTerrainGenerator.ts` (`deformCrater` at lines 244-284)

- [ ] **Step 1: Update `deformCrater` — identical pattern to DefaultTerrainGenerator**

```typescript
  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): CraterDeformData | null {
    if (!this.heightmap || !this.terrainMesh) return null
    const hm = this.heightmap
    const influenceRadius = radius * 1.3
    const cellSize = SCALE / (GRID_SIZE - 1)
    const gxCenter = Math.round((x / SCALE + 0.5) * (GRID_SIZE - 1))
    const gzCenter = Math.round((z / SCALE + 0.5) * (GRID_SIZE - 1))
    const cellSpan = Math.ceil(influenceRadius / cellSize) + 1

    const gxMin = Math.max(0, gxCenter - cellSpan)
    const gxMax = Math.min(GRID_SIZE - 1, gxCenter + cellSpan)
    const gzMin = Math.max(0, gzCenter - cellSpan)
    const gzMax = Math.min(GRID_SIZE - 1, gzCenter + cellSpan)

    const cells: CraterDeformData['cells'] = []
    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const wx = (gx / (GRID_SIZE - 1) - 0.5) * SCALE
        const wz = (gz / (GRID_SIZE - 1) - 0.5) * SCALE
        const dx = wx - x
        const dz = wz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        const idx = gz * GRID_SIZE + gx
        cells.push({ gx, gz, originalY: hm[idx] })
        hm[idx] += offset
      }
    }

    const meshVertices: CraterDeformData['meshVertices'] = []
    const pos = this.terrainMesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)
      const dx = vx - x
      const dz = vz - z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > influenceRadius) continue
      const offset = computeCraterDepth(dist, radius, depth, rimHeight)
      meshVertices.push({ meshIndex: 0, vertexIndex: i, originalY: pos.getY(i) })
      pos.setY(i, pos.getY(i) + offset)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()

    return { cells, meshVertices }
  }
```

- [ ] **Step 2: Add `revertCrater` method**

```typescript
  revertCrater(data: CraterDeformData): void {
    if (!this.heightmap || !this.terrainMesh) return
    const hm = this.heightmap
    for (const c of data.cells) {
      hm[c.gz * GRID_SIZE + c.gx] = c.originalY
    }
    const pos = this.terrainMesh.geometry.attributes.position
    for (const v of data.meshVertices) {
      pos.setY(v.vertexIndex, v.originalY)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()
  }
```

- [ ] **Step 3: Add `CraterDeformData` import at top of file**

```typescript
import type { CraterDeformData } from './TerrainGenerator'
```

- [ ] **Step 4: Run type check — all terrain generators should now compile**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

Expected: Either clean or only unrelated errors. No terrain generator type errors.

- [ ] **Step 5: Commit**

```bash
git add src/three/terrain/ElevationTerrainGenerator.ts
git commit -m "feat(terrain): implement deformCrater return + revertCrater in ElevationTerrainGenerator"
```

---

## Task 6: `MeteorCrater` Type + Crater Tracking in MeteorController

**Files:**
- Modify: `src/lib/meteor/meteorTypes.ts`
- Modify: `src/views/site-controllers/MeteorController.ts`

- [ ] **Step 1: Add `MeteorCrater` interface to `meteorTypes.ts`**

Append to `src/lib/meteor/meteorTypes.ts`:

```typescript
export interface MeteorCrater {
  id: string
  x: number
  z: number
  radius: number
  /** Reference to the meteorite rock mesh sitting in this crater */
  rockMesh: import('three').Mesh | null
  /** Deformation data for reverting this crater's terrain changes */
  deformData: import('../three/terrain/TerrainGenerator').CraterDeformData | null
}
```

Note: We use `import()` type syntax to avoid pulling Three.js into a types-only file at runtime. If the project convention prefers a separate file for this, move the interface. Since `meteorTypes.ts` already defines `MeteorFall` which is used by the controller, adding the crater type here keeps related concepts together.

**Alternative (cleaner):** Create the interface in `MeteorController.ts` itself since it references Three.js `Mesh` which is already imported there. The choice depends on whether other files need to import `MeteorCrater`. The DanTickHandler will need it for `getCraterAtPosition` return type, so we'll define it in `meteorTypes.ts` but use the import-type syntax.

Actually, let's keep it simpler and put it directly in MeteorController.ts since that file already imports THREE and is the only producer. The DanTickHandler can import the type from there.

Add this interface in `src/views/site-controllers/MeteorController.ts` after the existing imports (before line 14):

```typescript
export interface MeteorCrater {
  id: string
  x: number
  z: number
  radius: number
  rockMesh: THREE.Mesh | null
  deformData: CraterDeformData | null
}
```

And add the import at the top:

```typescript
import type { CraterDeformData } from '@/three/terrain/TerrainGenerator'
```

- [ ] **Step 2: Add crater tracking array and `getCraterAtPosition` query**

Inside the `createMeteorController` function, after `const meteoriteRocks: THREE.Mesh[] = []` (line 71), add:

```typescript
  const craters: MeteorCrater[] = []
```

Add query function before the `return` statement (before line 244):

```typescript
  function getCraterAtPosition(x: number, z: number): MeteorCrater | null {
    for (const crater of craters) {
      const dx = crater.x - x
      const dz = crater.z - z
      if (Math.sqrt(dx * dx + dz * dz) <= crater.radius) return crater
    }
    return null
  }
```

- [ ] **Step 3: Store crater data on impact**

In the `onFallImpact` callback, after line 158 (`terrain.deformCrater(...)`) replace the deformCrater call and the line after it:

Before (lines 158-161):
```typescript
        const crater = rollCraterParams()
        terrain.deformCrater(fall.targetX, fall.targetZ, crater.radius, crater.depth, crater.rimHeight)
        // Reposition rock to new ground level
        mesh.position.y = terrain.terrainHeightAt(fall.targetX, fall.targetZ)
```

After:
```typescript
        const craterParams = rollCraterParams()
        const deformData = terrain.deformCrater(fall.targetX, fall.targetZ, craterParams.radius, craterParams.depth, craterParams.rimHeight)
        mesh.position.y = terrain.terrainHeightAt(fall.targetX, fall.targetZ)
        craters.push({
          id: fall.id,
          x: fall.targetX,
          z: fall.targetZ,
          radius: craterParams.radius,
          rockMesh: mesh,
          deformData,
        })
```

- [ ] **Step 4: Update `onStormActive` to revert craters and clear tracking**

Replace the `onStormActive` function:

```typescript
  function onStormActive(): void {
    if (!rockFactory || !terrainGroup) return
    for (const rock of meteoriteRocks) {
      rockFactory.unregisterMeteoriteRock(rock, terrainGroup)
    }
    meteoriteRocks.length = 0
    // Revert all crater terrain deformations
    for (const crater of craters) {
      if (crater.deformData && terrain) {
        terrain.revertCrater(crater.deformData)
      }
    }
    craters.length = 0
  }
```

- [ ] **Step 5: Add `unregisterMeteoriteRock` helper for vent placement**

Add before the `return` statement. This is used when a vent consumes a meteorite rock from a crater:

```typescript
  function removeCrater(craterId: string): void {
    const idx = craters.findIndex(c => c.id === craterId)
    if (idx !== -1) craters.splice(idx, 1)
  }

  function unregisterMeteoriteRockFromCrater(crater: MeteorCrater): void {
    if (!crater.rockMesh || !rockFactory || !terrainGroup) return
    rockFactory.unregisterMeteoriteRock(crater.rockMesh, terrainGroup)
    const rockIdx = meteoriteRocks.indexOf(crater.rockMesh)
    if (rockIdx !== -1) meteoriteRocks.splice(rockIdx, 1)
    crater.rockMesh = null
  }
```

- [ ] **Step 6: Update the return type to expose new functions**

Update the return type annotation of `createMeteorController` to include the new functions. Change the return statement to:

```typescript
  return {
    tick, dispose, setSceneComponents, onStormActive, getActiveMeteoriteRocks, triggerShower,
    getCraterAtPosition, removeCrater, unregisterMeteoriteRockFromCrater,
  }
```

And update the return type in the function signature:

```typescript
export function createMeteorController(
  options: MeteorControllerOptions,
): SiteTickHandler & {
  setSceneComponents: (components: MeteorSceneComponents) => void
  onStormActive: () => void
  getActiveMeteoriteRocks: () => THREE.Mesh[]
  triggerShower: (severity: ShowerSeverity) => void
  getCraterAtPosition: (x: number, z: number) => MeteorCrater | null
  removeCrater: (craterId: string) => void
  unregisterMeteoriteRockFromCrater: (crater: MeteorCrater) => void
} {
```

- [ ] **Step 7: Run type check**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`

Expected: Clean or only unrelated errors.

- [ ] **Step 8: Commit**

```bash
git add src/views/site-controllers/MeteorController.ts
git commit -m "feat(meteor): track craters with deform data, expose getCraterAtPosition and storm revert"
```

---

## Task 7: Discovery Table + Roll Function

**Files:**
- Create: `src/lib/meteor/craterDiscovery.ts`
- Create: `src/lib/meteor/__tests__/craterDiscovery.test.ts`
- Modify: `src/lib/meteor/index.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/meteor/__tests__/craterDiscovery.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  CRATER_DISCOVERIES,
  rollCraterDiscovery,
  type CraterDiscovery,
} from '../craterDiscovery'

describe('CRATER_DISCOVERIES', () => {
  it('has 5 entries', () => {
    expect(CRATER_DISCOVERIES).toHaveLength(5)
  })

  it('discovery IDs are DC01-DC05', () => {
    const ids = CRATER_DISCOVERIES.map(d => d.id)
    expect(ids).toEqual(['DC01', 'DC02', 'DC03', 'DC04', 'DC05'])
  })

  it('weights sum to 100', () => {
    const total = CRATER_DISCOVERIES.reduce((s, d) => s + d.weight, 0)
    expect(total).toBe(100)
  })

  it('only DC01 and DC04 are placeable vents', () => {
    const vents = CRATER_DISCOVERIES.filter(d => d.ventType !== null)
    expect(vents).toHaveLength(2)
    expect(vents[0].id).toBe('DC01')
    expect(vents[0].ventType).toBe('co2')
    expect(vents[1].id).toBe('DC04')
    expect(vents[1].ventType).toBe('methane')
  })
})

describe('rollCraterDiscovery', () => {
  it('always returns a valid discovery', () => {
    for (let i = 0; i < 100; i++) {
      const d = rollCraterDiscovery()
      expect(d.id).toMatch(/^DC0[1-5]$/)
      expect(d.sp).toBeGreaterThan(0)
    }
  })

  it('returns the discovery matching a forced roll value', () => {
    // Roll 0 => first entry (DC01, weight 40, cumulative 0-40)
    const d1 = rollCraterDiscovery(0)
    expect(d1.id).toBe('DC01')

    // Roll 39.9 => still DC01 (cumulative < 40)
    const d2 = rollCraterDiscovery(39.9)
    expect(d2.id).toBe('DC01')

    // Roll 40 => DC02 (cumulative 40-55)
    const d3 = rollCraterDiscovery(40)
    expect(d3.id).toBe('DC02')

    // Roll 85 => DC04 (cumulative 70-85)
    const d4 = rollCraterDiscovery(85)
    expect(d4.id).toBe('DC05')

    // Roll 99.9 => DC05 (last entry)
    const d5 = rollCraterDiscovery(99.9)
    expect(d5.id).toBe('DC05')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/meteor/__tests__/craterDiscovery.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the discovery table**

Create `src/lib/meteor/craterDiscovery.ts`:

```typescript
export type VentType = 'co2' | 'methane'

export interface CraterDiscovery {
  id: string
  name: string
  rarity: 'Common' | 'Uncommon' | 'Rare'
  sp: number
  ventType: VentType | null
  sideProducts: Array<{ itemId: string; quantity: number }>
  weight: number
}

export const CRATER_DISCOVERIES: CraterDiscovery[] = [
  { id: 'DC01', name: 'CO\u2082 vent',                 rarity: 'Common',   sp: 20,  ventType: 'co2',     sideProducts: [],                                  weight: 40 },
  { id: 'DC02', name: 'Carbonate decomposition',       rarity: 'Uncommon', sp: 55,  ventType: null,      sideProducts: [{ itemId: 'trace-Ca', quantity: 2 }], weight: 15 },
  { id: 'DC03', name: 'Adsorbed water release',        rarity: 'Uncommon', sp: 60,  ventType: null,      sideProducts: [{ itemId: 'ice', quantity: 1 }],      weight: 15 },
  { id: 'DC04', name: 'Methane trace',                 rarity: 'Rare',     sp: 150, ventType: 'methane', sideProducts: [],                                  weight: 15 },
  { id: 'DC05', name: 'Deep regolith stratigraphy',    rarity: 'Uncommon', sp: 45,  ventType: null,      sideProducts: [],                                  weight: 15 },
]

/**
 * Roll a crater discovery. Pass a forced roll value (0-100) for testing; omit for random.
 */
export function rollCraterDiscovery(forcedRoll?: number): CraterDiscovery {
  const roll = forcedRoll ?? Math.random() * 100
  let cumulative = 0
  for (const d of CRATER_DISCOVERIES) {
    cumulative += d.weight
    if (roll < cumulative) return d
  }
  return CRATER_DISCOVERIES[CRATER_DISCOVERIES.length - 1]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/meteor/__tests__/craterDiscovery.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Add re-export to barrel**

In `src/lib/meteor/index.ts`, add:

```typescript
export * from './craterDiscovery'
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/meteor/craterDiscovery.ts src/lib/meteor/__tests__/craterDiscovery.test.ts src/lib/meteor/index.ts
git commit -m "feat(meteor): add crater discovery table with weighted roll function"
```

---

## Task 8: Vent Archive Types + Composable

**Files:**
- Create: `src/types/ventArchive.ts`
- Create: `src/composables/useVentArchive.ts`
- Create: `src/composables/__tests__/useVentArchive.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/composables/__tests__/useVentArchive.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useVentArchive } from '../useVentArchive'

describe('useVentArchive', () => {
  beforeEach(() => {
    localStorage.clear()
    useVentArchive().resetForTests()
  })

  it('starts empty', () => {
    const { vents } = useVentArchive()
    expect(vents.value).toEqual([])
  })

  it('archives a vent and persists it', () => {
    const { archiveVent, vents } = useVentArchive()
    archiveVent({
      siteId: 'gale',
      ventType: 'co2',
      placedSol: 5,
      x: 10,
      z: 20,
    })
    expect(vents.value).toHaveLength(1)
    expect(vents.value[0].ventType).toBe('co2')
    expect(vents.value[0].siteId).toBe('gale')
    expect(vents.value[0].x).toBe(10)
    expect(vents.value[0].z).toBe(20)
    expect(vents.value[0].archiveId).toBeTruthy()

    // Verify localStorage persistence
    const raw = localStorage.getItem('mars-vent-archive-v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed).toHaveLength(1)
  })

  it('returns vents for a specific site', () => {
    const { archiveVent, getVentsForSite } = useVentArchive()
    archiveVent({ siteId: 'gale', ventType: 'co2', placedSol: 1, x: 0, z: 0 })
    archiveVent({ siteId: 'jezero', ventType: 'methane', placedSol: 2, x: 5, z: 5 })
    archiveVent({ siteId: 'gale', ventType: 'methane', placedSol: 3, x: 10, z: 10 })

    expect(getVentsForSite('gale')).toHaveLength(2)
    expect(getVentsForSite('jezero')).toHaveLength(1)
    expect(getVentsForSite('nope')).toHaveLength(0)
  })

  it('checks if a vent type is active for a site', () => {
    const { archiveVent, hasActiveVent } = useVentArchive()
    expect(hasActiveVent('gale', 'co2')).toBe(false)

    archiveVent({ siteId: 'gale', ventType: 'co2', placedSol: 1, x: 0, z: 0 })
    expect(hasActiveVent('gale', 'co2')).toBe(true)
    expect(hasActiveVent('gale', 'methane')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/composables/__tests__/useVentArchive.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Create the `ArchivedVent` type**

Create `src/types/ventArchive.ts`:

```typescript
export interface ArchivedVent {
  archiveId: string
  siteId: string
  ventType: 'co2' | 'methane'
  placedSol: number
  /** World position where the vent GLB should be placed on restore. */
  x: number
  z: number
}
```

- [ ] **Step 4: Create the composable**

Create `src/composables/useVentArchive.ts`:

```typescript
import { ref } from 'vue'
import type { ArchivedVent } from '@/types/ventArchive'

const STORAGE_KEY = 'mars-vent-archive-v1'

function loadFromStorage(): ArchivedVent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function persist(data: ArchivedVent[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const vents = ref<ArchivedVent[]>(loadFromStorage())

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `vent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function useVentArchive() {
  function archiveVent(params: Omit<ArchivedVent, 'archiveId'>): ArchivedVent {
    const entry: ArchivedVent = { archiveId: generateId(), ...params }
    vents.value = [...vents.value, entry]
    persist(vents.value)
    return entry
  }

  function getVentsForSite(siteId: string): ArchivedVent[] {
    return vents.value.filter(v => v.siteId === siteId)
  }

  function hasActiveVent(siteId: string, ventType: 'co2' | 'methane'): boolean {
    return vents.value.some(v => v.siteId === siteId && v.ventType === ventType)
  }

  function resetForTests(): void {
    vents.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return { vents, archiveVent, getVentsForSite, hasActiveVent, resetForTests }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/composables/__tests__/useVentArchive.test.ts`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types/ventArchive.ts src/composables/useVentArchive.ts src/composables/__tests__/useVentArchive.test.ts
git commit -m "feat(vent): add ArchivedVent type and useVentArchive composable with localStorage persistence"
```

---

## Task 9: Extend DAN Archive with `craterDiscovery` Field

**Files:**
- Modify: `src/types/danArchive.ts`

- [ ] **Step 1: Add optional `craterDiscovery` field to `ArchivedDANProspect`**

In `src/types/danArchive.ts`, before the closing `}` of `ArchivedDANProspect`, add:

```typescript
  /** Present only for DAN Crater Mode discoveries. */
  craterDiscovery?: {
    discoveryId: string
    discoveryName: string
    ventPlaced: boolean
    ventType?: 'co2' | 'methane'
  }
```

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit 2>&1 | head -10`

Expected: Clean (optional field is backwards compatible).

- [ ] **Step 3: Commit**

```bash
git add src/types/danArchive.ts
git commit -m "feat(dan): add optional craterDiscovery field to ArchivedDANProspect"
```

---

## Task 10: Add Crater Phases to DANController

**Files:**
- Modify: `src/three/instruments/DANController.ts`

- [ ] **Step 1: Extend `DANProspectPhase` type**

Find the `DANProspectPhase` type definition (line ~21) and extend it:

```typescript
type DANProspectPhase = 'idle' | 'drive-to-zone' | 'initiating' | 'prospecting' | 'complete'
  | 'crater-confirm' | 'crater-scanning'
```

No other changes needed in DANController — the tick handler drives the phase transitions.

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit 2>&1 | head -10`

Expected: Clean (union is wider, all existing matches still work).

- [ ] **Step 3: Commit**

```bash
git add src/three/instruments/DANController.ts
git commit -m "feat(dan): add crater-confirm and crater-scanning phases to DANProspectPhase"
```

---

## Task 11: DAN Crater Mode in DanTickHandler

This is the core task. The tick handler gets crater detection on DAN activate, the `crater-confirm` and `crater-scanning` phase branches, and vent placement on discovery.

**Files:**
- Modify: `src/views/site-controllers/DanTickHandler.ts`

- [ ] **Step 1: Add imports and new callback types**

At the top of `DanTickHandler.ts`, add to the imports:

```typescript
import type { MeteorCrater } from './MeteorController'
import type { CraterDiscovery, VentType } from '@/lib/meteor/craterDiscovery'
import { rollCraterDiscovery } from '@/lib/meteor/craterDiscovery'
```

Add new fields to `DanTickRefs` interface:

```typescript
  /** Set by tick handler when crater mode is available; watched by Vue for confirm dialog */
  danCraterModeAvailable: Ref<boolean>
```

Add new fields to `DanTickCallbacks` interface:

```typescript
  /** Query MeteorController for crater at rover position */
  getCraterAtPosition: (x: number, z: number) => MeteorCrater | null
  /** Check DAN archive for existing crater scan at this position */
  hasCraterBeenScanned: (x: number, z: number) => boolean
  /** Check if a vent of this type already exists for the site */
  hasActiveVent: (ventType: VentType) => boolean
  /** Called when crater scan completes — archives the crater discovery */
  archiveCraterDiscovery: (discovery: CraterDiscovery, ventPlaced: boolean) => void
  /** Called to place a vent (remove rock, revert crater, place GLB) */
  placeVent: (crater: MeteorCrater, ventType: VentType) => void
  /** Award SP for crater discovery */
  awardCraterSP: (amount: number, reason: string) => void
```

Add new fields to `DanTickHandler` interface:

```typescript
  /** Called from Vue when player confirms crater mode */
  confirmCraterMode(fctx: SiteFrameContext): void
  /** Called from Vue when player cancels crater mode */
  cancelCraterMode(fctx: SiteFrameContext): void
```

- [ ] **Step 2: Add crater mode state variables inside `createDanTickHandler`**

After the existing state variables (around line 165), add:

```typescript
  let activeCrater: MeteorCrater | null = null
  const DAN_CRATER_SCAN_DURATION_SEC = 30
```

- [ ] **Step 3: Modify `handleDanProspect` to detect craters first**

In the `handleDanProspect` function (starts line 326), add crater detection at the top, before the existing disc mesh creation. After the guard clause (line 328), insert:

```typescript
    // Crater detection — check if rover is inside an eligible crater
    const roverPos = fctx.siteScene?.rover?.position
    if (roverPos) {
      const crater = getCraterAtPosition(roverPos.x, roverPos.z)
      if (crater && crater.rockMesh && !hasCraterBeenScanned(crater.x, crater.z)) {
        // Eligible crater found — enter confirmation phase
        activeCrater = crater
        danInst.prospectPhase = 'crater-confirm'
        danProspectPhase.value = 'crater-confirm'
        danCraterModeAvailable.value = true
        return // Don't start normal prospect
      }
    }
```

- [ ] **Step 4: Add `confirmCraterMode` and `cancelCraterMode` functions**

After `handleDanProspect`:

```typescript
  function confirmCraterMode(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst || !activeCrater) return

    danInst.prospectPhase = 'crater-scanning'
    danProspectPhase.value = 'crater-scanning'
    danProspectProgress.value = 0
    danCraterModeAvailable.value = false

    // Immobilize rover
    if (fctx.rover) fctx.rover.config.moveSpeed = 0
  }

  function cancelCraterMode(fctx: SiteFrameContext): void {
    const danInst = fctx.rover?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (!danInst) return

    activeCrater = null
    danInst.prospectPhase = 'idle'
    danProspectPhase.value = 'idle'
    danProspectProgress.value = 0
    danCraterModeAvailable.value = false
  }
```

- [ ] **Step 5: Add `crater-scanning` phase handling in the `tick` function**

In the `tick` function, inside the prospect state machine block (after line 421), add a new branch before the existing `drive-to-zone` check. The crater-scanning phase is a parallel branch that runs independently from the normal prospect flow:

Add after the `syncDanScanPlayback(danInst.passiveSubsystemEnabled)` line (419) and before the prospect phase state machine block (line 421):

```typescript
    // --- Crater scanning phase (parallel branch — never crosses normal prospect flow) ---
    if (danInst.prospectPhase === 'crater-scanning' && activeCrater) {
      const speedMod = playerMod('analysisSpeed') / danStormPenalty
      const adjustedDuration = DAN_CRATER_SCAN_DURATION_SEC / speedMod
      danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / adjustedDuration)
      danInst.prospectProgress = danProspectProgress.value

      if (danProspectProgress.value >= 1) {
        // Roll discovery
        const discovery = rollCraterDiscovery()
        const wantVent = discovery.ventType !== null && !hasActiveVent(discovery.ventType)

        // Award SP
        awardCraterSP(discovery.sp, `Crater discovery: ${discovery.name}`)

        // Archive
        archiveCraterDiscovery(discovery, wantVent)

        // Place vent if applicable
        if (wantVent && discovery.ventType) {
          placeVent(activeCrater, discovery.ventType)
          sampleToastRef.value?.showDAN(
            `PNEUMATIC FRACTURING COMPLETE \u2014 ${discovery.ventType === 'co2' ? 'CO\u2082' : 'CH\u2084'} VENT EXPOSED`,
          )
        } else {
          sampleToastRef.value?.showDAN(`Crater analysis: ${discovery.name} (+${discovery.sp} SP)`)
        }

        // Cleanup — deactivate DAN, unlock rover, return to idle
        danInst.prospectPhase = 'idle'
        danInst.prospectComplete = false
        danProspectPhase.value = 'idle'
        danProspectProgress.value = 0
        activeCrater = null
        if (controller) controller.config.moveSpeed = 5
        danInst.pendingHit = null
        danHitAvailable.value = false
      }
      // Skip normal prospect state machine when in crater mode
      syncDanProspectingPlayback(danInst.prospectPhase === 'crater-scanning')
      return
    }
```

**Important placement note:** This block must appear before the existing prospect phase state machine check at line 422 (`if (danInst.passiveSubsystemEnabled && danInst.prospectPhase !== 'idle' ...`). The `return` at the end prevents the normal prospect state machine from running during crater mode.

Actually, looking more carefully at the tick function structure, the `crater-scanning` block should go right before the normal prospect phase machine. The early return prevents the two paths from ever crossing.

- [ ] **Step 6: Update `abandonDanInvestigationOnStandby` to handle crater mode**

In the `abandonDanInvestigationOnStandby` function (around line 240), add crater mode cleanup. After clearing the existing prospect state, add:

```typescript
    activeCrater = null
    danCraterModeAvailable.value = false
```

- [ ] **Step 7: Update the return statement to include new functions**

In the return object, add:

```typescript
    confirmCraterMode,
    cancelCraterMode,
```

Update the `DanTickHandler` interface to match (already done in Step 1).

- [ ] **Step 8: Commit**

```bash
git add src/views/site-controllers/DanTickHandler.ts
git commit -m "feat(dan): add crater-confirm and crater-scanning phases to DAN tick handler"
```

---

## Task 12: Wire Crater Mode Callbacks in createMarsSiteTickHandlers

**Files:**
- Modify: `src/views/site-controllers/createMarsSiteTickHandlers.ts`

- [ ] **Step 1: Add imports**

Add at top:

```typescript
import { useVentArchive } from '@/composables/useVentArchive'
import type { CraterDiscovery, VentType } from '@/lib/meteor/craterDiscovery'
```

- [ ] **Step 2: Add `danCraterModeAvailable` ref to the refs block**

In the area where DAN refs are destructured from `ctx.refs`, add to the `refs` destructure:

```typescript
    danCraterModeAvailable,
```

This ref must be declared in `MartianSiteView.vue` (Task 14) and passed through `ctx.refs`.

- [ ] **Step 3: Wire new DAN callbacks**

In the `createDanTickHandler` call (lines 93-124), add new callback properties:

```typescript
      getCraterAtPosition: (x, z) => meteorHandler.getCraterAtPosition(x, z),
      hasCraterBeenScanned: (x, z) => {
        // Check DAN archive for a craterDiscovery entry near this position
        const { prospects } = useDanArchive()
        return prospects.value.some(p =>
          p.craterDiscovery
          && p.drillSiteX !== undefined && p.drillSiteZ !== undefined
          && Math.abs(p.drillSiteX - x) < 2 && Math.abs(p.drillSiteZ! - z) < 2,
        )
      },
      hasActiveVent: (ventType: VentType) => useVentArchive().hasActiveVent(ctx.siteId, ventType),
      archiveCraterDiscovery: (discovery: CraterDiscovery, ventPlaced: boolean) => {
        ctx.archiveDanProspect({
          capturedSol: refs.marsSol.value,
          siteId: ctx.siteId,
          siteLatDeg: refs.siteLat.value,
          siteLonDeg: refs.siteLon.value,
          roverWorldX: refs.roverWorldX.value,
          roverWorldZ: refs.roverWorldZ.value,
          roverSpawnX: refs.roverSpawnXZ.value.x,
          roverSpawnZ: refs.roverSpawnXZ.value.z,
          signalStrength: 1,
          quality: 'Strong',
          waterConfirmed: false,
          reservoirQuality: 0,
          craterDiscovery: {
            discoveryId: discovery.id,
            discoveryName: discovery.name,
            ventPlaced,
            ventType: discovery.ventType ?? undefined,
          },
        })
      },
      placeVent: (crater, ventType) => {
        // 1. Remove meteorite rock
        meteorHandler.unregisterMeteoriteRockFromCrater(crater)
        // 2. Revert crater terrain
        if (crater.deformData && fctx_terrain) {
          fctx_terrain.revertCrater(crater.deformData)
        }
        // 3. Remove crater from tracking
        meteorHandler.removeCrater(crater.id)
        // 4. Archive the vent
        useVentArchive().archiveVent({
          siteId: ctx.siteId,
          ventType,
          placedSol: refs.marsSol.value,
          x: crater.x,
          z: crater.z,
        })
        // Note: The actual GLB vent marker placement is handled in MartianSiteView via vent archive restoration
      },
      awardCraterSP: (amount, reason) => {
        ctx.awardSP(amount, reason)
      },
```

**Issue:** `placeVent` needs terrain access. The terrain reference is available through `fctx.siteScene.terrain` at runtime but not at construction time. We need a lazy reference. Add a helper at the top of `createMarsSiteTickHandlers`:

```typescript
  // Lazy terrain reference — resolved from first tick's fctx
  let fctx_terrain: import('@/three/terrain/TerrainGenerator').ITerrainGenerator | null = null
```

And in the meteor handler tick wrapper (or in a separate tick that runs early), capture it. Actually, the simplest approach: the `placeVent` callback will be called from within the DAN tick handler's `tick()` function, which has `fctx` in scope. Instead, let's pass the terrain getter as a function:

Replace the `placeVent` callback approach. Instead, make `placeVent` accept the terrain:

Actually, the cleanest approach: pass `placeVent` as a callback that receives just `crater` and `ventType`, and have it query the terrain from the meteor controller (which already captures it on tick). Let me restructure.

The MeteorController already has `terrain` in its closure (set from `fctx.siteScene.terrain` on first tick). But it's private. The simpler solution: the DanTickHandler's tick function already has `fctx`, so the `placeVent` callback should receive it. Or better: let the DanTickHandler itself handle the Three.js placement since it already has `fctx` access, and the callback only handles the data layer (archive + tracking removal).

**Revised approach:** Split the vent placement into data operations (callback) and scene operations (tick handler). The `placeVent` callback handles: remove rock from tracking, revert crater terrain, remove crater, archive vent. The tick handler in Task 11 already has `fctx` so it can access terrain directly.

Let me simplify. The `placeVent` callback from `createMarsSiteTickHandlers`:

```typescript
      placeVent: (crater, ventType) => {
        // Remove meteorite rock mesh from scene
        meteorHandler.unregisterMeteoriteRockFromCrater(crater)
        // Revert crater terrain (terrain is accessed through siteScene by the caller)
        // Note: terrain revert is done by the caller (DanTickHandler) which has fctx
        // Remove crater from tracking
        meteorHandler.removeCrater(crater.id)
        // Archive the vent
        useVentArchive().archiveVent({
          siteId: ctx.siteId,
          ventType,
          placedSol: refs.marsSol.value,
          x: crater.x,
          z: crater.z,
        })
      },
```

And in Task 11's crater-scanning completion (the `placeVent` call site in DanTickHandler), add the terrain revert before calling `placeVent`:

```typescript
        if (wantVent && discovery.ventType) {
          // Revert crater terrain first (fracking flattens the ground)
          if (activeCrater.deformData && siteScene?.terrain) {
            siteScene.terrain.revertCrater(activeCrater.deformData)
          }
          placeVent(activeCrater, discovery.ventType)
          // ... toast
        }
```

This is cleaner — the tick handler owns the fctx/scene access, the callback owns the data tracking. Update Task 11 Step 5 accordingly. The `placeVent` callback signature stays the same but doesn't need to touch terrain.

- [ ] **Step 4: Ensure `archiveDanProspect` in the context supports the new `craterDiscovery` field**

The `archiveDanProspect` callback type in `DanTickCallbacks` (line ~128-143) already accepts a params object. We need to add `craterDiscovery` to that params type. In `DanTickHandler.ts`, update the `archiveDanProspect` parameter type in `DanTickCallbacks`:

```typescript
  archiveDanProspect: (params: {
    capturedSol: number
    siteId: string
    siteLatDeg: number
    siteLonDeg: number
    roverWorldX: number
    roverWorldZ: number
    roverSpawnX: number
    roverSpawnZ: number
    siteUnitsPerMeter?: number
    signalStrength: number
    quality: 'Weak' | 'Moderate' | 'Strong'
    waterConfirmed: boolean
    reservoirQuality: number
    drillSite?: { x: number; y: number; z: number }
    craterDiscovery?: {
      discoveryId: string
      discoveryName: string
      ventPlaced: boolean
      ventType?: 'co2' | 'methane'
    }
  }) => void
```

And in `useDanArchive.ts`, the `archiveProspect` function needs to pass through `craterDiscovery` when building the archive row. Add `craterDiscovery` to the params accepted by `archiveProspect` and include it in the saved object.

- [ ] **Step 5: Update `useDanArchive.archiveProspect` to support `craterDiscovery`**

In `src/composables/useDanArchive.ts`, in the `archiveProspect` function, add `craterDiscovery` to the params type and include it in the created row.

- [ ] **Step 6: Commit**

```bash
git add src/views/site-controllers/createMarsSiteTickHandlers.ts src/views/site-controllers/DanTickHandler.ts src/composables/useDanArchive.ts
git commit -m "feat(dan): wire crater mode callbacks through createMarsSiteTickHandlers"
```

---

## Task 13: Vent GLB Marker Placement + Restoration

The vent marker reuses the existing `/dan.glb` drill marker pattern. Vents are restored on page load from the vent archive.

**Files:**
- Modify: `src/views/site-controllers/DanTickHandler.ts` (vent marker placement after crater scan)

- [ ] **Step 1: Add vent marker placement in crater-scanning completion**

In the crater-scanning completion block (Task 11, Step 5), after calling `placeVent(...)`, place the GLB marker at the crater center. This reuses the existing `loadDanDrillMarkerTemplate` + `placeDanDrillMarkerInstance` pattern:

```typescript
        if (wantVent && discovery.ventType) {
          // Revert crater terrain (fracking flattens ground)
          if (activeCrater.deformData && siteScene?.terrain) {
            siteScene.terrain.revertCrater(activeCrater.deformData)
          }
          placeVent(activeCrater, discovery.ventType)

          // Place vent GLB marker at crater center on flat terrain
          const ventX = activeCrater.x
          const ventZ = activeCrater.z
          const ventGroundY = siteScene?.terrain
            ? siteScene.terrain.heightAt(ventX, ventZ)
            : 0
          const sceneRef = siteScene?.scene
          void loadDanDrillMarkerTemplate().then((template) => {
            if (!tickHandlerActive || !sceneRef) return
            const marker = template.clone(true)
            placeDanDrillMarkerInstance(marker, ventX, ventZ, ventGroundY)
            sceneRef.add(marker)
          })

          sampleToastRef.value?.showDAN(
            `PNEUMATIC FRACTURING COMPLETE \u2014 ${discovery.ventType === 'co2' ? 'CO\u2082' : 'CH\u2084'} VENT EXPOSED`,
          )
        }
```

This is a refinement of the code already shown in Task 11 Step 5. Make sure the `placeVent` call happens AFTER the terrain revert but BEFORE the marker placement (the marker needs the new flat ground height).

- [ ] **Step 2: Add vent restoration on site load**

In the `initIfReady` function (around line 308), after the drill site hydration, add vent restoration:

```typescript
      // Restore persisted vents
      const siteVents = getVentsForSite(siteId)
      for (const vent of siteVents) {
        const ventGroundY = fctx.siteScene?.terrain
          ? fctx.siteScene.terrain.heightAt(vent.x, vent.z)
          : 0
        const sceneRef = fctx.siteScene?.scene
        void loadDanDrillMarkerTemplate().then((template) => {
          if (!tickHandlerActive || !sceneRef) return
          const marker = template.clone(true)
          placeDanDrillMarkerInstance(marker, vent.x, vent.z, ventGroundY)
          sceneRef.add(marker)
        })
      }
```

Add `getVentsForSite` to the callbacks interface:

```typescript
  getVentsForSite: (siteId: string) => import('@/types/ventArchive').ArchivedVent[]
```

And wire it in `createMarsSiteTickHandlers`:

```typescript
      getVentsForSite: (siteId) => useVentArchive().getVentsForSite(siteId),
```

- [ ] **Step 3: Commit**

```bash
git add src/views/site-controllers/DanTickHandler.ts src/views/site-controllers/createMarsSiteTickHandlers.ts
git commit -m "feat(vent): place and restore vent GLB markers using dan.glb template"
```

---

## Task 14: Vue Layer — Crater Confirm Dialog + Vent Map Markers

**Files:**
- Modify: `src/views/MartianSiteView.vue`

- [ ] **Step 1: Add `danCraterModeAvailable` ref**

In the refs section (around line 975), add:

```typescript
const danCraterModeAvailable = ref(false)
```

Pass it through `refs` to `createMarsSiteTickHandlers` (via the `MarsSiteViewContext` refs object).

- [ ] **Step 2: Add crater confirm dialog template**

In the template, after the existing power shunt confirmation dialog (around line 385), add:

```vue
<div v-if="danCraterModeAvailable" key="crater-confirm" class="overdrive-confirm-overlay">
  <div class="overdrive-confirm conservation-dialog">
    <div class="overdrive-icon conservation-icon">&#x26C7;</div>
    <div class="overdrive-title">CRATER DETECTED</div>
    <div class="overdrive-desc">
      Initiate DAN Crater Mode? Rover will be immobilized during scan.
    </div>
    <div class="overdrive-buttons">
      <button class="overdrive-engage" @click="confirmCraterMode()">INITIATE SCAN</button>
      <button class="overdrive-cancel" @click="cancelCraterMode()">CANCEL</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add confirm/cancel handler functions**

```typescript
function confirmCraterMode(): void {
  const fctx = siteHandle.value?.getFrameContext?.()
  if (fctx) siteHandle.value?.danHandler.confirmCraterMode(fctx)
}
function cancelCraterMode(): void {
  const fctx = siteHandle.value?.getFrameContext?.()
  if (fctx) siteHandle.value?.danHandler.cancelCraterMode(fctx)
}
```

Note: The exact access pattern to the DAN handler depends on how `siteHandle` exposes tick handlers. Check `MarsSiteViewControllerHandle` for the existing pattern. The existing `handleDanProspect` delegates via `siteHandle.value?.handleDanProspect()` so the crater mode confirm/cancel may need a similar delegation pattern. If `MarsSiteViewControllerHandle` doesn't expose individual handlers, add `confirmCraterMode` and `cancelCraterMode` to the handle interface.

- [ ] **Step 4: Add vent markers to MapOverlay**

In the `computed` or method that builds the `markers` array for `MapOverlay`, include vent positions:

```typescript
const ventMarkers = computed<MapMarker[]>(() => {
  const { getVentsForSite } = useVentArchive()
  return getVentsForSite(siteId).map(v => ({
    id: `vent-${v.archiveId}`,
    x: v.x,
    z: v.z,
    color: v.ventType === 'co2' ? '#ff8844' : '#44ff88',
    label: v.ventType === 'co2' ? 'CO\u2082 VENT' : 'CH\u2084 VENT',
    pulse: true,
  }))
})
```

Then merge with existing markers in the `MapOverlay` props:

```vue
<MapOverlay
  ...existing-props
  :markers="[...existingMarkers, ...ventMarkers]"
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "feat(dan): add crater confirm dialog and vent map markers to MartianSiteView"
```

---

## Task 15: Integration Verification + Final Cleanup

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`

Expected: All tests pass. Fix any failures.

- [ ] **Step 2: Run type check**

Run: `npx vue-tsc --noEmit`

Expected: Clean.

- [ ] **Step 3: Run dev server and smoke test**

Run: `npm run dev`

Manual checks:
1. Trigger a meteor shower (dev command)
2. Drive rover into a crater
3. Activate DAN — confirm dialog appears
4. Accept — 30-second scan runs
5. On vent discovery — terrain flattens, GLB marker appears, toast shown
6. Open map overlay — vent marker visible with correct color + pulse
7. Refresh page — vent marker restored from localStorage
8. Trigger storm — non-vent craters revert, vent persists

- [ ] **Step 4: Commit any fixups**

```bash
git add -u
git commit -m "fix: integration cleanup for Pass 3 crater mode"
```

---

## Appendix: Cross-Task Dependency Graph

```
Task 1 (interface) ──┬── Task 2 (Default) ──┐
                     ├── Task 3 (GLB)       ──┤
                     ├── Task 4 (Global)    ──┼── Task 6 (MeteorController crater tracking)
                     └── Task 5 (Elevation) ──┘          │
                                                          │
Task 7 (Discovery table) ────────────────────┐           │
Task 8 (Vent archive) ──────────────────────┤           │
Task 9 (DAN archive field) ─────────────────┤           │
Task 10 (DAN phases) ──────────────────────┤           │
                                             ├── Task 11 (DAN tick handler crater mode)
                                             │           │
                                             └── Task 12 (Wire callbacks)
                                                         │
                                               Task 13 (Vent GLB placement)
                                                         │
                                               Task 14 (Vue dialog + markers)
                                                         │
                                               Task 15 (Integration test)
```

Tasks 2-5 can run in parallel. Tasks 7-10 can run in parallel. Tasks 11-14 are sequential.
