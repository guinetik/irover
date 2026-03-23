const STORAGE_KEY = 'mars.skipSiteIntro'

/**
 * Parses a string into “skip intro” (true) vs “play intro” (false), or null if unrecognized.
 */
function parseSkipIntroFlag(value: string | null | undefined): boolean | null {
  if (value == null || value === '') return null
  const v = value.trim().toLowerCase()
  if (['0', 'false', 'off', 'no'].includes(v)) return false
  if (['1', 'true', 'on', 'yes'].includes(v)) return true
  return null
}

/** localStorage key: set to `1` / `true` to skip sky-crane + deploy sequence on Martian site load. */
export const SITE_INTRO_SKIP_STORAGE_KEY = STORAGE_KEY

/**
 * When `true`, Martian site load skips descent, touchdown rig, and GLTF deploy animation
 * (rover appears already deployed).
 *
 * Precedence: URL `skipIntro` query → `VITE_SKIP_SITE_INTRO` env →
 * localStorage {@link SITE_INTRO_SKIP_STORAGE_KEY} → default `false` (play intro).
 *
 * Examples: `?skipIntro=1`, `.env` `VITE_SKIP_SITE_INTRO=true`,
 * `localStorage.setItem('mars.skipSiteIntro', '1')`.
 */
export function isSiteIntroSequenceSkipped(): boolean {
  if (typeof window === 'undefined') return false

  const fromUrl = parseSkipIntroFlag(new URLSearchParams(window.location.search).get('skipIntro'))
  if (fromUrl !== null) return fromUrl

  const env = import.meta.env.VITE_SKIP_SITE_INTRO as string | undefined
  const fromEnv = parseSkipIntroFlag(env)
  if (fromEnv !== null) return fromEnv

  try {
    const fromStorage = parseSkipIntroFlag(localStorage.getItem(STORAGE_KEY))
    if (fromStorage !== null) return fromStorage
  } catch {
    // ignore (e.g. private mode)
  }

  return false
}
