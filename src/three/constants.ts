export const MARS_RADIUS_KM = 3389.5
export const MARS_OBLIQUITY_DEG = 25.19
export const MARS_OBLIQUITY_RAD = MARS_OBLIQUITY_DEG * Math.PI / 180

export const GLOBE_RADIUS = 10
export const GLOBE_SEGMENTS = 64
export const ATMOSPHERE_RADIUS = GLOBE_RADIUS * 1.008
export const STAR_SPHERE_RADIUS = GLOBE_RADIUS * 80

export const CAMERA_FOV = 45
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = STAR_SPHERE_RADIUS * 2
export const CAMERA_MIN_DISTANCE = GLOBE_RADIUS * 1.2
export const CAMERA_MAX_DISTANCE = GLOBE_RADIUS * 4
export const CAMERA_DEFAULT_DISTANCE = GLOBE_RADIUS * 2.8

export const AUTO_ROTATE_SPEED = 0.3
export const AUTO_ROTATE_RESUME_DELAY = 3000

export const FLY_TO_DURATION = 1.5
export const FLY_TO_DISTANCE = GLOBE_RADIUS * 1.6

export const ATMOSPHERE_COLOR: [number, number, number] = [0.8, 0.35, 0.1]
export const ATMOSPHERE_FRESNEL_POWER = 5.0

export const TILE_SERVICE_BASE = 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile'
export const TILE_SIZE = 512
export const TILE_BASE_ZOOM = 3

export const LANDMARK_COLORS: Record<string, string> = {
  'landing-site': '#4fc3f7',
  volcano: '#ff7043',
  canyon: '#ab47bc',
  basin: '#66bb6a',
  plain: '#ffca28',
  'polar-cap': '#e0e0e0',
}
