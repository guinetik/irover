import { describe, expect, it } from 'vitest'
import { getExitedActiveInstrumentSoundIds } from '../MarsSiteViewController'

describe('getExitedActiveInstrumentSoundIds', () => {
  it('returns owned drill sounds when drill leaves active mode', () => {
    expect(
      getExitedActiveInstrumentSoundIds(
        { mode: 'active', instrumentId: 'drill' },
        { mode: 'instrument', instrumentId: 'drill' },
      ),
    ).toEqual(['sfx.drillStart', 'sfx.mastMove'])
  })

  it('returns an empty list when the same active instrument stays active', () => {
    expect(
      getExitedActiveInstrumentSoundIds(
        { mode: 'active', instrumentId: 'chemcam' },
        { mode: 'active', instrumentId: 'chemcam' },
      ),
    ).toEqual([])
  })

  it('returns owned mastcam sounds when switching to a different active instrument', () => {
    expect(
      getExitedActiveInstrumentSoundIds(
        { mode: 'active', instrumentId: 'mastcam' },
        { mode: 'active', instrumentId: 'drill' },
      ),
    ).toEqual(['sfx.mastcamTag', 'sfx.cameraMove'])
  })
})
