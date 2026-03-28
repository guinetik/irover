export interface LandmarkBase {
  id: string
  name: string
  lat: number
  lon: number
  description: string
  accent: string
  tier: 1 | 2 | 3
  radiationIndex: number
  meteorRisk: number
}

/** Geological fields shared by both landmark types. */
export interface GeologicalData {
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap'
  diameterKm: number
  elevationKm: number
  surfacePressureMbar: number
  temperatureMinK: number
  temperatureMaxK: number
  waterIceIndex: number
  ironOxideIndex: number
  silicateIndex: number
  basaltIndex: number
  roughness: number
  dustCover: number
  craterDensity: number
  geologicalAge: 'noachian' | 'hesperian' | 'amazonian'
}

export interface LandingSite extends LandmarkBase, GeologicalData {
  type: 'landing-site'
  mission: string
  agency: string
  year: number
  status: 'operational' | 'completed' | 'failed' | 'lost'
}

export interface GeologicalFeature extends LandmarkBase, GeologicalData {
  type: 'geological'
}

export type Landmark = LandingSite | GeologicalFeature

export interface LandmarkHoverEvent {
  landmark: Landmark
  screenX: number
  screenY: number
}
