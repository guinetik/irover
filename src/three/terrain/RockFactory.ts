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

const ROCK_COUNT = 1200
const BOULDER_COUNT = 50
const SCALE = 800

export interface RockCollider {
  x: number
  z: number
  radius: number
  height: number
}

/**
 * Handles loading, building, and spawning all rocks and boulders on the terrain.
 * Pulls geometry from rocks.glb (with per-type mineral textures) and a small
 * procedural pool for variety.
 */
export class RockFactory {
  /** All spawned rock/boulder meshes. */
  readonly rocks: THREE.Mesh[] = []
  /** Collision shapes for rover interaction. */
  readonly colliders: RockCollider[] = []

  private rockGeoMap = new Map<RockTypeId, THREE.BufferGeometry[]>()
  private rockMatMap = new Map<RockTypeId, THREE.MeshStandardMaterial>()
  /** Materials without vertexColors — used for GLB geometries. */
  private glbMatMap = new Map<RockTypeId, THREE.MeshStandardMaterial>()
  /** All GLB rock geometries from rocks.glb. */
  private glbRockGeos: THREE.BufferGeometry[] = []
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
   * Spawns all rocks and boulders into the target group.
   * @param params Terrain params for geology-driven type distribution.
   * @param heightAt Function to query terrain height at (x, z).
   * @param group Target group to add meshes to.
   */
  spawn(
    params: TerrainParams,
    heightAt: (x: number, z: number) => number,
    group: THREE.Group,
  ): void {
    const { seed, featureType } = params
    const rng = new SimplexNoise(seed)

    // Site-aware count multipliers
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

    const spawnDist = buildSpawnDistribution({
      basalt: params.basalt,
      ironOxide: params.ironOxide,
      silicateIndex: params.silicateIndex,
      waterIceIndex: params.waterIceIndex,
      dustCover: params.dustCover,
    })

    // --- Rocks ---
    const rockCount = Math.floor(ROCK_COUNT * rockMultiplier)
    for (let i = 0; i < rockCount; i++) {
      const rx = (rng.n2(i * 1.7, 3.1) + 1) * 0.5 * SCALE - SCALE / 2
      const rz = (rng.n2(7.9, i * 2.3) + 1) * 0.5 * SCALE - SCALE / 2
      const sc = 0.5 + (rng.n2(i * 0.3, i * 0.7) + 1) * 1.0

      const typeRand = (rng.n2(i * 2.9, i * 1.3) + 1) * 0.5
      const typeId = pickRockType(spawnDist, typeRand)
      const typeScaleY = ROCK_TYPE_LIST.find(t => t.id === typeId)!.geometry.scaleY

      // 90% GLB, 10% procedural for extra variety
      const useGlb = this.glbRockGeos.length > 0 && (i % 10 !== 0)
      let geo: THREE.BufferGeometry
      let mat: THREE.MeshStandardMaterial
      let scaleY: number
      if (useGlb) {
        geo = this.glbRockGeos[i % this.glbRockGeos.length]
        mat = this.glbMatMap.get(typeId)!
        scaleY = 0.5 + Math.sin(i * 1.7) * 0.25
      } else {
        const typeGeos = this.rockGeoMap.get(typeId)!
        geo = typeGeos[i % typeGeos.length]
        mat = this.rockMatMap.get(typeId)!
        scaleY = typeScaleY
      }

      const rock = new THREE.Mesh(geo, mat)
      rock.userData.rockType = typeId

      const ry = heightAt(rx, rz) + (useGlb ? sc * scaleY * 0.35 : -sc * 0.05)

      rock.position.set(rx, ry, rz)
      rock.scale.set(sc, sc * scaleY, sc)
      const tiltRange = useGlb ? 0.08 : 0.5
      rock.rotation.set(Math.random() * tiltRange, Math.random() * Math.PI * 2, Math.random() * tiltRange)
      rock.castShadow = true
      group.add(rock)
      this.rocks.push(rock)
      this.colliders.push({ x: rx, z: rz, radius: sc * 0.6, height: sc * 0.35 })
    }

    // --- Boulders ---
    const boulderRng = new SimplexNoise(seed + 200)
    const boulderCount = Math.floor(BOULDER_COUNT * boulderMultiplier)
    for (let i = 0; i < boulderCount; i++) {
      const bx = (boulderRng.n2(i * 2.3, 5.3) + 1) * 0.5 * SCALE - SCALE / 2
      const bz = (boulderRng.n2(11.7, i * 3.1) + 1) * 0.5 * SCALE - SCALE / 2
      let sc = 2.0 + (boulderRng.n2(i * 0.5, i * 0.9) + 1) * 2.5

      if (featureType === 'volcano' && i % 4 === 0) {
        sc = 4.0 + (boulderRng.n2(i * 0.5, i * 0.9) + 1) * 2.0
      }

      const bTypeRand = (boulderRng.n2(i * 3.7, i * 2.1) + 1) * 0.5
      const bTypeId = pickRockType(spawnDist, bTypeRand)

      const useGlbBoulder = this.glbRockGeos.length > 0
      const boulderPool = useGlbBoulder ? this.glbRockGeos : this.boulderGeos
      const bMat = useGlbBoulder
        ? this.glbMatMap.get(bTypeId)!
        : this.rockMatMap.get(bTypeId)!
      const boulder = new THREE.Mesh(boulderPool[i % boulderPool.length], bMat)
      const by = heightAt(bx, bz) + (useGlbBoulder ? sc * 0.15 : -sc * 0.1)

      boulder.position.set(bx, by, bz)
      boulder.scale.set(sc, sc * 0.5, sc * 0.8)
      const bTilt = useGlbBoulder ? 0.08 : 0.3
      boulder.rotation.set(
        boulderRng.n2(i * 1.1, 0) * bTilt,
        boulderRng.n2(0, i * 1.1) * Math.PI * 2,
        boulderRng.n2(i * 0.7, i * 0.3) * bTilt,
      )
      boulder.castShadow = true
      boulder.receiveShadow = true
      group.add(boulder)
      this.rocks.push(boulder)
      this.colliders.push({ x: bx, z: bz, radius: sc * 0.7, height: sc * 0.4 })
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
