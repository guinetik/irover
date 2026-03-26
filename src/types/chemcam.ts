/**
 * ChemCam LIBS spectrum line — shared by {@link ChemCamController}, archive, and UI.
 */
export interface SpectrumPeak {
  /** Wavelength in nm (e.g. 380–780). */
  wavelength: number
  /** Normalized intensity 0–1. */
  intensity: number
  /** Element symbol, e.g. `Fe`, or `??` when unresolved. */
  element: string
}
