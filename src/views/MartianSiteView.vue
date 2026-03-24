<template>
  <div class="martian-site-view w-full h-full">
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
        <button
          type="button"
          class="ach-counter"
          aria-haspopup="dialog"
          :aria-expanded="achievementsOpen"
          aria-label="Achievements"
          @click="achievementsOpen = true"
        >
          <span class="ach-trophy" aria-hidden="true">🏆</span>
          <span class="ach-count font-instrument">{{ unlockedAchievementCount }}/{{ totalAchievementCount }}</span>
        </button>
        <button
          type="button"
          class="sp-counter"
          aria-haspopup="dialog"
          :aria-expanded="spLedgerOpen"
          aria-label="Science points history"
          @click="spLedgerOpen = true"
        >
          <span class="sp-icon" aria-hidden="true">&#x2726;</span>
          <span class="sp-value font-instrument">{{ totalSP }}</span>
          <span class="sp-label">SP</span>
        </button>
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
      <div v-if="apxsState === 'counting'" class="apxs-countdown-overlay" key="apxs-countdown">
        <div class="apxs-countdown-card">
          <div class="apxs-countdown-label">APXS CONTACT</div>
          <div class="apxs-countdown-num font-instrument">{{ apxsCountdown }}</div>
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
        v-if="centerHintText"
        class="controls-hint"
        :class="centerHintClass"
      >
        {{ centerHintText }}
      </div>
    </Transition>
    <Transition name="deploy-fade">
      <InstrumentToolbar
        v-if="!deploying && !descending"
        :active-slot="activeInstrumentSlot"
        :inventory-open="inventoryOpen"
        :chem-cam-unread="chemCamUnreadCount"
        :sam-unread="samUnread"
        :apxs-unread="apxsUnread"
        :dan-scanning="!!(siteRover?.instruments.find(i => i.id === 'dan') as DANController | undefined)?.passiveSubsystemEnabled"
        @select="(slot: number) => { if (!isSleeping) siteRover?.activateInstrument(slot) }"
        @deselect="siteRover?.activateInstrument(null)"
        @toggle-inventory="inventoryOpen = !inventoryOpen"
      />
    </Transition>
    <InstrumentOverlay
      v-if="!isInstrumentActive"
      :active-slot="activeInstrumentSlot"
      :can-activate="!isSleeping && (siteRover?.activeInstrument?.canActivate ?? false)"
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
      :sam-processing="samIsProcessing"
      :sam-progress-pct="samCurrentExperiment ? ((1 - samCurrentExperiment.remainingTimeSec / samCurrentExperiment.totalTimeSec) * 100) : 0"
      :sam-progress-label="samCurrentExperiment ? samCurrentExperiment.modeName + ' — ' + Math.ceil(samCurrentExperiment.remainingTimeSec) + 's' : ''"
      :sam-unread="samUnread"
      @sam-see-results="samResultDialogEntry = samResults[0] ?? null"
      :apxs-processing="apxsIsProcessing"
      :apxs-progress-pct="apxsCurrentExperiment ? ((1 - apxsCurrentExperiment.remainingTimeSec / apxsCurrentExperiment.totalTimeSec) * 100) : 0"
      :apxs-progress-label="apxsCurrentExperiment ? 'APXS — ' + Math.ceil(apxsCurrentExperiment.remainingTimeSec) + 's' : ''"
      :apxs-unread="apxsUnread"
      @apxs-see-results="apxsResultDialogEntry = apxsResults[0] ?? null"
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
      :sam-results="samArchivedDiscoveries"
      :apxs-results="apxsArchivedAnalyses"
      @close="scienceLogOpen = false"
      @queue-for-transmission="handleQueueForTx"
      @dequeue-from-transmission="handleDequeueFromTx"
    />
    <SciencePointsDialog :open="spLedgerOpen" @close="spLedgerOpen = false" @open-track="spLedgerOpen = false; rewardTrackOpen = true" />
    <AchievementsDialog
      :open="achievementsOpen"
      :libs="libsAchievements"
      :dan="danAchievements"
      :survival="survivalAchievements"
      :unlocked-ids="unlockedAchievementIds"
      :total-sp="totalSP"
      :mission-sol="marsSol"
      :reward-track="rewardTrackMilestones"
      @close="achievementsOpen = false"
    />
    <RewardTrackDialog
      :open="rewardTrackOpen"
      :milestones="rewardTrackMilestones"
      :unlocked-ids="unlockedTrackIds"
      :total-sp="totalSP"
      @close="rewardTrackOpen = false"
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
    <SAMDialog
      :visible="samDialogVisible"
      :stacks="inventoryStacks"
      :total-s-p="totalSP"
      :sample-consumption-kg="samExperiments.data.value?.sampleConsumptionKg ?? 0.002"
      @close="samDialogVisible = false"
      @enqueue="handleSamEnqueue"
    />
    <SAMResultDialog
      :result="samResultDialogEntry"
      @acknowledge="handleSamAcknowledge"
      @close="samResultDialogEntry = null"
    />
    <APXSResultDialog
      :result="apxsResultDialogEntry"
      @acknowledge="handleAPXSAcknowledge"
      @close="apxsResultDialogEntry = null"
    />
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
      <Transition name="science-fade">
        <div v-if="apxsMinigameOpen && apxsGameComposition" class="science-overlay">
          <div class="apxs-game-container">
            <APXSMinigame
              :rock-type="apxsGameRockType"
              :composition="apxsGameComposition"
              :duration-sec="apxsGameDuration"
              @complete="handleAPXSComplete"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
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
      @select="(slot: number) => siteRover?.activateInstrument(slot)"
      @deselect="siteRover?.activateInstrument(null)"
    />
    <!-- LGA Mailbox panel (shown when LGA antenna selected) -->
    <LGAMailbox
      v-if="!deploying && !descending && activeInstrumentSlot === 11"
      :messages="lgaMailbox.messages.value"
      :unread-count="lgaUnreadCount"
      @mark-read="lgaMailbox.markRead"
      style="position: fixed; top: 160px; left: 10px; z-index: 40;"
    />
    <!-- UHF Uplink panel (shown when UHF antenna selected) -->
    <UHFUplinkPanel
      v-if="!deploying && !descending && activeInstrumentSlot === 12"
      :pass-active="uhfPassActive"
      :transmitting="uhfTransmitting"
      :current-orbiter="uhfCurrentOrbiter"
      :transmission-progress="uhfTransmissionProgress"
      :queue-length="uhfQueueLength"
      :window-remaining-sec="uhfWindowRemainingSec"
      :next-pass-in-sec="uhfNextPassInSec"
      :transmitted-this-pass="uhfTransmittedThisPass"
      :uhf-enabled="uhfEnabled"
      :passes="currentSolPasses"
      style="position: fixed; top: 160px; left: 10px; z-index: 40;"
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
import { ref, computed, watch, watchEffect, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { MARS_TIME_OF_DAY_06_00, SOL_DURATION, MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'
import {
  roverHeadingRadToCompassDeg,
  signedRelativeBearingDeg,
  worldBearingDegToPoi,
} from '@/lib/sitePoiBearing'
import { useMarsData } from '@/composables/useMarsData'
import { useSiteMissionPois } from '@/composables/useSiteMissionPois'
import SiteCompass from '@/components/SiteCompass.vue'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import {
  createMarsSiteViewController,
  formatRtgShuntCooldownLabel,
  type MarsSiteViewContext,
  type MarsSiteViewControllerHandle,
} from '@/views/MarsSiteViewController'
import InstrumentToolbar from '@/components/InstrumentToolbar.vue'
import InstrumentOverlay from '@/components/InstrumentOverlay.vue'
import ChemCamExperimentPanel from '@/components/ChemCamExperimentPanel.vue'
import ScienceLogDialog from '@/components/ScienceLogDialog.vue'
import SciencePointsDialog from '@/components/SciencePointsDialog.vue'
import AchievementsDialog from '@/components/AchievementsDialog.vue'
import RewardTrackDialog from '@/components/RewardTrackDialog.vue'
import AchievementBanner from '@/components/AchievementBanner.vue'
import MastTelemetry from '@/components/MastTelemetry.vue'
import InstrumentCrosshair from '@/components/InstrumentCrosshair.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import SampleToast from '@/components/SampleToast.vue'
import SAMDialog from '@/components/SAMDialog.vue'
import SAMResultDialog from '@/components/SAMResultDialog.vue'
import DANDialog from '@/components/DANDialog.vue'
import DANProspectBar from '@/components/DANProspectBar.vue'
import PowerHud from '@/components/PowerHud.vue'
import SolClock from '@/components/SolClock.vue'
import ProfilePanel from '@/components/ProfilePanel.vue'
import { useInventory, devSpawnRandomInventoryItems, devSpawnInventoryItem } from '@/composables/useInventory'
import { useSamExperiments } from '@/composables/useSamExperiments'
import { useSamQueue, type SamQueueEntry } from '@/composables/useSamQueue'
import { useSamArchive } from '@/composables/useSamArchive'
import { useOrbitalDrops } from '@/composables/useOrbitalDrops'
import { useMarsGameClock } from '@/composables/useMarsGameClock'
import { useMarsPower, POWER_SLEEP_THRESHOLD_PCT } from '@/composables/useMarsPower'
import { useMarsThermal } from '@/composables/useMarsThermal'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useSciencePoints } from '@/composables/useSciencePoints'
import { useRewardTrack } from '@/composables/useRewardTrack'
import type { RewardTrackMilestone } from '@/lib/rewardTrack'
import { milestonesUnlockedBetween } from '@/lib/rewardTrack'
import { useChemCamArchive } from '@/composables/useChemCamArchive'
import { useDanArchive } from '@/composables/useDanArchive'
import { getInventoryItemDef, INVENTORY_CATALOG } from '@/types/inventory'
import {
  MastCamController,
  ChemCamController,
  DANController,
  SAMController,
  RTGController,
  HeaterController,
  HEATER_SLOT,
  RoverWheelsController,
  WHLS_SLOT,
  type RTGConservationState,
} from '@/three/instruments'
import CommToolbar from '@/components/CommToolbar.vue'
import LGAMailbox from '@/components/LGAMailbox.vue'
import UHFUplinkPanel from '@/components/UHFUplinkPanel.vue'
import { useLGAMailbox } from '@/composables/useLGAMailbox'
import { useOrbitalPasses } from '@/composables/useOrbitalPasses'
import APXSMinigame from '@/components/APXSMinigame.vue'
import APXSResultDialog from '@/components/APXSResultDialog.vue'
import { useAPXSArchive } from '@/composables/useAPXSArchive'
import { useAPXSQueue, type APXSQueueEntry } from '@/composables/useAPXSQueue'
import { generateComposition, computeAPXSSp, type APXSComposition, type APXSElementId } from '@/lib/apxsComposition'
import type { APXSCountdownState } from '@/views/site-controllers/APXSTickHandler'

const route = useRoute()
const siteId = route.params.siteId as string

const siteHandle = shallowRef<MarsSiteViewControllerHandle | null>(null)
/** Rover controller — use `siteRover` in template (unwraps); use `siteRover.value` in `<script>`. */
const siteRover = computed(() => siteHandle.value?.rover ?? null)
const { archiveAcknowledgedReadout, spectra: chemCamArchivedSpectra, queueForTransmission: queueChemCamTx, dequeueFromTransmission: dequeueChemCamTx } = useChemCamArchive()
const { archiveProspect: archiveDanProspect, prospects: danArchivedProspects, queueForTransmission: queueDanTx, dequeueFromTransmission: dequeueDanTx } = useDanArchive()
const scienceLogOpen = ref(false)
const spLedgerOpen = ref(false)
const achievementsOpen = ref(false)
const rewardTrackOpen = ref(false)
const hasScienceDiscoveries = computed(() => chemCamArchivedSpectra.value.length > 0 || danArchivedProspects.value.length > 0 || samArchivedDiscoveries.value.length > 0 || apxsArchivedAnalyses.value.length > 0)
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
  const i = siteRover.value?.activeInstrument
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

// Antenna system refs
const uhfPassActive = ref(false)
const uhfTransmitting = ref(false)
const uhfCurrentOrbiter = ref('')
const uhfTransmissionProgress = ref(0)
const uhfQueueLength = ref(0)
const uhfWindowRemainingSec = ref(0)
const uhfNextPassInSec = ref(0)
const uhfTransmittedThisPass = ref(0)
const lgaUnreadCount = ref(0)
const uhfEnabled = computed(() => {
  void passiveUiRevision.value
  return siteRover.value?.instruments.find(i => i.id === 'antenna-uhf')?.passiveSubsystemEnabled ?? false
})

// --- DAN state ---
const danHitAvailable = ref(false)
const danProspectPhase = ref<string>('idle')
const danProspectProgress = ref(0)
const danDialogVisible = ref(false)
const danSignalStrength = ref(0)
const danTotalSamples = ref(0)
const danWaterResult = ref<boolean | null>(null)

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
  const cc = siteRover.value?.instruments.find(i => i.id === 'chemcam')
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
  const w = siteRover.value?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
  if (!w) return { powerStr: '—', statusStr: '—', healthPct: 100 }
  const moving = roverIsMoving.value
  const draw = w.getDrivePowerW()
  const powerStr = moving ? `${draw.toFixed(0)} W` : '0 W'
  const statusStr = !w.operational ? 'OFFLINE' : moving ? 'DRIVING' : 'READY'
  return { powerStr, statusStr, healthPct: w.durabilityPct }
})

function handleInstrumentRepair() {
  const w = siteRover.value?.instruments.find(i => i.id === 'wheels') as RoverWheelsController | undefined
  if (activeInstrumentSlot.value === WHLS_SLOT && w) w.repair()
}

function toggleWheelsPanel() {
  if (!siteRover.value || isSleeping.value || wheelsHudBlocked.value) return
  if (activeInstrumentSlot.value === WHLS_SLOT) siteRover.value.activateInstrument(null)
  else siteRover.value.activateInstrument(WHLS_SLOT)
}

function toggleHeaterPanel() {
  if (!siteRover.value || isSleeping.value || wheelsHudBlocked.value) return
  if (activeInstrumentSlot.value === HEATER_SLOT) siteRover.value.activateInstrument(null)
  else siteRover.value.activateInstrument(HEATER_SLOT)
}

function handleQueueForTx(source: 'chemcam' | 'dan' | 'sam' | 'apxs', archiveId: string) {
  if (source === 'chemcam') queueChemCamTx(archiveId)
  else if (source === 'dan') queueDanTx(archiveId)
  else if (source === 'sam') queueSamTx(archiveId)
  else if (source === 'apxs') queueAPXSTx(archiveId)
}

function handleDequeueFromTx(source: 'chemcam' | 'dan' | 'sam' | 'apxs', archiveId: string) {
  if (source === 'chemcam') dequeueChemCamTx(archiveId)
  else if (source === 'dan') dequeueDanTx(archiveId)
  else if (source === 'sam') dequeueSamTx(archiveId)
  else if (source === 'apxs') dequeueAPXSTx(archiveId)
}

function handleChemCamAck(readoutId: string) {
  const cc = siteRover.value?.instruments.find(i => i.id === 'chemcam')
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
const orbitalDrops = useOrbitalDrops()
const siteLat = ref(0)
const siteLon = ref(0)
/** Landing spawn XZ — first frame at roverState `ready`; offsets rover position for archive lat/lon. */
const roverSpawnXZ = ref({ x: 0, z: 0 })
const roverWorldX = ref(0)
const roverWorldZ = ref(0)

const {
  pois: missionPois,
  focusPoiId,
  loadPoisForSite,
  upsertPoi,
  removePoi,
  setFocusPoi,
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
  addComponentsBatch,
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
const { mod: playerMod, applyRewardTrack } = usePlayerProfile()
const { totalSP, sessionSP, chemcamSP, lastGain, award: awardSP, awardAck, awardDAN, awardSAM, awardAPXS, awardSurvival, awardTransmission } = useSciencePoints()
const { milestones: rewardTrackMilestones, loaded: rewardTrackLoaded, trackModifiers, unlockedPerks, unlockedTrackIds, prevSP: rewardTrackPrevSP, hasPerk, loadRewardTrack } = useRewardTrack()
const lgaMailbox = useLGAMailbox()
const orbitalPasses = useOrbitalPasses()
const currentSolPasses = computed(() => orbitalPasses.getPassesForSol(marsSol.value))

// --- SAM experiment system ---
const samExperiments = useSamExperiments()
samExperiments.ensureLoaded()
const {
  queue: samQueue,
  results: samResults,
  isProcessing: samIsProcessing,
  currentExperiment: samCurrentExperiment,
  unacknowledgedCount: samUnread,
  enqueue: samEnqueue,
  tick: samTick,
  acknowledgeOldest: samAcknowledgeOldest,
} = useSamQueue()
const { archiveDiscovery: archiveSamDiscovery, discoveries: samArchivedDiscoveries, queueForTransmission: queueSamTx, dequeueFromTransmission: dequeueSamTx } = useSamArchive()
const { analyses: apxsArchivedAnalyses, archiveAnalysis: archiveAPXSAnalysis, queueForTransmission: queueAPXSTx, dequeueFromTransmission: dequeueAPXSTx } = useAPXSArchive()

const samResultDialogEntry = ref<SamQueueEntry | null>(null)

const {
  queue: apxsQueue,
  results: apxsResults,
  isProcessing: apxsIsProcessing,
  currentExperiment: apxsCurrentExperiment,
  unacknowledgedCount: apxsUnread,
  enqueue: apxsEnqueue,
  tick: apxsTick,
  acknowledgeOldest: apxsAcknowledgeOldest,
} = useAPXSQueue()
const apxsResultDialogEntry = ref<APXSQueueEntry | null>(null)

// --- APXS state ---
const apxsMinigameOpen = ref(false)
const apxsCountdown = ref(0)
const apxsState = ref<APXSCountdownState>('idle')
const apxsGameRockUuid = ref('')
const apxsGameRockType = ref('')
const apxsGameRockLabel = ref('')
const apxsGameComposition = ref<APXSComposition | null>(null)
const apxsGameDuration = ref(25)
const { landmarks, loadLandmarks } = useMarsData()

const siteTerrainParams = ref<TerrainParams | null>(null)

// --- Achievements ---
interface Achievement { id: string; icon: string; title: string; description: string; type: string }
interface LibsAchievement extends Achievement { sp: number }
interface DanAchievement extends Achievement { event: string }
interface SurvivalAchievement extends Achievement { minSol: number; spReward: number }
const libsAchievements = ref<LibsAchievement[]>([])
const danAchievements = ref<DanAchievement[]>([])
const survivalAchievements = ref<SurvivalAchievement[]>([])
const samAchievementsData = ref<{ id: string; event: string; icon: string; title: string; description: string; type: string }[]>([])
const apxsAchievementsData = ref<{ id: string; event: string; icon: string; title: string; description: string; type: string }[]>([])

// APXS achievement counters
const apxsAnalysisCount = ref(0)
const apxsAnomalyCount = ref(0)
const apxsSGradeCount = ref(0)
/** Unlocked achievement ids this session (reactive so the HUD counter updates). */
const unlockedAchievementIds = ref<string[]>([])

const totalAchievementCount = computed(
  () =>
    libsAchievements.value.length +
    danAchievements.value.length +
    survivalAchievements.value.length +
    samAchievementsData.value.length +
    apxsAchievementsData.value.length +
    rewardTrackMilestones.value.length,
)
const unlockedAchievementCount = computed(() => unlockedAchievementIds.value.length)

let apxsCompositionData: Record<string, Record<string, number>> = {}
fetch('/data/apxs-compositions.json')
  .then(r => r.json())
  .then((data: Record<string, Record<string, number>>) => { apxsCompositionData = data })
  .catch(() => {})

fetch('/data/achievements.json')
  .then(r => r.json())
  .then(
    (data: {
      'libs-calibration'?: LibsAchievement[]
      'dan-prospecting'?: DanAchievement[]
      'mars-survival'?: SurvivalAchievement[]
      'sam-analysis'?: { id: string; event: string; icon: string; title: string; description: string; type: string }[]
      'apxs-analysis'?: { id: string; event: string; icon: string; title: string; description: string; type: string }[]
      'reward-track'?: RewardTrackMilestone[]
    }) => {
      libsAchievements.value = data['libs-calibration'] ?? []
      danAchievements.value = data['dan-prospecting'] ?? []
      survivalAchievements.value = data['mars-survival'] ?? []
      samAchievementsData.value = data['sam-analysis'] ?? []
      apxsAchievementsData.value = data['apxs-analysis'] ?? []
      if (data['reward-track']) loadRewardTrack(data['reward-track'])
    },
  )
  .catch(() => {})

function triggerDanAchievement(event: string): void {
  for (const ach of danAchievements.value) {
    if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
      achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
    }
  }
}

function triggerSamAchievement(event: string): void {
  for (const ach of samAchievementsData.value) {
    if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
      achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
    }
  }
}

function triggerAPXSAchievement(event: string): void {
  for (const ach of apxsAchievementsData.value) {
    if (ach.event === event && !unlockedAchievementIds.value.includes(ach.id)) {
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
      achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
    }
  }
}

function handleSamEnqueue(entry: Omit<SamQueueEntry, 'id'>): void {
  const { consumeItem } = useInventory()
  const sampleConsumptionKg = samExperiments.data.value?.sampleConsumptionKg ?? 0.002
  const def = INVENTORY_CATALOG[entry.sampleId]
  if (def?.category === 'rock') {
    consumeItem(entry.sampleId, 1, sampleConsumptionKg)
  } else {
    consumeItem(entry.sampleId, 1)
  }
  // Consume ingredients (ice for wet chemistry)
  const mode = samExperiments.modes.value.find(m => m.id === entry.modeId)
  if (mode?.ingredients) {
    for (const ing of mode.ingredients) {
      consumeItem(ing.itemId, ing.quantity)
    }
  }
  // Fill in sol
  const fullEntry = { ...entry, startedAtSol: marsSol.value }
  samEnqueue(fullEntry)
  samDialogVisible.value = false
  triggerSamAchievement('first-analysis')
}

function handleSamAcknowledge(): void {
  const entry = samAcknowledgeOldest()
  if (!entry) return

  const gain = awardSAM(entry.id, entry.spReward, entry.discoveryName)
  if (gain) sampleToastRef.value?.showSP(gain.amount, 'SAM', gain.bonus)

  // Drop side products
  const { addComponent } = useInventory()
  for (const sp of entry.sideProducts) {
    const res = addComponent(sp.itemId, sp.quantity)
    if (res.ok) {
      const label = INVENTORY_CATALOG[sp.itemId]?.label ?? sp.itemId
      sampleToastRef.value?.showPayloadItem(label, sp.quantity)
    }
  }

  // Archive to science log
  archiveSamDiscovery({
    discoveryId: entry.discoveryId,
    discoveryName: entry.discoveryName,
    rarity: entry.discoveryRarity,
    modeId: entry.modeId,
    modeName: entry.modeName,
    sampleId: entry.sampleId,
    sampleLabel: entry.sampleLabel,
    quality: entry.quality,
    spEarned: entry.spReward,
    sideProducts: entry.sideProducts,
    capturedSol: marsSol.value,
    siteId,
    siteLatDeg: siteLat.value,
    siteLonDeg: siteLon.value,
    roverWorldX: roverWorldX.value,
    roverWorldZ: roverWorldZ.value,
    roverSpawnX: roverSpawnXZ.value.x,
    roverSpawnZ: roverSpawnXZ.value.z,
    description: entry.discoveryDescription,
  })

  // Trigger rarity achievements
  if (entry.discoveryRarity === 'uncommon') triggerSamAchievement('first-uncommon')
  if (entry.discoveryRarity === 'rare') triggerSamAchievement('first-rare')
  if (entry.discoveryRarity === 'legendary') triggerSamAchievement('first-legendary')

  // Show next result or close
  if (samUnread.value > 0) {
    samResultDialogEntry.value = samResults.value[0] ?? null
  } else {
    samResultDialogEntry.value = null
  }
}

function handleAPXSComplete(result: {
  accuracy: number
  measuredComposition: APXSComposition
  caughtElements: Set<APXSElementId>
  totalCaught: number
  totalEmitted: number
}): void {
  apxsMinigameOpen.value = false
  apxsState.value = 'idle'

  if (!apxsGameComposition.value) return

  const { grade, sp, anomalies } = computeAPXSSp(
    result.accuracy,
    apxsGameComposition.value,
    [...result.caughtElements],
  )

  const baseTime = 20 + Math.random() * 10
  const processingTime = baseTime / playerMod('analysisSpeed')

  apxsEnqueue({
    rockMeshUuid: apxsGameRockUuid.value,
    rockType: apxsGameRockType.value,
    rockLabel: apxsGameRockLabel.value,
    grade,
    accuracy: result.accuracy,
    trueComposition: apxsGameComposition.value,
    measuredComposition: result.measuredComposition,
    anomalies,
    caughtElements: [...result.caughtElements],
    sp,
    remainingTimeSec: processingTime,
    totalTimeSec: processingTime,
    startedAtSol: marsSol.value,
  })

  // Mark rock as analyzed immediately (prevent re-analysis while processing)
  const rover = siteHandle.value?.rover
  if (rover) {
    const apxsInst = rover.instruments.find(i => i.id === 'apxs') as any
    if (apxsInst && 'markAnalyzed' in apxsInst && apxsInst.currentTargetResult) {
      apxsInst.markAnalyzed(apxsInst.currentTargetResult.rock)
    }
  }

  sampleToastRef.value?.showComm('APXS analysis queued — processing...')
}

function handleAPXSAcknowledge(): void {
  const entry = apxsAcknowledgeOldest()
  if (!entry) return

  // Award SP
  const gain = awardAPXS(entry.rockMeshUuid, entry.sp, entry.rockLabel)
  if (gain) sampleToastRef.value?.showSP(gain.amount, 'APXS', gain.bonus)

  // Archive
  archiveAPXSAnalysis({
    rockType: entry.rockType as any,
    rockLabel: entry.rockLabel,
    grade: entry.grade,
    accuracy: entry.accuracy,
    trueComposition: entry.trueComposition,
    measuredComposition: entry.measuredComposition,
    anomalies: entry.anomalies,
    spEarned: gain?.amount ?? entry.sp,
    capturedSol: entry.startedAtSol,
    siteId,
  })

  // Achievements
  apxsAnalysisCount.value++
  if (entry.anomalies.length > 0) apxsAnomalyCount.value++
  if (entry.grade === 'S') apxsSGradeCount.value++

  if (apxsAnalysisCount.value === 1) triggerAPXSAchievement('first-analysis')
  if (apxsAnalysisCount.value === 5) triggerAPXSAchievement('five-analyses')
  if (apxsAnomalyCount.value === 5) triggerAPXSAchievement('five-anomalies')
  if (apxsSGradeCount.value === 5) triggerAPXSAchievement('five-s-grades')

  // Show next or close
  if (apxsUnread.value > 0) {
    apxsResultDialogEntry.value = apxsResults.value[0] ?? null
  } else {
    apxsResultDialogEntry.value = null
  }
}

watchEffect(() => {
  if (apxsUnread.value > 0 && !apxsResultDialogEntry.value) {
    apxsResultDialogEntry.value = apxsResults.value[0] ?? null
  }
})

watchEffect(() => {
  const sp = chemcamSP.value
  for (const ach of libsAchievements.value) {
    if (sp >= ach.sp && !unlockedAchievementIds.value.includes(ach.id)) {
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
      achievementRef.value?.show(ach.icon, ach.title, ach.description, ach.type)
    }
  }
})

// --- Reward track banner watcher ---
watchEffect(() => {
  if (!rewardTrackLoaded.value || rewardTrackMilestones.value.length === 0) return
  const sp = totalSP.value
  const prev = rewardTrackPrevSP.value
  if (sp <= prev) return

  const crossed = milestonesUnlockedBetween(prev, sp, rewardTrackMilestones.value)
  for (const m of crossed) {
    if (!unlockedTrackIds.value.includes(m.id)) {
      unlockedTrackIds.value = [...unlockedTrackIds.value, m.id]
      unlockedAchievementIds.value = [...unlockedAchievementIds.value, m.id]
      achievementRef.value?.show(m.icon, m.title, m.description, m.type)
    }
  }
  rewardTrackPrevSP.value = sp
})

// --- Reward track modifier sync ---
watchEffect(() => {
  applyRewardTrack(trackModifiers.value)
})

watchEffect(() => {
  const sol = marsSol.value
  void survivalAchievements.value
  const pending = survivalAchievements.value
    .filter((a) => sol >= a.minSol && !unlockedAchievementIds.value.includes(a.id))
    .sort((a, b) => a.minSol - b.minSol)
  for (const ach of pending) {
    unlockedAchievementIds.value = [...unlockedAchievementIds.value, ach.id]
    const gain = awardSurvival(`Survival: ${ach.title}`, ach.spReward)
    achievementRef.value?.show(ach.icon, ach.title, `${ach.description} (+${gain.amount} SP)`, ach.type)
    sampleToastRef.value?.showSP(gain.amount, 'SURVIVAL', gain.bonus)
  }
})

const showOverdriveConfirm = ref(false)
const showConservationConfirm = ref(false)
const orbitalDropInteractHint = computed(() => {
  if (deploying.value || descending.value || isSleeping.value) return ''
  if (siteRover.value?.mode !== 'driving') return ''
  if (!orbitalDrops.nearbyDrop.value) return ''
  return 'PAYLOAD IN RANGE · PRESS E TO OPEN'
})
const centerHintText = computed(() => {
  if (!deploying.value && !descending.value && activeInstrumentSlot.value === null && rtgPhase.value === 'idle' && rtgConservationMode.value !== 'active' && !controlsHintDismissed.value) {
    return 'WASD drive · drag orbit · 1-9 TOOLS'
  }
  if (orbitalDropInteractHint.value) return orbitalDropInteractHint.value
  if (!deploying.value && !descending.value && activeInstrumentSlot.value === null && rtgConservationMode.value === 'active') {
    return 'Power shunt: driving offline · -50% instrument load · Drag to orbit'
  }
  return ''
})
const centerHintClass = computed(() => ({
  'controls-hint-shunt': centerHintText.value.startsWith('Power shunt:'),
  'orbital-drop-hint': centerHintText.value === orbitalDropInteractHint.value && orbitalDropInteractHint.value.length > 0,
}))

function handleActivate() {
  if (!siteRover.value || isSleeping.value) return
  if (siteRover.value.activeInstrument instanceof RTGController) {
    showOverdriveConfirm.value = true
  } else {
    const passive = siteRover.value.activeInstrument?.passiveSubsystemOnly
    siteRover.value.enterActiveMode()
    if (passive) passiveUiRevision.value++
  }
}

function confirmOverdrive() {
  showOverdriveConfirm.value = false
  if (!siteRover.value) return
  const rtg = siteRover.value.activeInstrument
  if (rtg instanceof RTGController) {
    rtg.activateOverdrive()
    siteRover.value.activateInstrument(null)
  }
}

function cancelOverdrive() {
  showOverdriveConfirm.value = false
}

function openConservationConfirm() {
  if (!siteRover.value || isSleeping.value) return
  showConservationConfirm.value = true
}

function confirmConservation() {
  showConservationConfirm.value = false
  if (!siteRover.value || isSleeping.value) return
  const rtg = siteRover.value.instruments.find(i => i.id === 'rtg')
  if (rtg instanceof RTGController && rtg.activateConservation()) {
    fillBatteryFull()
    siteRover.value.activateInstrument(null)
  }
}

function cancelConservation() {
  showConservationConfirm.value = false
}

function handleOrbitalDropOpen(): void {
  const drop = orbitalDrops.nearbyDrop.value
  if (!drop || siteRover.value?.mode !== 'driving') return
  orbitalDrops.openDrop(drop.id, addComponentsBatch)
}

function handleDanProspect(): void {
  siteHandle.value?.handleDanProspect()
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    e.preventDefault()
    inventoryOpen.value = !inventoryOpen.value
  }
  if (e.code === 'Digit0' || e.code === 'Backquote') {
    profileOpen.value = !profileOpen.value
  }
  if (e.code === 'KeyE' && !e.repeat && siteRover.value?.mode === 'driving' && orbitalDrops.nearbyDrop.value) {
    e.preventDefault()
    handleOrbitalDropOpen()
  }
}

function buildMarsSiteViewContext(): MarsSiteViewContext {
  return {
    siteId,
    canvasRef,
    loadLandmarks,
    landmarks,
    gameClock,
    orbitalDrops,
    isSleeping,
    roverPowerProfile: profile,
    playerMod,
    hasPerk,
    tickPower,
    tickThermal,
    sampleToastRef,
    upsertPoi,
    removePoi,
    setFocusPoi,
    focusPoiId,
    awardSP,
    awardDAN,
    archiveDanProspect,
    samTick,
    apxsTick,
    totalSP,
    triggerDanAchievement,
    awardTransmission,
    onAPXSLaunchMinigame: (rockMeshUuid, rockType, rockLabel, durationSec) => {
      const baseWeights = apxsCompositionData[rockType] ?? apxsCompositionData['basalt'] ?? {}
      const comp = generateComposition(baseWeights)
      apxsGameRockUuid.value = rockMeshUuid
      apxsGameRockType.value = rockType
      apxsGameRockLabel.value = rockLabel
      apxsGameComposition.value = comp
      apxsGameDuration.value = durationSec
      apxsMinigameOpen.value = true
      apxsState.value = 'playing'
    },
    onAPXSBlockedByCold: () => {
      sampleToastRef.value?.showError('Too cold for APXS — warm up first')
    },
    onInstrumentActivateRequest: handleActivate,
    onGlobalKeyDown,
    clearPois,
    devSpawnRandomInventoryItems,
    devSpawnInventoryItemById: devSpawnInventoryItem,
    refs: {
      siteLat,
      siteLon,
      siteTerrainParams,
      roverHeading,
      roverIsMoving,
      controlsHintDismissed,
      roverWorldX,
      roverWorldZ,
      roverSpawnXZ,
      passiveUiRevision,
      isInstrumentActive,
      samDialogVisible,
      rtgPhase,
      rtgPhaseProgress,
      rtgConservationMode,
      rtgConservationProgress01,
      rtgOverdriveReady,
      rtgConservationReady,
      rtgConservationCdLabel,
      rtgConservationCooldownTitle,
      crosshairVisible,
      crosshairColor,
      crosshairX,
      crosshairY,
      drillProgress,
      isDrilling,
      mastcamFilterLabel,
      mastcamScanning,
      mastcamScanProgress,
      chemCamUnreadCount,
      chemcamPhase,
      chemcamShotsRemaining,
      chemcamShotsMax,
      chemcamProgressPct,
      chemCamOverlaySequenceActive,
      chemCamOverlaySequenceProgress,
      chemCamOverlaySequenceLabel,
      chemCamOverlaySequencePulse,
      marsTimeOfDay,
      currentNightFactor,
      marsSol,
      mastPan,
      mastTilt,
      mastFov,
      mastTargetRange,
      descending,
      deploying,
      deployProgress,
      activeInstrumentSlot,
      danTotalSamples,
      danHitAvailable,
      danProspectPhase,
      danProspectProgress,
      danSignalStrength,
      danWaterResult,
      danDialogVisible,
      internalTempC,
      ambientEffectiveC,
      heaterW,
      thermalZone,
      samIsProcessing,
      apxsCountdown,
      apxsState,
      // Antenna system refs
      uhfPassActive,
      uhfTransmitting,
      uhfCurrentOrbiter,
      uhfTransmissionProgress,
      uhfQueueLength,
      uhfWindowRemainingSec,
      uhfNextPassInSec,
      uhfTransmittedThisPass,
      lgaUnreadCount,
    },
  }
}

onMounted(async () => {
  const handle = createMarsSiteViewController(buildMarsSiteViewContext())
  await handle.mount()
  siteHandle.value = handle
})

onUnmounted(() => {
  siteHandle.value?.dispose()
  siteHandle.value = null
})


</script>

<style scoped src="./MartianSiteView.css"></style>
