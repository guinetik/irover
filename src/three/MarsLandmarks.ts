// src/three/MarsLandmarks.ts
import * as THREE from 'three'
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { SceneLayer } from './SceneLayer'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'
import { latLonToCartesian, surfaceNormal } from '@/lib/areography/coordinates'
import { GLOBE_RADIUS, FLY_TO_DISTANCE } from './constants'

const PIN_RADIUS = 0.15
const PIN_HEIGHT = 0.15
const PICK_THROTTLE_FRAMES = 3

export class MarsLandmarks implements SceneLayer {
  readonly root: THREE.Group
  private readonly raycaster = new THREE.Raycaster()
  private readonly pinMeshes: THREE.Mesh[] = []
  private readonly labelObjects: CSS2DObject[] = []
  private readonly normals: THREE.Vector3[] = []
  private readonly landmarkMap = new Map<THREE.Mesh, Landmark>()
  private pinGeometry: THREE.SphereGeometry | null = null
  private frameCount = 0
  private hoveredMesh: THREE.Mesh | null = null
  private readonly _worldPos = new THREE.Vector3()
  private readonly _camDir = new THREE.Vector3()

  onHover: ((event: LandmarkHoverEvent | null) => void) | null = null
  onClick: ((landmark: Landmark) => void) | null = null

  constructor(private readonly landmarks: Landmark[]) {
    this.root = new THREE.Group()
  }

  async init(): Promise<void> {
    this.pinGeometry = new THREE.SphereGeometry(PIN_RADIUS, 8, 8)
    const pinGeometry = this.pinGeometry

    for (const landmark of this.landmarks) {
      const position = latLonToCartesian(landmark.lat, landmark.lon, GLOBE_RADIUS * 1.005)
      const color = new THREE.Color(landmark.accent)

      // Pin mesh
      const material = new THREE.MeshBasicMaterial({ color })
      const pin = new THREE.Mesh(pinGeometry, material)
      pin.position.copy(position)
      this.root.add(pin)
      this.pinMeshes.push(pin)
      this.landmarkMap.set(pin, landmark)

      // CSS2D label
      const labelDiv = document.createElement('div')
      labelDiv.className = 'landmark-label'
      labelDiv.textContent = landmark.name
      labelDiv.style.color = landmark.accent
      labelDiv.style.fontSize = '11px'
      labelDiv.style.fontWeight = '400'
      labelDiv.style.letterSpacing = '0.05em'
      labelDiv.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)'
      labelDiv.style.pointerEvents = 'none'
      labelDiv.style.whiteSpace = 'nowrap'

      const label = new CSS2DObject(labelDiv)
      const normal = surfaceNormal(landmark.lat, landmark.lon)
      label.position.copy(position).addScaledVector(normal, PIN_HEIGHT)
      this.root.add(label)

      this.labelObjects.push(label)
      this.normals.push(normal)
    }
  }

  getLandmarkTarget(id: string): { position: THREE.Vector3; distance: number } | null {
    const landmark = this.landmarks.find(l => l.id === id)
    if (!landmark) return null
    const position = latLonToCartesian(landmark.lat, landmark.lon, GLOBE_RADIUS)
    return { position, distance: FLY_TO_DISTANCE }
  }

  pick(pointer: THREE.Vector2, camera: THREE.Camera): void {
    this.frameCount++
    if (this.frameCount % PICK_THROTTLE_FRAMES !== 0) return

    this.raycaster.setFromCamera(pointer, camera)
    const intersects = this.raycaster.intersectObjects(this.pinMeshes)

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      if (mesh !== this.hoveredMesh) {
        this.hoveredMesh = mesh
        const landmark = this.landmarkMap.get(mesh)!
        const screenPos = intersects[0].point.clone().project(camera)
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight
        this.onHover?.({ landmark, screenX: x, screenY: y })
      }
    } else if (this.hoveredMesh) {
      this.hoveredMesh = null
      this.onHover?.(null)
    }
  }

  clickTest(pointer: THREE.Vector2, camera: THREE.Camera): void {
    this.raycaster.setFromCamera(pointer, camera)
    const intersects = this.raycaster.intersectObjects(this.pinMeshes)
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      const landmark = this.landmarkMap.get(mesh)
      if (landmark) this.onClick?.(landmark)
    }
  }

  /**
   * Hide landmarks on the far side of the globe by checking the dot product
   * between the landmark's world-space normal and the camera direction.
   */
  updateVisibility(camera: THREE.Camera): void {
    for (let i = 0; i < this.pinMeshes.length; i++) {
      const pin = this.pinMeshes[i]
      const label = this.labelObjects[i]
      const normal = this.normals[i]

      // Get world position of the pin and compute direction to camera
      pin.getWorldPosition(this._worldPos)
      this._camDir.copy(camera.position).sub(this._worldPos).normalize()

      // Transform the local normal into world space (account for marsGroup rotation)
      const worldNormal = normal.clone().applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()))

      const dot = worldNormal.dot(this._camDir)
      const visible = dot > 0.05 // small threshold to hide at grazing angles

      pin.visible = visible
      label.visible = visible
    }
  }

  update(_elapsed: number): void {}

  dispose(): void {
    this.pinGeometry?.dispose()
    for (const mesh of this.pinMeshes) {
      ;(mesh.material as THREE.MeshBasicMaterial).dispose()
    }
  }
}
