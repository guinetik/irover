import * as THREE from 'three'

/**
 * 3D waypoint markers placed on the terrain for go-to mission objectives.
 * Each marker is a glowing vertical beam with a pulsing ring at the base.
 */

const BEAM_HEIGHT = 12
const BEAM_RADIUS = 0.15
const RING_RADIUS = 1.5
const RING_TUBE = 0.08
const MARKER_COLOR = 0x66ffee

interface WaypointMarker {
  id: string
  group: THREE.Group
}

const markers: WaypointMarker[] = []

function createMarkerMesh(color: number = MARKER_COLOR): THREE.Group {
  const group = new THREE.Group()

  // Vertical beam
  const beamGeo = new THREE.CylinderGeometry(BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 8)
  const beamMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.position.y = BEAM_HEIGHT / 2
  group.add(beam)

  // Base ring
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.1
  group.add(ring)

  // Top diamond
  const diamondGeo = new THREE.OctahedronGeometry(0.4, 0)
  const diamondMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
  })
  const diamond = new THREE.Mesh(diamondGeo, diamondMat)
  diamond.position.y = BEAM_HEIGHT + 0.6
  group.add(diamond)

  return group
}

/**
 * Add a waypoint marker to the scene at the given world position.
 */
export function addWaypointMarker(
  id: string,
  x: number,
  z: number,
  groundY: number,
  scene: THREE.Scene,
  color?: number,
): void {
  // Don't duplicate
  if (markers.find((m) => m.id === id)) return

  const group = createMarkerMesh(color)
  group.position.set(x, groundY, z)
  scene.add(group)
  markers.push({ id, group })
}

/**
 * Remove a specific waypoint marker by id.
 */
export function removeWaypointMarker(id: string, scene: THREE.Scene): void {
  const idx = markers.findIndex((m) => m.id === id)
  if (idx === -1) return
  const marker = markers[idx]
  scene.remove(marker.group)
  marker.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (child.material instanceof THREE.Material) child.material.dispose()
    }
  })
  markers.splice(idx, 1)
}

/**
 * Remove all waypoint markers.
 */
export function clearWaypointMarkers(scene: THREE.Scene): void {
  for (const marker of markers) {
    scene.remove(marker.group)
    marker.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
  }
  markers.length = 0
}

const ARRIVAL_COLOR = new THREE.Color(0xffcc44) // gold when arriving
const BASE_COLOR = new THREE.Color(MARKER_COLOR)
const lerpColor = new THREE.Color()

/**
 * Transition a marker's color based on dwell progress (0 = cyan, 1 = gold).
 */
export function setWaypointMarkerProgress(id: string, progress: number): void {
  const marker = markers.find((m) => m.id === id)
  if (!marker) return
  lerpColor.copy(BASE_COLOR).lerp(ARRIVAL_COLOR, progress)
  marker.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshBasicMaterial
      mat.color.copy(lerpColor)
    }
  })
}

/**
 * Animate markers (call each frame). Pulses the ring and rotates the diamond.
 */
export function updateWaypointMarkers(elapsed: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3)
  for (const marker of markers) {
    const ring = marker.group.children[1] as THREE.Mesh
    if (ring) {
      ring.scale.setScalar(0.9 + pulse * 0.2)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.4
    }
    const diamond = marker.group.children[2] as THREE.Mesh
    if (diamond) {
      diamond.rotation.y = elapsed * 2
      diamond.position.y = BEAM_HEIGHT + 0.6 + Math.sin(elapsed * 2) * 0.3
    }
  }
}
