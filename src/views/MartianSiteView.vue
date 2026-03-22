<template>
  <div class="w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div class="site-hud">
      <button class="back-btn" @click="$router.push('/globe')">BACK</button>
      <h2 class="site-name">{{ siteId }}</h2>
    </div>
    <SiteCompass :heading="roverHeading" />
    <Transition name="deploy-fade">
      <div v-if="descending" class="deploy-overlay" key="descent">
        <div class="deploy-content">
          <div class="deploy-label descent-label">SKY CRANE DESCENT</div>
          <div class="deploy-altitude">TOUCHDOWN IMMINENT</div>
        </div>
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <div v-if="deploying" class="deploy-overlay" key="deploy">
        <div class="deploy-content">
          <div class="deploy-label">DEPLOYING ROVER SYSTEMS</div>
          <div class="deploy-steps">
            <div class="deploy-step" :class="{ active: deployProgress > 0.0 }">SUSPENSION</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.10 }">ARM</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.20 }">MAST</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.30 }">ANTENNA</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.40 }">COVERS</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.48 }">WHEELS</div>
            <div class="deploy-step" :class="{ active: deployProgress > 0.72 }">STEERING TEST</div>
          </div>
          <div class="deploy-bar-track">
            <div class="deploy-bar-fill" :style="{ width: (deployProgress * 100) + '%' }" />
          </div>
          <div class="deploy-pct">{{ Math.round(deployProgress * 100) }}%</div>
        </div>
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <div v-if="!deploying && !descending && activeInstrumentSlot === null" class="controls-hint">
        WASD to drive &middot; Drag to orbit &middot; 1-5 instruments
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <InstrumentToolbar
        v-if="!deploying && !descending"
        :active-slot="activeInstrumentSlot"
        @select="(slot: number) => controller?.activateInstrument(slot)"
        @deselect="controller?.activateInstrument(null)"
      />
    </Transition>
    <InstrumentOverlay :active-slot="activeInstrumentSlot" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { useMarsData } from '@/composables/useMarsData'
import SiteCompass from '@/components/SiteCompass.vue'
import type { GeologicalFeature } from '@/types/landmark'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import InstrumentToolbar from '@/components/InstrumentToolbar.vue'
import InstrumentOverlay from '@/components/InstrumentOverlay.vue'
import { MastCamController, ChemCamController, APXSController, DANController, SAMController } from '@/three/instruments'

const route = useRoute()
const siteId = route.params.siteId as string
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roverHeading = ref(0)
const descending = ref(true)
const deploying = ref(false)
const deployProgress = ref(0)
const activeInstrumentSlot = ref<number | null>(null)
const { landmarks, loadLandmarks } = useMarsData()

let renderer: THREE.WebGLRenderer | null = null
let camera: THREE.PerspectiveCamera | null = null
let composer: EffectComposer | null = null
let siteScene: SiteScene | null = null
let controller: RoverController | null = null
let clock: THREE.Clock | null = null
let dustPass: ReturnType<typeof createDustAtmospherePass> | null = null
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
      siteId: geo.id,
      featureType: geo.featureType,
      waterIceIndex: geo.waterIceIndex,
      silicateIndex: geo.silicateIndex,
      temperatureMaxK: geo.temperatureMaxK,
      temperatureMinK: geo.temperatureMinK,
    }
  }
  return {
    roughness: 0.4,
    craterDensity: 0.3,
    dustCover: 0.6,
    elevation: 0.5,
    ironOxide: 0.6,
    basalt: 0.5,
    seed: hashString(siteId),
    siteId: siteId,
    featureType: 'plain' as const,
    waterIceIndex: 0.1,
    silicateIndex: 0.3,
    temperatureMaxK: 280,
    temperatureMinK: 160,
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
    1200,
  )

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
      { moveSpeed: 1.2, turnSpeed: 0.5 },
      siteScene,
    )
  }

  // Create instrument controllers
  const instrumentControllers = [
    new MastCamController(),
    new ChemCamController(),
    new APXSController(),
    new DANController(),
    new SAMController(),
  ]
  if (controller) {
    controller.instruments = instrumentControllers
  }

  // Post-processing
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(siteScene.scene, camera))

  dustPass = createDustAtmospherePass(terrainParams.dustCover)
  composer.addPass(dustPass)

  clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)
    if (!camera || !clock || !siteScene || !composer) return

    const delta = clock.getDelta()
    const elapsed = clock.getElapsedTime()

    // Night penalty — halve speed when dark
    if (controller && siteScene.sky) {
      const nightPenalty = 1.0 - siteScene.sky.nightFactor * 0.5
      controller.config.moveSpeed = 1.2 * nightPenalty
      controller.config.turnSpeed = 0.5 * nightPenalty
    }

    controller?.update(delta)
    roverHeading.value = controller?.heading ?? 0

    // Track descent → deployment → ready states
    if (siteScene.roverState === 'descending') {
      descending.value = true
      deploying.value = false
    } else if (siteScene.roverState === 'deploying') {
      descending.value = false
      deploying.value = true
      deployProgress.value = siteScene.deployProgress
    } else if (siteScene.roverState === 'ready' && (deploying.value || descending.value)) {
      descending.value = false
      deploying.value = false
      deployProgress.value = 1
    }

    // Attach instruments once ready (idempotent — attach() checks its own flag)
    if (siteScene.roverState === 'ready' && siteScene.rover && controller && !controller.instruments[0]?.attached) {
      controller.instruments.forEach(i => i.attach(siteScene!.rover!))
    }

    // Track active instrument for toolbar
    activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null

    if (siteScene.rover && siteScene.trails) {
      siteScene.trails.update(siteScene.rover.position, controller?.heading ?? 0)
    }

    siteScene.update(elapsed, delta, camera.position)

    // Update dust pass time
    if (dustPass) {
      dustPass.uniforms.uTime.value = elapsed
    }

    composer.render()
  }
  animate()

  window.addEventListener('resize', onResize)
})

function onResize() {
  const canvas = canvasRef.value
  if (!canvas || !renderer || !camera || !composer) return
  camera.aspect = canvas.clientWidth / canvas.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  composer.setSize(canvas.clientWidth, canvas.clientHeight)
  if (dustPass) {
    dustPass.uniforms.uResolution.value.set(canvas.clientWidth, canvas.clientHeight)
  }
}

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  controller?.dispose()
  siteScene?.dispose()
  composer?.dispose()
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

/* Deployment overlay */
.deploy-overlay {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 50;
}

.deploy-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(228, 147, 62, 0.2);
  border-radius: 6px;
  min-width: 280px;
}

.deploy-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: rgba(228, 147, 62, 0.9);
  animation: deploy-pulse 1.5s ease-in-out infinite;
}

.deploy-steps {
  display: flex;
  gap: 12px;
}

.deploy-step {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.15);
  transition: color 0.4s ease;
}

.deploy-step.active {
  color: rgba(228, 147, 62, 0.8);
}

.deploy-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.deploy-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(228, 147, 62, 0.6), rgba(228, 147, 62, 0.9));
  border-radius: 2px;
  transition: width 0.1s linear;
}

.deploy-pct {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.3);
  font-variant-numeric: tabular-nums;
}

.descent-label {
  color: rgba(255, 120, 60, 0.95);
}

.deploy-altitude {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.4);
  animation: deploy-pulse 1s ease-in-out infinite;
}

@keyframes deploy-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Transition */
.deploy-fade-enter-active,
.deploy-fade-leave-active {
  transition: opacity 0.8s ease;
}

.deploy-fade-enter-from,
.deploy-fade-leave-to {
  opacity: 0;
}
</style>
