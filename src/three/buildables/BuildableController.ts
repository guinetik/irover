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
  readonly footprint: BuildableFootprint
  readonly features: string[]
  readonly isRoverInside: boolean

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
