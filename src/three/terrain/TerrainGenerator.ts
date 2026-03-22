import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SimplexNoise } from './SimplexNoise'
import terrainVert from '@/three/shaders/terrain.vert.glsl?raw'
import terrainFrag from '@/three/shaders/terrain.frag.glsl?raw'
import rockTextureUrl from '@/assets/texture1.jpg?url'
import dustTextureUrl from '@/assets/texture2.jpg?url'
import {
  ROCK_TYPE_LIST,
  type RockTypeId,
  createRockGeometry,
  createRockMaterial,
  buildSpawnDistribution,
  pickRockType,
} from './RockTypes'

const GRID_SIZE = 256
const SCALE = 800
const ROCK_COUNT = 1200
const BOULDER_COUNT = 50

export interface TerrainParams {
  roughness: number
  craterDensity: number
  dustCover: number
  elevation: number
  ironOxide: number
  basalt: number
  seed: number
  // Site identity
  siteId: string
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap' | 'landing-site'
  waterIceIndex: number
  silicateIndex: number
  temperatureMaxK: number
  temperatureMinK: number
}

export class TerrainGenerator {
  private heightmap: Float32Array | null = null
  private heightMin = 0
  private heightMax = 0
  private terrainMesh: THREE.Mesh | null = null
  /** Exposed for dynamic sun direction updates */
  terrainMaterial: THREE.ShaderMaterial | null = null
  private rocks: THREE.Mesh[] = []
  private mountains: THREE.Mesh[] = []
  /** Rock positions, radii, and heights for collision/climbing */
  rockColliders: { x: number; z: number; radius: number; height: number }[] = []
  private rockGeoMap = new Map<RockTypeId, THREE.BufferGeometry>()
  private rockMatMap = new Map<RockTypeId, THREE.MeshStandardMaterial>()
  private boulderGeos: THREE.BufferGeometry[] = []
  private textures: THREE.Texture[] = []

  readonly group = new THREE.Group()

  constructor() {
    const texLoader = new THREE.TextureLoader()

    for (const rt of ROCK_TYPE_LIST) {
      const tex = texLoader.load(`/${rt.textureFile}`)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.colorSpace = THREE.SRGBColorSpace
      this.textures.push(tex)

      this.rockGeoMap.set(rt.id, createRockGeometry(rt, true))
      this.rockMatMap.set(rt.id, createRockMaterial(rt, tex))
    }

    this.boulderGeos = this.createBoulderGeometries()
  }

  private createBoulderGeometries(): THREE.BufferGeometry[] {
    const geos: THREE.BufferGeometry[] = []

    // Rounded boulder
    geos.push(new THREE.DodecahedronGeometry(1.0, 1))

    // Angular slab
    const slab = new THREE.BoxGeometry(1.0, 0.6, 1.2, 2, 2, 2)
    this.displaceVertices(slab, 0.15)
    geos.push(slab)

    // Jagged spike
    const spike = new THREE.ConeGeometry(0.7, 1.4, 6, 2)
    this.displaceVertices(spike, 0.12)
    geos.push(spike)

    // Flat tabletop
    const table = new THREE.CylinderGeometry(0.8, 1.0, 0.5, 7, 2)
    this.displaceVertices(table, 0.1)
    geos.push(table)

    // Lumpy icosphere
    const lump = new THREE.IcosahedronGeometry(1.0, 1)
    this.displaceVertices(lump, 0.25)
    geos.push(lump)

    return geos
  }

  private displaceVertices(geo: THREE.BufferGeometry, amount: number) {
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      const noise = Math.sin(x * 5.1) * Math.cos(y * 3.7) * Math.sin(z * 4.3)
      pos.setX(i, x + noise * amount)
      pos.setY(i, y + noise * amount * 0.6)
      pos.setZ(i, z + noise * amount)
    }
    geo.computeVertexNormals()
  }

  generate(params: TerrainParams) {
    this.dispose()

    this.heightmap = this.genHeightmap(params)

    // Compute height range for shader normalization
    this.heightMin = Infinity
    this.heightMax = -Infinity
    for (let i = 0; i < this.heightmap.length; i++) {
      if (this.heightmap[i] < this.heightMin) this.heightMin = this.heightmap[i]
      if (this.heightmap[i] > this.heightMax) this.heightMax = this.heightmap[i]
    }

    this.buildTerrainMesh(params)
    this.buildRocks(params)
    this.buildMountains(params)
  }

  private genHeightmap(p: TerrainParams): Float32Array {
    const sn = new SimplexNoise(p.seed)
    const sn2 = new SimplexNoise(p.seed + 50)
    const sn3 = new SimplexNoise(p.seed + 150)
    const d = new Float32Array(GRID_SIZE * GRID_SIZE)
    const { roughness: ro, craterDensity: cr, dustCover: dc, elevation: el, featureType: ft } = p

    // High-roughness fine-grit amplification (>0.7 → double the fine octaves)
    const highRough = ro > 0.7
    const fineAmp = highRough ? 2.0 : 1.0

    // ----------------------------------------------------------------
    // Per-pixel terrain shape
    // ----------------------------------------------------------------
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const nx = x / GRID_SIZE - 0.5 // -0.5 … +0.5
        const ny = y / GRID_SIZE - 0.5
        // Radial distance from map centre (0 at centre, ~0.707 at corner)
        const nr = Math.sqrt(nx * nx + ny * ny)

        let h = 0

        // ----------------------------------------------------------------
        // VOLCANO — shield dome, lava channels, collapsed tubes
        // ----------------------------------------------------------------
        if (ft === 'volcano') {
          // Broad shield dome: smooth parabolic rise toward centre
          const dome = Math.max(0, 1 - nr * 2.8)
          h += dome * dome * el * 30

          // Large-scale undulation riding the dome
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 6
          h += sn2.n2(nx * 3, ny * 3) * el * 4

          // Lava channels — long sinuous valleys via abs(noise) along dominant axis
          const lavaChannel = Math.abs(sn3.n2(nx * 4 + 5, ny * 1.5)) * el * -8
          h += lavaChannel
          const lavaChannel2 = Math.abs(sn3.n2(nx * 1.5 + 9, ny * 3.5 + 2)) * el * -4
          h += lavaChannel2

          // Collapsed lava tubes — narrow linear depressions
          const tube = sn.n2(nx * 12, ny * 2.5 + 3)
          if (tube > 0.6) h -= (tube - 0.6) * ro * 8

          // Medium-scale undulation (volcanic surface is younger, more rolling)
          h += sn.n2(nx * 5, ny * 5) * el * 3
          h += sn2.n2(nx * 8, ny * 8) * ro * 2.5

          // Fine rocky detail (reduced — younger, less cratered surface)
          h += sn.n2(nx * 15, ny * 15) * ro * 2
          h += sn2.n2(nx * 30, ny * 30) * ro * fineAmp * 0.8
          h += sn.n2(nx * 60, ny * 60) * ro * fineAmp * 0.4

          // ----------------------------------------------------------------
          // CANYON — deep channels, cliff terracing, knife-edge ridges
          // ----------------------------------------------------------------
        } else if (ft === 'canyon') {
          // Elevated plateau base; elevation effect doubled for dramatic height range
          h += sn.n2(nx * 1.2, ny * 1.2) * el * 28
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 14

          // Carve 3 major canyon channels with strongly directional noise
          const ch1 = sn3.n2(ny * 3.5, nx * 0.4 + 1)
          if (ch1 > 0.15) h -= (ch1 - 0.15) * (el + 0.5) * 55
          const ch2 = sn3.n2((nx + ny) * 2.2 + 5, (ny - nx) * 0.5 + 3)
          if (ch2 > 0.25) h -= (ch2 - 0.25) * (el + 0.4) * 35
          const ch3 = sn2.n2(ny * 5 + 7, nx * 0.6 + 4)
          if (ch3 > 0.35) h -= (ch3 - 0.35) * (el + 0.3) * 22

          // Terracing — step-like cliff ledges blended with smooth h
          const steps = 5
          const hStepped = Math.floor(h / steps) * steps
          h = h * 0.55 + hStepped * 0.45

          // Knife-edge ridges when roughness is high
          if (highRough) {
            h += Math.abs(sn.n2(nx * 7 + 10, ny * 7 + 10)) * ro * 10
            h += Math.abs(sn2.n2(nx * 12 + 3, ny * 5 + 8)) * ro * 6
          } else {
            h += Math.abs(sn.n2(nx * 7 + 10, ny * 7 + 10)) * ro * 4
          }

          // Fine detail
          h += sn.n2(nx * 20, ny * 20) * ro * fineAmp * 3
          h += sn2.n2(nx * 40, ny * 40) * ro * fineAmp * 1.5

          // ----------------------------------------------------------------
          // POLAR CAP — smooth ice, polygon cracks, spiral troughs, dunes
          // ----------------------------------------------------------------
        } else if (ft === 'polar-cap') {
          const iceAmp = 0.4 // 60 % reduction on all noise amplitudes

          // Very gentle large-scale relief
          h += sn.n2(nx * 1.0, ny * 1.0) * el * 5 * iceAmp
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 3 * iceAmp

          // Spiral trough terracing (polar layered deposits)
          const spiralAngle = Math.atan2(ny, nx) * 2 + nr * 8
          const trough = Math.sin(spiralAngle) * 0.5 + 0.5
          h -= trough * trough * el * 4 * iceAmp

          // Polygonal cracking — Voronoi-like raised ridges at cell boundaries
          const cellFreq = 8
          const cellNx = Math.floor(nx * cellFreq + 0.5) / cellFreq
          const cellNy = Math.floor(ny * cellFreq + 0.5) / cellFreq
          const cellDist = Math.sqrt(Math.pow(nx - cellNx, 2) + Math.pow(ny - cellNy, 2)) * cellFreq
          const polyRidge = Math.exp(-Math.pow((cellDist - 0.45) * 8, 2))
          h += polyRidge * el * 1.5 * iceAmp

          // Gentle wind dunes
          h += sn3.n2(nx * 6 + 20, ny * 3) * el * 2.5 * iceAmp
          h += sn3.n2(nx * 3 + 10, ny * 6 + 5) * el * 1.5 * iceAmp

          // Very subtle fine texture
          h += sn.n2(nx * 20, ny * 20) * ro * fineAmp * 0.5 * iceAmp
          h += sn2.n2(nx * 50, ny * 50) * ro * fineAmp * 0.25 * iceAmp

          // ----------------------------------------------------------------
          // PLAIN — flat with yardangs and shallow depressions
          // ----------------------------------------------------------------
        } else if (ft === 'plain') {
          // Mostly flat, gentle undulation
          h += sn.n2(nx * 1.0, ny * 1.0) * el * 6
          h += sn2.n2(nx * 2.5, ny * 2.5) * el * 3

          // Yardangs — wind-carved linear features, stretched along one axis
          h += sn3.n2(nx * 8, ny * 2.5) * ro * 3.5
          h += sn3.n2(nx * 12 + 4, ny * 2 + 3) * ro * 2.0

          // Occasional shallow depressions
          const dep2 = sn.n2(nx * 4 + 7, ny * 4 + 7)
          if (dep2 < -0.4) h += (dep2 + 0.4) * el * 4

          // Medium rocky detail
          h += sn.n2(nx * 10, ny * 10) * ro * 3
          h += sn2.n2(nx * 20, ny * 20) * ro * fineAmp * 1.5
          h += sn.n2(nx * 45, ny * 45) * ro * fineAmp * 0.7

          // Mild ridge lines
          h += Math.abs(sn.n2(nx * 5 + 10, ny * 5 + 10)) * el * 1.5

          // ----------------------------------------------------------------
          // BASIN — bowl shape, ancient heavily cratered floor
          // ----------------------------------------------------------------
        } else if (ft === 'basin') {
          // Broad parabolic bowl depression
          h -= nr * nr * el * 40

          // Ancient heavily deformed floor noise
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 10
          h += sn2.n2(nx * 3, ny * 3) * el * 6
          h += sn3.n2(nx * 6, ny * 6) * el * 3

          // Rough cratered texture
          h += sn.n2(nx * 10, ny * 10) * ro * 6
          h += sn2.n2(nx * 20, ny * 20) * ro * fineAmp * 3.5
          h += sn.n2(nx * 40, ny * 40) * ro * fineAmp * 2

          // Ancient ridge lines
          h += Math.abs(sn.n2(nx * 6 + 10, ny * 6 + 10)) * el * 4
          if (highRough) {
            h += Math.abs(sn3.n2(nx * 10 + 5, ny * 10 + 5)) * ro * 5
          }

          // ----------------------------------------------------------------
          // LANDING-SITE / default — original rolling terrain
          // ----------------------------------------------------------------
        } else {
          h += sn.n2(nx * 1.5, ny * 1.5) * el * 15
          h += sn.n2(nx * 3, ny * 3) * el * 8
          h += sn2.n2(nx * 5, ny * 5) * el * 4
          h += sn.n2(nx * 10, ny * 10) * ro * 5
          h += sn2.n2(nx * 20, ny * 20) * ro * 3
          h += sn.n2(nx * 40, ny * 40) * ro * 1.5
          h += sn2.n2(nx * 80, ny * 80) * ro * fineAmp * 0.5
          h += Math.abs(sn.n2(nx * 6 + 10, ny * 6 + 10)) * el * 3
        }

        d[y * GRID_SIZE + x] = h
      }
    }

    // ----------------------------------------------------------------
    // CRATERS — feature-type counts, large craters, secondary craters
    // ----------------------------------------------------------------
    const rng = new SimplexNoise(p.seed + 100)
    const rng2 = new SimplexNoise(p.seed + 400)
    // High-roughness: crater rims are more pronounced
    const rimMult = highRough ? 2.0 : 1.0

    // Base crater count and scaling per feature type
    let craterCount = Math.floor(cr * 20) + 3
    let largeCraterCount = 0
    let craterSizeMult = 1.0

    if (ft === 'volcano') {
      // Young volcanic surface — far fewer craters
      craterCount = Math.max(1, Math.floor(craterCount * 0.3))
      craterSizeMult = 0.7
    } else if (ft === 'canyon') {
      craterCount = Math.floor(craterCount * 0.6)
    } else if (ft === 'polar-cap') {
      // Ice resurfaces — almost none
      craterCount = Math.max(0, Math.floor(craterCount * 0.15))
      craterSizeMult = 0.5
    } else if (ft === 'basin') {
      // Ancient, heavily cratered floor
      craterCount = Math.floor(craterCount * 1.8) + 5
      largeCraterCount = Math.floor(cr * 4) + 2
      craterSizeMult = 1.4
    } else if (ft === 'plain') {
      largeCraterCount = Math.floor(cr * 2)
    }

    // Helper: stamp one crater at normalised (cx, cy) with given radius and depth
    const stampCrater = (cx: number, cy: number, rad: number, dep: number) => {
      const xMin = Math.max(0, Math.floor((cx - rad * 2.5) * GRID_SIZE))
      const xMax = Math.min(GRID_SIZE - 1, Math.ceil((cx + rad * 2.5) * GRID_SIZE))
      const yMin = Math.max(0, Math.floor((cy - rad * 2.5) * GRID_SIZE))
      const yMax = Math.min(GRID_SIZE - 1, Math.ceil((cy + rad * 2.5) * GRID_SIZE))
      for (let py = yMin; py <= yMax; py++) {
        for (let px = xMin; px <= xMax; px++) {
          const dx2 = px / GRID_SIZE - cx
          const dy2 = py / GRID_SIZE - cy
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          if (dist < rad * 2.5) {
            const t = dist / rad
            const rimExp = Math.exp(-Math.pow((t - 1) * 3.5, 2))
            if (t < 1) {
              // Flat floor using pow(t, 2) instead of t*t
              d[py * GRID_SIZE + px] += (Math.pow(t, 2) - 1) * dep
              d[py * GRID_SIZE + px] += rimExp * dep * 0.5 * rimMult
            } else if (t < 2.5) {
              d[py * GRID_SIZE + px] += rimExp * dep * 0.5 * rimMult
            }
          }
        }
      }
    }

    // Standard craters
    for (let c = 0; c < craterCount; c++) {
      const cx = (rng.n2(c * 7.3, 0.5) + 1) * 0.5
      const cy = (rng.n2(0.5, c * 7.3) + 1) * 0.5
      const rad = (0.02 + (rng.n2(c * 3.1, c * 2.7) + 1) * 0.05 * cr) * craterSizeMult
      const dep = (5 + cr * 12) * (highRough ? 1.5 : 1.0)
      stampCrater(cx, cy, rad, dep)
    }

    // Large craters (radius 0.08–0.15) for high craterDensity sites
    for (let c = 0; c < largeCraterCount; c++) {
      const cx = (rng2.n2(c * 5.1, 1.3) + 1) * 0.5
      const cy = (rng2.n2(1.3, c * 5.1) + 1) * 0.5
      const rad = (0.08 + (rng2.n2(c * 2.3, c * 1.9) + 1) * 0.035) * craterSizeMult
      const dep = (10 + cr * 20) * (highRough ? 1.5 : 1.0)
      stampCrater(cx, cy, rad, dep)

      // Secondary craters scattered around large crater rims
      const secCount = 3 + Math.floor(cr * 4)
      for (let s = 0; s < secCount; s++) {
        const angle = rng2.n2(c * 3.7 + s * 1.1, s * 2.3) * Math.PI * 2
        const rimDist = rad * (1.3 + (rng2.n2(s * 1.9, c * 2.7) + 1) * 0.6)
        const scx = Math.max(0.01, Math.min(0.99, cx + Math.cos(angle) * rimDist))
        const scy = Math.max(0.01, Math.min(0.99, cy + Math.sin(angle) * rimDist))
        const srad = rad * (0.08 + (rng2.n2(s * 3.3, c * 1.7) + 1) * 0.06)
        stampCrater(scx, scy, srad, dep * 0.35)
      }
    }

    // Extra ridge pass for high-roughness sites
    if (highRough) {
      for (let y2 = 0; y2 < GRID_SIZE; y2++) {
        for (let x2 = 0; x2 < GRID_SIZE; x2++) {
          const nx2 = x2 / GRID_SIZE - 0.5
          const ny2 = y2 / GRID_SIZE - 0.5
          d[y2 * GRID_SIZE + x2] += Math.abs(sn3.n2(nx2 * 14 + 20, ny2 * 14 + 20)) * ro * 4
        }
      }
    }

    // ----------------------------------------------------------------
    // DUST SMOOTHING
    // ----------------------------------------------------------------
    // Polar caps always get forced extra smoothing; others follow dust cover
    const smoothPasses = ft === 'polar-cap'
      ? Math.max(4, Math.floor(dc * 5))
      : dc > 0.3
        ? Math.floor(dc * 3)
        : 0

    for (let q = 0; q < smoothPasses; q++) {
      const cp = new Float32Array(d)
      for (let y2 = 1; y2 < GRID_SIZE - 1; y2++) {
        for (let x2 = 1; x2 < GRID_SIZE - 1; x2++) {
          d[y2 * GRID_SIZE + x2] =
            (cp[y2 * GRID_SIZE + x2] * 2 +
              cp[(y2 - 1) * GRID_SIZE + x2] +
              cp[(y2 + 1) * GRID_SIZE + x2] +
              cp[y2 * GRID_SIZE + x2 - 1] +
              cp[y2 * GRID_SIZE + x2 + 1]) /
            6
        }
      }
    }

    return d
  }

  private buildTerrainMesh(p: TerrainParams) {
    const hm = this.heightmap!
    const geo = new THREE.PlaneGeometry(SCALE, SCALE, GRID_SIZE - 1, GRID_SIZE - 1)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position.array as Float32Array
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      pos[i * 3 + 1] = hm[i]
    }

    geo.computeVertexNormals()

    const textureLoader = new THREE.TextureLoader()

    const rockTex = textureLoader.load(rockTextureUrl)
    rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping
    rockTex.minFilter = THREE.LinearMipmapLinearFilter
    rockTex.magFilter = THREE.LinearFilter
    rockTex.anisotropy = 4

    const dustTex = textureLoader.load(dustTextureUrl)
    dustTex.wrapS = dustTex.wrapT = THREE.RepeatWrapping
    dustTex.minFilter = THREE.LinearMipmapLinearFilter
    dustTex.magFilter = THREE.LinearFilter
    dustTex.anisotropy = 4

    this.textures = [rockTex, dustTex]

    // Site-specific orbital texture (from public/{siteId}.jpg)
    // Provides macro color variation from real NASA imagery
    const siteTex = textureLoader.load(
      `/${p.siteId}.jpg`,
      undefined,
      undefined,
      () => {
        // Texture not found — set a flag to skip in shader
        material.uniforms.uHasSiteTexture.value = 0.0
      },
    )
    siteTex.wrapS = siteTex.wrapT = THREE.RepeatWrapping
    siteTex.minFilter = THREE.LinearMipmapLinearFilter
    siteTex.magFilter = THREE.LinearFilter
    siteTex.anisotropy = 4
    this.textures.push(siteTex)

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
        uSiteTexture: { value: siteTex },
        uHasSiteTexture: { value: 1.0 },
        uWaterIce: { value: p.waterIceIndex },
        uTemperature: { value: Math.max(0, Math.min(1, (p.temperatureMaxK - 150) / 150)) },
        uSilicate: { value: p.silicateIndex },
      },
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
    })

    this.terrainMaterial = material
    this.terrainMesh = new THREE.Mesh(geo, material)
    this.terrainMesh.receiveShadow = true
    this.group.add(this.terrainMesh)
  }

  private buildRocks(params: TerrainParams) {
    const { seed, featureType } = params
    const rng = new SimplexNoise(seed)
    const hm = this.heightmap!

    // Site-aware rock count multipliers
    let rockMultiplier = 1.0
    let boulderMultiplier = 1.0
    if (featureType === 'polar-cap') {
      rockMultiplier = 0.5
      boulderMultiplier = 0.5
    } else if (featureType === 'canyon') {
      rockMultiplier = 1.5
      boulderMultiplier = 1.5
    } else if (featureType === 'plain') {
      rockMultiplier = 0.8
      boulderMultiplier = 0.5
    }

    // Build spawn distribution from landmark geological indices
    const spawnDist = buildSpawnDistribution({
      basalt: params.basalt,
      ironOxide: params.ironOxide,
      silicateIndex: params.silicateIndex,
      waterIceIndex: params.waterIceIndex,
      dustCover: params.dustCover,
    })

    const rockCount = Math.floor(ROCK_COUNT * rockMultiplier)
    for (let i = 0; i < rockCount; i++) {
      const rx = (rng.n2(i * 1.7, 0) + 1) * 0.5 * SCALE - SCALE / 2
      const rz = (rng.n2(0, i * 1.7) + 1) * 0.5 * SCALE - SCALE / 2
      const sc = 0.3 + (rng.n2(i * 0.3, i * 0.7) + 1) * 0.8

      // Seeded random for deterministic type selection
      const typeRand = (rng.n2(i * 2.9, i * 1.3) + 1) * 0.5
      const typeId = pickRockType(spawnDist, typeRand)
      const typeGeo = this.rockGeoMap.get(typeId)!
      const typeMat = this.rockMatMap.get(typeId)!
      const typeScaleY = ROCK_TYPE_LIST.find(t => t.id === typeId)!.geometry.scaleY

      const rock = new THREE.Mesh(typeGeo, typeMat)
      rock.userData.rockType = typeId

      const gx = Math.floor((rx / SCALE + 0.5) * (GRID_SIZE - 1))
      const gz = Math.floor((rz / SCALE + 0.5) * (GRID_SIZE - 1))
      const ry = (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE)
        ? hm[gz * GRID_SIZE + gx] - 0.15
        : 0

      rock.position.set(rx, ry, rz)
      rock.scale.set(sc, sc * typeScaleY, sc)
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5)
      rock.castShadow = true
      this.group.add(rock)
      this.rocks.push(rock)
      this.rockColliders.push({ x: rx, z: rz, radius: sc * 0.6, height: sc * 0.35 })
    }

    // Boulders — large textured obstacles, type picked from biome distribution
    const boulderRng = new SimplexNoise(seed + 200)
    const boulderCount = Math.floor(BOULDER_COUNT * boulderMultiplier)
    for (let i = 0; i < boulderCount; i++) {
      const bx = (boulderRng.n2(i * 2.3, 0.7) + 1) * 0.5 * SCALE - SCALE / 2
      const bz = (boulderRng.n2(0.7, i * 2.3) + 1) * 0.5 * SCALE - SCALE / 2
      let sc = 2.0 + (boulderRng.n2(i * 0.5, i * 0.9) + 1) * 2.5

      if (featureType === 'volcano' && i % 4 === 0) {
        sc = 4.0 + (boulderRng.n2(i * 0.5, i * 0.9) + 1) * 2.0
      }

      const bTypeRand = (boulderRng.n2(i * 3.7, i * 2.1) + 1) * 0.5
      const bTypeId = pickRockType(spawnDist, bTypeRand)
      const bMat = this.rockMatMap.get(bTypeId)!

      const boulder = new THREE.Mesh(this.boulderGeos[i % this.boulderGeos.length], bMat)
      const gx = Math.floor((bx / SCALE + 0.5) * (GRID_SIZE - 1))
      const gz = Math.floor((bz / SCALE + 0.5) * (GRID_SIZE - 1))
      const by = (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE)
        ? hm[gz * GRID_SIZE + gx] - sc * 0.15
        : 0

      boulder.position.set(bx, by, bz)
      boulder.scale.set(sc, sc * 0.5, sc * 0.8)
      boulder.rotation.set(
        boulderRng.n2(i * 1.1, 0) * 0.3,
        boulderRng.n2(0, i * 1.1) * Math.PI * 2,
        boulderRng.n2(i * 0.7, i * 0.3) * 0.3,
      )
      boulder.castShadow = true
      boulder.receiveShadow = true
      this.group.add(boulder)
      this.rocks.push(boulder)
      this.rockColliders.push({ x: bx, z: bz, radius: sc * 0.7, height: sc * 0.4 })
    }
  }

  private buildMountains(params: TerrainParams) {
    const { seed, elevation, featureType, waterIceIndex } = params
    const rng = new SimplexNoise(seed + 300)
    const elev = Math.max(0.25, elevation)

    // Site-aware palette
    let nearColor: number
    let midColor: number
    if (waterIceIndex > 0.7) {
      nearColor = 0x7088a0
      midColor = 0x7a90a8
    } else if (featureType === 'volcano') {
      nearColor = 0x3a2520
      midColor = 0x4a3028
    } else if (featureType === 'canyon') {
      nearColor = 0x6a3a25
      midColor = 0x7a4a30
    } else {
      nearColor = 0x5a3d2a
      midColor = 0x6a4d35
    }
    const farColor = waterIceIndex > 0.7 ? 0x8090a0 : 0x7a5a40

    const nearMat = new THREE.MeshStandardMaterial({ color: nearColor, roughness: 0.95, metalness: 0.05 })
    const midMat = new THREE.MeshStandardMaterial({ color: midColor, roughness: 0.96, metalness: 0.03 })
    const farMat = new THREE.MeshStandardMaterial({ color: farColor, roughness: 0.98, metalness: 0.0 })

    // Helper to place one mountain
    const placeMountain = (
      angle: number, dist: number, height: number, width: number,
      mat: THREE.MeshStandardMaterial, idx: number,
    ) => {
      const mx = Math.cos(angle) * dist
      const mz = Math.sin(angle) * dist
      const geo = this.buildMountainGeo(rng, idx, width, height, 5)
      const m = new THREE.Mesh(geo, mat)
      m.position.set(mx, -height * 0.1, mz)
      m.rotation.y = rng.n2(idx * 5.3, idx * 2.1) * Math.PI * 2
      m.castShadow = false
      m.receiveShadow = false
      this.group.add(m)
      this.mountains.push(m)
    }

    // --- Inner ring: dense wall of overlapping peaks ---
    const innerCount = 28 + Math.floor(elev * 16)
    const innerRadius = SCALE * 0.52

    for (let i = 0; i < innerCount; i++) {
      const angle = (i / innerCount) * Math.PI * 2 + rng.n2(i * 3.1, 0) * 0.25
      const dist = innerRadius + rng.n2(0, i * 2.7) * SCALE * 0.08

      const hs = (rng.n2(i * 1.3, i * 0.7) + 1) * 0.5
      const height = 30 + hs * 70 * elev
      const width = 50 + (rng.n2(i * 0.9, i * 1.5) + 1) * 35

      placeMountain(angle, dist, height, width, nearMat, i)
    }

    // --- Mid ring: fills gap, wider bases for solid ridgeline ---
    const midCount = 22 + Math.floor(elev * 12)
    const midRadius = SCALE * 0.65

    for (let i = 0; i < midCount; i++) {
      const angle = (i / midCount) * Math.PI * 2 + rng.n2(i * 4.3, 0.5) * 0.3
      const dist = midRadius + rng.n2(0.5, i * 3.1) * SCALE * 0.08

      const hs = (rng.n2(i * 1.7, i * 1.1) + 1) * 0.5
      const height = 50 + hs * 80 * elev
      const width = 60 + (rng.n2(i * 1.3, i * 0.9) + 1) * 40

      placeMountain(angle, dist, height, width, midMat, i + 200)
    }

    // --- Outer ring: dramatic backdrop, tallest peaks ---
    const outerCount = 18 + Math.floor(elev * 10)
    const outerRadius = SCALE * 0.8

    for (let i = 0; i < outerCount; i++) {
      const angle = (i / outerCount) * Math.PI * 2 + rng.n2(i * 5.7, 1.3) * 0.3
      const dist = outerRadius + rng.n2(1.3, i * 3.1) * SCALE * 0.1

      const hs = (rng.n2(i * 2.1, i * 1.3) + 1) * 0.5
      const height = 80 + hs * 80 * elev
      const width = 70 + (rng.n2(i * 1.1, i * 0.7) + 1) * 50

      placeMountain(angle, dist, height, width, farMat, i + 400)
    }

    // --- Gap-filler peaks: scattered between rings to close holes ---
    const fillerCount = 16 + Math.floor(elev * 8)
    const fillerRng = new SimplexNoise(seed + 350)

    for (let i = 0; i < fillerCount; i++) {
      const angle = fillerRng.n2(i * 2.9, 0.3) * Math.PI * 2
      const dist = SCALE * (0.55 + (fillerRng.n2(0.3, i * 2.9) + 1) * 0.15)

      const height = 25 + (fillerRng.n2(i * 1.5, i * 0.9) + 1) * 35 * elev
      const width = 40 + (fillerRng.n2(i * 0.7, i * 1.3) + 1) * 30

      const mat = dist < SCALE * 0.63 ? nearMat : midMat
      placeMountain(angle, dist, height, width, mat, i + 600)
    }
  }

  /** Build a mountain geometry — 5 shape types with aggressive multi-octave displacement */
  private buildMountainGeo(
    rng: SimplexNoise,
    i: number,
    baseWidth: number,
    peakHeight: number,
    shapeCount: number,
  ): THREE.BufferGeometry {
    const shapeType = i % shapeCount
    let geo: THREE.BufferGeometry

    if (shapeType === 0) {
      // Jagged peak
      geo = new THREE.ConeGeometry(baseWidth, peakHeight, 12, 8)
    } else if (shapeType === 1) {
      // Mesa / butte with steep walls
      geo = new THREE.CylinderGeometry(baseWidth * 0.5, baseWidth, peakHeight * 0.7, 10, 6)
    } else if (shapeType === 2) {
      // Broad dome (half-sphere stretched tall)
      geo = new THREE.SphereGeometry(baseWidth, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)
      geo.scale(1, peakHeight / baseWidth, 1)
    } else if (shapeType === 3) {
      // Twin peaks — two merged cones
      const geo1 = new THREE.ConeGeometry(baseWidth * 0.65, peakHeight, 10, 6)
      const geo2 = new THREE.ConeGeometry(baseWidth * 0.55, peakHeight * 0.85, 10, 6)
      geo2.translate(baseWidth * 0.5, -peakHeight * 0.08, baseWidth * 0.2)
      this.displaceMountainVertices(geo1, baseWidth * 0.18, i)
      this.displaceMountainVertices(geo2, baseWidth * 0.18, i + 50)
      const merged = BufferGeometryUtils.mergeGeometries([geo1, geo2])
      geo1.dispose()
      geo2.dispose()
      if (!merged) return new THREE.ConeGeometry(baseWidth, peakHeight, 10, 6)
      geo = merged
      geo.computeVertexNormals()
      return geo
    } else {
      // Cliff wall / ridge — stretched box
      geo = new THREE.BoxGeometry(baseWidth * 2.5, peakHeight, baseWidth * 0.5, 8, 8, 4)
    }

    this.displaceMountainVertices(geo, baseWidth * 0.18, i)
    geo.computeVertexNormals()
    return geo
  }

  /**
   * Multi-octave displacement tuned for mountains — produces craggy ridges
   * and cliff faces rather than smooth lumps.
   */
  private displaceMountainVertices(
    geo: THREE.BufferGeometry,
    amount: number,
    seed: number,
  ): void {
    const pos = geo.attributes.position
    const s = seed * 0.37
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)

      // Large ridges
      const n1 = Math.sin(x * 0.08 + s) * Math.cos(z * 0.06 + s * 0.7) * 1.0
      // Medium crags
      const n2 = Math.sin(x * 0.18 + y * 0.12 + s * 1.3) * Math.cos(z * 0.15 + s) * 0.5
      // Fine jagged detail
      const n3 = Math.sin(x * 0.4 + z * 0.35 + s * 2.1) * Math.cos(y * 0.3 + x * 0.25) * 0.25
      // Vertical cliff bands (abs creates sharp edges)
      const cliff = Math.abs(Math.sin(y * 0.12 + x * 0.04 + s * 0.5)) * 0.4

      const noise = n1 + n2 + n3 + cliff

      // Displace radially outward, with less Y displacement to keep height coherent
      const len = Math.sqrt(x * x + z * z) || 1
      pos.setX(i, x + (x / len) * noise * amount)
      pos.setY(i, y + noise * amount * 0.3)
      pos.setZ(i, z + (z / len) * noise * amount)
    }
  }

  /** Bilinear height interpolation at world (x, z), including rock surfaces */
  heightAt(x: number, z: number): number {
    let h = this.terrainHeightAt(x, z)

    // Add rock bump heights — rocks are smooth dome shapes the rover can climb
    for (const rock of this.rockColliders) {
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

  /** Raw terrain height without rocks */
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

  /** Surface normal at world (x, z) — for tilting objects on terrain */
  normalAt(x: number, z: number): THREE.Vector3 {
    const s = 0.5
    const hL = this.heightAt(x - s, z)
    const hR = this.heightAt(x + s, z)
    const hD = this.heightAt(x, z - s)
    const hU = this.heightAt(x, z + s)
    return new THREE.Vector3(hL - hR, 2 * s, hD - hU).normalize()
  }

  /** Slope magnitude at world (x, z) */
  slopeAt(x: number, z: number): number {
    const dx = (this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) / 2
    const dz = (this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2
    return Math.sqrt(dx * dx + dz * dz)
  }

  get scale(): number {
    return SCALE
  }

  /** Returns only small rocks (excludes boulders with scale >= 2.0) */
  getSmallRocks(): THREE.Mesh[] {
    return this.rocks.filter(r => r.scale.x < 2.0)
  }

  dispose() {
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }
    this.textures.forEach((t) => t.dispose())
    this.textures = []
    this.rocks.forEach((r) => {
      // Depleted rocks have cloned materials that need disposal
      if (r.userData._depletedMat) {
        ;(r.material as THREE.Material).dispose()
      }
      this.group.remove(r)
    })
    this.rocks = []
    this.rockColliders = []
    this.mountains.forEach((m) => {
      m.geometry.dispose()
      this.group.remove(m)
    })
    this.mountains = []
    if (this.terrainMesh) this.group.remove(this.terrainMesh)
    this.terrainMesh = null
    this.terrainMaterial = null
    this.heightmap = null
  }
}
