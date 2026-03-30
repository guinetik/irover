// src/views/site-controllers/DanTickHandler.ts
import type { Ref } from 'vue'
import type { ExtractorDockTarget, ExtractorDockState } from '@/types/extractorDock'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

/**
 * Reactive refs required by the DAN docking/extraction tick handler.
 * These augment the base {@link DanHudRefs} with extractor-dock state.
 */
export interface DanTickRefs {
  danDockEnabled: Ref<boolean>
  pendingExtractorDock: Ref<ExtractorDockState | null>
}

/**
 * Side-effect callbacks required by the DAN docking/extraction tick handler.
 * These augment the base {@link DanHudCallbacks} with extractor-dock operations.
 */
export interface DanTickCallbacks {
  /** Returns all deployed extractors (water + gas) for this site, shaped for proximity checks. */
  getAllExtractorsForSite: (siteId: string) => ExtractorDockTarget[]
  /** Persists updated storedKg/lastChargedSol to the appropriate archive. */
  updateExtractorStorage: (
    archiveId: string,
    archiveType: 'dan' | 'vent',
    storedKg: number,
    lastChargedSol: number,
  ) => void
  /** Deducts watts from RTG currentPowerW (one-time flat cost). */
  deductRTGPower: (watts: number) => void
  /** Adds the extracted fluid item to rover inventory. */
  addInventoryItem: (itemId: string, quantity: number) => void
  /** Plays magnetic docking sound effect. */
  playDockSound: () => void
  /** Sets the DAN Dock toggle in ProfilePanel (called on undock to prevent re-dock). */
  setDanDockEnabled: (enabled: boolean) => void
  /** Returns current mission sol for charge accumulation. */
  getCurrentSol: () => number
}

/**
 * Extended tick handler interface for DAN extractor docking and fluid extraction.
 */
export interface DanTickHandler extends SiteTickHandler {
  /** Extract fluid from currently docked extractor into inventory. */
  extractFromDock(): void
  /** Release rover from docked extractor and disable DAN Dock toggle. */
  undockExtractor(fctx: SiteFrameContext): void
  /** Called by MartianSiteView on each new sol to accumulate charge and persist. */
  onNewSol(sol: number): void
}
