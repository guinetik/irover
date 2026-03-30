import buildablesJson from '../../public/data/buildables.json'

export interface BuildableDoorDef {
  meshName: string
  axis: 'x' | 'y' | 'z'
  openAngle: number
  speed: number
  triggerDistance: number
}

export interface BuildableFootprint {
  x: number
  z: number
}

export interface BuildableDef {
  id: string
  label: string
  desc: string
  image: string
  model: string
  category: string
  placement: 'exterior' | 'interior'
  footprint: BuildableFootprint
  maxPlacementSlope: number
  scale: number
  door?: BuildableDoorDef
  controllerType: string
  inventoryItemId: string
  features: string[]
}

export interface BuildablesFile {
  version: number
  buildables: BuildableDef[]
}

export interface PlacedBuildable {
  id: string
  siteId: string
  position: { x: number; y: number; z: number }
  rotationY: number
}

export interface BuildablesSaveData {
  buildables: PlacedBuildable[]
}

const data = buildablesJson as BuildablesFile

export const BUILDABLE_CATALOG: Record<string, BuildableDef> = {}
for (const b of data.buildables) {
  BUILDABLE_CATALOG[b.id] = b
}

export function getBuildableDef(id: string): BuildableDef | undefined {
  return BUILDABLE_CATALOG[id]
}
