const STORAGE_KEY = 'mars.sitePostProcessing'

/**
 * Parses a string flag into enabled/disabled, or null if unrecognized.
 */
function parsePostFxFlag(value: string | null | undefined): boolean | null {
  if (value == null || value === '') return null
  const v = value.trim().toLowerCase()
  if (['0', 'false', 'off', 'no'].includes(v)) return false
  if (['1', 'true', 'on', 'yes'].includes(v)) return true
  return null
}

/** localStorage key for persistent Martian site post-processing toggle. */
export const SITE_POST_PROCESSING_STORAGE_KEY = STORAGE_KEY

/**
 * Whether the Martian site view runs EffectComposer with the dust-atmosphere pass.
 *
 * Precedence: URL `postfx` query → `VITE_SITE_POST_PROCESSING` env →
 * localStorage {@link SITE_POST_PROCESSING_STORAGE_KEY} → default `true`.
 *
 * Examples: `?postfx=0`, `.env` `VITE_SITE_POST_PROCESSING=false`,
 * `localStorage.setItem('mars.sitePostProcessing', '0')`.
 */
export function isSitePostProcessingEnabled(): boolean {
  if (typeof window === 'undefined') return true

  const fromUrl = parsePostFxFlag(new URLSearchParams(window.location.search).get('postfx'))
  if (fromUrl !== null) return fromUrl

  const env = import.meta.env.VITE_SITE_POST_PROCESSING as string | undefined
  const fromEnv = parsePostFxFlag(env)
  if (fromEnv !== null) return fromEnv

  try {
    const fromStorage = parsePostFxFlag(localStorage.getItem(STORAGE_KEY))
    if (fromStorage !== null) return fromStorage
  } catch {
    // ignore (e.g. private mode)
  }

  return true
}
