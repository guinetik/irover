import type { Ref } from 'vue'
import { resolveRandomOrbitalDropPosition } from '@/lib/orbitalDropSpawn'
import { getInventoryItemDef } from '@/types/inventory'
import { isOrbitalDropItemId, listOrbitalDropItemIds } from '@/types/orbitalDrop'
import type { useOrbitalDrops } from '@/composables/useOrbitalDrops'
import type SampleToast from '@/components/SampleToast.vue'
import type { SiteFrameContext, SiteTickHandler } from './SiteFrameContext'

export interface OrbitalDropTickCallbacks {
  orbitalDrops: ReturnType<typeof useOrbitalDrops>
  sampleToastRef: Ref<InstanceType<typeof SampleToast> | null>
  roverWorldX: Ref<number>
  roverWorldZ: Ref<number>
  upsertPoi: (poi: { id: string; label: string; x: number; z: number; color: string }) => void
  removePoi: (id: string) => void
  setFocusPoi: (id: string | null) => void
  focusPoiId: Ref<string | null>
}

export interface OrbitalDropTickHandler extends SiteTickHandler {
  /**
   * Spawns a specific orbital-drop item near the rover.
   * @throws If the scene is not ready or `itemId` is not a valid orbital-drop item.
   */
  spawnOrbitalDropItem(
    fctx: SiteFrameContext,
    itemId: string,
    options?: { x?: number; z?: number; quantity?: number },
  ): string
  /** Spawns a random orbital-drop component item near the rover. */
  spawnRandomOrbitalDrop(
    fctx: SiteFrameContext,
    options?: { x?: number; z?: number; quantity?: number },
  ): string
}

/**
 * Creates a tick handler for orbital supply drops:
 * - Drop update physics and rover proximity detection
 * - Landed-drop POI placement and toast notifications
 * - Opened-drop inventory application, POI cleanup, and error feedback
 * - Spawn helpers for debug API and gameplay triggers
 */
export function createOrbitalDropTickHandler(
  callbacks: OrbitalDropTickCallbacks,
): OrbitalDropTickHandler {
  const {
    orbitalDrops, sampleToastRef, roverWorldX, roverWorldZ,
    upsertPoi, removePoi, setFocusPoi, focusPoiId,
  } = callbacks

  function resolvePosition(options?: { x?: number; z?: number }): { x: number; z: number } {
    return {
      x: options?.x ?? roverWorldX.value + 18,
      z: options?.z ?? roverWorldZ.value - 12,
    }
  }

  function spawnOrbitalDropItem(
    fctx: SiteFrameContext,
    itemId: string,
    options?: { x?: number; z?: number; quantity?: number },
  ): string {
    if (!fctx.siteScene) throw new Error('Site scene not ready.')
    if (!isOrbitalDropItemId(itemId)) {
      throw new Error(`Orbital drops currently support component items only: ${itemId}`)
    }
    const quantity = Math.max(1, Math.floor(options?.quantity ?? 1))
    const position = resolvePosition(options)
    const id = orbitalDrops.spawnDrop(fctx.siteScene.scene, {
      itemStacks: [{ itemId, quantity }],
      position,
      heightAt: (x, z) => fctx.siteScene!.terrain.heightAt(x, z),
    })
    sampleToastRef.value?.showPayloadStatus('Payload inbound')
    return id
  }

  function spawnRandomOrbitalDrop(
    fctx: SiteFrameContext,
    options?: { x?: number; z?: number; quantity?: number },
  ): string {
    const itemIds = listOrbitalDropItemIds()
    const itemId = itemIds[Math.floor(Math.random() * itemIds.length)]
    const position = resolveRandomOrbitalDropPosition(
      { x: roverWorldX.value, z: roverWorldZ.value },
      { x: options?.x, z: options?.z },
    )
    return spawnOrbitalDropItem(fctx, itemId, {
      ...options,
      x: position.x,
      z: position.z,
    })
  }

  function tick(fctx: SiteFrameContext): void {
    const { siteScene, sceneDelta } = fctx

    if (siteScene.rover) {
      orbitalDrops.updateDrops(sceneDelta, siteScene.rover.position)
    }

    if (orbitalDrops.lastLandedDrop.value) {
      const landed = orbitalDrops.lastLandedDrop.value
      upsertPoi({
        id: landed.id,
        label: 'Payload box',
        x: landed.position.x,
        z: landed.position.z,
        color: '#ffd27a',
      })
      setFocusPoi(landed.id)
      sampleToastRef.value?.showPayloadStatus('Payload landed')
      orbitalDrops.lastLandedDrop.value = null
    }

    if (orbitalDrops.lastOpenedDrop.value) {
      const opened = orbitalDrops.lastOpenedDrop.value
      for (const applied of opened.applied) {
        const itemDef = getInventoryItemDef(applied.itemId)
        sampleToastRef.value?.showPayloadItem(itemDef?.label ?? applied.itemId, applied.quantity)
      }
      if (opened.ok) {
        removePoi(opened.dropId)
        if (focusPoiId.value === opened.dropId) setFocusPoi(null)
      } else {
        sampleToastRef.value?.showError('Cargo full — payload retained')
        setFocusPoi(opened.dropId)
      }
      orbitalDrops.lastOpenedDrop.value = null
    }
  }

  function dispose(): void {
    // No owned resources — orbitalDrops.disposeAllDrops() called by orchestrator
  }

  return { tick, dispose, spawnOrbitalDropItem, spawnRandomOrbitalDrop }
}
