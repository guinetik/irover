import * as THREE from 'three'
import { SimplexNoise } from './SimplexNoise'

const GRID_SIZE = 256
const SCALE = 500
const ROCK_COUNT = 400

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
  private terrainMesh: THREE.Mesh | null = null
  private rocks: THREE.Mesh[] = []
  /** Rock positions, radii, and heights for collision/climbing */
  rockColliders: { x: number; z: number; radius: number; height: number }[] = []
  private rockGeo: THREE.DodecahedronGeometry
  private rockMat: THREE.MeshStandardMaterial
  private skyMesh: THREE.Mesh | null = null

  readonly group = new THREE.Group()

  constructor() {
    this.rockGeo = new THREE.DodecahedronGeometry(0.5, 0)
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x4a3225, roughness: 1 })
  }

  generate(params: TerrainParams) {
    this.dispose()

    this.heightmap = this.genHeightmap(params)
    this.buildTerrainMesh(params)
    this.buildRocks(params.seed)
    this.buildSky()
  }

  private genHeightmap(p: TerrainParams): Float32Array {
    const sn = new SimplexNoise(p.seed)
    const d = new Float32Array(GRID_SIZE * GRID_SIZE)
    const { roughness: ro, craterDensity: cr, dustCover: dc, elevation: el } = p

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const nx = x / GRID_SIZE - 0.5
        const ny = y / GRID_SIZE - 0.5
        let h = sn.n2(nx * 2, ny * 2) * el * 8
        h += sn.n2(nx * 6, ny * 6) * el * 3
        h += sn.n2(nx * 20, ny * 20) * ro * 4
        h += sn.n2(nx * 50, ny * 50) * ro * 1.5
        d[y * GRID_SIZE + x] = h
      }
    }

    // Craters
    const rng = new SimplexNoise(p.seed + 100)
    const nc = Math.floor(cr * 15) + 2
    for (let c = 0; c < nc; c++) {
      const cx = (rng.n2(c * 7.3, 0.5) + 1) * 0.5
      const cy = (rng.n2(0.5, c * 7.3) + 1) * 0.5
      const rad = 0.03 + (rng.n2(c * 3.1, c * 2.7) + 1) * 0.04 * cr
      const dep = 3 + cr * 8
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          const dx2 = x / GRID_SIZE - cx
          const dy2 = y / GRID_SIZE - cy
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2)
          if (dist < rad * 2) {
            const t = dist / rad
            const rimExp = Math.exp(-Math.pow((t - 1) * 4, 2))
            if (t < 1) {
              d[y * GRID_SIZE + x] += (t * t - 1) * dep
              d[y * GRID_SIZE + x] += rimExp * dep * 0.4
            } else if (t < 2) {
              d[y * GRID_SIZE + x] += rimExp * dep * 0.4
            }
          }
        }
      }
    }

    // Dust smoothing
    if (dc > 0.3) {
      const passes = Math.floor(dc * 4)
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

  private terrainColor(h: number, slope: number, p: TerrainParams): [number, number, number] {
    const { dustCover: dc, ironOxide: io, basalt: ba } = p
    const r = 0.76 * dc + 0.35 * (1 - dc) * ba + 0.65 * io * 0.5
    const g = 0.45 * dc + 0.25 * (1 - dc) * ba + 0.30 * io * 0.3
    const b = 0.28 * dc + 0.18 * (1 - dc) * ba + 0.15 * io * 0.2
    const hm = Math.max(0, Math.min(1, (h + 10) / 20)) * 0.3
    const sf = Math.min(1, slope * 3)
    return [
      Math.min(1, r + hm + sf * 0.1),
      Math.min(1, g + hm * 0.5),
      Math.min(1, b + hm * 0.3 - sf * 0.05),
    ]
  }

  private buildTerrainMesh(p: TerrainParams) {
    const hm = this.heightmap!
    const geo = new THREE.PlaneGeometry(SCALE, SCALE, GRID_SIZE - 1, GRID_SIZE - 1)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position.array as Float32Array
    const cols = new Float32Array(pos.length)

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      pos[i * 3 + 1] = hm[i]
    }

    geo.computeVertexNormals()
    const nrm = geo.attributes.normal.array as Float32Array

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      const slope = 1 - Math.abs(nrm[i * 3 + 1])
      const [r, g, b] = this.terrainColor(hm[i], slope, p)
      cols[i * 3] = r
      cols[i * 3 + 1] = g
      cols[i * 3 + 2] = b
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))

    this.terrainMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.05,
      }),
    )
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

      const rock = new THREE.Mesh(this.rockGeo, this.rockMat)
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
  }

  private buildSky() {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vP;
        void main() {
          vP = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vP;
        void main() {
          float h = normalize(vP).y;
          vec3 c = mix(vec3(0.76, 0.55, 0.35), vec3(0.12, 0.06, 0.04), max(0.0, h));
          float sd = max(0.0, dot(normalize(vP), normalize(vec3(50.0, 80.0, 30.0))));
          c += vec3(0.3, 0.15, 0.05) * pow(sd, 8.0);
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(SCALE * 1.2, 32, 32), skyMat)
    this.group.add(this.skyMesh)
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
        // Hemisphere profile: height = rockHeight * sqrt(1 - (dist/radius)^2)
        const t = 1 - distSq / (r * r)
        const rockBaseY = this.terrainHeightAt(rock.x, rock.z)
        const rockTopY = rockBaseY + rock.height
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
    if (this.skyMesh) {
      this.skyMesh.geometry.dispose()
      ;(this.skyMesh.material as THREE.Material).dispose()
    }
    this.rocks.forEach((r) => this.group.remove(r))
    this.rocks = []
    this.rockColliders = []
    if (this.terrainMesh) this.group.remove(this.terrainMesh)
    if (this.skyMesh) this.group.remove(this.skyMesh)
    this.terrainMesh = null
    this.skyMesh = null
    this.heightmap = null
  }
}
