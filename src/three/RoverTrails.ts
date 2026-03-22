import * as THREE from 'three'
import type { HeightFn } from './RoverController'

const MAX_POINTS = 600
const TRACK_WIDTH = 0.18
const TRACK_SEPARATION = 0.42
const MIN_DISTANCE = 0.3
const TRAIL_Y_OFFSET = 0.05
const FADE_START = 0.5
// Offset from rover origin to rear axle (negative = behind rover forward direction)
const REAR_AXLE_OFFSET = -0.75

export class RoverTrails {
  readonly mesh: THREE.Mesh
  private geometry: THREE.BufferGeometry
  private positions: Float32Array
  private alphas: Float32Array
  private material: THREE.ShaderMaterial
  private pointCount = 0
  private lastPos = new THREE.Vector3()
  private lastHeading = 0
  private heightAt: HeightFn
  private hasStarted = false

  constructor(heightAt: HeightFn) {
    this.heightAt = heightAt

    // Each trail point produces 4 vertices (left outer, left inner, right inner, right outer)
    // Each segment between two points produces 2 quads (left track + right track) = 4 triangles = 12 indices
    const maxVerts = MAX_POINTS * 4
    const maxIndices = (MAX_POINTS - 1) * 12

    this.positions = new Float32Array(maxVerts * 3)
    this.alphas = new Float32Array(maxVerts)

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1))
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(maxIndices), 1))

    this.material = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.45, 0.35, 0.25, vAlpha * 0.7);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
  }

  update(roverPosition: THREE.Vector3, heading: number) {
    if (!this.hasStarted) {
      this.lastPos.copy(roverPosition)
      this.lastHeading = heading
      this.hasStarted = true
      return
    }

    const dx = roverPosition.x - this.lastPos.x
    const dz = roverPosition.z - this.lastPos.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < MIN_DISTANCE) return

    this.lastPos.copy(roverPosition)
    this.lastHeading = heading

    // Shift old points if at capacity
    if (this.pointCount >= MAX_POINTS) {
      // Shift arrays left by 1 point (4 verts)
      this.positions.copyWithin(0, 4 * 3, this.pointCount * 4 * 3)
      this.alphas.copyWithin(0, 4, this.pointCount * 4)
      this.pointCount = MAX_POINTS - 1
    }

    // Add new point — 4 vertices
    const i = this.pointCount

    // Offset stamp to rear axle position
    const fwd = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
    const rearX = roverPosition.x + fwd.x * REAR_AXLE_OFFSET
    const rearZ = roverPosition.z + fwd.z * REAR_AXLE_OFFSET

    const right = new THREE.Vector3(
      -Math.cos(heading),
      0,
      Math.sin(heading),
    )

    // Left track: outer and inner edges
    const loX = rearX - right.x * (TRACK_SEPARATION + TRACK_WIDTH)
    const loZ = rearZ - right.z * (TRACK_SEPARATION + TRACK_WIDTH)
    const liX = rearX - right.x * TRACK_SEPARATION
    const liZ = rearZ - right.z * TRACK_SEPARATION

    // Right track: inner and outer edges
    const riX = rearX + right.x * TRACK_SEPARATION
    const riZ = rearZ + right.z * TRACK_SEPARATION
    const roX = rearX + right.x * (TRACK_SEPARATION + TRACK_WIDTH)
    const roZ = rearZ + right.z * (TRACK_SEPARATION + TRACK_WIDTH)

    const vi = i * 4 * 3
    // Vert 0: left outer
    this.positions[vi] = loX
    this.positions[vi + 1] = this.heightAt(loX, loZ) + TRAIL_Y_OFFSET
    this.positions[vi + 2] = loZ
    // Vert 1: left inner
    this.positions[vi + 3] = liX
    this.positions[vi + 4] = this.heightAt(liX, liZ) + TRAIL_Y_OFFSET
    this.positions[vi + 5] = liZ
    // Vert 2: right inner
    this.positions[vi + 6] = riX
    this.positions[vi + 7] = this.heightAt(riX, riZ) + TRAIL_Y_OFFSET
    this.positions[vi + 8] = riZ
    // Vert 3: right outer
    this.positions[vi + 9] = roX
    this.positions[vi + 10] = this.heightAt(roX, roZ) + TRAIL_Y_OFFSET
    this.positions[vi + 11] = roZ

    this.pointCount++

    // Update alphas — newest (last) = full opacity, oldest (first) = faded
    for (let p = 0; p < this.pointCount; p++) {
      const t = p / Math.max(1, this.pointCount - 1) // 0 = oldest, 1 = newest
      const alpha = t < FADE_START ? t / FADE_START : 1.0
      const ai = p * 4
      this.alphas[ai] = alpha
      this.alphas[ai + 1] = alpha
      this.alphas[ai + 2] = alpha
      this.alphas[ai + 3] = alpha
    }

    // Rebuild indices
    const indexCount = (this.pointCount - 1) * 12
    const indices = this.geometry.index!.array as Uint16Array
    for (let s = 0; s < this.pointCount - 1; s++) {
      const a = s * 4
      const b = (s + 1) * 4
      const ii = s * 12

      // Left track quad (verts 0,1 of each point)
      indices[ii] = a
      indices[ii + 1] = b
      indices[ii + 2] = b + 1
      indices[ii + 3] = a
      indices[ii + 4] = b + 1
      indices[ii + 5] = a + 1

      // Right track quad (verts 2,3 of each point)
      indices[ii + 6] = a + 2
      indices[ii + 7] = b + 2
      indices[ii + 8] = b + 3
      indices[ii + 9] = a + 2
      indices[ii + 10] = b + 3
      indices[ii + 11] = a + 3
    }

    // Update GPU buffers
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.aAlpha.needsUpdate = true
    this.geometry.index!.needsUpdate = true
    this.geometry.setDrawRange(0, indexCount)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
