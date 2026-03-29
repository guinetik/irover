export interface ArchivedVent {
  archiveId: string
  siteId: string
  ventType: 'co2' | 'methane'
  placedSol: number
  /** World position where the vent GLB should be placed on restore. */
  x: number
  z: number
}
