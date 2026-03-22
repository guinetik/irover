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
      <div v-if="rtgPhase === 'overdrive'" class="rtg-banner overdrive" key="rtg-overdrive">
        <span class="rtg-banner-icon">&#x26A1;</span>
        <span class="rtg-banner-text">OVERDRIVE ACTIVE</span>
        <div class="rtg-banner-bar"><div class="rtg-banner-fill" :style="{ width: (1 - rtgPhaseProgress) * 100 + '%' }" /></div>
      </div>
      <div v-else-if="rtgPhase === 'cooldown'" class="rtg-banner cooldown" key="rtg-cooldown">
        <span class="rtg-banner-icon">&#x23F3;</span>
        <span class="rtg-banner-text">RTG COOLDOWN &mdash; INSTRUMENTS LOCKED</span>
        <div class="rtg-banner-bar"><div class="rtg-banner-fill cooldown" :style="{ width: (1 - rtgPhaseProgress) * 100 + '%' }" /></div>
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <div v-if="isInstrumentActive && activeInstrumentSlot === 1" class="mastcam-hud">
        <div class="mc-strip">
          <span class="mc-label">MASTCAM</span>
          <span class="mc-divider">|</span>
          <span class="mc-filter">SURVEY: {{ mastcamFilterLabel }}</span>
          <span class="mc-divider">|</span>
          <span class="mc-hint">A/D pan &middot; W/S tilt &middot; Scroll zoom &middot; Q filter &middot; Hold E scan</span>
        </div>
        <div v-if="mastcamScanning" class="mc-scan-bar">
          <div class="mc-scan-fill" :style="{ width: mastcamScanProgress * 100 + '%' }" />
          <span class="mc-scan-label">SCANNING...</span>
        </div>
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <div v-if="!deploying && !descending && activeInstrumentSlot === null && rtgPhase === 'idle'" class="controls-hint">
        WASD to drive &middot; Drag to orbit &middot; 1-5 instruments
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <InstrumentToolbar
        v-if="!deploying && !descending"
        :active-slot="activeInstrumentSlot"
        :inventory-open="inventoryOpen"
        @select="(slot: number) => { if (!isSleeping) controller?.activateInstrument(slot) }"
        @deselect="controller?.activateInstrument(null)"
        @toggle-inventory="inventoryOpen = !inventoryOpen"
      />
    </Transition>
    <InstrumentOverlay
      v-if="!isInstrumentActive"
      :active-slot="activeInstrumentSlot"
      :can-activate="controller?.activeInstrument?.canActivate ?? false"
      :is-active-mode="isInstrumentActive"
      :thermal="activeInstrumentSlot === 9 ? { internalTempC: internalTempC, ambientC: ambientEffectiveC, heaterW: heaterW, zone: thermalZone } : null"
      @activate="handleActivate()"
    />
    <InstrumentCrosshair
      :visible="crosshairVisible"
      :color="crosshairColor"
      :drilling="isDrilling"
      :progress="drillProgress"
      :screen-x="crosshairX"
      :screen-y="crosshairY"
    />
    <InventoryPanel
      :open="inventoryOpen"
      :samples="samples"
      :current-weight-kg="currentWeightKg"
      :capacity-kg="capacityKg"
      :is-full="isFull"
      @dump="removeSample"
    />
    <ProfilePanel :open="profileOpen" />
    <SampleToast ref="sampleToastRef" />
    <Teleport to="body">
      <Transition name="deploy-fade">
        <div v-if="showOverdriveConfirm" class="overdrive-confirm-overlay">
          <div class="overdrive-confirm">
            <div class="overdrive-icon">&#x26A1;</div>
            <div class="overdrive-title">EMERGENCY OVERDRIVE</div>
            <div class="overdrive-desc">
              Routing all power to drive systems. Movement speed will be doubled for approximately 2 hours.
            </div>
            <div class="overdrive-warning">
              All instruments will be locked during overdrive and for half a sol afterwards while the RTG cools down. You will not be able to scan, drill, or analyze until cooldown completes.
            </div>
            <div class="overdrive-buttons">
              <button class="overdrive-btn confirm" @click="confirmOverdrive()">ENGAGE OVERDRIVE</button>
              <button class="overdrive-btn cancel" @click="cancelOverdrive()">CANCEL</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Transition name="deploy-fade">
      <div v-if="isSleeping && !deploying && !descending" class="sleep-overlay">
        <div class="sleep-content">
          <div class="sleep-icon">&#x26A0;</div>
          <div class="sleep-title">CRITICAL POWER</div>
          <div class="sleep-desc">Battery below 15% &mdash; rover entering sleep mode.</div>
          <div class="sleep-desc">Systems will resume at 50% charge.</div>
          <div class="sleep-bar-track">
            <div class="sleep-bar-fill" :style="{ width: socPct + '%' }" />
            <div class="sleep-bar-target" />
          </div>
          <div class="sleep-pct">{{ socPct.toFixed(0) }}% / 50%</div>
          <div class="sleep-hint">Recharging from {{ netW >= 0 ? 'RTG + solar' : 'RTG' }}&hellip;</div>
        </div>
      </div>
    </Transition>
    <SolClock
      v-if="!deploying && !descending"
      :sol="marsSol"
      :time-of-day="marsTimeOfDay"
      :night-factor="currentNightFactor"
    />
    <PowerHud
      v-if="!deploying && !descending"
      :battery-wh="batteryWh"
      :capacity-wh="capacityWh"
      :generation-w="generationW"
      :consumption-w="consumptionW"
      :net-w="netW"
      :soc-pct="socPct"
    />
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
import InstrumentCrosshair from '@/components/InstrumentCrosshair.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import SampleToast from '@/components/SampleToast.vue'
import PowerHud from '@/components/PowerHud.vue'
import SolClock from '@/components/SolClock.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import { useInventory } from '@/composables/useInventory'
import { useMarsPower } from '@/composables/useMarsPower'
import { useMarsThermal } from '@/composables/useMarsThermal'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { MastCamController, ChemCamController, APXSController, DANController, SAMController, RTGController, HeaterController, REMSController, RADController, type InstrumentController } from '@/three/instruments'

const route = useRoute()
const siteId = route.params.siteId as string
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roverHeading = ref(0)
const descending = ref(true)
const deploying = ref(false)
const deployProgress = ref(0)
const activeInstrumentSlot = ref<number | null>(null)
const isInstrumentActive = ref(false)
const rtgPhase = ref<'idle' | 'overdrive' | 'cooldown' | 'recharging'>('idle')
const rtgPhaseProgress = ref(0)
const inventoryOpen = ref(false)
const profileOpen = ref(false)
const crosshairVisible = ref(false)
const crosshairColor = ref<'green' | 'red'>('red')
const crosshairX = ref(50)
const crosshairY = ref(50)
const drillProgress = ref(0)
const isDrilling = ref(false)
const mastcamFilterLabel = ref('ALL TYPES')
const mastcamScanning = ref(false)
const mastcamScanProgress = ref(0)
const sampleToastRef = ref<InstanceType<typeof SampleToast> | null>(null)
const marsSol = ref(1)
const marsTimeOfDay = ref(0)
const currentNightFactor = ref(0)
const { samples, currentWeightKg, isFull, capacityKg, removeSample } = useInventory()
const { batteryWh, capacityWh, generationW, consumptionW, netW, socPct, isSleeping, tickPower } = useMarsPower()
const { internalTempC, ambientEffectiveC, heaterW, zone: thermalZone, tickThermal } = useMarsThermal()
const { mod: playerMod } = usePlayerProfile()
const { landmarks, loadLandmarks } = useMarsData()

let lastSkyTimeOfDay = -1

const showOverdriveConfirm = ref(false)

function handleActivate() {
  if (!controller || isSleeping.value) return
  if (controller.activeInstrument instanceof RTGController) {
    showOverdriveConfirm.value = true
  } else {
    controller.enterActiveMode()
  }
}

function confirmOverdrive() {
  showOverdriveConfirm.value = false
  if (!controller) return
  const rtg = controller.activeInstrument
  if (rtg instanceof RTGController) {
    rtg.activateOverdrive()
    // Return to driving — dismiss the instrument view
    controller.mode = 'driving'
    controller.activeInstrument = null
  }
}

function cancelOverdrive() {
  showOverdriveConfirm.value = false
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault()
    inventoryOpen.value = !inventoryOpen.value
  }
  if (e.code === 'Digit0' || e.code === 'Backquote') {
    profileOpen.value = !profileOpen.value
  }
}

let siteTerrainParams: TerrainParams | null = null
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
  renderer.toneMappingExposure = 1.15

  camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    1200,
  )

  await loadLandmarks()
  const terrainParams = getTerrainParams()
  siteTerrainParams = terrainParams

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
    new RTGController(),
    new HeaterController(),
    new REMSController(),
    new RADController(),
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

    // Sleep mode — kill movement + force-deactivate instruments
    if (isSleeping.value && controller) {
      if (controller.activeInstrument) {
        controller.activateInstrument(null)
      }
      controller.config.moveSpeed = 0
      controller.config.turnSpeed = 0
    } else if (controller && siteScene.sky) {
      // Night penalty — halve speed when dark. RTG overdrive doubles speed.
      const nightPenalty = 1.0 - siteScene.sky.nightFactor * 0.5
      const rtg = controller.instruments.find(i => i.id === 'rtg') as RTGController | undefined
      const rtgBoost = rtg?.speedMultiplier ?? 1.0
      const speedMult = playerMod('movementSpeed')
      controller.config.moveSpeed = 1.2 * nightPenalty * rtgBoost * speedMult
      controller.config.turnSpeed = 0.5 * nightPenalty * rtgBoost * speedMult
    }

    controller?.update(delta)
    roverHeading.value = controller?.heading ?? 0

    isInstrumentActive.value = controller?.mode === 'active'

    // Track RTG overdrive state + glow effect
    const rtg = controller?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
    if (rtg) {
      rtgPhase.value = rtg.phase
      rtgPhaseProgress.value = rtg.phaseProgress

      // Glow effect on RTG node
      if (rtg.node && rtg.phase !== 'idle') {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh
            const mat = mesh.material as THREE.MeshStandardMaterial
            if (rtg.phase === 'overdrive') {
              mat.emissive = mat.emissive || new THREE.Color()
              mat.emissive.setHex(0xff6600)
              mat.emissiveIntensity = 0.3 + Math.sin(elapsed * 4) * 0.15
            } else {
              mat.emissive = mat.emissive || new THREE.Color()
              mat.emissive.setHex(0xff2200)
              mat.emissiveIntensity = 0.1 + Math.sin(elapsed * 2) * 0.05
            }
          }
        })
      } else if (rtg.node && rtg.phase === 'idle') {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat.emissiveIntensity > 0) {
              mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - delta * 0.5)
            }
          }
        })
      }
    }

    // Sleep mode visual — slow red pulse on entire rover
    if (siteScene.rover) {
      siteScene.rover.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
          if (!mat.emissive) return
          if (isSleeping.value) {
            mat.emissive.setHex(0xff1100)
            mat.emissiveIntensity = 0.08 + Math.sin(elapsed * 1.5) * 0.06
          } else if (rtgPhase.value === 'idle' && mat.emissiveIntensity > 0) {
            // Fade out only if RTG isn't also glowing
            mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - delta * 0.3)
          }
        }
      })
    }

    if (siteScene.sky) {
      marsTimeOfDay.value = siteScene.sky.timeOfDay
      currentNightFactor.value = siteScene.sky.nightFactor
      if (lastSkyTimeOfDay >= 0 && siteScene.sky.timeOfDay < lastSkyTimeOfDay - 0.25) {
        marsSol.value++
      }
      lastSkyTimeOfDay = siteScene.sky.timeOfDay
    }

    let apxsDrilling = false
    if (controller?.mode === 'active' && controller.activeInstrument instanceof APXSController) {
      const apxs = controller.activeInstrument
      // Thermal effect + player analysisSpeed buff/nerf
      // analysisSpeed > 1 = faster analysis = lower duration multiplier
      const z = thermalZone.value
      const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
      apxs.drillDurationMultiplier = thermalMult / playerMod('analysisSpeed')
      apxs.setRoverPosition(siteScene.rover!.position)
      crosshairVisible.value = true
      crosshairColor.value = apxs.hasTarget && !apxs.isInventoryFull ? 'green' : 'red'
      drillProgress.value = apxs.drillProgress
      isDrilling.value = apxs.isDrilling
      apxsDrilling = apxs.isDrilling

      // Project 3D target position to screen for crosshair overlay
      if (camera) {
        const projected = apxs.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      if (apxs.lastCollected) {
        const s = apxs.lastCollected
        sampleToastRef.value?.show(s.type, s.label, s.weightKg)
        apxs.lastCollected = null
      }
    } else {
      crosshairVisible.value = false
      isDrilling.value = false
      drillProgress.value = 0
    }

    // Thermal tick (before power so heaterW is current)
    if (siteTerrainParams) {
      tickThermal(delta, {
        timeOfDay: siteScene.sky?.timeOfDay ?? 0.5,
        temperatureMinK: siteTerrainParams.temperatureMinK,
        temperatureMaxK: siteTerrainParams.temperatureMaxK,
      })
    }

    // Update HeaterController state for overlay display
    const heaterInst = controller?.instruments.find(i => i.id === 'heater') as HeaterController | undefined
    if (heaterInst) {
      heaterInst.internalTempC = internalTempC.value
      heaterInst.ambientC = ambientEffectiveC.value
      heaterInst.heaterW = heaterW.value
      heaterInst.zone = thermalZone.value
    }

    // Compute active instrument power draw (MastCam, etc.)
    const mcActive = controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController
      ? (controller.activeInstrument as MastCamController).powerDrawW : 0

    tickPower(delta, {
      nightFactor: siteScene.sky?.nightFactor ?? 0,
      roverInSunlight: siteScene.roverInSunlight,
      moving: controller?.isMoving ?? false,
      apxsDrilling,
      instrumentW: mcActive,
      heaterW: heaterW.value,
    })

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

    if (siteScene.roverState === 'ready' && siteScene.rover && camera) {
      const apxs = controller?.instruments.find(i => i.id === 'apxs')
      if (apxs instanceof APXSController && apxs.attached && !apxs.targeting) {
        apxs.initGameplay(siteScene.scene, camera, siteScene.terrain.getSmallRocks())
      }
      const mc = controller?.instruments.find(i => i.id === 'mastcam')
      if (mc instanceof MastCamController && mc.attached && !mc['overlayScene']) {
        // Collect scene meshes to wireframe during survey — exclude small rocks (handled separately)
        const smallRocks = new Set(siteScene.terrain.getSmallRocks())
        const sceneMeshes: THREE.Mesh[] = []
        siteScene.terrain.group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh && !smallRocks.has(child as THREE.Mesh)) {
            sceneMeshes.push(child as THREE.Mesh)
          }
        })
        if (siteScene.rover) {
          siteScene.rover.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) sceneMeshes.push(child as THREE.Mesh)
          })
        }
        mc.initSurvey(siteScene.scene, siteScene.terrain.getSmallRocks(), sceneMeshes)
      }
    }

    // Enter survey mode when MastCam is active
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      if (mc['overlayMeshes'].length === 0) {
        mc.enterSurveyMode()
        mc.rebuildOverlays()
      }
    }

    // Animate MastCam tag markers (always, not just in active mode)
    const mcInst = controller?.instruments.find(i => i.id === 'mastcam')
    if (mcInst instanceof MastCamController) {
      mcInst.updateTagMarkers(elapsed)
    }

    // Track active instrument for toolbar
    activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null

    // MastCam HUD state + crosshair
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      mastcamFilterLabel.value = mc.filterLabel
      mastcamScanning.value = mc.isScanning
      mastcamScanProgress.value = mc.scanProgressValue

      // Show crosshair at target rock position
      crosshairVisible.value = true
      const hasTarget = mc.scanTarget !== null
      const alreadyScanned = mc.scanTarget?.userData.mastcamScanned === true
      crosshairColor.value = hasTarget && !alreadyScanned ? 'green' : 'red'
      isDrilling.value = mc.isScanning
      drillProgress.value = mc.scanProgressValue

      if (camera) {
        const projected = mc.scanTargetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }
    } else {
      mastcamScanning.value = false
    }

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

  window.addEventListener('keydown', onGlobalKeyDown)
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
  window.removeEventListener('keydown', onGlobalKeyDown)
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

/* RTG status banner */
.rtg-banner {
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 20px;
  background: rgba(10, 5, 2, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  z-index: 40;
  pointer-events: none;
}

.rtg-banner.overdrive {
  border: 1px solid rgba(239, 159, 39, 0.4);
}

.rtg-banner.cooldown {
  border: 1px solid rgba(224, 80, 48, 0.3);
}

.rtg-banner-icon {
  font-size: 14px;
}

.rtg-banner-text {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.15em;
  color: #ef9f27;
}

.rtg-banner.cooldown .rtg-banner-text {
  color: #e05030;
}

.rtg-banner-bar {
  width: 80px;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.rtg-banner-fill {
  height: 100%;
  background: rgba(239, 159, 39, 0.8);
  border-radius: 2px;
  transition: width 0.5s linear;
}

.rtg-banner-fill.cooldown {
  background: rgba(224, 80, 48, 0.7);
}

/* Overdrive confirm dialog */
.overdrive-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.overdrive-confirm {
  width: 340px;
  background: rgba(10, 5, 2, 0.95);
  border: 1px solid rgba(239, 159, 39, 0.4);
  border-radius: 10px;
  padding: 24px;
  text-align: center;
  font-family: 'Courier New', monospace;
}

.overdrive-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.overdrive-title {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #ef9f27;
  margin-bottom: 14px;
}

.overdrive-desc {
  font-size: 10px;
  color: rgba(196, 149, 106, 0.7);
  line-height: 1.6;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.overdrive-warning {
  font-size: 9px;
  color: #e05030;
  line-height: 1.6;
  letter-spacing: 0.04em;
  padding: 8px 10px;
  background: rgba(224, 80, 48, 0.08);
  border: 1px solid rgba(224, 80, 48, 0.2);
  border-radius: 6px;
  margin-bottom: 16px;
}

.overdrive-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.overdrive-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: opacity 0.15s;
}

.overdrive-btn:hover {
  opacity: 0.85;
}

.overdrive-btn.confirm {
  background: #ef9f27;
  color: #1a0d08;
}

.overdrive-btn.cancel {
  background: transparent;
  border: 1px solid rgba(196, 117, 58, 0.3);
  color: #a08060;
}

/* MastCam HUD */
.mastcam-hud {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.mc-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 6px;
  padding: 5px 14px;
  font-family: 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 0.1em;
}

.mc-label {
  color: #e8a060;
  font-weight: bold;
}

.mc-divider {
  color: rgba(196, 117, 58, 0.25);
}

.mc-filter {
  color: #5dc9a5;
  font-weight: bold;
}

.mc-hint {
  color: rgba(196, 117, 58, 0.4);
  font-size: 8px;
}

.mc-scan-bar {
  width: 200px;
  height: 4px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.mc-scan-fill {
  height: 100%;
  background: linear-gradient(90deg, #5dc9a5, #3a9a7a);
  border-radius: 2px;
  transition: width 0.1s linear;
}

.mc-scan-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Courier New', monospace;
  font-size: 8px;
  color: #5dc9a5;
  letter-spacing: 0.15em;
}

/* Sleep mode overlay */
.sleep-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  pointer-events: none;
}

.sleep-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 36px;
  background: rgba(10, 5, 2, 0.9);
  border: 1px solid rgba(224, 80, 48, 0.4);
  border-radius: 10px;
  font-family: 'Courier New', monospace;
  min-width: 280px;
}

.sleep-icon {
  font-size: 28px;
  animation: sleep-pulse 2s ease-in-out infinite;
}

.sleep-title {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 0.25em;
  color: #e05030;
}

.sleep-desc {
  font-size: 10px;
  color: rgba(224, 80, 48, 0.6);
  letter-spacing: 0.1em;
  text-align: center;
}

.sleep-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 6px;
  position: relative;
}

.sleep-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #e05030, #ef9f27);
  border-radius: 3px;
  transition: width 0.5s ease;
}

.sleep-bar-target {
  position: absolute;
  left: 50%;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1px;
}

.sleep-pct {
  font-size: 11px;
  color: #e05030;
  font-weight: bold;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
}

.sleep-hint {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.1em;
  animation: sleep-pulse 2s ease-in-out infinite;
}

@keyframes sleep-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
