/**
 * Site terrain identity and geology knobs shared by generators, REMS, Golombek rocks, etc.
 */

export type TerrainFeatureType =
  | 'volcano'
  | 'canyon'
  | 'basin'
  | 'plain'
  | 'polar-cap'
  | 'landing-site'

export interface TerrainParams {
  roughness: number
  craterDensity: number
  dustCover: number
  elevation: number
  /** Raw site elevation in km relative to Mars datum. */
  elevationKm: number
  ironOxide: number
  basalt: number
  seed: number
  siteId: string
  featureType: TerrainFeatureType
  waterIceIndex: number
  silicateIndex: number
  temperatureMaxK: number
  temperatureMinK: number
  /** Landmark latitude in degrees (-90..90) */
  latDeg?: number
  /** Landmark longitude in degrees (-180..180, east-positive) */
  lonDeg?: number
}
