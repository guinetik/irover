import type { TerrainParams } from '@/types/terrain'

/** Orbital map textures grouped by feature type for cross-site blending. */
export const MAP_TEXTURES_BY_TYPE: Record<string, string[]> = {
  volcano: [
    '/olympus-mons.jpg',
    '/ascraeus-mons.jpg',
    '/pavonis-mons.jpg',
    '/elysium-mons.jpg',
  ],
  canyon: ['/valles-marineris.jpg', '/syrtis-major.jpg', '/argyre-basin.jpg'],
  basin: ['/hellas-basin.jpg', '/argyre-basin.jpg', '/utopia-planitia.jpg'],
  plain: [
    '/utopia-planitia.jpg',
    '/acidalia-planitia.jpg',
    '/syrtis-major.jpg',
  ],
  'polar-cap': [
    '/north-polar-cap.jpg',
    '/south-polar-cap.jpg',
    '/utopia-planitia.jpg',
  ],
  'landing-site': [
    '/utopia-planitia.jpg',
    '/acidalia-planitia.jpg',
    '/hellas-basin.jpg',
  ],
}

/**
 * Picks two complementary orbital map textures from the same feature-type pool,
 * excluding the site's own image so detail layers differ from the site texture.
 */
export function pickDetailTextures(p: TerrainParams): [string, string] {
  const own = `/${p.siteId}.jpg`
  const pool = (MAP_TEXTURES_BY_TYPE[p.featureType] ?? MAP_TEXTURES_BY_TYPE.plain).filter(
    (url) => url !== own,
  )
  const i = Math.abs(p.seed) % pool.length
  const j = (i + 1) % pool.length
  return [pool[i], pool[j === i ? (i + 1) % pool.length : j]]
}
