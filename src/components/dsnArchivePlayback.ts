import type { AudioPlaybackHandle, AudioPlayOptions } from '@/audio/audioTypes'
import type { AudioSoundId } from '@/audio/audioManifest'
import type { DSNTransmission } from '@/types/dsnArchive'

/**
 * Minimal audio surface needed by DSN archive playback helpers.
 */
export interface DsnArchiveAudioController {
  unlock(): void
  play(soundId: AudioSoundId, options?: AudioPlayOptions): AudioPlaybackHandle
}

/**
 * Starts DSN archive playback from a trusted click event.
 *
 * Plays a short UI response cue first, then starts the dynamic DSN voice log. Returns the voice
 * handle used by the caller for progress UI, or `null` when the selected transmission has no audio.
 *
 * @param audio Shared audio manager facade.
 * @param tx Selected transmission row.
 * @param onEnd Cleanup callback for natural voice completion or load/play failure.
 */
export function startDsnArchivePlayback(
  audio: DsnArchiveAudioController,
  tx: DSNTransmission,
  onEnd: () => void,
): AudioPlaybackHandle | null {
  if (!tx.audioUrl) return null
  audio.unlock()
  audio.play('ui.dsnArchivePlay')
  return audio.play('voice.dsnTransmission', {
    src: tx.audioUrl,
    onEnd,
  })
}
