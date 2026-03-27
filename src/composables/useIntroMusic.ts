import { watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAudio } from '@/audio/useAudio'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'

const FADE_DURATION_MS = 2000
const FADE_STEPS = 40

let introHandle: AudioPlaybackHandle | null = null
let fadeInterval: ReturnType<typeof setInterval> | null = null
let started = false

function isSiteRoute(path: string): boolean {
  return path.startsWith('/site/')
}

function startIntro(): void {
  if (introHandle) return
  const audio = useAudio()
  audio.unlock()
  introHandle = audio.play('music.intro' as AudioSoundId, { loop: true })
  started = true
}

function fadeOutAndStop(): void {
  if (!introHandle || fadeInterval) return
  const handle = introHandle
  let step = 0
  const stepMs = FADE_DURATION_MS / FADE_STEPS
  fadeInterval = setInterval(() => {
    step++
    const vol = Math.max(0, 1 - step / FADE_STEPS)
    handle.setVolume(vol * 0.4) // 0.4 is the manifest base volume
    if (step >= FADE_STEPS) {
      clearInterval(fadeInterval!)
      fadeInterval = null
      handle.stop()
      introHandle = null
      started = false
    }
  }, stepMs)
}

/**
 * Manages intro/menu music lifecycle. Call once from App.vue.
 * Plays `music.intro` in a loop on non-site routes, fades out when entering a site.
 */
export function useIntroMusic(): void {
  const route = useRoute()

  watch(
    () => route.path,
    (path) => {
      if (isSiteRoute(path)) {
        if (introHandle) fadeOutAndStop()
      } else {
        if (!started && !introHandle) startIntro()
      }
    },
    { immediate: true },
  )
}
