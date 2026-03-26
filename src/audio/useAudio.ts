import { AudioManager } from './AudioManager'

let sharedAudioManager: AudioManager | null = null

/**
 * Returns the shared {@link AudioManager} instance (singleton for the app lifetime).
 */
export function useAudio(): AudioManager {
  if (!sharedAudioManager) {
    sharedAudioManager = new AudioManager()
  }
  return sharedAudioManager
}

/**
 * Clears the shared manager reference (for unit tests only).
 */
export function resetAudioForTests(): void {
  sharedAudioManager = null
}
