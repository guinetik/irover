export interface ArchivedVent {
  archiveId: string
  siteId: string
  ventType: 'co2' | 'methane'
  placedSol: number
  /** World position where the vent GLB should be placed on restore. */
  x: number
  z: number
  /** kg of gas accumulated since deploy. Undefined until first dock. */
  storedKg?: number
  /** Sol at which storedKg was last calculated. Defaults to placedSol on first dock. */
  lastChargedSol?: number
}
