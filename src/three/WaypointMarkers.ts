import * as THREE from 'three'

/**
 * 3D waypoint markers placed on the terrain for go-to mission objectives.
 * Each marker is a glowing vertical beam with a pulsing ring at the base.
 */

const BEAM_HEIGHT = 18
const BEAM_CORE_RADIUS = 0.18
const BEAM_GLOW_RADIUS = 0.55
const RING_RADIUS = 1.5
const RING_TUBE = 0.08
const MARKER_COLOR = 0x66ffee

interface WaypointMarker {
  id: string
  group: THREE.Group
}

const markers: WaypointMarker[] = []

/**
 * Build a translucent additive beam material that reads like projected light.
 */
function createBeamMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/**
 * Create the mesh group for a waypoint marker.
 */
function createMarkerMesh(color: number = MARKER_COLOR): THREE.Group {
  const group = new THREE.Group()

  // Layer the beam so it reads as a bright core inside a soft glow.
  const beamCoreGeo = new THREE.CylinderGeometry(
    BEAM_CORE_RADIUS * 0.7,
    BEAM_CORE_RADIUS,
    BEAM_HEIGHT,
    10,
    1,
    true,
  )
  const beamCore = new THREE.Mesh(beamCoreGeo, createBeamMaterial(color, 0.72))
  beamCore.name = 'beamCore'
  beamCore.position.y = BEAM_HEIGHT / 2
  group.add(beamCore)

  const beamGlowGeo = new THREE.CylinderGeometry(
    BEAM_GLOW_RADIUS * 0.45,
    BEAM_GLOW_RADIUS,
    BEAM_HEIGHT * 1.08,
    12,
    1,
    true,
  )
  const beamGlow = new THREE.Mesh(beamGlowGeo, createBeamMaterial(color, 0.22))
  beamGlow.name = 'beamGlow'
  beamGlow.position.y = (BEAM_HEIGHT * 1.08) / 2
  group.add(beamGlow)

  // Base ring
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, 32)
  const ringMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
  })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.name = 'ring'
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
  diamond.name = 'diamond'
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
    const ring = marker.group.getObjectByName('ring') as THREE.Mesh | undefined
    if (ring) {
      ring.scale.setScalar(0.9 + pulse * 0.2)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.4 + pulse * 0.4
    }

    const beamCore = marker.group.getObjectByName('beamCore') as THREE.Mesh | undefined
    if (beamCore) {
      ;(beamCore.material as THREE.MeshBasicMaterial).opacity = 0.55 + pulse * 0.22
    }

    const beamGlow = marker.group.getObjectByName('beamGlow') as THREE.Mesh | undefined
    if (beamGlow) {
      beamGlow.scale.setScalar(0.95 + pulse * 0.1)
      ;(beamGlow.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.12
    }

    const diamond = marker.group.getObjectByName('diamond') as THREE.Mesh | undefined
    if (diamond) {
      diamond.rotation.y = elapsed * 2
      diamond.position.y = BEAM_HEIGHT + 0.6 + Math.sin(elapsed * 2) * 0.3
    }
  }
}
