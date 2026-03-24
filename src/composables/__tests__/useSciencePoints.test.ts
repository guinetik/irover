import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useSciencePoints, resetSciencePointsForTests, devAwardSciencePoints } from '../useSciencePoints'

describe('useSciencePoints ledger', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    resetSciencePointsForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('appends one ledger row when award succeeds', () => {
    const { award, spLedger, totalSP } = useSciencePoints()
    const gain = award('mastcam', 'rock-a', 'Basalt A')
    expect(gain).not.toBeNull()
    expect(spLedger.value).toHaveLength(1)
    expect(spLedger.value[0]?.source).toBe('mastcam')
    expect(spLedger.value[0]?.detail).toBe('Basalt A')
    expect(spLedger.value[0]?.amount).toBe(totalSP.value)
  })

  it('does not append ledger when award is duplicate for same rock', () => {
    const { award, spLedger } = useSciencePoints()
    expect(award('mastcam', 'rock-a', 'Basalt A')).not.toBeNull()
    expect(award('mastcam', 'rock-a', 'Basalt A')).toBeNull()
    expect(spLedger.value).toHaveLength(1)
  })

  it('awardDAN appends detail to ledger', () => {
    const { awardDAN, spLedger } = useSciencePoints()
    awardDAN('DAN prospect complete')
    expect(spLedger.value).toHaveLength(1)
    expect(spLedger.value[0]?.source).toBe('dan')
    expect(spLedger.value[0]?.detail).toBe('DAN prospect complete')
  })

  it('awardAck appends when readout is new', () => {
    const { awardAck, spLedger } = useSciencePoints()
    expect(awardAck('readout-1', 'Rock X')).not.toBeNull()
    expect(spLedger.value).toHaveLength(1)
    expect(spLedger.value[0]?.source).toBe('chemcam-ack')
    expect(awardAck('readout-1', 'Rock X')).toBeNull()
    expect(spLedger.value).toHaveLength(1)
  })

  it('awardSurvival appends survival source to ledger', () => {
    const { awardSurvival, spLedger } = useSciencePoints()
    const gain = awardSurvival('FIRST SOL', 25)
    expect(gain.source).toBe('survival')
    expect(spLedger.value[0]?.source).toBe('survival')
    expect(spLedger.value[0]?.detail).toBe('FIRST SOL')
  })

  it('devAwardSciencePoints appends flat amount without spYield', () => {
    const { spLedger, totalSP, sessionSP } = useSciencePoints()
    const gain = devAwardSciencePoints(100)
    expect(gain?.amount).toBe(100)
    expect(gain?.source).toBe('dev')
    expect(totalSP.value).toBe(100)
    expect(sessionSP.value).toBe(100)
    expect(spLedger.value[0]?.source).toBe('dev')
    expect(spLedger.value[0]?.detail).toBe('Console grant')
  })

  it('devAwardSciencePoints returns null for invalid amount', () => {
    expect(devAwardSciencePoints(0)).toBeNull()
    expect(devAwardSciencePoints(-1)).toBeNull()
    expect(devAwardSciencePoints(Number.NaN)).toBeNull()
  })
})
