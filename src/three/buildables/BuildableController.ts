// src/three/buildables/BuildableController.ts
import type * as THREE from 'three'
import type { BuildableDef, BuildableFootprint } from '@/types/buildables'

/**
 * Contract for all buildable controllers.
 * Each buildable loads its own model and manages per-frame logic.
 */
export interface BuildableController {
  readonly id: string
  readonly def: BuildableDef
  readonly position: THREE.Vector3
  readonly rotationY: number
  readonly footprint: BuildableFootprint
  readonly features: string[]
  readonly isRoverInside: boolean

  /** True when the rover is close enough to interact (press F). */
  isNearby(roverPosition: THREE.Vector3): boolean
  /** Enter the shelter — sets isRoverInside and returns the center position for teleporting the rover. */
  enter(): THREE.Vector3
  /** Exit the shelter — clears isRoverInside and returns the entrance position for teleporting the rover. */
  exit(): THREE.Vector3
  /** Fixed camera orbit parameters for the interior view. */
  getInteriorCameraOrbit(): { distance: number; pitch: number }
  /** World-space center position of the buildable interior. */
  getCenterPosition(): THREE.Vector3
  /** World-space position just outside the entrance. */
  getEntrancePosition(): THREE.Vector3

  init(scene: THREE.Scene): Promise<void>
  update(roverPosition: THREE.Vector3, dt: number): void
  dispose(): void
}

export type BuildableControllerConstructor = new (
  def: BuildableDef,
  position: THREE.Vector3,
  rotationY: number,
  heightAt: (x: number, z: number) => number,
) => BuildableController
