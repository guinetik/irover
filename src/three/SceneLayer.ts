import type * as THREE from 'three'

export interface SceneLayer {
  readonly root: THREE.Object3D
  init(): Promise<void>
  update(elapsed: number): void
  dispose(): void
}
