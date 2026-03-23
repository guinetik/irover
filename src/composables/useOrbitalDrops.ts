import * as THREE from 'three'
import { computed, ref, shallowRef } from 'vue'
import type {
  AddComponentsBatchResult,
  InventoryBatchFailure,
  InventoryComponentGrant,
} from './useInventory'
import { OrbitalDropController } from '@/three/orbitalDrop/OrbitalDropController'
import type {
  OrbitalDropRequest,
  OrbitalDropState,
  OrbitalDropStatus,
} from '@/types/orbitalDrop'

const INTERACTION_RANGE = 4

interface SpawnOrbitalDropRequest extends OrbitalDropRequest {
  heightAt: (x: number, z: number) => number
}

interface ManagedOrbitalDrop extends OrbitalDropState {
  controller: OrbitalDropController
  landingAnnounced: boolean
}

export interface OrbitalDropOpenResult {
  dropId: string
  ok: boolean
  applied: InventoryComponentGrant[]
  failed: InventoryBatchFailure[]
}

const activeDrops = shallowRef<ManagedOrbitalDrop[]>([])
const nearbyDropId = ref<string | null>(null)
const lastLandedDrop = ref<OrbitalDropState | null>(null)
const lastOpenedDrop = ref<OrbitalDropOpenResult | null>(null)
let nextDropId = 1

/**
 * Singleton orbital-drop runtime for payload actors, proximity, and open results.
 */
export function useOrbitalDrops() {
  const nearbyDrop = computed(() =>
    activeDrops.value.find((drop) => drop.id === nearbyDropId.value) ?? null,
  )

  /**
   * Spawns a new orbital payload actor into the provided scene.
   */
  function spawnDrop(scene: THREE.Scene, request: SpawnOrbitalDropRequest): string {
    const id = `orbital-drop-${nextDropId++}`
    const controller = new OrbitalDropController(scene, {
      id,
      position: request.position,
      heightAt: request.heightAt,
    })
    controller.start()
    activeDrops.value = [
      ...activeDrops.value,
      {
        id,
        itemStacks: request.itemStacks.map((stack) => ({ ...stack })),
        position: { ...request.position },
        status: 'descending',
        controller,
        landingAnnounced: false,
      },
    ]
    return id
  }

  /**
   * Advances all active drops and updates the nearest interactable payload.
   */
  function updateDrops(deltaSec: number, roverPosition: THREE.Vector3): void {
    let nearestId: string | null = null
    let nearestDistSq = Infinity
    const next = [...activeDrops.value]

    for (const drop of next) {
      drop.controller.update(deltaSec)
      drop.status = drop.controller.status as OrbitalDropStatus
      if (drop.status === 'landed' && !drop.landingAnnounced) {
        drop.landingAnnounced = true
        lastLandedDrop.value = snapshotDrop(drop)
      }
      if (drop.status !== 'landed') continue
      const dx = roverPosition.x - drop.position.x
      const dz = roverPosition.z - drop.position.z
      const distSq = dx * dx + dz * dz
      if (distSq <= INTERACTION_RANGE * INTERACTION_RANGE && distSq < nearestDistSq) {
        nearestId = drop.id
        nearestDistSq = distSq
      }
    }

    activeDrops.value = next
    nearbyDropId.value = nearestId
  }

  /**
   * Opens one landed payload and applies its remaining item stacks.
   */
  function openDrop(
    dropId: string,
    transfer: (itemStacks: InventoryComponentGrant[]) => AddComponentsBatchResult,
  ): OrbitalDropOpenResult | null {
    const drop = activeDrops.value.find((entry) => entry.id === dropId)
    if (!drop || drop.status !== 'landed') return null

    const result = transfer(drop.itemStacks)
    lastOpenedDrop.value = {
      dropId,
      ok: result.ok,
      applied: result.applied,
      failed: result.failed,
    }

    if (result.failed.length === 0) {
      drop.controller.open()
      drop.controller.dispose()
      activeDrops.value = activeDrops.value.filter((entry) => entry.id !== dropId)
      if (nearbyDropId.value === dropId) nearbyDropId.value = null
      return lastOpenedDrop.value
    }

    drop.itemStacks = result.failed.map((failure) => ({
      itemId: failure.itemId,
      quantity: failure.quantity,
    }))
    return lastOpenedDrop.value
  }

  /**
   * Clears one-shot landing/open events after the UI consumes them.
   */
  function clearEvents(): void {
    lastLandedDrop.value = null
    lastOpenedDrop.value = null
  }

  /**
   * Disposes all active payload actors and clears runtime state.
   */
  function disposeAllDrops(): void {
    resetOrbitalDropsForTests()
  }

  return {
    activeDrops,
    nearbyDropId,
    nearbyDrop,
    lastLandedDrop,
    lastOpenedDrop,
    spawnDrop,
    updateDrops,
    openDrop,
    clearEvents,
    disposeAllDrops,
  }
}

/**
 * Test-only reset for the singleton orbital-drop runtime.
 */
export function resetOrbitalDropsForTests(): void {
  for (const drop of activeDrops.value) {
    drop.controller.dispose()
  }
  activeDrops.value = []
  nearbyDropId.value = null
  lastLandedDrop.value = null
  lastOpenedDrop.value = null
  nextDropId = 1
}

/**
 * Creates a serializable view of drop state without the Three.js controller.
 */
function snapshotDrop(drop: ManagedOrbitalDrop): OrbitalDropState {
  return {
    id: drop.id,
    itemStacks: drop.itemStacks.map((stack) => ({ ...stack })),
    position: { ...drop.position },
    status: drop.status,
  }
}
