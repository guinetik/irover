/**
 * Shared mast orientation state — MastCam and ChemCam both aim via the
 * same physical mast, so pan/tilt/fov persist across instrument switches.
 */
export const mastState = {
  panAngle: 0,
  tiltAngle: 0,
  fov: 50,
}
