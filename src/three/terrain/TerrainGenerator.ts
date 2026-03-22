import * as THREE from 'three'
import { SimplexNoise } from './SimplexNoise'
import terrainVert from '@/three/shaders/terrain.vert.glsl?raw'
import terrainFrag from '@/three/shaders/terrain.frag.glsl?raw'
import rockTextureUrl from '@/assets/texture1.jpg?url'
import dustTextureUrl from '@/assets/texture2.jpg?url'

const GRID_SIZE = 256
const SCALE = 800
const ROCK_COUNT = 500
const BOULDER_COUNT = 50

export interface TerrainParams {
  roughness: number
  craterDensity: number
  dustCover: number
  elevation: number
  ironOxide: number
  basalt: number
  seed: number
}

export class TerrainGenerator {
  private heightmap: Float32Array | null = null
  private heightMin = 0
  private heightMax = 0
  private terrainMesh: THREE.Mesh | null = null
  private rocks: THREE.Mesh[] = []
  private mountains: THREE.Mesh[] = []
  /** Rock positions, radii, and heights for collision/climbing */
  rockColliders: { x: number; z: number; radius: number; height: number }[] = []
  private rockGeos: THREE.BufferGeometry[] = []
  private boulderGeos: THREE.BufferGeometry[] = []
  private rockMat: THREE.MeshStandardMaterial
  private boulderMat: THREE.MeshStandardMaterial
  private textures: THREE.Texture[] = []

  readonly group = new THREE.Group()

  constructor() {
    // Small rock shapes
    this.rockGeos = [
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.OctahedronGeometry(0.5, 0),
    ]

    // Boulder shapes — varied silhouettes
    this.boulderGeos = this.createBoulderGeometries()

    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3225, roughness: 1 })
    this.boulderMat = new THREE.MeshStandardMaterial({ color: 0x3d2a1c, roughness: 0.95, metalness: 0.05 })
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
    this.buildRocks(params.seed)
    this.buildMountains(params.seed, params.elevation)
  }

  private genHeightmap(p: TerrainParams): Float32Array {
    const sn = new SimplexNoise(p.seed)
    const sn2 = new SimplexNoise(p.seed + 50)
    const d = new Float32Array(GRID_SIZE * GRID_SIZE)
    const { roughness: ro, craterDensity: cr, dustCover: dc, elevation: el } = p

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const nx = x / GRID_SIZE - 0.5
        const ny = y / GRID_SIZE - 0.5

        // Large-scale rolling terrain
        let h = sn.n2(nx * 1.5, ny * 1.5) * el * 15

        // Medium ridges and valleys
        h += sn.n2(nx * 3, ny * 3) * el * 8
        h += sn2.n2(nx * 5, ny * 5) * el * 4

        // Rocky detail — more octaves, sharper
        h += sn.n2(nx * 10, ny * 10) * ro * 5
        h += sn2.n2(nx * 20, ny * 20) * ro * 3
        h += sn.n2(nx * 40, ny * 40) * ro * 1.5

        // Fine grit
        h += sn2.n2(nx * 80, ny * 80) * ro * 0.5

        // Ridge lines — absolute value creates sharp creases
        const ridge = Math.abs(sn.n2(nx * 6 + 10, ny * 6 + 10))
        h += ridge * el * 3

        d[y * GRID_SIZE + x] = h
      }
    }

    // Craters — bigger and deeper
    const rng = new SimplexNoise(p.seed + 100)
    const nc = Math.floor(cr * 20) + 3
    for (let c = 0; c < nc; c++) {
      const cx = (rng.n2(c * 7.3, 0.5) + 1) * 0.5
      const cy = (rng.n2(0.5, c * 7.3) + 1) * 0.5
      const rad = 0.02 + (rng.n2(c * 3.1, c * 2.7) + 1) * 0.05 * cr
      const dep = 5 + cr * 12
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const dx2 = x / GRID_SIZE - cx
          const dy2 = y / GRID_SIZE - cy
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          if (dist < rad * 2.5) {
            const t = dist / rad
            const rimExp = Math.exp(-Math.pow((t - 1) * 3.5, 2))
            if (t < 1) {
              d[y * GRID_SIZE + x] += (t * t - 1) * dep
              d[y * GRID_SIZE + x] += rimExp * dep * 0.5
            } else if (t < 2.5) {
              d[y * GRID_SIZE + x] += rimExp * dep * 0.5
            }
          }
        }
      }
    }

    // Dust smoothing — only smooth high-frequency, preserve large shapes
    if (dc > 0.3) {
      const passes = Math.floor(dc * 3)
      for (let q = 0; q < passes; q++) {
        const cp = new Float32Array(d)
        for (let y = 1; y < GRID_SIZE - 1; y++) {
          for (let x = 1; x < GRID_SIZE - 1; x++) {
            d[y * GRID_SIZE + x] = (
              cp[y * GRID_SIZE + x] * 2 +
              cp[(y - 1) * GRID_SIZE + x] +
              cp[(y + 1) * GRID_SIZE + x] +
              cp[y * GRID_SIZE + x - 1] +
              cp[y * GRID_SIZE + x + 1]
            ) / 6
          }
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
      },
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
    })

    this.terrainMesh = new THREE.Mesh(geo, material)
    this.terrainMesh.receiveShadow = true
    this.group.add(this.terrainMesh)
  }

  private buildRocks(seed: number) {
    const rng = new SimplexNoise(seed)
    const hm = this.heightmap!

    for (let i = 0; i < ROCK_COUNT; i++) {
      const rx = (rng.n2(i * 1.7, 0) + 1) * 0.5 * SCALE - SCALE / 2
      const rz = (rng.n2(0, i * 1.7) + 1) * 0.5 * SCALE - SCALE / 2
      const sc = 0.3 + (rng.n2(i * 0.3, i * 0.7) + 1) * 0.8

      const rock = new THREE.Mesh(this.rockGeos[i % this.rockGeos.length], this.rockMat)
      const gx = Math.floor((rx / SCALE + 0.5) * (GRID_SIZE - 1))
      const gz = Math.floor((rz / SCALE + 0.5) * (GRID_SIZE - 1))
      const ry = (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE)
        ? hm[gz * GRID_SIZE + gx] - 0.15
        : 0

      rock.position.set(rx, ry, rz)
      rock.scale.set(sc, sc * 0.6, sc)
      rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5)
      rock.castShadow = true
      this.group.add(rock)
      this.rocks.push(rock)
      this.rockColliders.push({ x: rx, z: rz, radius: sc * 0.6, height: sc * 0.35 })
    }

    // Boulders — large rocks for gameplay obstacles
    const boulderRng = new SimplexNoise(seed + 200)
    for (let i = 0; i < BOULDER_COUNT; i++) {
      const bx = (boulderRng.n2(i * 2.3, 0.7) + 1) * 0.5 * SCALE - SCALE / 2
      const bz = (boulderRng.n2(0.7, i * 2.3) + 1) * 0.5 * SCALE - SCALE / 2
      const sc = 2.0 + (boulderRng.n2(i * 0.5, i * 0.9) + 1) * 2.5 // scale 2–7

      const boulder = new THREE.Mesh(this.boulderGeos[i % this.boulderGeos.length], this.boulderMat)
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

  private buildMountains(seed: number, elevation: number) {
    const rng = new SimplexNoise(seed + 300)
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x5a3d2a,
      roughness: 0.95,
      metalness: 0.05,
    })

    const count = 12 + Math.floor(elevation * 8)
    const ringRadius = SCALE * 0.55 // just beyond terrain edge

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng.n2(i * 3.1, 0) * 0.4
      const dist = ringRadius + rng.n2(0, i * 2.7) * SCALE * 0.15

      const mx = Math.cos(angle) * dist
      const mz = Math.sin(angle) * dist

      // Vary mountain shape
      const peakHeight = 30 + (rng.n2(i * 1.3, i * 0.7) + 1) * 40 * elevation
      const baseWidth = 40 + (rng.n2(i * 0.9, i * 1.5) + 1) * 30
      const shapeType = i % 3

      let geo: THREE.BufferGeometry
      if (shapeType === 0) {
        // Cone peak
        geo = new THREE.ConeGeometry(baseWidth, peakHeight, 8, 4)
        this.displaceVertices(geo, baseWidth * 0.08)
      } else if (shapeType === 1) {
        // Ridge / mesa
        geo = new THREE.CylinderGeometry(baseWidth * 0.6, baseWidth, peakHeight * 0.7, 7, 3)
        this.displaceVertices(geo, baseWidth * 0.1)
      } else {
        // Broad rounded hill
        const sphere = new THREE.SphereGeometry(baseWidth, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)
        sphere.scale(1, peakHeight / baseWidth, 1)
        this.displaceVertices(sphere, baseWidth * 0.06)
        geo = sphere
      }

      const mountain = new THREE.Mesh(geo, mountainMat)
      mountain.position.set(mx, -peakHeight * 0.1, mz)
      mountain.rotation.y = rng.n2(i * 5.3, i * 2.1) * Math.PI * 2
      mountain.castShadow = false
      mountain.receiveShadow = false
      this.group.add(mountain)
      this.mountains.push(mountain)
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
  private terrainHeightAt(x: number, z: number): number {
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

  dispose() {
    if (this.terrainMesh) {
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }
    this.textures.forEach((t) => t.dispose())
    this.textures = []
    this.rocks.forEach((r) => this.group.remove(r))
    this.rocks = []
    this.rockColliders = []
    this.mountains.forEach((m) => {
      m.geometry.dispose()
      this.group.remove(m)
    })
    this.mountains = []
    if (this.terrainMesh) this.group.remove(this.terrainMesh)
    this.terrainMesh = null
    this.heightmap = null
  }
}
