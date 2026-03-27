import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'

/**
 * Unlocks Howler and plays a manifest UI cue — use from pointer/keyboard handlers so autoplay rules pass.
 */
export function useUiSound() {
  const audio = useAudio()

  /**
   * @param soundId - Registered {@link AudioSoundId}.
   */
  function playUiCue(soundId: AudioSoundId): void {
    audio.unlock()
    audio.play(soundId)
  }

  return { playUiCue, audio }
}
