import * as THREE from 'three'
import terrainVert from '@/three/shaders/terrain.vert.glsl?raw'
import terrainFrag from '@/three/shaders/terrain.frag.glsl?raw'
import mountainVert from '@/three/shaders/mountain.vert.glsl?raw'
import mountainFrag from '@/three/shaders/mountain.frag.glsl?raw'
import rockTextureUrl from '@/assets/texture1.jpg?url'
import dustTextureUrl from '@/assets/texture2.jpg?url'
import { RockFactory, type RockCollider } from './RockFactory'
import { SimplexNoise } from './SimplexNoise'
import { fetchElevationTile } from './marsElevationTiles'
import { TERRAIN_SCALE } from './terrainConstants'
import type { ITerrainGenerator, TerrainParams } from './TerrainGenerator'

const SCALE = TERRAIN_SCALE
const GRID_SIZE = 256

/** Map orbital textures grouped by feature type for cross-site blending. */
const MAP_TEXTURES_BY_TYPE: Record<string, string[]> = {
  'volcano':      ['/olympus-mons.jpg', '/ascraeus-mons.jpg', '/pavonis-mons.jpg', '/elysium-mons.jpg'],
  'canyon':       ['/valles-marineris.jpg', '/syrtis-major.jpg', '/argyre-basin.jpg'],
  'basin':        ['/hellas-basin.jpg', '/argyre-basin.jpg', '/utopia-planitia.jpg'],
  'plain':        ['/utopia-planitia.jpg', '/acidalia-planitia.jpg', '/syrtis-major.jpg'],
  'polar-cap':    ['/north-polar-cap.jpg', '/south-polar-cap.jpg', '/utopia-planitia.jpg'],
  'landing-site': ['/utopia-planitia.jpg', '/acidalia-planitia.jpg', '/hellas-basin.jpg'],
}

function pickDetailTextures(p: TerrainParams): [string, string] {
  const own = `/${p.siteId}.jpg`
  const pool = (MAP_TEXTURES_BY_TYPE[p.featureType] ?? MAP_TEXTURES_BY_TYPE['plain'])
    .filter(url => url !== own)
  const i = Math.abs(p.seed) % pool.length
  const j = (i + 1) % pool.length
  return [pool[i], pool[j === i ? (i + 1) % pool.length : j]]
}

/**
 * Terrain generator that fetches Google Mars elevation tiles (~10-20KB each)
 * and uses them as displacement maps. Applies the existing terrain shader
 * for texturing.
 */
export class ElevationTerrainGenerator implements ITerrainGenerator {
  readonly group = new THREE.Group()
  readonly rockSpawner = new RockFactory()
  terrainMaterial: THREE.ShaderMaterial | null = null

  private terrainMesh: THREE.Mesh | null = null
  private mountains: THREE.Mesh[] = []
  private textures: THREE.Texture[] = []
  private heightmap: Float32Array | null = null
  private heightMin = 0
  private heightMax = 0
  private disposed = false

  // Raycaster for precise rock placement
  private raycaster = new THREE.Raycaster()
  private rayOrigin = new THREE.Vector3()
  private rayDown = new THREE.Vector3(0, -1, 0)

  get rockColliders(): RockCollider[] { return this.rockSpawner.colliders }
  get scale(): number { return SCALE }

  async generate(params: TerrainParams): Promise<void> {
    this.dispose()
    this.disposed = false

    // Jitter lat/lon by up to ±1.5° so each visit samples a nearby but different tile
    const rng = new SimplexNoise(params.seed)
    const jitterLat = rng.n2(params.seed * 0.1, 3.7) * 1.5
    const jitterLon = rng.n2(7.3, params.seed * 0.1) * 1.5
    const lat = Math.max(-85, Math.min(85, (params.latDeg ?? 0) + jitterLat))
    const lon = (params.lonDeg ?? 0) + jitterLon

    console.log(`[ElevationTerrain] generating for lat=${lat.toFixed(2)}, lon=${lon.toFixed(2)} (jitter: ${jitterLat.toFixed(2)}, ${jitterLon.toFixed(2)})`)

    // Fetch a single elevation tile at zoom 7 (~256×256, covers ~2.8° ≈ 166km)
    const tile = await fetchElevationTile(lat, lon, 7)
    if (this.disposed) return

    if (!tile) {
      console.warn('[ElevationTerrain] no tile data, falling back to flat terrain')
      this.buildFlatTerrain(params)
      return
    }

    // Build terrain mesh from elevation data
    const tileSize = tile.size
    const geo = new THREE.PlaneGeometry(SCALE, SCALE, GRID_SIZE - 1, GRID_SIZE - 1)
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))

    const pos = geo.attributes.position

    // Target height range — the tile heightmap is 0-1 normalized
    // Scale to game units: gentle terrain ~15 units, dramatic ~60 units
    const heightTarget = 15 + params.roughness * 30 + params.elevation * 20

    // Displace vertices from the elevation tile
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)

      // Map vertex position to tile pixel
      const u = vx / SCALE + 0.5
      const v = vz / SCALE + 0.5
      const tx = Math.floor(u * (tileSize - 1))
      const tz = Math.floor(v * (tileSize - 1))
      const cx = Math.min(tileSize - 1, Math.max(0, tx))
      const cz = Math.min(tileSize - 1, Math.max(0, tz))

      const h = tile.heightmap[cz * tileSize + cx]
      pos.setY(i, h * heightTarget)
    }

    // Generate UVs
    const uvs = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) / SCALE + 0.5
      uvs[i * 2 + 1] = pos.getZ(i) / SCALE + 0.5
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.computeVertexNormals()

    // Build internal heightmap for heightAt() queries
    this.buildHeightmap(geo)

    // Apply terrain shader
    const material = this.createTerrainMaterial(params)
    this.terrainMaterial = material

    this.terrainMesh = new THREE.Mesh(geo, material)
    this.terrainMesh.receiveShadow = true
    this.group.add(this.terrainMesh)

    // Force world matrix for raycasting
    this.group.updateMatrixWorld(true)

    // Spawn rocks
    await this.rockSpawner.ready()
    if (this.disposed) return

    this.rockSpawner.spawn(
      params,
      (x, z) => this.raycastHeight(x, z),
      this.group,
    )

    console.log(`[ElevationTerrain] done: height range ${this.heightMin.toFixed(1)}–${this.heightMax.toFixed(1)}, ${this.rockSpawner.rocks.length} rocks`)

    // Background mountains
    this.buildMountains(params)
  }

  private buildFlatTerrain(params: TerrainParams): void {
    const geo = new THREE.PlaneGeometry(SCALE, SCALE, GRID_SIZE - 1, GRID_SIZE - 1)
    geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
    const uvs = new Float32Array(geo.attributes.position.count * 2)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) / SCALE + 0.5
      uvs[i * 2 + 1] = pos.getZ(i) / SCALE + 0.5
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geo.computeVertexNormals()
    this.buildHeightmap(geo)
    const material = this.createTerrainMaterial(params)
    this.terrainMaterial = material
    this.terrainMesh = new THREE.Mesh(geo, material)
    this.terrainMesh.receiveShadow = true
    this.group.add(this.terrainMesh)
  }

  private buildHeightmap(geo: THREE.BufferGeometry): void {
    const pos = geo.attributes.position
    const hm = new Float32Array(GRID_SIZE * GRID_SIZE)

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vz = pos.getZ(i)
      const gx = Math.floor((vx / SCALE + 0.5) * (GRID_SIZE - 1))
      const gz = Math.floor((vz / SCALE + 0.5) * (GRID_SIZE - 1))
      if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) continue
      hm[gz * GRID_SIZE + gx] = pos.getY(i)
    }

    this.heightMin = Infinity
    this.heightMax = -Infinity
    for (let i = 0; i < hm.length; i++) {
      if (hm[i] < this.heightMin) this.heightMin = hm[i]
      if (hm[i] > this.heightMax) this.heightMax = hm[i]
    }
    this.heightmap = hm
  }

  private raycastHeight(x: number, z: number): number {
    if (!this.terrainMesh) return 0
    this.rayOrigin.set(x, this.heightMax + 50, z)
    this.raycaster.set(this.rayOrigin, this.rayDown)
    const hits = this.raycaster.intersectObject(this.terrainMesh, false)
    if (hits.length > 0) return hits[0].point.y
    return this.terrainHeightAt(x, z)
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
      undefined, undefined,
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

  private buildMountains(params: TerrainParams): void {
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
