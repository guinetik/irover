export interface LandmarkBase {
  id: string
  name: string
  lat: number
  lon: number
  description: string
  accent: string
}

export interface LandingSite extends LandmarkBase {
  type: 'landing-site'
  mission: string
  agency: string
  year: number
  status: 'operational' | 'completed' | 'failed' | 'lost'
}

export interface GeologicalFeature extends LandmarkBase {
  type: 'geological'
  featureType: 'volcano' | 'canyon' | 'basin' | 'plain' | 'polar-cap'

  // Dimensions
  diameterKm: number
  elevationKm: number

  // Atmosphere at surface level
  surfacePressureMbar: number
  temperatureMinK: number
  temperatureMaxK: number

  // Resource indicators (0.0 - 1.0 normalized)
  waterIceIndex: number
  ironOxideIndex: number
  silicateIndex: number
  basaltIndex: number

  // Terrain characteristics (0.0 - 1.0 normalized)
  roughness: number
  dustCover: number
  craterDensity: number

  // Classification
  geologicalAge: 'noachian' | 'hesperian' | 'amazonian'
}

export type Landmark = LandingSite | GeologicalFeature

export interface LandmarkHoverEvent {
  landmark: Landmark
  screenX: number
  screenY: number
}
