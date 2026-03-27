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
 * The app also sets this key after landing (see {@link setSiteIntroSequenceSkipped}) when you have a saved site.
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

/**
 * Persist preference to skip the Martian site descent / deploy sequence on future loads.
 *
 * @param skip - When true, writes {@link SITE_INTRO_SKIP_STORAGE_KEY}; when false, removes the key so the default is to play the intro.
 */
export function setSiteIntroSequenceSkipped(skip: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (skip) {
      localStorage.setItem(STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // private mode / quota — ignore
  }
}

/**
 * Clears stored intro-skip preference (e.g. new campaign from character create).
 */
export function clearSiteIntroSequencePreference(): void {
  setSiteIntroSequenceSkipped(false)
}
