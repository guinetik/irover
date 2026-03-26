import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const store: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k])
  },
}

/** Configurable minimal `window` for URL query resolution. */
function stubWindow(search: string) {
  vi.stubGlobal('window', {
    location: { search },
  } as unknown as Window & typeof globalThis)
}

describe('site intro / post-processing flags', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock)
    localStorageMock.clear()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  describe('isSiteIntroSequenceSkipped', () => {
    it('returns false when window is undefined (SSR / node)', async () => {
      vi.unstubAllGlobals()
      const { isSiteIntroSequenceSkipped } = await import('@/lib/siteIntroSequence')
      expect(isSiteIntroSequenceSkipped()).toBe(false)
    })

    it('respects skipIntro query before env and storage', async () => {
      stubWindow('?skipIntro=0&other=1')
      vi.stubEnv('VITE_SKIP_SITE_INTRO', 'true')
      localStorageMock.setItem('mars.skipSiteIntro', '1')
      const { isSiteIntroSequenceSkipped } = await import('@/lib/siteIntroSequence')
      expect(isSiteIntroSequenceSkipped()).toBe(false)
    })

    it('accepts truthy query aliases', async () => {
      stubWindow('?skipIntro=yes')
      const { isSiteIntroSequenceSkipped } = await import('@/lib/siteIntroSequence')
      expect(isSiteIntroSequenceSkipped()).toBe(true)
    })

    it('falls back to env then localStorage', async () => {
      stubWindow('')
      vi.stubEnv('VITE_SKIP_SITE_INTRO', '1')
      const { isSiteIntroSequenceSkipped } = await import('@/lib/siteIntroSequence')
      expect(isSiteIntroSequenceSkipped()).toBe(true)

      vi.unstubAllEnvs()
      localStorageMock.setItem('mars.skipSiteIntro', 'true')
      const mod = await import('@/lib/siteIntroSequence')
      expect(mod.isSiteIntroSequenceSkipped()).toBe(true)
    })

    it('treats unrecognized localStorage as absent (play intro)', async () => {
      stubWindow('')
      localStorageMock.setItem('mars.skipSiteIntro', 'maybe')
      const { isSiteIntroSequenceSkipped } = await import('@/lib/siteIntroSequence')
      expect(isSiteIntroSequenceSkipped()).toBe(false)
    })
  })

  describe('isSitePostProcessingEnabled', () => {
    it('returns true when window is undefined', async () => {
      vi.unstubAllGlobals()
      const { isSitePostProcessingEnabled } = await import('@/lib/sitePostProcessing')
      expect(isSitePostProcessingEnabled()).toBe(true)
    })

    it('respects postfx=0 over env and storage', async () => {
      stubWindow('?postfx=0')
      vi.stubEnv('VITE_SITE_POST_PROCESSING', 'true')
      localStorageMock.setItem('mars.sitePostProcessing', '1')
      const { isSitePostProcessingEnabled } = await import('@/lib/sitePostProcessing')
      expect(isSitePostProcessingEnabled()).toBe(false)
    })

    it('defaults to true when nothing is set', async () => {
      stubWindow('')
      const { isSitePostProcessingEnabled } = await import('@/lib/sitePostProcessing')
      expect(isSitePostProcessingEnabled()).toBe(true)
    })

    it('treats unrecognized localStorage as absent (postfx on)', async () => {
      stubWindow('')
      localStorageMock.setItem('mars.sitePostProcessing', 'foobar')
      const { isSitePostProcessingEnabled } = await import('@/lib/sitePostProcessing')
      expect(isSitePostProcessingEnabled()).toBe(true)
    })
  })
})
