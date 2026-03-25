import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SimplexNoise } from './SimplexNoise'
import {
  ROCK_TYPE_LIST,
  ROCK_VARIANTS_PER_TYPE,
  type RockTypeId,
  createRockGeometry,
  createRockMaterial,
  buildSpawnDistribution,
  pickRockType,
} from './RockTypes'
import type { TerrainParams } from './TerrainGenerator'
import { generateRockDistribution, type RockSpawn, type GolombekConfig } from './GolombekDistribution'

const SCALE = 800

export interface RockCollider {
  x: number
  z: number
  radius: number
  height: number
}

/** Spatial grid cell size — should be >= the largest rock radius. */
const GRID_CELL = 8

/**
 * Handles loading, building, and spawning all rocks and boulders on the terrain.
 * Uses the Golombek-Rapp exponential model (Golombek & Rapp 1997, Golombek et al. 2003/2021)
 * for scientifically accurate size-frequency distributions, spatial clustering
 * around crater ejecta, and biome-appropriate rock morphology.
 */
export class RockFactory {
  /** All spawned rock/boulder meshes. */
  readonly rocks: THREE.Mesh[] = []
  /** Collision shapes for rover interaction. */
  readonly colliders: RockCollider[] = []
  /** Spatial hash grid for fast per-frame collision lookups. */
  private grid = new Map<number, number[]>()

  private rockGeoMap = new Map<RockTypeId, THREE.BufferGeometry[]>()
  private rockMatMap = new Map<RockTypeId, THREE.MeshStandardMaterial>()
  /** Materials without vertexColors — used for GLB geometries. */
  private glbMatMap = new Map<RockTypeId, THREE.MeshStandardMaterial>()
  /** All GLB rock geometries from rocks.glb. */
  private glbRockGeos: THREE.BufferGeometry[] = []
  /** Bottom Y of each normalized GLB geometry (for ground placement). */
  private glbRockBottomY: number[] = []
  private glbRockReady: Promise<void>
  private boulderGeos: THREE.BufferGeometry[] = []
  private textures: THREE.Texture[] = []

  constructor() {
    const texLoader = new THREE.TextureLoader()

    for (const rt of ROCK_TYPE_LIST) {
      const tex = texLoader.load(`/${rt.textureFile}`)
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.colorSpace = THREE.SRGBColorSpace
      this.textures.push(tex)

      // Sphere-preview textures have a dark background around a centered circle.
      // Crop to the inner 50% square via canvas so all UV coordinates sample rock surface only.
      const cropped = new THREE.Texture()
      cropped.wrapS = cropped.wrapT = THREE.RepeatWrapping
      cropped.minFilter = THREE.LinearMipmapLinearFilter
      cropped.magFilter = THREE.LinearFilter
      cropped.colorSpace = THREE.SRGBColorSpace
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = `/${rt.textureFile}`
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const cropSize = Math.floor(Math.min(img.width, img.height) * 0.5)
        const sx = Math.floor((img.width - cropSize) / 2)
        const sy = Math.floor((img.height - cropSize) / 2)
        canvas.width = cropSize
        canvas.height = cropSize
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, cropSize, cropSize)
        cropped.image = canvas
        cropped.needsUpdate = true
      }

      // Procedural geometry variants per type
      const variants: THREE.BufferGeometry[] = []
      for (let v = 0; v < ROCK_VARIANTS_PER_TYPE; v++) {
        variants.push(createRockGeometry(rt, true, v))
      }
      this.rockGeoMap.set(rt.id, variants)
      this.rockMatMap.set(rt.id, createRockMaterial(rt, tex, true))
      this.glbMatMap.set(rt.id, createRockMaterial(rt, cropped, false))
    }

    this.boulderGeos = this.createBoulderGeometries()

    // Load rocks.glb — a pool of 20 rock geometries (textures stripped, ~2MB).
    this.glbRockReady = new GLTFLoader().loadAsync('/rocks.glb').then((gltf) => {
      gltf.scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const geo = child.geometry as THREE.BufferGeometry

        geo.computeBoundingBox()
        const box = geo.boundingBox!
        const size = new THREE.Vector3()
        box.getSize(size)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const center = new THREE.Vector3()
        box.getCenter(center)
        geo.translate(-center.x, -center.y, -center.z)
        geo.scale(1 / maxDim, 1 / maxDim, 1 / maxDim)

        if (!geo.attributes.normal) {
          geo.computeVertexNormals()
        }

        // Record the actual bottom Y after normalization for precise ground placement
        geo.computeBoundingBox()
        this.glbRockBottomY.push(geo.boundingBox!.min.y)
        this.glbRockGeos.push(geo)
      })
    }).catch(() => {
      // GLB not found — fall back to procedural rocks only
    })
  }

  /** Must be awaited before calling {@link spawn}. */
  async ready(): Promise<void> {
    await this.glbRockReady
  }

  /**
   * Spawns rocks using the Golombek-Rapp exponential size-frequency distribution.
   *
   * Instead of flat ROCK_COUNT with random sizes, this method:
   *  1. Computes biome-specific rock abundance (k) from terrain params
   *  2. Generates rock diameters following F_k(D) = k·exp[−q(k)·D]
   *  3. Clusters rocks around crater ejecta halos (r^-3 falloff)
   *  4. Applies biome-appropriate H/D ratios and burial fractions
   *
   * @param params Terrain params for geology-driven distribution.
   * @param heightAt Function to query terrain height at (x, z).
   * @param group Target group to add meshes to.
   * @param config Optional performance/range overrides.
   */
  spawn(
    params: TerrainParams,
    heightAt: (x: number, z: number) => number,
    group: THREE.Group,
    config?: GolombekConfig,
  ): void {
    // ── Generate scientifically-grounded rock distribution ──────────────
    const distribution = generateRockDistribution(params, SCALE, config)

    // ── Geology-driven mineral type distribution ───────────────────────
    const spawnDist = buildSpawnDistribution({
      basalt: params.basalt,
      ironOxide: params.ironOxide,
      silicateIndex: params.silicateIndex,
      waterIceIndex: params.waterIceIndex,
      dustCover: params.dustCover,
    })

    const rng = new SimplexNoise(params.seed + 500)

    // ── Spawn each rock from the distribution ─────────────────────────
    for (let i = 0; i < distribution.length; i++) {
      const spawn = distribution[i]

      // Pick mineral type from geological composition
      const typeRand = (rng.n2(i * 2.9, i * 1.3) + 1) * 0.5
      const typeId = pickRockType(spawnDist, typeRand)

      // Diameter threshold: large rocks (>= 2.0) use boulder pool
      const isBoulder = spawn.diameter >= 2.0

      // 90% GLB, 10% procedural for visual variety
      const useGlb = this.glbRockGeos.length > 0 && (i % 10 !== 0)

      let geo: THREE.BufferGeometry
      let mat: THREE.MeshStandardMaterial

      if (isBoulder) {
        // Boulder geometry selection
        const pool = useGlb ? this.glbRockGeos : this.boulderGeos
        const bGeoIdx = i % pool.length
        geo = pool[bGeoIdx]
        mat = useGlb ? this.glbMatMap.get(typeId)! : this.rockMatMap.get(typeId)!
      } else if (useGlb) {
        geo = this.glbRockGeos[i % this.glbRockGeos.length]
        mat = this.glbMatMap.get(typeId)!
      } else {
        const typeGeos = this.rockGeoMap.get(typeId)!
        geo = typeGeos[i % typeGeos.length]
        mat = this.rockMatMap.get(typeId)!
      }

      const rock = new THREE.Mesh(geo, mat)
      rock.userData.rockType = typeId
      rock.userData.isEjecta = spawn.isEjecta
      rock.userData.golombekDiameter = spawn.diameter

      // ── Scale from diameter + H/D ratio ───────────────────────────
      const sc = spawn.diameter
      const scaleY = spawn.heightRatio
      rock.scale.set(sc, sc * scaleY, sc)

      // ── Position: terrain height with burial offset ───────────────
      const rx = spawn.x
      const rz = spawn.z
      let ry: number

      if (useGlb) {
        const geoIdx = i % this.glbRockGeos.length
        const bottomY = this.glbRockBottomY[geoIdx]
        // Base placement: bottom of mesh on terrain
        ry = heightAt(rx, rz) - bottomY * sc * scaleY
        // Burial: sink rock into terrain
        ry -= spawn.burial * sc * scaleY * 0.5
        // Slight additional embed for natural look
        ry -= sc * scaleY * 0.08
      } else {
        ry = heightAt(rx, rz)
        ry -= spawn.burial * sc * scaleY * 0.4
        ry -= sc * 0.05
      }

      rock.position.set(rx, ry, rz)

      // ── Rotation: subtle tilt, full Y rotation ────────────────────
      const tiltRange = useGlb ? 0.08 : 0.5
      rock.rotation.set(
        (rng.n2(i * 1.1, 0) + 1) * 0.5 * tiltRange,
        (rng.n2(0, i * 1.1) + 1) * 0.5 * Math.PI * 2,
        (rng.n2(i * 0.7, i * 0.3) + 1) * 0.5 * tiltRange,
      )

      rock.castShadow = true
      if (isBoulder) rock.receiveShadow = true

      group.add(rock)
      this.rocks.push(rock)

      // Collider uses the actual diameter for collision radius
      this.colliders.push({
        x: rx,
        z: rz,
        radius: sc * 0.5,
        height: sc * scaleY * (1 - spawn.burial * 0.5),
      })
      this.gridInsert(this.colliders.length - 1)
    }
  }

  /**
   * Returns colliders near (x, z) using the spatial grid.
   * Only checks the 9 surrounding cells — O(1) average vs O(n) linear scan.
   */
  getCollidersNear(x: number, z: number): RockCollider[] {
    const cx = Math.floor(x / GRID_CELL)
    const cz = Math.floor(z / GRID_CELL)
    const result: RockCollider[] = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = ((cx + dx) * 73856093) ^ ((cz + dz) * 19349663)
        const indices = this.grid.get(key)
        if (indices) {
          for (const idx of indices) {
            result.push(this.colliders[idx])
          }
        }
      }
    }
    return result
  }

  /** Inserts a collider index into the spatial grid. */
  private gridInsert(idx: number): void {
    const c = this.colliders[idx]
    // Insert into all cells the rock overlaps (center + radius)
    const minCx = Math.floor((c.x - c.radius) / GRID_CELL)
    const maxCx = Math.floor((c.x + c.radius) / GRID_CELL)
    const minCz = Math.floor((c.z - c.radius) / GRID_CELL)
    const maxCz = Math.floor((c.z + c.radius) / GRID_CELL)
    for (let gx = minCx; gx <= maxCx; gx++) {
      for (let gz = minCz; gz <= maxCz; gz++) {
        const key = (gx * 73856093) ^ (gz * 19349663)
        let cell = this.grid.get(key)
        if (!cell) {
          cell = []
          this.grid.set(key, cell)
        }
        cell.push(idx)
      }
    }
  }

  /** Returns only small rocks (excludes boulders with scale >= 2.0) */
  getSmallRocks(): THREE.Mesh[] {
    return this.rocks.filter(r => r.scale.x < 2.0)
  }

  /** Removes all spawned rocks from the group and resets state. */
  clear(group: THREE.Group): void {
    for (const r of this.rocks) {
      if (r.userData._depletedMat) {
        ;(r.material as THREE.Material).dispose()
      }
      group.remove(r)
    }
    this.rocks.length = 0
    this.colliders.length = 0
    this.grid.clear()
  }

  private createBoulderGeometries(): THREE.BufferGeometry[] {
    const geos: THREE.BufferGeometry[] = []
    geos.push(new THREE.DodecahedronGeometry(1.0, 1))

    const slab = new THREE.BoxGeometry(1.0, 0.6, 1.2, 2, 2, 2)
    this.displaceVertices(slab, 0.15)
    geos.push(slab)

    const spike = new THREE.ConeGeometry(0.7, 1.4, 6, 2)
    this.displaceVertices(spike, 0.12)
    geos.push(spike)

    const table = new THREE.CylinderGeometry(0.8, 1.0, 0.5, 7, 2)
    this.displaceVertices(table, 0.1)
    geos.push(table)

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
}
