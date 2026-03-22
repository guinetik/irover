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
  diameterKm?: number
  elevationKm?: number
}

export type Landmark = LandingSite | GeologicalFeature

export interface LandmarkHoverEvent {
  landmark: Landmark
  screenX: number
  screenY: number
}
