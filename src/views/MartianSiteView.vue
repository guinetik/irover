<template>
  <div class="w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div class="site-hud">
      <button class="back-btn" @click="$router.push('/globe')">BACK</button>
      <h2 class="site-name">{{ siteId }}</h2>
      <div class="hud-actions">
        <div class="sp-counter">
          <span class="sp-icon">&#x2726;</span>
          <span class="sp-value font-instrument">{{ totalSP }}</span>
          <span class="sp-label">SP</span>
        </div>
        <button
          v-if="hasScienceDiscoveries && !deploying && !descending"
          type="button"
          class="science-hud-btn"
          @click="scienceLogOpen = true"
        >SCIENCE</button>
      </div>
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
          <div class="deploy-pct font-instrument">{{ Math.round(deployProgress * 100) }}%</div>
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
      <div v-else-if="rtgConservationMode === 'active'" class="rtg-banner conservation" key="rtg-shunt">
        <span class="rtg-banner-icon">&#x26AB;</span>
        <span class="rtg-banner-text">POWER SHUNT &mdash; DRIVE OFFLINE &middot; &minus;50% LOAD</span>
        <div class="rtg-banner-bar"><div class="rtg-banner-fill conservation" :style="{ width: (1 - rtgConservationProgress01) * 100 + '%' }" /></div>
      </div>
      <div v-else-if="rtgConservationMode === 'cooldown'" class="rtg-banner shunt-cooldown" key="rtg-shunt-cd">
        <span class="rtg-banner-icon">&#x23F3;</span>
        <span class="rtg-banner-text">SHUNT RECHARGE &mdash; {{ rtgConservationCdLabel }}</span>
        <div class="rtg-banner-bar"><div class="rtg-banner-fill shunt-cd" :style="{ width: (1 - rtgConservationProgress01) * 100 + '%' }" /></div>
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <div v-if="isInstrumentActive && activeInstrumentSlot === 2" class="chemcam-hud">
        <div class="cc-strip">
          <span class="cc-label">CHEMCAM</span>
          <span class="cc-divider">|</span>
          <span class="cc-shots"><span class="font-instrument">{{ chemcamShotsRemaining }}/{{ chemcamShotsMax }}</span> SHOTS</span>
          <span class="cc-divider">|</span>
          <span class="cc-phase" :class="chemcamPhase.toLowerCase()">{{ chemcamPhaseLabel }}</span>
          <span class="cc-divider">|</span>
          <span class="cc-hint">A/D pan · W/S tilt · Scroll zoom · hold E fire</span>
        </div>
        <div v-if="chemcamPhase === 'PULSE_TRAIN' || chemcamPhase === 'INTEGRATING'" class="cc-progress-bar">
          <div class="cc-progress-fill" :class="chemcamPhase.toLowerCase().replace('_','-')" :style="{ width: chemcamProgressPct + '%' }" />
          <span class="cc-progress-label">{{ chemcamPhase === 'PULSE_TRAIN' ? 'FIRING...' : 'INTEGRATING...' }}</span>
        </div>
        <Transition name="deploy-fade">
          <div v-if="chemCamUnreadCount > 0" class="cc-results-row">
            <span class="cc-results-hint">SPECTRUM READY</span>
            <button
              type="button"
              class="cc-btn-see-results"
              @click="showChemCamResults = true"
            >SEE RESULTS <span class="cc-results-badge font-instrument">{{ chemCamUnreadCount }}</span></button>
          </div>
        </Transition>
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
      <div
        v-if="!deploying && !descending && activeInstrumentSlot === null && rtgPhase === 'idle' && rtgConservationMode !== 'active'"
        class="controls-hint"
      >
        WASD to drive &middot; Drag to orbit &middot; 1&ndash;9 instruments &middot; E quick-activates when selected
      </div>
      <div
        v-else-if="!deploying && !descending && activeInstrumentSlot === null && rtgConservationMode === 'active'"
        class="controls-hint controls-hint-shunt"
      >
        Power shunt: driving offline &middot; &minus;50% instrument load &middot; Drag to orbit
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <InstrumentToolbar
        v-if="!deploying && !descending"
        :active-slot="activeInstrumentSlot"
        :inventory-open="inventoryOpen"
        :chem-cam-unread="chemCamUnreadCount"
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
      :chem-cam-shots="chemcamShotsRemaining + '/' + chemcamShotsMax"
      :chem-cam-unread="chemCamUnreadCount"
      :chem-cam-sequence-active="chemCamOverlaySequenceActive"
      :chem-cam-sequence-progress="chemCamOverlaySequenceProgress"
      :chem-cam-sequence-label="chemCamOverlaySequenceLabel"
      :chem-cam-sequence-pulse="chemCamOverlaySequencePulse"
      :rtg-overdrive-ready="rtgOverdriveReady"
      :rtg-conservation-ready="rtgConservationReady"
      :rtg-conservation-cooldown-title="rtgConservationCooldownTitle"
      @activate="handleActivate()"
      @see-results="showChemCamResults = true"
      @rtg-overdrive="showOverdriveConfirm = true"
      @rtg-conservation="openConservationConfirm()"
    />
    <ChemCamExperimentPanel
      :readout="activeChemCamReadout"
      @close="showChemCamResults = false"
      @acknowledge="handleChemCamAck"
    />
    <ScienceLogDialog
      :open="scienceLogOpen"
      :spectra="chemCamArchivedSpectra"
      @close="scienceLogOpen = false"
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
      :stacks="inventoryStacks"
      :current-weight-kg="currentWeightKg"
      :capacity-kg="capacityKg"
      :is-full="isFull"
      @dump="removeInventoryStack"
    />
    <ProfilePanel :open="profileOpen" />
    <SAMDialog :visible="samDialogVisible" />
    <SampleToast ref="sampleToastRef" />
    <AchievementBanner ref="achievementRef" />
    <Teleport to="body">
      <Transition name="deploy-fade">
        <div v-if="showOverdriveConfirm" key="overdrive-confirm" class="overdrive-confirm-overlay">
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
      <Transition name="deploy-fade">
        <div v-if="showConservationConfirm" key="conservation-confirm" class="overdrive-confirm-overlay">
          <div class="overdrive-confirm conservation-dialog">
            <div class="overdrive-icon conservation-icon">&#x26AB;</div>
            <div class="overdrive-title">POWER SHUNT</div>
            <div class="overdrive-desc">
              Stow drive motors and dump reserve thermal headroom into the main bus. Your battery fills immediately and all modeled loads run at half power for about three hours (mission time).
            </div>
            <div class="overdrive-warning">
              You cannot drive or steer with WASD until the shunt ends. Science instruments stay available. Afterward, the shunt cannot be used again for about one sol.
            </div>
            <div class="overdrive-buttons">
              <button class="overdrive-btn confirm conservation-confirm" @click="confirmConservation()">ENGAGE SHUNT</button>
              <button class="overdrive-btn cancel" @click="cancelConservation()">CANCEL</button>
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
          <div class="sleep-desc">Battery below {{ POWER_SLEEP_THRESHOLD_PCT }}% &mdash; rover entering sleep mode.</div>
          <div class="sleep-desc">Systems will resume at 50% charge.</div>
          <div class="sleep-bar-track">
            <div class="sleep-bar-fill" :style="{ width: socPct + '%' }" />
            <div class="sleep-bar-target" />
          </div>
          <div class="sleep-pct font-instrument">{{ socPct.toFixed(0) }}% / 50%</div>
          <div class="sleep-hint" :class="{ 'sleep-hint-warn': netW <= 0 }">
            <template v-if="netW > 0">Recharging &mdash; net +{{ netW.toFixed(1) }} W</template>
            <template v-else>No charge gain (net {{ netW.toFixed(1) }} W). Wait for more sun or lower thermal load.</template>
          </div>
        </div>
      </div>
    </Transition>
    <SolClock
      v-if="!deploying && !descending"
      :sol="marsSol"
      :time-of-day="marsTimeOfDay"
      :night-factor="currentNightFactor"
    />
    <CommToolbar
      v-if="!deploying && !descending"
      :active-slot="activeInstrumentSlot"
      @select="(slot: number) => controller?.activateInstrument(slot)"
      @deselect="controller?.activateInstrument(null)"
    />
    <MastTelemetry
      v-if="isInstrumentActive && (activeInstrumentSlot === 1 || activeInstrumentSlot === 2)"
      :base-lat="siteLat"
      :base-lon="siteLon"
      :rover-x="roverWorldX"
      :rover-z="roverWorldZ"
      :pan-angle="mastPan"
      :tilt-angle="mastTilt"
      :fov="mastFov"
      :heading="roverHeading"
      :target-range="mastTargetRange"
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { MARS_TIME_OF_DAY_06_00 } from '@/three/MarsSky'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createCameraFillLight, syncCameraFillLight } from '@/three/cameraFillLight'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { isSitePostProcessingEnabled } from '@/lib/sitePostProcessing'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import { useMarsData } from '@/composables/useMarsData'
import SiteCompass from '@/components/SiteCompass.vue'
import type { GeologicalFeature } from '@/types/landmark'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import InstrumentToolbar from '@/components/InstrumentToolbar.vue'
import InstrumentOverlay from '@/components/InstrumentOverlay.vue'
import ChemCamExperimentPanel from '@/components/ChemCamExperimentPanel.vue'
import ScienceLogDialog from '@/components/ScienceLogDialog.vue'
import AchievementBanner from '@/components/AchievementBanner.vue'
import MastTelemetry from '@/components/MastTelemetry.vue'
import InstrumentCrosshair from '@/components/InstrumentCrosshair.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import SampleToast from '@/components/SampleToast.vue'
import SAMDialog from '@/components/SAMDialog.vue'
import PowerHud from '@/components/PowerHud.vue'
import SolClock from '@/components/SolClock.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import { useInventory } from '@/composables/useInventory'
import { useMarsGameClock } from '@/composables/useMarsGameClock'
import { useMarsPower, POWER_SLEEP_THRESHOLD_PCT } from '@/composables/useMarsPower'
import { useMarsThermal } from '@/composables/useMarsThermal'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useSciencePoints } from '@/composables/useSciencePoints'
import { useChemCamArchive } from '@/composables/useChemCamArchive'
import { ROCK_TYPES } from '@/three/terrain/RockTypes'
import { MastCamController, ChemCamController, APXSController, DANController, SAMController, RTGController, HeaterController, REMSController, RADController, AntennaLGController, AntennaUHFController, type InstrumentController, type RTGConservationState } from '@/three/instruments'
import CommToolbar from '@/components/CommToolbar.vue'

const route = useRoute()
const siteId = route.params.siteId as string
const { archiveAcknowledgedReadout, spectra: chemCamArchivedSpectra } = useChemCamArchive()
const scienceLogOpen = ref(false)
const hasScienceDiscoveries = computed(() => chemCamArchivedSpectra.value.length > 0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roverHeading = ref(0)
const descending = ref(true)
const deploying = ref(false)
const deployProgress = ref(0)
const activeInstrumentSlot = ref<number | null>(null)
const isInstrumentActive = ref(false)
const samDialogVisible = ref(false)
const rtgPhase = ref<'idle' | 'overdrive' | 'cooldown' | 'recharging'>('idle')
const rtgPhaseProgress = ref(0)
const rtgConservationMode = ref<RTGConservationState>('off')
const rtgOverdriveReady = ref(false)
const rtgConservationReady = ref(false)
const rtgConservationCooldownTitle = ref('')
/** 0–1 elapsed for active shunt or shunt cooldown (for banner bars). */
const rtgConservationProgress01 = ref(0)
const rtgConservationCdLabel = ref('')

function formatRtgShuntCooldownLabel(seconds: number): string {
  if (seconds <= 0) return ''
  const m = Math.ceil(seconds / 60)
  return m >= 2 ? `~${m} min until shunt ready` : `${Math.max(1, Math.ceil(seconds))}s until shunt ready`
}
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
const chemCamUnreadCount = ref(0)
const showChemCamResults = ref(false)
const chemcamPhase = ref<string>('ARMED')
const chemcamShotsRemaining = ref(10)
const chemcamShotsMax = ref(10)
const chemcamProgressPct = ref(0)
/** Instrument card: ChemCam firing/integration when not in ChemCam active view */
const chemCamOverlaySequenceActive = ref(false)
const chemCamOverlaySequenceProgress = ref(0)
const chemCamOverlaySequenceLabel = ref('')
const chemCamOverlaySequencePulse = ref(false)
const activeChemCamReadout = computed(() => {
  if (!showChemCamResults.value) return null
  const cc = controller?.instruments.find(i => i.id === 'chemcam')
  if (cc instanceof ChemCamController) {
    return cc.getLatestUnread() ?? (cc.readouts.length > 0 ? cc.readouts[cc.readouts.length - 1] : null)
  }
  return null
})

function handleChemCamAck(readoutId: string) {
  const cc = controller?.instruments.find(i => i.id === 'chemcam')
  if (cc instanceof ChemCamController) {
    const readout = cc.readouts.find(r => r.id === readoutId)
    if (readout) {
      archiveAcknowledgedReadout({
        readout,
        solAcknowledged: marsSol.value,
        siteId,
        siteLatDeg: siteLat.value,
        siteLonDeg: siteLon.value,
        roverWorldX: roverWorldX.value,
        roverWorldZ: roverWorldZ.value,
        roverSpawnX: roverSpawnXZ.value.x,
        roverSpawnZ: roverSpawnXZ.value.z,
      })
    }
    cc.markRead(readoutId)
    chemCamUnreadCount.value = cc.unreadCount
    if (readout) {
      const gain = awardAck(readoutId, readout.rockLabel)
      if (gain) sampleToastRef.value?.showSP(gain.amount, 'REVIEW', gain.bonus)
    }
  }
  showChemCamResults.value = false
}

const chemcamPhaseLabel = computed(() => {
  switch (chemcamPhase.value) {
    case 'PULSE_TRAIN': return 'FIRING'
    case 'INTEGRATING': return 'PROCESSING'
    case 'READY': return 'READY'
    case 'COOLDOWN': return 'COOLDOWN'
    case 'IDLE': return 'IDLE'
    default: return 'ARMED'
  }
})
const sampleToastRef = ref<InstanceType<typeof SampleToast> | null>(null)
const achievementRef = ref<InstanceType<typeof AchievementBanner> | null>(null)
const siteLat = ref(0)
const siteLon = ref(0)
/** Landing spawn XZ — first frame at roverState `ready`; offsets rover position for archive lat/lon. */
const roverSpawnXZ = ref({ x: 0, z: 0 })
let roverSpawnCaptured = false
const roverWorldX = ref(0)
const roverWorldZ = ref(0)
const mastPan = ref(0)
const mastTilt = ref(0)
const mastFov = ref(50)
const mastTargetRange = ref(-1)
const marsSol = ref(1)
const marsTimeOfDay = ref(MARS_TIME_OF_DAY_06_00)
const currentNightFactor = ref(0)
const {
  stacks: inventoryStacks,
  currentWeightKg,
  isFull,
  capacityKg,
  removeStack: removeInventoryStack,
} = useInventory()
const gameClock = useMarsGameClock()
const { batteryWh, capacityWh, generationW, consumptionW, netW, socPct, isSleeping, tickPower, fillBatteryFull } = useMarsPower()
const { internalTempC, ambientEffectiveC, heaterW, zone: thermalZone, tickThermal } = useMarsThermal()
const { mod: playerMod } = usePlayerProfile()
const { totalSP, award: awardSP, awardAck } = useSciencePoints()
const { landmarks, loadLandmarks } = useMarsData()

let lastSkyTimeOfDay = -1

// --- LIBS calibration achievements ---
interface LibsAchievement { id: string; sp: number; icon: string; title: string; description: string; type: string }
const libsAchievements = ref<LibsAchievement[]>([])
const triggeredAchievements = new Set<string>()

fetch('/data/achievements.json')
  .then(r => r.json())
  .then((data: { 'libs-calibration': LibsAchievement[] }) => {
    libsAchievements.value = data['libs-calibration'] ?? []
  })
  .catch(() => {})

watch(totalSP, (sp) => {
  for (const ach of libsAchievements.value) {
    if (sp >= ach.sp && !triggeredAchievements.has(ach.id)) {
      triggeredAchievements.add(ach.id)
      achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
    }
  }
})

const showOverdriveConfirm = ref(false)
const showConservationConfirm = ref(false)

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
    controller.activateInstrument(null)
  }
}

function cancelOverdrive() {
  showOverdriveConfirm.value = false
}

function openConservationConfirm() {
  if (!controller || isSleeping.value) return
  showConservationConfirm.value = true
}

function confirmConservation() {
  showConservationConfirm.value = false
  if (!controller || isSleeping.value) return
  const rtg = controller.instruments.find(i => i.id === 'rtg')
  if (rtg instanceof RTGController && rtg.activateConservation()) {
    fillBatteryFull()
    controller.activateInstrument(null)
  }
}

function cancelConservation() {
  showConservationConfirm.value = false
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
let cameraFillLight: THREE.DirectionalLight | null = null

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
  const site = landmarks.value.find((l) => l.id === siteId)
  if (site) {
    siteLat.value = site.lat
    siteLon.value = site.lon
  }
  const terrainParams = getTerrainParams()
  siteTerrainParams = terrainParams

  siteScene = new SiteScene()
  await siteScene.init(terrainParams, { skipIntroSequence: isSiteIntroSequenceSkipped() })

  cameraFillLight = createCameraFillLight()
  siteScene.scene.add(cameraFillLight)
  siteScene.scene.add(cameraFillLight.target)

  if (siteScene.rover) {
    controller = new RoverController(
      siteScene.rover,
      camera,
      canvas,
      (x, z) => siteScene!.terrain.heightAt(x, z),
      (x, z) => siteScene!.terrain.normalAt(x, z),
      { moveSpeed: 1.2, turnSpeed: 0.5, instrumentZoomDelaySeconds: 5 },
      siteScene,
    )
    controller.onInstrumentActivateRequest = handleActivate
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
    new AntennaLGController(),
    new AntennaUHFController(),
  ]
  if (controller) {
    controller.instruments = instrumentControllers
  }

  // Post-processing (dust-atmosphere / “drone feed” pass); optional via URL, env, or localStorage
  if (isSitePostProcessingEnabled()) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(siteScene.scene, camera))
    dustPass = createDustAtmospherePass(terrainParams.dustCover)
    composer.addPass(dustPass)
  }

  clock = new THREE.Clock()

  /** Accumulated simulation time (stops when `gameClock` is paused). */
  let simulationTime = 0

  function animate() {
    animationId = requestAnimationFrame(animate)
    if (!camera || !clock || !siteScene || !renderer) return

    const rawDelta = clock.getDelta()
    const sceneDelta = gameClock.getSceneDelta(rawDelta)
    const skyDelta = gameClock.getSkyDelta(rawDelta)
    gameClock.missionCooldowns.tick(sceneDelta)
    simulationTime += sceneDelta

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

    controller?.update(sceneDelta)
    roverHeading.value = controller?.heading ?? 0
    if (siteScene?.rover) {
      roverWorldX.value = siteScene.rover.position.x
      roverWorldZ.value = siteScene.rover.position.z
    }
    if (
      siteScene
      && siteScene.roverState === 'ready'
      && siteScene.rover
      && !roverSpawnCaptured
    ) {
      roverSpawnXZ.value = {
        x: siteScene.rover.position.x,
        z: siteScene.rover.position.z,
      }
      roverSpawnCaptured = true
    }

    if (camera && cameraFillLight) {
      syncCameraFillLight(
        cameraFillLight,
        camera,
        siteScene.sky?.nightFactor ?? 0,
      )
    }

    isInstrumentActive.value = controller?.mode === 'active'
    samDialogVisible.value = controller?.mode === 'active' && controller?.activeInstrument instanceof SAMController

    // Track RTG overdrive state + glow effect
    const rtg = controller?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
    if (rtg) {
      rtgPhase.value = rtg.phase
      rtgPhaseProgress.value = rtg.phaseProgress
      rtgConservationMode.value = rtg.conservationMode
      rtgConservationProgress01.value = rtg.conservationProgress01
      rtgOverdriveReady.value = rtg.canActivateOverdrive
      rtgConservationReady.value = rtg.canActivateConservation
      rtgConservationCdLabel.value = formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)
      rtgConservationCooldownTitle.value = rtg.conservationMode === 'cooldown'
        ? `Shunt recharging — ${formatRtgShuntCooldownLabel(rtg.conservationCooldownRemainingSec)}`
        : ''

      // Glow on RTG mesh only while overdrive is active (materials cloned in RTGController.attach).
      // Cooldown / recharge use UI banners — no chassis emissive so we do not tint the whole rover.
      if (rtg.node && rtg.phase === 'overdrive') {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            mat.emissive = mat.emissive || new THREE.Color()
            mat.emissive.setHex(0xff6600)
            mat.emissiveIntensity = 0.3 + Math.sin(simulationTime * 4) * 0.15
          }
        })
      } else if (rtg.node) {
        rtg.node.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
            if (mat.emissiveIntensity > 0) {
              mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.5)
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
            mat.emissiveIntensity = 0.08 + Math.sin(simulationTime * 1.5) * 0.06
          } else if (rtgPhase.value === 'idle' && mat.emissiveIntensity > 0) {
            // Fade out only if RTG isn't also glowing
            mat.emissiveIntensity = Math.max(0, mat.emissiveIntensity - sceneDelta * 0.3)
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
      crosshairColor.value = apxs.hasTarget && apxs.canCollectCurrentTarget ? 'green' : 'red'
      drillProgress.value = apxs.drillProgress
      isDrilling.value = apxs.isDrilling
      apxsDrilling = apxs.isDrilling

      // Project 3D target position to screen for crosshair overlay
      if (camera) {
        const projected = apxs.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      if (apxs.lastInventoryError) {
        sampleToastRef.value?.showError(apxs.lastInventoryError)
        apxs.lastInventoryError = null
      }
      if (apxs.lastCollected) {
        const s = apxs.lastCollected
        sampleToastRef.value?.show(s.rockType, s.displayLabel, s.weightKgThisSample)
        const gain = awardSP('apxs', s.rockMeshUuid, s.displayLabel)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        // Trace element drops from ChemCam-buffed mining
        if (apxs.lastTraceDrops) {
          for (const drop of apxs.lastTraceDrops) {
            sampleToastRef.value?.showTrace(drop.element, drop.label)
          }
          apxs.lastTraceDrops = null
        }
        const mcSurvey = controller?.instruments.find(i => i.id === 'mastcam')
        if (mcSurvey instanceof MastCamController && mcSurvey['overlayMeshes']?.length > 0) {
          mcSurvey.rebuildOverlays()
        }
        apxs.lastCollected = null
      }
    } else {
      crosshairVisible.value = false
      isDrilling.value = false
      drillProgress.value = 0
    }

    // Thermal tick (before power so heaterW is current)
    if (siteTerrainParams) {
      tickThermal(sceneDelta, {
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

    // Compute active instrument power draw (MastCam, ChemCam, etc.)
    let instrumentW = 0
    let instrumentHudLabel: string | undefined
    const chemCamIsDrivingView =
      controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      instrumentW = (controller.activeInstrument as MastCamController).powerDrawW
      instrumentHudLabel = 'MastCam'
    } else if (chemCamIsDrivingView && controller) {
      instrumentW = (controller.activeInstrument as ChemCamController).powerDrawW
      instrumentHudLabel = 'ChemCam'
    }
    // ChemCam can finish pulse/integration while another instrument card is open — still bill power
    const ccForPower = controller?.instruments.find(i => i.id === 'chemcam')
    if (!chemCamIsDrivingView && ccForPower instanceof ChemCamController && ccForPower.isSequenceAdvancing) {
      instrumentW += ccForPower.powerDrawW
      instrumentHudLabel = instrumentHudLabel ? `${instrumentHudLabel} + ChemCam` : 'ChemCam'
    }

    const rtgForPower = controller?.instruments.find(i => i.id === 'rtg')
    const powerLoadFactor = rtgForPower instanceof RTGController ? rtgForPower.powerLoadFactor : 1

    tickPower(sceneDelta, {
      nightFactor: siteScene.sky?.nightFactor ?? 0,
      roverInSunlight: siteScene.roverInSunlight,
      moving: controller?.isMoving ?? false,
      apxsDrilling,
      instrumentW,
      instrumentHudLabel,
      heaterW: heaterW.value,
      powerLoadFactor,
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

    if (siteScene.roverState === 'ready' && !gameClock.roverClockRunning.value) {
      gameClock.notifyRoverReady()
    }

    // Attach instruments once ready (idempotent — attach() checks its own flag)
    if (siteScene.roverState === 'ready' && siteScene.rover && controller && !controller.instruments[0]?.attached) {
      controller.instruments.forEach(i => {
        if (i instanceof SAMController) {
          i.attachWithBindPoses(siteScene!.rover!, siteScene!.coverBindQuats)
        } else {
          i.attach(siteScene!.rover!)
        }
      })
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
        mc.onScanComplete = (rock, rockType) => {
          const label = ROCK_TYPES[rockType]?.label ?? 'Unknown'
          const gain = awardSP('mastcam', rock.uuid, label)
          if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        }
      }
      const cc = controller?.instruments.find(i => i.id === 'chemcam')
      if (cc instanceof ChemCamController && cc.attached && !cc['scene']) {
        cc.initTargeting(siteScene.scene, siteScene.terrain.getSmallRocks())
        cc.onReady = (readout) => {
          sampleToastRef.value?.showChemCam(readout.rockType, readout.rockLabel)
          const gain = awardSP('chemcam', readout.rockMeshUuid, readout.rockLabel)
          if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        }
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
      mcInst.updateTagMarkers(simulationTime)
    }

    // Track active instrument for toolbar
    activeInstrumentSlot.value = controller?.activeInstrument?.slot ?? null

    // MastCam HUD state + crosshair + telemetry
    if (controller?.mode === 'active' && controller.activeInstrument instanceof MastCamController) {
      const mc = controller.activeInstrument
      mastcamFilterLabel.value = mc.filterLabel
      mastcamScanning.value = mc.isScanning
      mastcamScanProgress.value = mc.scanProgressValue

      // Telemetry
      mastPan.value = mc.panAngle
      mastTilt.value = mc.tiltAngle
      mastFov.value = mc.fov
      mastTargetRange.value = mc.scanTarget
        ? mc.mastWorldPos.distanceTo(mc.scanTargetWorldPos)
        : -1

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

    // ChemCam HUD state + crosshair + badge + instrument-card sequence progress
    const ccInst = controller?.instruments.find(i => i.id === 'chemcam')
    const chemCamIsActiveInstrument =
      controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController
    if (ccInst instanceof ChemCamController) {
      chemCamUnreadCount.value = ccInst.unreadCount
      ccInst.currentSP = totalSP.value
      ccInst.currentSol = marsSol.value
      if (ccInst.isSequenceAdvancing) {
        const z = thermalZone.value
        const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
        ccInst.durationMultiplier = thermalMult / playerMod('analysisSpeed')
      }
      const showCardProgress =
        activeInstrumentSlot.value === 2 && !chemCamIsActiveInstrument
        && (ccInst.phase === 'PULSE_TRAIN' || ccInst.phase === 'INTEGRATING')
      if (showCardProgress) {
        chemCamOverlaySequenceActive.value = true
        chemCamOverlaySequencePulse.value = ccInst.phase === 'PULSE_TRAIN'
        chemCamOverlaySequenceProgress.value = ccInst.phase === 'PULSE_TRAIN'
          ? ccInst.pulseProgress * 100
          : ccInst.integrateProgress * 100
        chemCamOverlaySequenceLabel.value = ccInst.phase === 'PULSE_TRAIN' ? 'FIRING...' : 'INTEGRATING...'
      } else {
        chemCamOverlaySequenceActive.value = false
      }
    } else {
      chemCamOverlaySequenceActive.value = false
    }
    if (controller?.mode === 'active' && controller.activeInstrument instanceof ChemCamController) {
      const cc = controller.activeInstrument
      cc.currentSP = totalSP.value
      cc.currentSol = marsSol.value
      chemcamPhase.value = cc.phase
      chemcamShotsRemaining.value = cc.shotsRemaining
      chemcamShotsMax.value = cc.shotsMax
      chemcamProgressPct.value = cc.phase === 'PULSE_TRAIN'
        ? cc.pulseProgress * 100
        : cc.integrateProgress * 100

      // Telemetry
      mastPan.value = cc.panAngle
      mastTilt.value = cc.tiltAngle
      mastFov.value = cc.fov
      mastTargetRange.value = cc.currentTarget
        ? cc.mastWorldPos.distanceTo(cc.targetWorldPos)
        : -1

      crosshairVisible.value = true
      crosshairColor.value = cc.targetValid ? 'green' : 'red'
      isDrilling.value = cc.phase === 'PULSE_TRAIN'
      drillProgress.value = cc.pulseProgress

      if (camera) {
        const projected = cc.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }
    }

    if (siteScene.rover && siteScene.trails) {
      siteScene.trails.update(siteScene.rover.position, controller?.heading ?? 0)
    }

    siteScene.update(simulationTime, sceneDelta, camera.position, skyDelta)

    // Update dust pass time
    if (dustPass) {
      dustPass.uniforms.uTime.value = simulationTime
    }

    if (composer) {
      composer.render()
    } else {
      renderer.render(siteScene.scene, camera)
    }
  }
  animate()

  window.addEventListener('keydown', onGlobalKeyDown)
  window.addEventListener('resize', onResize)
})

function onResize() {
  const canvas = canvasRef.value
  if (!canvas || !renderer || !camera) return
  camera.aspect = canvas.clientWidth / canvas.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
  composer?.setSize(canvas.clientWidth, canvas.clientHeight)
  if (dustPass) {
    dustPass.uniforms.uResolution.value.set(canvas.clientWidth, canvas.clientHeight)
  }
}

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('keydown', onGlobalKeyDown)
  controller?.dispose()
  if (cameraFillLight && siteScene) {
    siteScene.scene.remove(cameraFillLight.target)
    siteScene.scene.remove(cameraFillLight)
    cameraFillLight.dispose()
    cameraFillLight = null
  }
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

.hud-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-counter {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  background: rgba(102, 255, 238, 0.08);
  border: 1px solid rgba(102, 255, 238, 0.25);
  border-radius: 4px;
}

.science-hud-btn {
  padding: 4px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.18em;
  color: #0a0604;
  background: linear-gradient(180deg, rgba(102, 255, 238, 0.95), rgba(80, 200, 185, 0.9));
  border: 1px solid rgba(102, 255, 238, 0.6);
  border-radius: 4px;
  cursor: pointer;
  transition: filter 0.15s ease, box-shadow 0.15s ease;
  box-shadow: 0 0 12px rgba(102, 255, 238, 0.2);
}

.science-hud-btn:hover {
  filter: brightness(1.08);
  box-shadow: 0 0 16px rgba(102, 255, 238, 0.35);
}

.sp-icon {
  color: #66ffee;
  font-size: 12px;
  text-shadow: 0 0 6px rgba(102, 255, 238, 0.4);
}

.sp-value {
  color: #66ffee;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.05em;
}

.sp-label {
  color: rgba(102, 255, 238, 0.5);
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.12em;
}

.back-btn {
  padding: 5px 14px;
  font-size: 12px;
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
  font-size: 11px;
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
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.3);
}

.descent-label {
  color: rgba(255, 120, 60, 0.95);
}

.deploy-altitude {
  font-size: 12px;
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
  font-family: var(--font-ui);
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
  font-size: 12px;
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

.rtg-banner.conservation {
  border: 1px solid rgba(72, 188, 168, 0.5);
}

.rtg-banner.conservation .rtg-banner-text {
  color: #6ed4c4;
}

.rtg-banner-fill.conservation {
  background: rgba(72, 200, 175, 0.9);
}

.rtg-banner.shunt-cooldown {
  border: 1px solid rgba(100, 140, 135, 0.4);
}

.rtg-banner.shunt-cooldown .rtg-banner-text {
  color: rgba(160, 210, 200, 0.95);
  font-size: 11px;
}

.rtg-banner-fill.shunt-cd {
  background: rgba(100, 170, 160, 0.6);
}

.controls-hint-shunt {
  color: rgba(110, 212, 196, 0.95);
}

.conservation-dialog {
  border: 1px solid rgba(72, 188, 168, 0.25);
}

.conservation-icon {
  color: #5dc9b8 !important;
}

.overdrive-btn.confirm.conservation-confirm {
  background: linear-gradient(90deg, #1a5c52, #2a9a82);
  color: #eafaf7;
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
  font-family: var(--font-ui);
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
  font-size: 12px;
  color: rgba(196, 149, 106, 0.7);
  line-height: 1.6;
  letter-spacing: 0.04em;
  margin-bottom: 12px;
}

.overdrive-warning {
  font-size: 11px;
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
  font-family: var(--font-ui);
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
  font-family: var(--font-ui);
  font-size: 11px;
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
  font-size: 11px;
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
  font-family: var(--font-ui);
  font-size: 11px;
  color: #5dc9a5;
  letter-spacing: 0.15em;
}

/* ChemCam HUD — above InstrumentToolbar (toolbar bottom: 24px, ~4.5rem tall); keep clear of compass at top */
.chemcam-hud {
  position: fixed;
  bottom: calc(24px + 4.5rem + 10px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 43;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}

.cc-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 5, 2, 0.75);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(100, 200, 230, 0.3);
  border-radius: 6px;
  padding: 5px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
}

.cc-label {
  color: #66ffee;
  font-weight: bold;
}

.cc-divider {
  color: rgba(100, 200, 230, 0.25);
}

.cc-shots {
  color: #e8c8a0;
}

.cc-phase {
  color: #66ffee;
  font-weight: bold;
}

.cc-phase.pulse_train,
.cc-phase.pulse-train {
  color: #ff6644;
  animation: cc-blink 0.15s infinite alternate;
}

.cc-phase.integrating {
  color: #ffcc44;
}

.cc-phase.ready {
  color: #44ff88;
}

.cc-hint {
  color: rgba(100, 200, 230, 0.4);
  font-size: 11px;
}

.cc-progress-bar {
  width: 200px;
  height: 4px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
}

.cc-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.1s linear;
}

.cc-progress-fill.pulse-train {
  background: linear-gradient(90deg, #ff6644, #ff4422);
}

.cc-progress-fill.integrating {
  background: linear-gradient(90deg, #ffcc44, #66ffee);
}

.cc-progress-label {
  position: absolute;
  top: 6px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 11px;
  color: #66ffee;
  letter-spacing: 0.15em;
}

@keyframes cc-blink {
  from { opacity: 0.6; }
  to { opacity: 1; }
}

/* Unread spectrum — same ChemCam view, no camera change */
.cc-results-row {
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: auto;
}

.cc-results-hint {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #44ff88;
}

.cc-btn-see-results {
  padding: 6px 12px;
  background: rgba(102, 255, 238, 0.12);
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 6px;
  color: #66ffee;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cc-btn-see-results:hover {
  background: rgba(102, 255, 238, 0.2);
  border-color: rgba(102, 255, 238, 0.6);
}

.cc-results-badge {
  display: inline-block;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #66ffee;
  color: #0a0502;
  border-radius: 7px;
  font-size: 11px;
  font-weight: bold;
  line-height: 14px;
  text-align: center;
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
  font-family: var(--font-ui);
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
  font-size: 12px;
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
}

.sleep-hint {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.1em;
  animation: sleep-pulse 2s ease-in-out infinite;
}

.sleep-hint-warn {
  color: rgba(224, 100, 80, 0.85);
}

@keyframes sleep-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
</style>
