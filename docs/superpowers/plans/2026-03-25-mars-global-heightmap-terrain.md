# Mars Global Heightmap Terrain Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a terrain generator that extracts a local terrain patch from a global Mars heightmap GLB based on the landmark's lat/lon coordinates, so every site gets real topography from its actual location.

**Architecture:** The 92MB `mars_terrain_model.glb` is a sphere mesh of the entire planet (~1.77M vertices, 28 meshes). At generate time, we convert the landmark's lat/lon to a 3D point on the sphere, find all vertices within a configurable angular radius, project them onto a local tangent plane (East-North-Up), and build a terrain mesh from those points. The existing terrain shader provides all texturing. Falls back to `DefaultTerrainGenerator` if the GLB fails to load or the region is too sparse.

**Tech Stack:** Three.js (GLTFLoader, BufferGeometry, Raycaster), existing areography coordinate utils, existing terrain shader pipeline, existing RockFactory.

---

## Data Model

The GLB sphere has vertices in Mars-centered Cartesian coordinates (meters, ~3389km radius). Each landmark has `lat` (-90..90) and `lon` (-180..180, east-positive). We need to:

1. Convert lat/lon → 3D point on sphere at the GLB's radius
2. Find all GLB vertices within an angular radius (~0.5° ≈ 30km at equator)
3. Build a local tangent-plane frame (ENU: East-North-Up) at that point
4. Project nearby vertices into the tangent plane → flat (x, y, height) coords
5. Build a PlaneGeometry-like mesh from the projected points
6. Apply existing terrain shader + rock spawning

## Key Decisions

- **92MB GLB load:** Load once, cache the combined vertex buffer. Use a loading indicator. The GLB has no textures (already stripped by user) so it's pure geometry.
- **Patch extraction radius:** ~0.3°–0.5° latitude (18–30km). This gives enough terrain to fill our 800-unit play area while keeping vertex density reasonable.
- **Sparse regions:** Some areas may have few vertices (oceans, poles). If patch has <500 vertices, fall back to procedural.
- **Heightmap grid:** After projecting to tangent plane, rasterize into the existing 256×256 grid for `heightAt()` queries. Use the actual projected vertices for the render mesh.

## File Structure

```
src/three/terrain/
├── MarsGlobalTerrainGenerator.ts  — NEW: ITerrainGenerator implementation
├── marsGlobalExtract.ts           — NEW: GLB loading, vertex extraction, tangent-plane projection
├── TerrainGenerator.ts            — MODIFY: add 'mars-global' to TerrainGeneratorType union + factory
├── GlbTerrainGenerator.ts         — UNCHANGED (existing random GLB loader)
├── RockFactory.ts                 — UNCHANGED
└── GolombekDistribution.ts        — UNCHANGED

src/types/
└── landmark.ts                    — UNCHANGED (lat/lon already there)

src/lib/areography/
└── coordinates.ts                 — UNCHANGED (latLonToCartesian already there)
```

---

### Task 1: Add lat/lon to TerrainParams

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts` (TerrainParams interface)
- Modify: `src/views/MarsSiteViewController.ts` (getTerrainParamsForSite)

- [ ] **Step 1: Add optional lat/lon fields to TerrainParams**

```ts
// In TerrainParams interface, add:
/** Landmark latitude in degrees (-90..90) */
latDeg?: number
/** Landmark longitude in degrees (-180..180, east-positive) */
lonDeg?: number
```

- [ ] **Step 2: Pass lat/lon in getTerrainParamsForSite**

In `getTerrainParamsForSite`, add `latDeg: geo.lat, lonDeg: geo.lon` to both the geological and default return objects.

- [ ] **Step 3: Verify build passes**

Run: `npx vue-tsc --noEmit && npm run test`

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts src/views/MarsSiteViewController.ts
git commit -m "feat(terrain): add lat/lon to TerrainParams for geo-located terrain"
```

---

### Task 2: GLB loading + vertex extraction utility

**Files:**
- Create: `src/three/terrain/marsGlobalExtract.ts`
- Test: `src/three/terrain/__tests__/marsGlobalExtract.test.ts`

- [ ] **Step 1: Write test for tangent-plane projection**

```ts
// Test that latLonToCartesian → project to tangent plane → gives (0, 0, radius) at the center point
// Test that a point 0.1° east projects to a positive East offset
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run src/three/terrain/__tests__/marsGlobalExtract.test.ts`

- [ ] **Step 3: Implement marsGlobalExtract.ts**

Key exports:
```ts
/** Cached global vertex data from mars_terrain_model.glb */
interface MarsGlobalMesh {
  positions: Float32Array   // flattened xyz
  vertexCount: number
  sphereRadius: number      // detected from vertex distances
}

/** Load and cache the global Mars GLB (one-time ~92MB fetch) */
async function loadMarsGlobalMesh(): Promise<MarsGlobalMesh>

/** Result of extracting a local patch */
interface LocalPatch {
  /** Projected positions in ENU frame: x=East, y=Up(height), z=North */
  positions: Float32Array
  /** Triangle indices */
  indices: Uint32Array
  /** World-space extent for scaling */
  extentMeters: number
  /** Height range in the patch */
  heightMin: number
  heightMax: number
}

/**
 * Extract vertices near (lat, lon) and project to local tangent plane.
 * @param mesh  Cached global mesh
 * @param lat   Latitude degrees
 * @param lon   Longitude degrees
 * @param radiusDeg  Angular radius to extract (~0.3-0.5°)
 */
function extractLocalPatch(
  mesh: MarsGlobalMesh,
  lat: number, lon: number,
  radiusDeg: number,
): LocalPatch | null
```

Extraction algorithm:
1. `latLonToCartesian(lat, lon, mesh.sphereRadius)` → center point P
2. Compute angular threshold: `cos(radiusDeg * DEG2RAD)`
3. Scan all vertices, keep those where `dot(normalize(v), normalize(P)) > cosThreshold`
4. Build ENU frame at P:
   - P_normal = normalize(P)
   - **Pole-safe reference:** use world-X if `|P_normal.y| > 0.99`, else use world-Y
   - East = normalize(cross(refVector, P_normal))
   - North = cross(P_normal, East)
5. For each kept vertex: subtract P, project onto East/North/Up → (e, u, n)
6. Remap to Three.js coords: x=e, y=u (height), z=n
7. Auto-detect sphere radius from median vertex distance to origin (don't hardcode)

**Render mesh construction:** Build a regular `PlaneGeometry(SCALE, SCALE, GRID-1, GRID-1)` and displace vertex Y values from the rasterized heightmap grid. This is consistent with `DefaultTerrainGenerator` and works with the existing `heightAt()` query pattern.

**Grid rasterization:** Use a **coarser 128×128 grid** (not 256×256) since the extracted patch may only have 2k-5k vertices spread across it. Run **16 gap-fill passes** with neighbor averaging to ensure full coverage. If >20% of cells remain empty after filling, expand the extraction radius by 0.1° and retry.

**Height scaling:** After projection, clamp the height range to a maximum of 120 game-units (prevents unplayable terrain at extreme sites like Valles Marineris walls). Apply `min(fitScale * rawHeight, 120)` during grid rasterization.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add src/three/terrain/marsGlobalExtract.ts src/three/terrain/__tests__/marsGlobalExtract.test.ts
git commit -m "feat(terrain): global Mars heightmap extraction utility"
```

---

### Task 3: MarsGlobalTerrainGenerator class

**Files:**
- Create: `src/three/terrain/MarsGlobalTerrainGenerator.ts`

- [ ] **Step 1: Implement the generator**

Structure mirrors `GlbTerrainGenerator` but:
- In `generate()`: call `loadMarsGlobalMesh()` (cached singleton), then `extractLocalPatch(mesh, params.latDeg, params.lonDeg, 0.4)`
- Build a PlaneGeometry from the extracted heightmap grid
- Apply the same terrain shader (`createTerrainMaterial`) from `GlbTerrainGenerator` — extract into a shared utility or duplicate the material creation (it's ~50 lines)
- Generate UVs from XZ position (same as GlbTerrainGenerator)
- Raycast for rock placement
- Background mountains using the mountain shader
- If `extractLocalPatch` returns null (sparse region), log a warning and fall back to `DefaultTerrainGenerator.generate()`

- [ ] **Step 2: Verify build**

Run: `npx vue-tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/three/terrain/MarsGlobalTerrainGenerator.ts
git commit -m "feat(terrain): Mars global heightmap terrain generator"
```

---

### Task 4: Wire into factory + activate

**Files:**
- Modify: `src/three/terrain/TerrainGenerator.ts` (factory + type union)
- Modify: `src/views/MarsSiteViewController.ts` (switch to new generator)

- [ ] **Step 1: Add 'mars-global' to TerrainGeneratorType**

```ts
export type TerrainGeneratorType = 'default' | 'glb' | 'mars-global'
```

- [ ] **Step 2: Add factory case**

```ts
import { MarsGlobalTerrainGenerator } from './MarsGlobalTerrainGenerator'

// In createTerrainGenerator:
if (type === 'mars-global') return new MarsGlobalTerrainGenerator()
```

- [ ] **Step 3: Switch SiteScene to use 'mars-global'**

```ts
siteScene = new SiteScene('mars-global')
```

- [ ] **Step 4: Test manually**

Load a site, check console for:
- `[MarsGlobal] loading mars_terrain_model.glb...`
- `[MarsGlobal] extracted N vertices near (lat, lon)`
- Terrain visible with proper texturing
- Rocks placed on ground

- [ ] **Step 5: Commit**

```bash
git add src/three/terrain/TerrainGenerator.ts src/views/MarsSiteViewController.ts
git commit -m "feat(terrain): activate Mars global heightmap generator"
```

---

### Task 5: Loading indicator + fallback

**Files:**
- Modify: `src/three/terrain/MarsGlobalTerrainGenerator.ts`

- [ ] **Step 1: Add loading progress logging**

The 92MB GLB fetch should show progress. Use `GLTFLoader`'s `onProgress` callback or `fetch` with `ReadableStream` for progress tracking.

- [ ] **Step 2: Implement graceful fallback**

If the global GLB fails to load (network error, timeout), or the extracted patch is too sparse (<500 vertices), fall back to `DefaultTerrainGenerator`:

```ts
try {
  const mesh = await loadMarsGlobalMesh()
  const patch = extractLocalPatch(mesh, lat, lon, 0.4)
  if (!patch || patch.positions.length / 3 < 500) throw new Error('sparse')
  // ... build terrain from patch
} catch (e) {
  console.warn('[MarsGlobal] falling back to procedural:', e)
  const fallback = new DefaultTerrainGenerator()
  await fallback.generate(params)
  // Copy state from fallback to this
}
```

- [ ] **Step 3: Test with a polar site (likely sparse)**

- [ ] **Step 4: Commit**

```bash
git add src/three/terrain/MarsGlobalTerrainGenerator.ts
git commit -m "feat(terrain): loading progress + sparse-region fallback"
```

---

## Performance Considerations

- **92MB one-time load:** Cache the extracted position Float32Array in a module-level variable. **Dispose the GLB scene graph** (all meshes, buffer geometries) immediately after extracting positions to avoid holding ~42MB (GLB buffers + extracted array) instead of ~21MB.
- **Abort safety:** After `await loadAsync()`, check a `disposed` flag before proceeding. If the user navigated away during the load, bail out gracefully without mutating state.
- **Vertex scan:** 1.77M vertices × dot product = fast (~5ms). No spatial index needed at this scale.
- **Grid rasterization:** 128×128 grid from projected vertices with 16 gap-fill passes.
- **Memory:** The cached position buffer is ~21MB (1.77M × 3 × Float32). Acceptable for a web game that already loads 92MB of GLB data.
- **Compression:** The 92MB GLB is pure geometry (correlated float data). With Brotli compression on the server, transfer size should drop to ~30-40MB.

## Edge Cases

- **Polar regions:** Fewer vertices due to sphere topology. Radius may need to increase to 0.6° to get enough coverage. The tangent-plane projection also distorts more at poles.
- **Prime meridian / date line:** Longitude wrap-around. The dot-product approach handles this naturally since it works in Cartesian space.
- **Very flat regions:** Height range near zero. The shader's `uHeightRange` uniform handles this (uses `max(range, 0.1)`).
- **Olympus Mons summit:** Extreme elevation. The tangent plane projection may produce large height values. Scale to fit the 800-unit play area width, let height be whatever it is.
