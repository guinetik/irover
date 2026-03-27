import { describe, expect, it, vi } from 'vitest'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import type { DSNTransmission } from '@/types/dsnArchive'
import { startDsnArchivePlayback } from '../dsnArchivePlayback'

function makeHandle(soundId: string): AudioPlaybackHandle {
  return {
    soundId,
    stop: vi.fn(),
    playing: () => true,
    progress: () => 0,
    duration: () => 0,
    setVolume: vi.fn(),
  }
}

function makeTransmission(audioUrl?: string): DSNTransmission {
  return {
    id: 'TX-001',
    category: 'colonist',
    frequencyMHz: 145.8,
    date: '2037-04-12',
    sender: 'Vasquez',
    senderKey: 'vasquez',
    body: 'Test body',
    audioUrl,
    rarity: 'common',
    sortOrder: 1,
  }
}

describe('startDsnArchivePlayback', () => {
  it('plays the archive click cue before starting DSN voice playback', () => {
    const cueHandle = makeHandle('ui.dsnArchivePlay')
    const voiceHandle = makeHandle('voice.dsnTransmission')
    const play = vi.fn()
      .mockReturnValueOnce(cueHandle)
      .mockReturnValueOnce(voiceHandle)
    const audio = {
      unlock: vi.fn(),
      play,
    }

    const handle = startDsnArchivePlayback(audio, makeTransmission('/logs/test.mp3'), vi.fn())

    expect(audio.unlock).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenNthCalledWith(1, 'ui.dsnArchivePlay')
    expect(play).toHaveBeenNthCalledWith(2, 'voice.dsnTransmission', {
      src: '/logs/test.mp3',
      onEnd: expect.any(Function),
    })
    expect(handle).toBe(voiceHandle)
  })

  it('does nothing when the transmission has no audio url', () => {
    const audio = {
      unlock: vi.fn(),
      play: vi.fn(),
    }

    const handle = startDsnArchivePlayback(audio, makeTransmission(), vi.fn())

    expect(audio.unlock).not.toHaveBeenCalled()
    expect(audio.play).not.toHaveBeenCalled()
    expect(handle).toBeNull()
  })
})
