<template>
  <div class="w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <div class="site-hud">
      <div class="site-hud-left">
        <button class="back-btn" @click="$router.push('/globe')">BACK</button>
        <h2 class="site-name">{{ siteId }}</h2>
      </div>
      <div class="site-hud-center">
        <SiteCompass :heading="roverHeading" :pois="siteCompassPois" />
      </div>
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
    <DANProspectBar :phase="danProspectPhase" :progress="danProspectProgress" />
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
        v-if="!deploying && !descending && activeInstrumentSlot === null && rtgPhase === 'idle' && rtgConservationMode !== 'active' && !controlsHintDismissed"
        class="controls-hint"
      >
        WASD drive &middot; drag orbit &middot; 1&ndash;9 TOOLS
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
        :dan-scanning="!!(controller?.instruments.find(i => i.id === 'dan') as DANController | undefined)?.passiveSubsystemEnabled"
        @select="(slot: number) => { if (!isSleeping) controller?.activateInstrument(slot) }"
        @deselect="controller?.activateInstrument(null)"
        @toggle-inventory="inventoryOpen = !inventoryOpen"
      />
    </Transition>
    <InstrumentOverlay
      v-if="!isInstrumentActive"
      :active-slot="activeInstrumentSlot"
      :can-activate="!isSleeping && (controller?.activeInstrument?.canActivate ?? false)"
      :passive-subsystem-only="passiveOverlayPatch.only"
      :passive-subsystem-enabled="passiveOverlayPatch.enabled"
      :passive-instrument-hud="passiveOverlayPatch.hud"
      :is-active-mode="isInstrumentActive"
      :wheels-hud="activeInstrumentSlot === WHLS_SLOT ? wheelsOverlayHud : null"
      :thermal="activeInstrumentSlot === HEATER_SLOT ? { internalTempC: internalTempC, ambientC: ambientEffectiveC, heaterW: heaterW, zone: thermalZone } : null"
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
      @repair="handleInstrumentRepair"
      :dan-hit-available="danHitAvailable"
      :dan-prospect-phase="danProspectPhase"
      @dan-prospect="handleDanProspect"
    />
    <ChemCamExperimentPanel
      :readout="activeChemCamReadout"
      @close="showChemCamResults = false"
      @acknowledge="handleChemCamAck"
    />
    <ScienceLogDialog
      :open="scienceLogOpen"
      :spectra="chemCamArchivedSpectra"
      :dan-prospects="danArchivedProspects"
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
    <DANDialog
      :visible="danDialogVisible"
      :signal-strength="danSignalStrength"
      :water-ice-index="siteTerrainParams?.waterIceIndex ?? 0.1"
      :total-samples="danTotalSamples"
      :prospect-phase="danProspectPhase"
      :water-confirmed="danWaterResult"
      @close="danDialogVisible = false"
    />
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
    <div v-if="!deploying && !descending" class="power-hud-stack">
      <PowerHud
        :battery-wh="batteryWh"
        :capacity-wh="capacityWh"
        :generation-w="generationW"
        :consumption-w="consumptionW"
        :net-w="netW"
        :soc-pct="socPct"
      />
      <div v-if="!isSleeping" class="power-hud-side-controls">
        <button
          type="button"
          class="wheels-hud-btn"
          :class="{ active: activeInstrumentSlot === WHLS_SLOT, disabled: wheelsHudBlocked }"
          :disabled="wheelsHudBlocked"
          title="Mobility / drive [B]"
          @click="toggleWheelsPanel"
        >
          <span class="wheels-hud-key font-instrument">B</span>
          <span class="wheels-hud-icon">&#x25EF;</span>
          <span class="wheels-hud-name">WHLS</span>
        </button>
        <button
          type="button"
          class="wheels-hud-btn wheels-hud-btn--heater"
          :class="{
            active: activeInstrumentSlot === HEATER_SLOT,
            disabled: wheelsHudBlocked,
            'wheels-hud-btn--heater-on': heaterThermostatOn,
          }"
          :disabled="wheelsHudBlocked"
          :title="heaterHudButtonTitle"
          @click="toggleHeaterPanel"
        >
          <span class="wheels-hud-key font-instrument">H</span>
          <span class="wheels-hud-icon wheels-hud-heater-icon" aria-hidden="true">&#x2668;</span>
          <span class="wheels-hud-name">HTR</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { MARS_TIME_OF_DAY_06_00, SOL_DURATION, MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'
import { SiteScene } from '@/three/SiteScene'
import { RoverController } from '@/three/RoverController'
import { createCameraFillLight, syncCameraFillLight } from '@/three/cameraFillLight'
import { createDustAtmospherePass } from '@/three/DustAtmospherePass'
import { isSitePostProcessingEnabled } from '@/lib/sitePostProcessing'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import {
  roverHeadingRadToCompassDeg,
  signedRelativeBearingDeg,
  worldBearingDegToPoi,
} from '@/lib/sitePoiBearing'
import { useMarsData } from '@/composables/useMarsData'
import { useSiteMissionPois } from '@/composables/useSiteMissionPois'
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
import DANDialog from '@/components/DANDialog.vue'
import DANProspectBar from '@/components/DANProspectBar.vue'
import PowerHud from '@/components/PowerHud.vue'
import SolClock from '@/components/SolClock.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import { useInventory } from '@/composables/useInventory'
import { useMarsGameClock } from '@/composables/useMarsGameClock'
import { useMarsPower, POWER_SLEEP_THRESHOLD_PCT, type InstrumentPowerLineInput } from '@/composables/useMarsPower'
import { useMarsThermal } from '@/composables/useMarsThermal'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useSciencePoints } from '@/composables/useSciencePoints'
import { useChemCamArchive } from '@/composables/useChemCamArchive'
import { useDanArchive } from '@/composables/useDanArchive'
import { ROCK_TYPES } from '@/three/terrain/RockTypes'
import {
  MastCamController,
  ChemCamController,
  DrillController,
  APXSController,
  DANController,
  SAMController,
  RTGController,
  HeaterController,
  HEATER_SLOT,
  REMSController,
  RADController,
  AntennaLGController,
  AntennaUHFController,
  RoverWheelsController,
  WHLS_SLOT,
  instrumentSelectionEmissiveIntensity,
  type RTGConservationState,
} from '@/three/instruments'
import CommToolbar from '@/components/CommToolbar.vue'

const route = useRoute()
const siteId = route.params.siteId as string
const { archiveAcknowledgedReadout, spectra: chemCamArchivedSpectra } = useChemCamArchive()
const { archiveProspect: archiveDanProspect, prospects: danArchivedProspects } = useDanArchive()
const scienceLogOpen = ref(false)
const hasScienceDiscoveries = computed(() => chemCamArchivedSpectra.value.length > 0 || danArchivedProspects.value.length > 0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roverHeading = ref(0)
/** Mirrors {@link RoverController.isMoving} into Vue so wheels HUD updates when translation stops (heading alone is not enough). */
const roverIsMoving = ref(false)
/** After first W/S drive while deployed, hide the centered driving tips (per session). */
const controlsHintDismissed = ref(false)
const descending = ref(true)
const deploying = ref(false)
const deployProgress = ref(0)
const activeInstrumentSlot = ref<number | null>(null)
/** Bumped when a passive instrument (DAN/REMS/RAD/comms) toggles STANDBY so the overlay re-reads bus state. */
const passiveUiRevision = ref(0)

const passiveOverlayPatch = computed(() => {
  void passiveUiRevision.value
  void activeInstrumentSlot.value
  const i = controller?.activeInstrument
  if (!i?.passiveSubsystemOnly) {
    return { only: false as const, enabled: true, hud: null as null }
  }
  const w = i.selectionIdlePowerW
  const on = i.passiveSubsystemEnabled
  const statusOn: Record<string, string> = {
    dan: 'SCANNING',
    rems: 'SURVEYING',
    rad: 'MONITORING',
    'antenna-lg': 'CONNECTED',
    'antenna-uhf': 'RELAY LOCK',
  }
  return {
    only: true as const,
    enabled: on,
    hud: {
      power: on ? `${w}W` : '0W',
      powerColor: on ? '#5dc9a5' : '#6b4a30',
      status: on ? (statusOn[i.id] ?? 'ON') : 'STANDBY',
      statusColor: on ? '#5dc9a5' : '#6b4a30',
    },
  }
})

const isInstrumentActive = ref(false)
const samDialogVisible = ref(false)

// --- DAN state ---
const danHitAvailable = ref(false)
const danProspectPhase = ref<string>('idle')
const danProspectProgress = ref(0)
const danDialogVisible = ref(false)
const danSignalStrength = ref(0)
const danTotalSamples = ref(0)
const danWaterResult = ref<boolean | null>(null)
let danDiscMesh: THREE.Mesh | null = null
let danConeMesh: THREE.Mesh | null = null
/** Completed prospect site markers — shown when DAN slot is selected */
const danCompletedDiscs: THREE.Mesh[] = []
const INITIATE_DURATION = 4
const PROSPECT_DURATION_MARS_HOURS = 2

const rtgPhase = ref<'idle' | 'overdrive' | 'cooldown' | 'recharging'>('idle')
const rtgPhaseProgress = ref(0)
const rtgConservationMode = ref<RTGConservationState>('off')
const rtgOverdriveReady = ref(false)
const rtgConservationReady = ref(false)
const rtgConservationCooldownTitle = ref('')
/** 0–1 elapsed for active shunt or shunt cooldown (for banner bars). */
const rtgConservationProgress01 = ref(0)
const rtgConservationCdLabel = ref('')

/** WHLS + HTR controls beside power HUD — disabled while RTG locks other instruments ([B]/[H]). */
const wheelsHudBlocked = computed(
  () => rtgPhase.value === 'overdrive' || rtgPhase.value === 'cooldown',
)

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

/**
 * Live mobility stats for the wheels instrument card (slot 13).
 * Depends on `roverHeading` and `roverIsMoving` (synced from the controller each frame).
 */
const wheelsOverlayHud = computed(() => {
  roverHeading.value
  roverIsMoving.value
  const w = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
  if (!w) return { powerStr: '—', statusStr: '—', healthPct: 100 }
  const moving = roverIsMoving.value
  const draw = w.getDrivePowerW()
  const powerStr = moving ? `${draw.toFixed(0)} W` : '0 W'
  const statusStr = !w.operational ? 'OFFLINE' : moving ? 'DRIVING' : 'READY'
  return { powerStr, statusStr, healthPct: w.durabilityPct }
})

function handleInstrumentRepair() {
  const w = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
  if (activeInstrumentSlot.value === WHLS_SLOT && w) w.repair()
}

function toggleWheelsPanel() {
  if (!controller || isSleeping.value || wheelsHudBlocked.value) return
  if (activeInstrumentSlot.value === WHLS_SLOT) controller.activateInstrument(null)
  else controller.activateInstrument(WHLS_SLOT)
}

function toggleHeaterPanel() {
  if (!controller || isSleeping.value || wheelsHudBlocked.value) return
  if (activeInstrumentSlot.value === HEATER_SLOT) controller.activateInstrument(null)
  else controller.activateInstrument(HEATER_SLOT)
}

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

const {
  pois: missionPois,
  focusPoiId,
  loadPoisForSite,
  clearPois,
} = useSiteMissionPois()

/** Mission POIs as compass-relative bearings (updates with rover position and heading). */
const siteCompassPois = computed(() => {
  const rx = roverWorldX.value
  const rz = roverWorldZ.value
  const hDeg = roverHeadingRadToCompassDeg(roverHeading.value)
  const fid = focusPoiId.value
  return missionPois.value.map((p) => ({
    id: p.id,
    label: p.label,
    relativeDeg: signedRelativeBearingDeg(
      hDeg,
      worldBearingDegToPoi(rx, rz, p.x, p.z),
    ),
    focused: p.id === fid,
    color: p.color,
  }))
})

watch(
  () => route.params.siteId as string,
  (id) => {
    controlsHintDismissed.value = false
    if (id) void loadPoisForSite(id)
  },
  { immediate: true },
)
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
const {
  profile,
  batteryWh,
  capacityWh,
  generationW,
  consumptionW,
  netW,
  socPct,
  isSleeping,
  tickPower,
  fillBatteryFull,
} = useMarsPower()
const { internalTempC, ambientEffectiveC, heaterW, zone: thermalZone, tickThermal } = useMarsThermal()
/** True when automatic thermostat is drawing bus power (heaterW from thermal tick). */
const heaterThermostatOn = computed(() => heaterW.value > 0.5)
const heaterHudButtonTitle = computed(() =>
  heaterThermostatOn.value
    ? `Thermal / heater [H] — heating ~${Math.round(heaterW.value)} W`
    : 'Thermal / heater [H]',
)
const { mod: playerMod } = usePlayerProfile()
const { totalSP, sessionSP, lastGain, award: awardSP, awardAck, awardDAN } = useSciencePoints()
const { landmarks, loadLandmarks } = useMarsData()

let lastSkyTimeOfDay = -1

/** Main-bus instrument lines for the power tick: passive payloads while driving, focused slot, background ChemCam. */
function buildInstrumentPowerLines(
  roverCtl: RoverController | null,
  roverReady: boolean,
  roverAwake: boolean,
): InstrumentPowerLineInput[] {
  const lines: InstrumentPowerLineInput[] = []
  if (!roverCtl) return lines

  if (roverReady && roverAwake) {
    for (const inst of roverCtl.instruments) {
      if (!inst.billsPassiveBackgroundPower) continue
      const w = inst.getPassiveBackgroundPowerW()
      if (w > 1e-6) {
        lines.push({ id: `${inst.id}-bg`, label: inst.name, w })
      }
    }
  }

  const mode = roverCtl.mode
  const focused = roverCtl.activeInstrument
  if ((mode === 'instrument' || mode === 'active') && focused && focused.id !== 'heater') {
    const phase = mode === 'active' ? 'active' : 'instrument'
    const w = focused.getInstrumentBusPowerW(phase)
    if (w > 1e-6) {
      lines.push({ id: focused.id, label: focused.name, w })
    }
  }

  const cc = roverCtl.instruments.find((i): i is ChemCamController => i instanceof ChemCamController)
  if (cc?.isSequenceAdvancing) {
    const chemCamFocused =
      focused?.id === 'chemcam' && (mode === 'instrument' || mode === 'active')
    if (!chemCamFocused) {
      const w = Math.max(ChemCamController.BUS_IDLE_W, cc.powerDrawW)
      if (w > 1e-6) {
        lines.push({ id: 'chemcam', label: 'ChemCam', w })
      }
    }
  }

  return lines
}

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
    const passive = controller.activeInstrument?.passiveSubsystemOnly
    controller.enterActiveMode()
    if (passive) passiveUiRevision.value++
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

function handleDanProspect(): void {
  const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
  if (!danInst?.pendingHit) return

  const hit = danInst.pendingHit

  if (!danDiscMesh) {
    const geo = new THREE.CircleGeometry(5, 32)
    geo.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false,
    })
    danDiscMesh = new THREE.Mesh(geo, mat)
    siteScene?.scene.add(danDiscMesh)
  }
  const groundY = siteScene?.terrain
    ? siteScene.terrain.heightAt(hit.worldPosition.x, hit.worldPosition.z)
    : hit.worldPosition.y
  danDiscMesh.position.set(hit.worldPosition.x, groundY + 0.05, hit.worldPosition.z)
  danDiscMesh.visible = true

  danInst.prospectStrength = hit.signalStrength
  danInst.prospectPhase = 'drive-to-zone'
  danProspectPhase.value = 'drive-to-zone'
  danProspectProgress.value = 0
  danWaterResult.value = null
  danDialogVisible.value = true
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
    new DrillController(),
    new APXSController(),
    new DANController(),
    new SAMController(),
    new RTGController(),
    new HeaterController(),
    new REMSController(),
    new RADController(),
    new RoverWheelsController(),
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
    {
      const moving =
        siteScene.roverState === 'ready' && controller ? (controller.isMoving ?? false) : false
      if (moving !== roverIsMoving.value) roverIsMoving.value = moving
      if (moving) controlsHintDismissed.value = true
    }
    const wheelsInst = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
    if (wheelsInst) wheelsInst.baseDriveW = profile.baseDriveW
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

    // Instrument focus — cyan emissive on each tool’s GLTF subtree while selected (see InstrumentController.selectionHighlightColor + clone in attach).
    const activeInst = controller?.activeInstrument ?? null
    const instrumentViewActive =
      Boolean(controller && (controller.mode === 'instrument' || controller.mode === 'active'))
    const glowIntensity = instrumentSelectionEmissiveIntensity(simulationTime)
    for (const inst of controller?.instruments ?? []) {
      const hex = inst.selectionHighlightColor
      if (hex == null || !inst.node) continue
      if (inst instanceof RTGController && inst.phase === 'overdrive') continue
      const focused =
        instrumentViewActive && activeInst === inst && !isSleeping.value
      inst.node.traverse((child) => {
        if (!(child as THREE.Mesh).isMesh) return
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (!mat.emissive) return
        if (focused) {
          mat.emissive.setHex(hex)
          mat.emissiveIntensity = glowIntensity
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

    let rockDrilling = false
    if (controller?.mode === 'active' && controller.activeInstrument instanceof DrillController) {
      const drill = controller.activeInstrument
      // Thermal effect + player analysisSpeed buff/nerf
      // analysisSpeed > 1 = faster analysis = lower duration multiplier
      const z = thermalZone.value
      const thermalMult = z === 'OPTIMAL' ? 1.0 : z === 'COLD' ? 0.85 : z === 'FRIGID' ? 1.25 : 2.0
      drill.drillDurationMultiplier = thermalMult / playerMod('analysisSpeed')
      drill.setRoverPosition(siteScene.rover!.position)
      crosshairVisible.value = true
      crosshairColor.value = drill.hasTarget && drill.canCollectCurrentTarget ? 'green' : 'red'
      drillProgress.value = drill.drillProgress
      isDrilling.value = drill.isDrilling
      rockDrilling = drill.isDrilling

      // Project 3D target position to screen for crosshair overlay
      if (camera) {
        const projected = drill.targetWorldPos.clone().project(camera)
        crosshairX.value = (projected.x * 0.5 + 0.5) * 100
        crosshairY.value = (-projected.y * 0.5 + 0.5) * 100
      }

      if (drill.lastInventoryError) {
        sampleToastRef.value?.showError(drill.lastInventoryError)
        drill.lastInventoryError = null
      }
      if (drill.lastCollected) {
        const s = drill.lastCollected
        sampleToastRef.value?.show(s.rockType, s.displayLabel, s.weightKgThisSample)
        const gain = awardSP('drill', s.rockMeshUuid, s.displayLabel)
        if (gain) sampleToastRef.value?.showSP(gain.amount, gain.source, gain.bonus)
        // Trace element drops from ChemCam-buffed mining
        if (drill.lastTraceDrops) {
          for (const drop of drill.lastTraceDrops) {
            sampleToastRef.value?.showTrace(drop.element, drop.label)
          }
          drill.lastTraceDrops = null
        }
        const mcSurvey = controller?.instruments.find(i => i.id === 'mastcam')
        if (mcSurvey instanceof MastCamController && mcSurvey['overlayMeshes']?.length > 0) {
          mcSurvey.rebuildOverlays()
        }
        drill.lastCollected = null
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

    // --- DAN frame update ---
    const danInst = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
    if (danInst && siteScene.roverState === 'ready') {
      danInst.setRoverState(
        siteScene.rover?.position ?? new THREE.Vector3(),
        controller?.isMoving ?? false,
      )
      if (siteTerrainParams) {
        danInst.waterIceIndex = siteTerrainParams.waterIceIndex ?? 0.1
        danInst.featureType = siteTerrainParams.featureType ?? 'plain'
      }
      danInst.update(sceneDelta)

      danTotalSamples.value = danInst.totalSamples
      danHitAvailable.value = danInst.pendingHit !== null

      // VFX: always tick so dots hide when deselected
      const danSelected = controller?.activeInstrument?.id === 'dan'
      danInst.vfxVisible = !!danSelected
      const rp = siteScene.rover?.position
      const groundY = rp && siteScene.terrain ? siteScene.terrain.heightAt(rp.x, rp.z) : 0
      danInst.updateVFX(sceneDelta, groundY)

      // Show completed prospect site discs when DAN is selected
      for (const disc of danCompletedDiscs) disc.visible = !!danSelected

      // Hit detection → toast + SP
      if (danInst.pendingHit && !danInst.hitConsumed) {
        if (danHitAvailable.value) {
          sampleToastRef.value?.showDAN('New hydrogen signal — previous marker updated')
        }
        const hit = danInst.pendingHit
        const qual = DANController.qualityLabel(hit.signalStrength)
        sampleToastRef.value?.showDAN(`Hydrogen signal — ${qual} (${Math.round(hit.signalStrength * 100)}%)`)
        const gain = awardDAN('DAN signal hit')
        if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN SIGNAL', gain.bonus)
        danSignalStrength.value = hit.signalStrength
        danInst.hitConsumed = true
        danHitAvailable.value = true
      }

      // Sleep mode safety
      if (isSleeping.value && danInst.passiveSubsystemEnabled) {
        danInst.forceOff()
        sampleToastRef.value?.showDAN('Prospect interrupted — insufficient power')
        if (danDiscMesh) danDiscMesh.visible = false
        danProspectPhase.value = 'idle'
        danProspectProgress.value = 0
        passiveUiRevision.value++
      }
    }

    // --- DAN prospect phase tick ---
    if (danInst && danInst.prospectPhase !== 'idle' && danInst.prospectPhase !== 'complete') {
      const rp = siteScene?.rover?.position
      const hitPos = danDiscMesh?.position
      if (rp && hitPos) {
        const distToZone = new THREE.Vector2(rp.x - hitPos.x, rp.z - hitPos.z).length()

        if (danInst.prospectPhase === 'drive-to-zone') {
          if (distToZone < 5) {
            danInst.prospectPhase = 'initiating'
            danProspectPhase.value = 'initiating'
            danProspectProgress.value = 0
          }
        } else if (danInst.prospectPhase === 'initiating') {
          if (distToZone >= 5) {
            danInst.prospectPhase = 'drive-to-zone'
            danProspectPhase.value = 'drive-to-zone'
            danProspectProgress.value = 0
          } else {
            danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / INITIATE_DURATION)
            danInst.prospectProgress = danProspectProgress.value
            if (danProspectProgress.value >= 1) {
              danInst.prospectPhase = 'prospecting'
              danProspectPhase.value = 'prospecting'
              danProspectProgress.value = 0
              if (controller) controller.config.moveSpeed = 0
            }
          }
        } else if (danInst.prospectPhase === 'prospecting') {
          const prospectDurationSec = (PROSPECT_DURATION_MARS_HOURS * 60 / MARS_SOL_CLOCK_MINUTES) * SOL_DURATION
          danProspectProgress.value = Math.min(1, danProspectProgress.value + sceneDelta / prospectDurationSec)
          danInst.prospectProgress = danProspectProgress.value

          if (danProspectProgress.value >= 1) {
            danInst.prospectPhase = 'complete'
            danProspectPhase.value = 'complete'
            danInst.prospectComplete = true

            const gain = awardDAN('DAN prospect complete')
            if (gain) sampleToastRef.value?.showSP(gain.amount, 'DAN PROSPECT', gain.bonus)

            const hasWater = danInst.rollWater()
            danInst.waterConfirmed = hasWater
            danWaterResult.value = hasWater

            // Place cone marker at prospect site
            const conePos = danDiscMesh?.position.clone() ?? hitPos.clone()
            const coneGeo = new THREE.ConeGeometry(0.2, 0.5, 8)
            const coneMat = new THREE.MeshBasicMaterial({ color: hasWater ? 0x44aaff : 0xaaaaaa })
            danConeMesh = new THREE.Mesh(coneGeo, coneMat)
            danConeMesh.position.copy(conePos)
            danConeMesh.position.y += 0.25
            siteScene?.scene.add(danConeMesh)
            danInst.drillSitePosition = conePos.clone()
            danInst.reservoirQuality = danInst.prospectStrength

            if (hasWater) {
              sampleToastRef.value?.showDAN('Subsurface ice confirmed — marking drill site')
              const bonusGain = awardDAN('DAN water confirmed')
              if (bonusGain) sampleToastRef.value?.showSP(bonusGain.amount, 'WATER CONFIRMED', bonusGain.bonus)
            } else {
              sampleToastRef.value?.showDAN('Analysis inconclusive — hydrogen likely mineral-bound')
            }

            // Archive to science log
            archiveDanProspect({
              capturedSol: marsSol.value,
              siteId,
              siteLatDeg: siteLat.value,
              siteLonDeg: siteLon.value,
              roverWorldX: roverWorldX.value,
              roverWorldZ: roverWorldZ.value,
              roverSpawnX: roverSpawnXZ.value.x,
              roverSpawnZ: roverSpawnXZ.value.z,
              signalStrength: danInst.prospectStrength,
              quality: DANController.qualityLabel(danInst.prospectStrength) as 'Weak' | 'Moderate' | 'Strong',
              waterConfirmed: hasWater,
              reservoirQuality: danInst.prospectStrength,
            })

            // Keep disc as a completed site marker (hidden by default, shown when DAN selected)
            if (danDiscMesh) {
              danDiscMesh.visible = false
              // Recolor: blue for water, dim gray for inconclusive
              ;(danDiscMesh.material as THREE.MeshBasicMaterial).color.set(hasWater ? 0x44aaff : 0x666688)
              ;(danDiscMesh.material as THREE.MeshBasicMaterial).opacity = 0.15
              danCompletedDiscs.push(danDiscMesh)
              danDiscMesh = null  // next prospect creates a fresh disc
            }
            danInst.pendingHit = null
            danHitAvailable.value = false
            if (controller) controller.config.moveSpeed = 5
          }
        }
      }
    }

    const instrumentLines = buildInstrumentPowerLines(
      controller,
      siteScene.roverState === 'ready',
      !isSleeping.value,
    )

    const rtgForPower = controller?.instruments.find(i => i.id === 'rtg')
    const powerLoadFactor = rtgForPower instanceof RTGController ? rtgForPower.powerLoadFactor : 1

    const wheelsForPower = controller?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
    const driveMotorW =
      wheelsForPower && (controller?.isMoving ?? false) ? wheelsForPower.getDrivePowerW() : 0

    tickPower(sceneDelta, {
      nightFactor: siteScene.sky?.nightFactor ?? 0,
      roverInSunlight: siteScene.roverInSunlight,
      moving: controller?.isMoving ?? false,
      rockDrilling,
      driveMotorW,
      driveMotorHudLabel: 'Rover wheels',
      instrumentLines,
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
      const drillInst = controller?.instruments.find(i => i.id === 'drill')
      if (drillInst instanceof DrillController && drillInst.attached && !drillInst.targeting) {
        drillInst.initGameplay(siteScene.scene, camera, siteScene.terrain.getSmallRocks())
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
      const danInit = controller?.instruments.find(i => i.id === 'dan') as DANController | undefined
      if (danInit && siteScene) danInit.initVFX(siteScene.scene)
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
  clearPois()
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
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: 12px;
  padding: 0 16px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.site-hud-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.site-hud-center {
  justify-self: center;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.hud-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Power HUD + mobility strip — left column, vertically centered */
.power-hud-stack {
  position: fixed;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  width: max-content;
  max-width: 120px;
  pointer-events: none;
}

/** WHLS + HTR column — stacked under the power readout */
.power-hud-side-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.power-hud-side-controls .wheels-hud-btn {
  pointer-events: auto;
}

.wheels-hud-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  background: rgba(10, 5, 2, 0.78);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 8px;
  cursor: pointer;
  pointer-events: auto;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  font-family: var(--font-ui);
}

.wheels-hud-btn:hover:not(:disabled) {
  background: rgba(196, 117, 58, 0.12);
  border-color: rgba(196, 117, 58, 0.35);
}

.wheels-hud-btn.active {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.55);
  box-shadow: 0 0 8px rgba(196, 117, 58, 0.2);
}

.wheels-hud-btn:disabled,
.wheels-hud-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.wheels-hud-key {
  position: absolute;
  top: 4px;
  left: 6px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  color: rgba(196, 149, 106, 0.45);
  letter-spacing: 0;
}

.wheels-hud-btn.active .wheels-hud-key {
  color: rgba(196, 117, 58, 0.85);
}

.wheels-hud-icon {
  font-size: 17px;
  color: rgba(255, 255, 255, 0.35);
  line-height: 1;
  margin-top: 4px;
}

.wheels-hud-btn.active .wheels-hud-icon {
  color: rgba(196, 117, 58, 0.95);
}

/* HTR: ♨ reads “heater”; warm pulse only while thermostat is on (specificity ≥ .active .wheels-hud-icon) */
.wheels-hud-btn.wheels-hud-btn--heater-on .wheels-hud-heater-icon {
  color: #ef9f27;
  animation: wheels-hud-heater-glow 1.5s ease-in-out infinite;
}

.wheels-hud-btn.active.wheels-hud-btn--heater-on .wheels-hud-heater-icon {
  color: #f5b04a;
}

@media (prefers-reduced-motion: reduce) {
  .wheels-hud-btn.wheels-hud-btn--heater-on .wheels-hud-heater-icon {
    animation: none;
  }
}

@keyframes wheels-hud-heater-glow {
  0%,
  100% {
    filter: drop-shadow(0 0 1px rgba(239, 159, 39, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(239, 159, 39, 0.85));
  }
}

.wheels-hud-name {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: rgba(255, 255, 255, 0.28);
  text-transform: uppercase;
}

.wheels-hud-btn.active .wheels-hud-name {
  color: rgba(196, 149, 106, 0.75);
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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 35;
  padding: 10px 28px;
  max-width: min(90vw, 520px);
  text-align: center;
  line-height: 1.55;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  pointer-events: none;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
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

/* ChemCam HUD — above InstrumentToolbar (toolbar bottom: 24px, ~4.5rem tall) */
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
