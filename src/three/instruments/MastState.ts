/**
 * Shared mast orientation state — MastCam and ChemCam both aim via the
 * same physical mast, so pan/tilt/fov persist across instrument switches.
 */
export const mastState = {
  panAngle: 0,
  tiltAngle: 0,
  fov: 50,
  /**
   * Cleared at the start of each `RoverController.update` tick; set when the
   * active mast instrument handles A/D/W/S (or arrows) for pan/tilt.
   */
  actuatorKeysHeld: false,
}

/** Extra watts while mast gimbal motors are slewing (pan/tilt keys held). */
export const MAST_ACTUATOR_HOLD_POWER_W = 9

/**
 * @param keys - Current keyboard set from the rover
 * @returns Whether any mast pan/tilt key is down
 */
export function mastPanTiltKeysHeld(keys: Set<string>): boolean {
  return (
    keys.has('KeyA')
    || keys.has('ArrowLeft')
    || keys.has('KeyD')
    || keys.has('ArrowRight')
    || keys.has('KeyW')
    || keys.has('ArrowUp')
    || keys.has('KeyS')
    || keys.has('ArrowDown')
  )
}
