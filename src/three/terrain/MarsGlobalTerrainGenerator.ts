import * as THREE from 'three'
import terrainVert from '@/three/shaders/terrain.vert.glsl?raw'
import terrainFrag from '@/three/shaders/terrain.frag.glsl?raw'
import mountainVert from '@/three/shaders/mountain.vert.glsl?raw'
import mountainFrag from '@/three/shaders/mountain.frag.glsl?raw'
import rockTextureUrl from '@/assets/texture1.jpg?url'
import dustTextureUrl from '@/assets/texture2.jpg?url'
import { RockFactory, type RockCollider } from './RockFactory'
import { TERRAIN_SCALE } from './terrainConstants'
import { DefaultTerrainGenerator, type ITerrainGenerator } from './TerrainGenerator'
import type { TerrainParams } from '@/types/terrain'
import { SimplexNoise } from '@/lib/math/simplexNoise'
import { pickDetailTextures } from '@/lib/terrain/detailTextures'
import { loadMarsGlobalMesh, extractLocalPatch, PATCH_GRID_SIZE } from './marsGlobalExtract'
import { computeCraterDepth } from '@/lib/meteor'

const SCALE = TERRAIN_SCALE
const GRID_SIZE = PATCH_GRID_SIZE // 128

/**
 * Terrain generator that uses a global Mars heightmap GLB.
 *
 * Loads a ~92MB global terrain model once (cached singleton), extracts a local
 * patch around the requested lat/lon, and builds a PlaneGeometry displaced by
 * the real heightmap data. Applies the standard terrain shader for texturing.
 */
export class MarsGlobalTerrainGenerator implements ITerrainGenerator {
  readonly group = new THREE.Group()
  readonly rockSpawner = new RockFactory()
  terrainMaterial: THREE.ShaderMaterial | null = null

  mapCanvasMars: HTMLCanvasElement | null = null
  mapCanvasHypso: HTMLCanvasElement | null = null

  private disposed = false
  private fallback: DefaultTerrainGenerator | null = null
  private terrainMesh: THREE.Mesh | null = null
  private mountains: THREE.Mesh[] = []
  private textures: THREE.Texture[] = []
  /** Sampled height grid for fast heightAt() queries */
  private heightmap: Float32Array | null = null
  private heightMin = 0
  private heightMax = 0
  /** Raycaster for precise height queries during rock spawning */
  private raycaster = new THREE.Raycaster()
  private rayOrigin = new THREE.Vector3()
  private rayDown = new THREE.Vector3(0, -1, 0)
  private _rayHits = 0
  private _rayMisses = 0

  get rockColliders(): RockCollider[] { return this.fallback ? this.fallback.rockColliders : this.rockSpawner.colliders }
  get scale(): number { return SCALE }

  async generate(params: TerrainParams): Promise<void> {
    this.dispose()
    this.disposed = false

    const latDeg = params.latDeg ?? 0
    const lonDeg = params.lonDeg ?? 0
    console.log(`[MarsGlobalTerrain] Loading patch at lat=${latDeg}, lon=${lonDeg}`)

    // 1. Load global mesh (cached singleton)
    let globalMesh: Awaited<ReturnType<typeof loadMarsGlobalMesh>>
    console.log(`[MarsGlobal] loading global mesh...`)
    const t0 = performance.now()
    try {
      globalMesh = await loadMarsGlobalMesh()
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`[MarsGlobal] falling back to procedural terrain: GLB load failed – ${reason}`)
      await this.activateFallback(params)
      return
    }
    console.log(`[MarsGlobal] global mesh loaded in ${(performance.now() - t0).toFixed(0)}ms`)

    if (this.disposed) return

    // 2. Extract local patch
    const patch = extractLocalPatch(globalMesh, latDeg, lonDeg)

    if (!patch) {
      console.warn(`[MarsGlobal] falling back to procedural terrain: no patch data at lat=${latDeg}, lon=${lonDeg} (sparse region)`)
      await this.activateFallback(params)
      return
    }

    if (this.disposed) return

    const { heightmap: patchHeightmap, gridSize, extentMeters, heightMin: pHeightMin, heightMax: pHeightMax } = patch

    console.log(`[MarsGlobalTerrain] Patch grid ${gridSize}x${gridSize}, extent=${extentMeters.toFixed(1)}m, height range=[${pHeightMin.toFixed(2)}, ${pHeightMax.toFixed(2)}]`)

    // 3. Build PlaneGeometry and displace vertices from heightmap
    const geo = new THREE.PlaneGeometry(SCALE, SCALE, gridSize - 1, gridSize - 1)
    // Rotate so plane is horizontal (Y-up)
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))

    const fitScale = SCALE / extentMeters

    // Normalize heights: subtract minimum so terrain starts at 0,
    // then scale to game units. The GLB model has 20× vertical exaggeration
    // baked in, so we only need fitScale + a mild boost for gentle areas.
    const rawRange = patch.heightMax - patch.heightMin
    const targetRange = Math.max(10, Math.min(60, rawRange * fitScale * 3))
    const heightScale = rawRange > 0.01 ? targetRange / rawRange : 0

    console.log(`[MarsGlobal] height range: ${rawRange.toFixed(1)}m → ${targetRange.toFixed(1)} game units (scale: ${heightScale.toFixed(4)})`)

    const pos = geo.attributes.position
    const vertexCount = pos.count
    console.log(`[MarsGlobalTerrain] Vertex count: ${vertexCount}`)

    // Displace Y from heightmap grid
    for (let i = 0; i < vertexCount; i++) {
      // Map vertex XZ position to grid indices
      const vx = pos.getX(i)
      const vz = pos.getZ(i)

      // Normalized [0, 1] across the plane
      const u = vx / SCALE + 0.5
      const v = vz / SCALE + 0.5

      // Grid coordinates
      const gx = Math.floor(u * (gridSize - 1))
      const gz = Math.floor(v * (gridSize - 1))
      const clamped_gx = Math.min(gridSize - 1, Math.max(0, gx))
      const clamped_gz = Math.min(gridSize - 1, Math.max(0, gz))

      const hmIdx = clamped_gz * gridSize + clamped_gx
      const height = (patchHeightmap[hmIdx] - patch.heightMin) * heightScale

      pos.setY(i, height)
    }

    // 4. Generate UVs from XZ position (normalized 0-1)
    const uvs = new Float32Array(vertexCount * 2)
    for (let i = 0; i < vertexCount; i++) {
      uvs[i * 2] = pos.getX(i) / SCALE + 0.5
      uvs[i * 2 + 1] = pos.getZ(i) / SCALE + 0.5
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

    // 5. Compute vertex normals
    geo.computeVertexNormals()

    // 6. Build internal heightmap for heightAt() queries
    this.buildHeightmap(geo)

    // 7. Apply terrain shader material
    const material = this.createTerrainMaterial(params)
    this.terrainMaterial = material

    // 8. Create mesh
    const mesh = new THREE.Mesh(geo, material)
    mesh.receiveShadow = true
    this.group.add(mesh)
    this.terrainMesh = mesh

    // Force world matrix update so raycaster can hit the mesh
    this.group.updateMatrixWorld(true)

    // 9. Spawn rocks
    await this.rockSpawner.ready()
    if (this.disposed) return
    this._rayHits = 0
    this._rayMisses = 0
    this.rockSpawner.spawn(
      params,
      (x, z) => this.raycastHeight(x, z),
      this.group,
    )
    console.log(`[MarsGlobalTerrain] raycast: ${this._rayHits} hits, ${this._rayMisses} misses, ${this.rockSpawner.rocks.length} rocks spawned`)

    // 10. Build background mountains
    this.buildMountains(params)
  }

  /** Activate a DefaultTerrainGenerator as fallback and mirror its state. */
  private async activateFallback(params: TerrainParams): Promise<void> {
    const fb = new DefaultTerrainGenerator()
    await fb.generate(params)
    if (this.disposed) {
      fb.dispose()
      return
    }
    this.fallback = fb
    // Mirror group children so callers see geometry on this.group
    while (fb.group.children.length > 0) {
      this.group.add(fb.group.children[0])
    }
    this.terrainMaterial = fb.terrainMaterial
  }

  /** Sample the terrain mesh to build a heightmap grid for fast lookups */
  private buildHeightmap(geo: THREE.BufferGeometry): void {
    const hm = new Float32Array(GRID_SIZE * GRID_SIZE)
    hm.fill(-Infinity)

    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i)
      const wy = pos.getY(i)
      const wz = pos.getZ(i)

      const gx = Math.floor((wx / SCALE + 0.5) * (GRID_SIZE - 1))
      const gz = Math.floor((wz / SCALE + 0.5) * (GRID_SIZE - 1))
      if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue

      const idx = gz * GRID_SIZE + gx
      if (wy > hm[idx]) hm[idx] = wy
    }

    // Fill gaps by nearest-neighbor
    for (let pass = 0; pass < 3; pass++) {
      for (let z = 1; z < GRID_SIZE - 1; z++) {
        for (let x = 1; x < GRID_SIZE - 1; x++) {
          const idx = z * GRID_SIZE + x
          if (hm[idx] > -1000) continue
          let sum = 0, count = 0
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const v = hm[(z + dz) * GRID_SIZE + (x + dx)]
              if (v > -1000) { sum += v; count++ }
            }
          }
          if (count > 0) hm[idx] = sum / count
        }
      }
    }

    // Remaining gaps get 0
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] <= -1000) hm[i] = 0
    }

    // Compute range
    this.heightMin = Infinity
    this.heightMax = -Infinity
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] < this.heightMin) this.heightMin = hm[i]
      if (hm[i] > this.heightMax) this.heightMax = hm[i]
    }

    this.heightmap = hm

    // Log grid fill percentage
    let filledCount = 0
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] !== 0) filledCount++
    }
    const fillPct = ((filledCount / (GRID_SIZE * GRID_SIZE)) * 100).toFixed(1)
    console.log(`[MarsGlobalTerrain] Heightmap grid fill: ${fillPct}%, height range=[${this.heightMin.toFixed(2)}, ${this.heightMax.toFixed(2)}]`)
  }

  /** Raycast against actual terrain mesh for precise height at (x, z). */
  private raycastHeight(x: number, z: number): number {
    if (!this.terrainMesh) return 0
    this.rayOrigin.set(x, this.heightMax + 50, z)
    this.raycaster.set(this.rayOrigin, this.rayDown)
    const hits = this.raycaster.intersectObject(this.terrainMesh, false)
    if (hits.length > 0) {
      this._rayHits++
      if (this._rayHits === 1) console.log('[MarsGlobalTerrain] first raycast hit at y:', hits[0].point.y.toFixed(1))
      return hits[0].point.y
    }
    this._rayMisses++
    if (this._rayMisses === 1) console.log('[MarsGlobalTerrain] first raycast miss at:', x.toFixed(1), z.toFixed(1))
    return this.terrainHeightAt(x, z)
  }

  heightAt(x: number, z: number): number {
    if (this.fallback) return this.fallback.heightAt(x, z)
    let h = this.terrainHeightAt(x, z)

    const nearby = this.rockSpawner.getCollidersNear(x, z)
    for (const rock of nearby) {
      const dx = x - rock.x
      const dz = z - rock.z
      const distSq = dx * dx + dz * dz
      const r = rock.radius
      if (distSq < r * r) {
        const t = 1 - distSq / (r * r)
        const rockBaseY = this.terrainHeightAt(rock.x, rock.z)
        const surfaceY = rockBaseY + rock.height * Math.sqrt(t)
        h = Math.max(h, surfaceY)
      }
    }

    return h
  }

  terrainHeightAt(x: number, z: number): number {
    if (this.fallback) return this.fallback.terrainHeightAt(x, z)
    if (!this.heightmap) return 0
    const gx = (x / SCALE + 0.5) * (GRID_SIZE - 1)
    const gz = (z / SCALE + 0.5) * (GRID_SIZE - 1)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    if (ix < 0 || ix >= GRID_SIZE - 1 || iz < 0 || iz >= GRID_SIZE - 1) return 0
    const hm = this.heightmap
    return (
      hm[iz * GRID_SIZE + ix] * (1 - fx) * (1 - fz) +
      hm[iz * GRID_SIZE + ix + 1] * fx * (1 - fz) +
      hm[(iz + 1) * GRID_SIZE + ix] * (1 - fx) * fz +
      hm[(iz + 1) * GRID_SIZE + ix + 1] * fx * fz
    )
  }

  normalAt(x: number, z: number): THREE.Vector3 {
    if (this.fallback) return this.fallback.normalAt(x, z)
    const s = 0.5
    const hL = this.heightAt(x - s, z)
    const hR = this.heightAt(x + s, z)
    const hD = this.heightAt(x, z - s)
    const hU = this.heightAt(x, z + s)
    return new THREE.Vector3(hL - hR, 2 * s, hD - hU).normalize()
  }

  slopeAt(x: number, z: number): number {
    if (this.fallback) return this.fallback.slopeAt(x, z)
    const dx = (this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) / 2
    const dz = (this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2
    return Math.sqrt(dx * dx + dz * dz)
  }

  getSmallRocks(): THREE.Mesh[] {
    if (this.fallback) return this.fallback.getSmallRocks()
    return this.rockSpawner.getSmallRocks()
  }

  deformCrater(x: number, z: number, radius: number, depth: number, rimHeight: number): void {
    if (this.fallback) {
      this.fallback.deformCrater(x, z, radius, depth, rimHeight)
      return
    }
    if (!this.heightmap || !this.terrainMesh) return
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

    for (let gz = gzMin; gz <= gzMax; gz++) {
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const wx = (gx / (GRID_SIZE - 1) - 0.5) * SCALE
        const wz = (gz / (GRID_SIZE - 1) - 0.5) * SCALE
        const dx = wx - x
        const dz = wz - z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist > influenceRadius) continue
        const offset = computeCraterDepth(dist, radius, depth, rimHeight)
        hm[gz * GRID_SIZE + gx] += offset
      }
    }

    const pos = this.terrainMesh.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)
      const dx = vx - x
      const dz = vz - z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > influenceRadius) continue
      const offset = computeCraterDepth(dist, radius, depth, rimHeight)
      pos.setY(i, pos.getY(i) + offset)
    }
    this.terrainMesh.geometry.attributes.position.needsUpdate = true
    this.terrainMesh.geometry.computeVertexNormals()
  }

  private createTerrainMaterial(p: TerrainParams): THREE.ShaderMaterial {
    const textureLoader = new THREE.TextureLoader()

    const rockTex = textureLoader.load(rockTextureUrl)
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping
    rockTex.minFilter = THREE.LinearMipmapLinearFilter
    rockTex.anisotropy = 4

    const dustTex = textureLoader.load(dustTextureUrl)
    dustTex.wrapS = dustTex.wrapT = THREE.RepeatWrapping
    dustTex.minFilter = THREE.LinearMipmapLinearFilter
    dustTex.anisotropy = 4

    this.textures = [rockTex, dustTex]

    const siteTex = textureLoader.load(
      `/${p.siteId}.jpg`,
      undefined,
      undefined,
      () => { material.uniforms.uHasSiteTexture.value = 0.0 },
    )
    siteTex.wrapS = siteTex.wrapT = THREE.RepeatWrapping
    siteTex.minFilter = THREE.LinearMipmapLinearFilter
    siteTex.anisotropy = 4
    this.textures.push(siteTex)

    const [detailUrl1, detailUrl2] = pickDetailTextures(p)
    const detailTexA = textureLoader.load(detailUrl1)
    detailTexA.wrapS = detailTexA.wrapT = THREE.RepeatWrapping
    detailTexA.minFilter = THREE.LinearMipmapLinearFilter
    detailTexA.anisotropy = 4
    const detailTexB = textureLoader.load(detailUrl2)
    detailTexB.wrapS = detailTexB.wrapT = THREE.RepeatWrapping
    detailTexB.minFilter = THREE.LinearMipmapLinearFilter
    detailTexB.anisotropy = 4
    this.textures.push(detailTexA, detailTexB)

    const sunDir = new THREE.Vector3(50, 80, 30).normalize()

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uDustCover: { value: p.dustCover },
        uIronOxide: { value: p.ironOxide },
        uBasalt: { value: p.basalt },
        uRoughness: { value: p.roughness },
        uCraterDensity: { value: p.craterDensity },
        uSunDirection: { value: sunDir },
        uHeightMin: { value: this.heightMin },
        uHeightRange: { value: this.heightMax - this.heightMin },
        uRockTexture: { value: rockTex },
        uDustTexture: { value: dustTex },
        uDetailTexA: { value: detailTexA },
        uDetailTexB: { value: detailTexB },
        uSiteTexture: { value: siteTex },
        uHasSiteTexture: { value: 1.0 },
        uWaterIce: { value: p.waterIceIndex },
        uTemperature: { value: Math.max(0, Math.min(1, (p.temperatureMaxK - 150) / 150)) },
        uSilicate: { value: p.silicateIndex },
      },
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
    })

    return material
  }

  private buildMountains(params: TerrainParams) {
    const { seed, elevation, featureType, waterIceIndex } = params
    const rng = new SimplexNoise(seed + 300)
    const elev = Math.max(0.25, elevation)

    let baseColor: THREE.Color
    let peakColor: THREE.Color
    let hazeColor: THREE.Color
    if (waterIceIndex > 0.7) {
      baseColor = new THREE.Color(0x6a7888)
      peakColor = new THREE.Color(0xa0b0c0)
      hazeColor = new THREE.Color(0x8098a8)
    } else if (featureType === 'volcano') {
      baseColor = new THREE.Color(0x4a3028)
      peakColor = new THREE.Color(0x6a5040)
      hazeColor = new THREE.Color(0x2a1810)
    } else if (featureType === 'canyon') {
      baseColor = new THREE.Color(0x7a4830)
      peakColor = new THREE.Color(0xa07858)
      hazeColor = new THREE.Color(0x4a2818)
    } else {
      baseColor = new THREE.Color(0x6a4830)
      peakColor = new THREE.Color(0x9a7858)
      hazeColor = new THREE.Color(0x3a2010)
    }

    const sunDir = new THREE.Vector3(50, 80, 30).normalize()

    const createMat = (hazeStart: number, hazeEnd: number, maxH: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBaseColor: { value: baseColor },
          uPeakColor: { value: peakColor },
          uHazeColor: { value: hazeColor },
          uSunDirection: { value: sunDir },
          uMaxHeight: { value: maxH },
          uHazeStart: { value: hazeStart },
          uHazeEnd: { value: hazeEnd },
        },
        vertexShader: mountainVert,
        fragmentShader: mountainFrag,
        fog: false,
      })

    const nearMat = createMat(SCALE * 0.5, SCALE * 0.9, 100)
    const midMat = createMat(SCALE * 0.4, SCALE * 0.85, 130)
    const farMat = createMat(SCALE * 0.3, SCALE * 0.8, 160)

    const place = (angle: number, dist: number, height: number, width: number, mat: THREE.ShaderMaterial, idx: number) => {
      const mx = Math.cos(angle) * dist
      const mz = Math.sin(angle) * dist
      const geo = new THREE.ConeGeometry(width, height, 24, 16)
      const pos = geo.attributes.position
      const s = idx * 0.37
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
        const n = Math.sin(x * 0.05 + s) * Math.cos(z * 0.04 + s * 0.7) +
          Math.sin(x * 0.12 + y * 0.08 + s * 1.3) * Math.cos(z * 0.1 + s) * 0.5
        const len = Math.sqrt(x * x + z * z) || 1
        pos.setX(i, x + (x / len) * n * width * 0.2)
        pos.setY(i, y + n * width * 0.05)
        pos.setZ(i, z + (z / len) * n * width * 0.2)
      }
      geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, mat)
      m.position.set(mx, -height * 0.1, mz)
      m.rotation.y = rng.n2(idx * 5.3, idx * 2.1) * Math.PI * 2
      this.group.add(m)
      this.mountains.push(m)
    }

    // Three rings of mountains
    const innerCount = 28 + Math.floor(elev * 16)
    for (let i = 0; i < innerCount; i++) {
      const angle = (i / innerCount) * Math.PI * 2 + rng.n2(i * 3.1, 0) * 0.25
      const dist = SCALE * 0.52 + rng.n2(0, i * 2.7) * SCALE * 0.08
      const height = 30 + (rng.n2(i * 1.3, i * 0.7) + 1) * 0.5 * 70 * elev
      const width = 50 + (rng.n2(i * 0.9, i * 1.5) + 1) * 35
      place(angle, dist, height, width, nearMat, i)
    }

    const midCount = 22 + Math.floor(elev * 12)
    for (let i = 0; i < midCount; i++) {
      const angle = (i / midCount) * Math.PI * 2 + rng.n2(i * 4.3, 0.5) * 0.3
      const dist = SCALE * 0.65 + rng.n2(0.5, i * 3.1) * SCALE * 0.08
      const height = 50 + (rng.n2(i * 1.7, i * 1.1) + 1) * 0.5 * 80 * elev
      const width = 60 + (rng.n2(i * 1.3, i * 0.9) + 1) * 40
      place(angle, dist, height, width, midMat, i + 200)
    }

    const outerCount = 18 + Math.floor(elev * 10)
    for (let i = 0; i < outerCount; i++) {
      const angle = (i / outerCount) * Math.PI * 2 + rng.n2(i * 5.7, 1.3) * 0.3
      const dist = SCALE * 0.8 + rng.n2(1.3, i * 3.1) * SCALE * 0.1
      const height = 80 + (rng.n2(i * 2.1, i * 1.3) + 1) * 0.5 * 80 * elev
      const width = 70 + (rng.n2(i * 1.1, i * 0.7) + 1) * 50
      place(angle, dist, height, width, farMat, i + 400)
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.fallback) {
      this.fallback.dispose()
      this.fallback = null
    }
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose()
      this.group.remove(this.terrainMesh)
      this.terrainMesh = null
    }
    if (this.terrainMaterial) {
      this.terrainMaterial.dispose()
      this.terrainMaterial = null
    }
    this.textures.forEach(t => t.dispose())
    this.textures = []
    this.rockSpawner.clear(this.group)
    for (const m of this.mountains) {
      m.geometry.dispose()
      this.group.remove(m)
    }
    this.mountains = []
    this.heightmap = null
  }
}
