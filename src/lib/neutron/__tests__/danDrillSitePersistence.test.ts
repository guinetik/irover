import { describe, it, expect } from 'vitest'
import { findLatestPersistedDanDrillSite } from '@/lib/neutron/danDrillSitePersistence'
import type { ArchivedDANProspect } from '@/types/danArchive'

function row(p: Partial<ArchivedDANProspect> & Pick<ArchivedDANProspect, 'archiveId' | 'siteId'>): ArchivedDANProspect {
  return {
    capturedSol: 1,
    capturedAtMs: 0,
    latitudeDeg: 0,
    longitudeDeg: 0,
    roverWorldX: 0,
    roverWorldZ: 0,
    signalStrength: 0.5,
    quality: 'Moderate',
    waterConfirmed: false,
    reservoirQuality: 0.5,
    queuedForTransmission: false,
    transmitted: false,
    ...p,
  }
}

describe('findLatestPersistedDanDrillSite', () => {
  it('returns null when no water-confirmed rows with drill coords', () => {
    expect(findLatestPersistedDanDrillSite([], 'a')).toBeNull()
    expect(
      findLatestPersistedDanDrillSite(
        [row({ archiveId: '1', siteId: 'a', waterConfirmed: true })],
        'a',
      ),
    ).toBeNull()
  })

  it('picks the newest capturedAtMs for the site', () => {
    const rows: ArchivedDANProspect[] = [
      row({
        archiveId: 'old',
        siteId: 's',
        waterConfirmed: true,
        capturedAtMs: 100,
        drillSiteX: 1,
        drillSiteY: 2,
        drillSiteZ: 3,
        reservoirQuality: 0.4,
        signalStrength: 0.4,
      }),
      row({
        archiveId: 'new',
        siteId: 's',
        waterConfirmed: true,
        capturedAtMs: 200,
        drillSiteX: 4,
        drillSiteY: 5,
        drillSiteZ: 6,
        reservoirQuality: 0.8,
        signalStrength: 0.9,
      }),
    ]
    expect(findLatestPersistedDanDrillSite(rows, 's')).toEqual({
      x: 4,
      y: 5,
      z: 6,
      reservoirQuality: 0.8,
      signalStrength: 0.9,
    })
  })

  it('ignores other sites and non-water rows', () => {
    const rows: ArchivedDANProspect[] = [
      row({
        archiveId: 'w',
        siteId: 'other',
        waterConfirmed: true,
        capturedAtMs: 999,
        drillSiteX: 9,
        drillSiteY: 9,
        drillSiteZ: 9,
        reservoirQuality: 1,
        signalStrength: 1,
      }),
      row({
        archiveId: 'dry',
        siteId: 's',
        waterConfirmed: false,
        capturedAtMs: 500,
        drillSiteX: 1,
        drillSiteY: 1,
        drillSiteZ: 1,
        reservoirQuality: 0,
        signalStrength: 0,
      }),
    ]
    expect(findLatestPersistedDanDrillSite(rows, 's')).toBeNull()
  })
})
