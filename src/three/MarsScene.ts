// src/three/MarsScene.ts
import * as THREE from 'three'
import { MarsGlobe } from './MarsGlobe'
import { MarsAtmosphere } from './MarsAtmosphere'
import { MarsLandmarks } from './MarsLandmarks'
import { BackgroundStars } from './BackgroundStars'
import { MARS_OBLIQUITY_RAD } from './constants'
import type { Landmark } from '@/types/landmark'

export class MarsScene {
  readonly scene: THREE.Scene
  readonly globe: MarsGlobe
  readonly atmosphere: MarsAtmosphere
  readonly landmarks: MarsLandmarks
  readonly stars: BackgroundStars

  constructor(
    landmarkData: Landmark[],
    onTileProgress?: (loaded: number, total: number) => void,
  ) {
    this.scene = new THREE.Scene()

    this.globe = new MarsGlobe(onTileProgress)
    this.atmosphere = new MarsAtmosphere()
    this.landmarks = new MarsLandmarks(landmarkData)
    this.stars = new BackgroundStars()

    // Parent group for all Mars-relative layers — tilted to Mars obliquity.
    // Globe, atmosphere, and landmarks all share this tilt so positions align.
    const marsGroup = new THREE.Group()
    marsGroup.rotation.z = MARS_OBLIQUITY_RAD
    marsGroup.add(this.globe.root)
    marsGroup.add(this.atmosphere.root)
    marsGroup.add(this.landmarks.root)
    this.scene.add(marsGroup)

    // Stars are not tilted — they are scene-global
    this.scene.add(this.stars.root)

    // Lighting
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 3, 4)
    this.scene.add(sunLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    this.scene.add(ambientLight)
  }

  async init(): Promise<void> {
    await Promise.all([
      this.globe.init(),
      this.atmosphere.init(),
      this.landmarks.init(),
      this.stars.init(),
    ])
  }

  update(elapsed: number): void {
    this.globe.update(elapsed)
    this.atmosphere.update(elapsed)
    this.landmarks.update(elapsed)
    this.stars.update(elapsed)
  }

  dispose(): void {
    this.globe.dispose()
    this.atmosphere.dispose()
    this.landmarks.dispose()
    this.stars.dispose()
  }
}
