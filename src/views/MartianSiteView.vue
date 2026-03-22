<template>
  <div class="w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div class="site-hud">
      <button class="back-btn" @click="$router.push('/globe')">BACK</button>
      <h2 class="site-name">{{ siteId }}</h2>
    </div>
    <div class="controls-hint">
      WASD to drive &middot; Drag to orbit
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { useMarsData } from '@/composables/useMarsData'
import type { GeologicalFeature } from '@/types/landmark'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'

const route = useRoute()
const siteId = route.params.siteId as string
const canvasRef = ref<HTMLCanvasElement | null>(null)
const { landmarks, loadLandmarks } = useMarsData()
let renderer: THREE.WebGLRenderer | null = null
let camera: THREE.PerspectiveCamera | null = null
let siteScene: SiteScene | null = null
let controller: RoverController | null = null
let clock: THREE.Clock | null = null
let animationId = 0

function getTerrainParams(): TerrainParams {
  const site = landmarks.value.find((l) => l.id === siteId)
  if (site && site.type === 'geological') {
    const geo = site as GeologicalFeature
    return {
      roughness: geo.roughness,
      craterDensity: geo.craterDensity,
      dustCover: geo.dustCover,
      elevation: Math.min(1, Math.max(0, (geo.elevationKm + 8) / 30)),
      ironOxide: geo.ironOxideIndex,
      basalt: geo.basaltIndex,
      seed: hashString(geo.id),
    }
  }
  // Default params for landing sites or unknown
  return {
    roughness: 0.4,
    craterDensity: 0.3,
    dustCover: 0.6,
    elevation: 0.5,
    ironOxide: 0.6,
    basalt: 0.5,
    seed: hashString(siteId),
  }
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 1000 + 1
}

onMounted(async () => {
  const canvas = canvasRef.value
  if (!canvas) return

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.85

  camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    500,
  )

  // Load landmarks so we can derive terrain params from site data
  await loadLandmarks()
  const terrainParams = getTerrainParams()

  siteScene = new SiteScene()
  await siteScene.init(terrainParams)

  if (siteScene.rover) {
    controller = new RoverController(
      siteScene.rover,
      camera,
      canvas,
      (x, z) => siteScene!.terrain.heightAt(x, z),
      (x, z) => siteScene!.terrain.normalAt(x, z),
    )
  }

  clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)
    if (!renderer || !camera || !clock) return

    const delta = clock.getDelta()
    controller?.update(delta)
    renderer.render(siteScene!.scene, camera)
  }
  animate()

  window.addEventListener('resize', onResize)
})

function onResize() {
  const canvas = canvasRef.value
  if (!canvas || !renderer || !camera) return
  camera.aspect = canvas.clientWidth / canvas.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
}

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  controller?.dispose()
  siteScene?.dispose()
  renderer?.dispose()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.site-hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.back-btn {
  padding: 5px 14px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.site-name {
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.controls-hint {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 24px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  pointer-events: none;
}
</style>
