import * as THREE from 'three'

const _dir = new THREE.Vector3()

/**
 * Creates a shadowless directional fill aimed along the view axis (chase cam / forward ground).
 */
export function createCameraFillLight(): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(0xfff2ea, 0.35)
  light.castShadow = false
  light.name = 'CameraFill'
  return light
}

/**
 * Orients the fill from the camera along the view ray and scales intensity by time of day.
 *
 * @param light - Fill light; `light.target` must be in the scene graph
 * @param camera - Player camera after position/orientation updates
 * @param nightFactor - 0 = day, 1 = night (MarsSky); stronger fill when the sun is gone
 */
export function syncCameraFillLight(
  light: THREE.DirectionalLight,
  camera: THREE.PerspectiveCamera,
  nightFactor: number,
): void {
  camera.getWorldDirection(_dir)
  light.position.copy(camera.position)
  light.target.position.copy(camera.position).addScaledVector(_dir, 45)
  light.target.updateMatrixWorld()
  light.intensity = 0.22 + nightFactor * 0.36
}
