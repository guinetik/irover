import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import terrainVert from '@/three/shaders/terrain.vert.glsl?raw'
import terrainFrag from '@/three/shaders/terrain.frag.glsl?raw'
import mountainVert from '@/three/shaders/mountain.vert.glsl?raw'
import mountainFrag from '@/three/shaders/mountain.frag.glsl?raw'
import rockTextureUrl from '@/assets/texture1.jpg?url'
import dustTextureUrl from '@/assets/texture2.jpg?url'
import { RockFactory, type RockCollider } from './RockFactory'
import type { ITerrainGenerator } from './TerrainGenerator'
import type { TerrainParams } from '@/types/terrain'
import { SimplexNoise } from '@/lib/math/simplexNoise'
import { pickDetailTextures } from '@/lib/terrain/detailTextures'

/** Sites that have a dedicated GLB terrain file in public/terrain/{siteId}.glb */
export const GLB_TERRAIN_SITES = new Set([
  // Geological features
  'acidalia-planitia',
  'argyre-basin',
  'arsia-mons',
  'ascraeus-mons',
  'elysium-mons',
  'hellas-basin',
  'north-polar-cap',
  'olympus-mons',
  'pavonis-mons',
  'south-polar-cap',
  'syrtis-major',
  'utopia-planitia',
  'valles-marineris',
  // Landing sites
  'beagle-2',
  'curiosity',
  'insight',
  'mars-2',
  'mars-3',
  'mars-6',
  'mars-polar-lander',
  'opportunity',
  'pathfinder',
  'perseverance',
  'phoenix',
  'schiaparelli',
  'spirit',
  'viking-1',
  'viking-2',
  'zhurong',
])

/** GLB maps are 400x400 grids scaled up to 1000 world units (-500 to +500). */
export const GLB_TERRAIN_SCALE = 1000
const SCALE = GLB_TERRAIN_SCALE
const GRID_SIZE = 512

/**
 * Terrain generator that loads a GLB heightmap model and applies
 * the existing procedural terrain shader for texturing.
 *
 * The GLB provides real-world terrain geometry (craters, ridges, etc.)
 * while the shader provides the Mars surface look (dust, rock, orbital imagery).
 */
export class GlbTerrainGenerator implements ITerrainGenerator {
  readonly group = new THREE.Group()
  readonly rockSpawner = new RockFactory()
  terrainMaterial: THREE.ShaderMaterial | null = null

  private terrainMeshes: THREE.Mesh[] = []
  private mountains: THREE.Mesh[] = []
  private textures: THREE.Texture[] = []
  /** Sampled height grid for fast heightAt() queries */
  private heightmap: Float32Array | null = null
  /** Tracks which grid cells have real mesh data */
  private coverage: Uint8Array | null = null
  private heightMin = 0
  private heightMax = 0

  get rockColliders(): RockCollider[] { return this.rockSpawner.colliders }
  get scale(): number { return SCALE }

  async generate(params: TerrainParams): Promise<void> {
    this.dispose()
    await this.rockSpawner.ready()

    // Load the site-specific terrain GLB
    const terrainUrl = `/terrain/${params.siteId}.glb`
    console.log(`[GlbTerrain] loading ${terrainUrl}`)

    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(terrainUrl)

    // Collect all mesh geometries, merge into one
    const geometries: THREE.BufferGeometry[] = []
    gltf.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry.clone()
        child.updateWorldMatrix(true, false)
        geo.applyMatrix4(child.matrixWorld)
        geometries.push(geo)
      }
    })

    if (geometries.length === 0) return

    // Compute combined bounding box to center and scale
    const bbox = new THREE.Box3()
    for (const geo of geometries) {
      geo.computeBoundingBox()
      bbox.union(geo.boundingBox!)
    }

    const center = new THREE.Vector3()
    bbox.getCenter(center)
    const size = new THREE.Vector3()
    bbox.getSize(size)

    console.log('[GlbTerrain] bbox min:', bbox.min.toArray().map(v => v.toFixed(1)),
      'max:', bbox.max.toArray().map(v => v.toFixed(1)),
      'size:', size.toArray().map(v => v.toFixed(1)))

    // Detect orientation: the axis with the smallest span is the height axis.
    // If Y is smallest → already Y-up (Three.js convention), no rotation needed.
    // If Z is smallest → Z-up, needs rotation.
    const minAxis = size.x < size.y && size.x < size.z ? 'x'
      : size.y < size.z ? 'y' : 'z'

    console.log('[GlbTerrain] height axis:', minAxis)

    const groundSpan = minAxis === 'y'
      ? Math.max(size.x, size.z)
      : minAxis === 'z'
        ? Math.max(size.x, size.y)
        : Math.max(size.y, size.z)
    const fitScale = SCALE / groundSpan

    for (const geo of geometries) {
      geo.translate(-center.x, -center.y, -center.z)

      // Rotate to Y-up if needed
      if (minAxis === 'z') {
        geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
      } else if (minAxis === 'x') {
        geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
      }
      // minAxis === 'y' → already correct

      geo.scale(fitScale, fitScale, fitScale)

      // Generate UVs from world XZ position (normalized 0-1 across terrain)
      const pos = geo.attributes.position
      const uvs = new Float32Array(pos.count * 2)
      for (let i = 0; i < pos.count; i++) {
        uvs[i * 2] = pos.getX(i) / SCALE + 0.5
        uvs[i * 2 + 1] = pos.getZ(i) / SCALE + 0.5
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

      geo.computeVertexNormals()
    }

    // Build the heightmap from the merged geometry for fast queries
    this.buildHeightmap(geometries)

    // Apply the terrain shader
    const material = this.createTerrainMaterial(params)
    this.terrainMaterial = material

    // Create meshes
    for (const geo of geometries) {
      const mesh = new THREE.Mesh(geo, material)
      mesh.receiveShadow = true
      this.group.add(mesh)
      this.terrainMeshes.push(mesh)
    }

    // Force world matrix update so raycaster can hit the meshes
    this.group.updateMatrixWorld(true)

    // Spawn rocks — use heightmap grid, return NaN for uncovered areas so rocks are skipped
    this.rockSpawner.spawn(
      params,
      (x, z) => this.hasCoverage(x, z) ? this.terrainHeightAt(x, z) : NaN,
      this.group,
      undefined,
      SCALE,
    )
    console.log(`[GlbTerrain] ${this.rockSpawner.rocks.length} rocks spawned`)

    // GLB terrains have their own horizon — skip procedural mountains
  }

  /** Sample the terrain meshes to build a heightmap grid for fast lookups */
  private buildHeightmap(geometries: THREE.BufferGeometry[]): void {
    const hm = new Float32Array(GRID_SIZE * GRID_SIZE)
    hm.fill(-Infinity)
    const counts = new Uint16Array(GRID_SIZE * GRID_SIZE)

    // Sample all vertices into the grid — average heights per cell
    for (const geo of geometries) {
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i)
        const wy = pos.getY(i) // height
        const wz = pos.getZ(i)

        const gx = Math.round((wx / SCALE + 0.5) * (GRID_SIZE - 1))
        const gz = Math.round((wz / SCALE + 0.5) * (GRID_SIZE - 1))
        if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue

        const idx = gz * GRID_SIZE + gx
        if (counts[idx] === 0) {
          hm[idx] = wy
        } else {
          hm[idx] += wy
        }
        counts[idx]++
      }
    }

    // Finalize averages & build coverage mask from vertex data
    const cov = new Uint8Array(GRID_SIZE * GRID_SIZE)
    for (let i = 0; i < hm.length; i++) {
      if (counts[i] > 1) hm[i] /= counts[i]
      if (counts[i] > 0) cov[i] = 1
    }

    // Fill gaps (cells with no vertices) by nearest-neighbor — only for rover traversal
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

    // Any remaining gaps get 0
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
    this.coverage = cov
  }


  heightAt(x: number, z: number): number {
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

  /** Returns true if the given world position has actual mesh data underneath */
  private hasCoverage(x: number, z: number): boolean {
    if (!this.coverage) return false
    const gx = Math.round((x / SCALE + 0.5) * (GRID_SIZE - 1))
    const gz = Math.round((z / SCALE + 0.5) * (GRID_SIZE - 1))
    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return false
    return this.coverage[gz * GRID_SIZE + gx] === 1
  }

  terrainHeightAt(x: number, z: number): number {
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
    const s = 0.5
    const hL = this.heightAt(x - s, z)
    const hR = this.heightAt(x + s, z)
    const hD = this.heightAt(x, z - s)
    const hU = this.heightAt(x, z + s)
    return new THREE.Vector3(hL - hR, 2 * s, hD - hU).normalize()
  }

  slopeAt(x: number, z: number): number {
    const dx = (this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) / 2
    const dz = (this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2
    return Math.sqrt(dx * dx + dz * dz)
  }

  getSmallRocks(): THREE.Mesh[] {
    return this.rockSpawner.getSmallRocks()
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
      // Quick displacement
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
    for (const m of this.terrainMeshes) {
      m.geometry.dispose()
      this.group.remove(m)
    }
    this.terrainMeshes = []
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
    this.coverage = null
  }
}
