<template>
  <div class="martian-site-view w-full h-full">
    <canvas ref="canvasRef" class="block w-full h-full" />
    <Transition name="deploy-fade">
      <div
        v-if="remsStormIncomingText || remsStormActiveText"
        class="rems-storm-banner font-instrument"
        role="status"
      >
        {{ remsStormActiveText || remsStormIncomingText }}
      </div>
    </Transition>
    <MartianSiteNavbar
      :site-title="siteId"
      :show-sol-clock="!deploying && !descending"
      :mars-sol="marsSol"
      :mars-time-of-day="marsTimeOfDay"
      :current-night-factor="currentNightFactor"
      :ambient-celsius="solClockAmbientC"
      :rover-heading="roverHeading"
      :compass-pois="siteCompassPois"
      :unlocked-achievement-count="unlockedAchievementCount"
      :total-achievement-count="totalAchievementCount"
      :total-sp="totalSP"
      :show-science-button="hasScienceDiscoveries && !deploying && !descending"
      :achievements-expanded="achievementsOpen"
      :sp-ledger-expanded="spLedgerOpen"
      :active-mission-count="activeMissions.length"
      @open-achievements="achievementsOpen = true"
      @open-sp-ledger="spLedgerOpen = true"
      @open-science-log="scienceLogOpen = true"
      @open-mission-log="missionLogOpen = true"
    />
    <DANProspectBar :phase="danProspectPhase" :progress="danProspectProgress" />
    <RoverDeployOverlays
      :descending="descending"
      :deploying="deploying"
      :deploy-progress="deployProgress"
    />
    <Transition name="deploy-fade">
      <div v-if="apxsState === 'counting'" class="apxs-countdown-overlay" key="apxs-countdown">
        <div class="apxs-countdown-card">
          <div class="apxs-countdown-label">APXS CONTACT</div>
          <div class="apxs-countdown-num font-instrument">{{ apxsCountdown }}</div>
        </div>
      </div>
    </Transition>
    <RtgStatusBanners
      :rtg-phase="rtgPhase"
      :rtg-phase-progress="rtgPhaseProgress"
      :rtg-conservation-mode="rtgConservationMode"
      :rtg-conservation-progress01="rtgConservationProgress01"
      :rtg-conservation-cd-label="rtgConservationCdLabel"
      :heater-heat-boost-active="heaterHeatBoostActive"
      :heater-heat-boost-progress-elapsed01="heaterHeatBoostProgressElapsed01"
    />
    <Transition name="deploy-fade">
      <ChemCamActiveHud
        v-if="isInstrumentActive && activeInstrumentSlot === 2"
        :shots-remaining="chemcamShotsRemaining"
        :shots-max="chemcamShotsMax"
        :phase="chemcamPhase"
        :phase-label="chemcamPhaseLabel"
        :progress-pct="chemcamProgressPct"
        :unread-count="chemCamUnreadCount"
        @see-results="showChemCamResults = true"
      />
    </Transition>
    <Transition name="deploy-fade">
      <MastCamActiveHud
        v-if="isInstrumentActive && activeInstrumentSlot === 1"
        :filter-label="mastcamFilterLabel"
        :scanning="mastcamScanning"
        :scan-progress="mastcamScanProgress"
      />
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
        :unlocked-instruments="unlockedInstruments"
        :sandbox="playerProfile.sandbox"
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
      :thermal="activeInstrumentSlot === HEATER_SLOT ? { internalTempC: internalTempC, ambientC: ambientEffectiveC, ambientMeasured: remsSurveying, heaterW: heaterEffectiveW, zone: thermalZone } : null"
      :rems-hud="activeInstrumentSlot === REMS_SLOT ? remsHud : null"
      :chem-cam-shots="chemcamShotsRemaining + '/' + chemcamShotsMax"
      :chem-cam-unread="chemCamUnreadCount"
      :chem-cam-sequence-active="chemCamOverlaySequenceActive"
      :chem-cam-sequence-progress="chemCamOverlaySequenceProgress"
      :chem-cam-sequence-label="chemCamOverlaySequenceLabel"
      :chem-cam-sequence-pulse="chemCamOverlaySequencePulse"
      :rtg-overdrive-ready="rtgOverdriveReady"
      :rtg-conservation-ready="rtgConservationReady"
      :rtg-conservation-cooldown-title="rtgConservationCooldownTitle"
      :heater-overdrive-ready="heaterOverdriveReady"
      @activate="handleActivate()"
      @see-results="showChemCamResults = true"
      @rtg-overdrive="showOverdriveConfirm = true"
      @heater-overdrive="showHeaterOverdriveConfirm = true"
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
      :durability-pct="activeDurability?.durabilityPct"
      :max-durability="activeDurability?.maxDurability"
      :instrument-operational="activeDurability?.operational"
      :repair-cost-wire="activeDurability?.repairCost.weldingWire"
      :repair-cost-component-id="activeDurability?.repairCost.componentId"
      :repair-cost-component-qty="activeDurability?.repairCost.componentQty"
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
    <MessageDialog
      :message="openedMessage"
      :mission-accepted="!!(openedMessage?.missionId && (
        activeMissions.some(m => m.missionId === openedMessage?.missionId) ||
        completedMissions.some(m => m.missionId === openedMessage?.missionId)
      ))"
      @close="openedMessage = null"
      @accept-mission="handleAcceptMission"
    />
    <MissionLogDialog
      :open="missionLogOpen"
      :active-missions="activeMissions"
      :completed-missions="completedMissions"
      :tracked-mission-id="trackedMissionId"
      :get-def="getMissionDef"
      :get-obj-label="getObjLabel"
      @close="missionLogOpen = false"
      @track="(id: string) => { trackedMissionId = id }"
    />
    <MissionTracker
      v-if="!deploying && !descending"
      :mission="trackedMission"
      :mission-def="trackedMissionDef"
      :is-eligible="(objId: string) => trackedMissionId ? isObjectiveEligible(trackedMissionId, objId) : false"
      :lga-active="activeInstrumentSlot === 11"
      :transmit-progress="transmitProgress"
      :dwell-poi-id="activeDwellPoiId"
      :dwell-progress="activeDwellProgress"
      @untrack="trackedMissionId = null"
      @transmit="handleMissionTransmit"
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
      :accuracy-mod="playerMod('instrumentAccuracy')"
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
              :accuracy-mod="playerMod('instrumentAccuracy')"
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
        <div v-if="showHeaterOverdriveConfirm" key="heater-overdrive-confirm" class="overdrive-confirm-overlay">
          <div class="overdrive-confirm heater-overdrive-dialog">
            <div class="overdrive-icon">&#x2668;</div>
            <div class="overdrive-title">HEATER OVERDRIVE</div>
            <div class="overdrive-desc">
              Dump {{ Math.round(HEATER_OVERDRIVE_BATTERY_COST * 100) }}% of battery charge instantly. For the next
              {{ HEATER_MISSION_DURATIONS.overdriveHeatMarsClockHours }} hours (mission clock), thermostat heating warms the rover at double the normal rate.
            </div>
            <div class="overdrive-warning">
              You cannot use heater overdrive again for {{ HEATER_MISSION_DURATIONS.overdriveLockoutSols }} full sols after you confirm. Timers pause only if the mission clock is paused.
            </div>
            <div class="overdrive-buttons">
              <button class="overdrive-btn confirm" @click="confirmHeaterOverdrive()">ENGAGE OVERDRIVE</button>
              <button class="overdrive-btn cancel" @click="cancelHeaterOverdrive()">CANCEL</button>
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
    <CommToolbar
      v-if="!deploying && !descending"
      :active-slot="activeInstrumentSlot"
      :uhf-unlocked="playerProfile.sandbox || unlockedInstruments.includes('uhf')"
      @select="(slot: number) => siteRover?.activateInstrument(slot)"
      @deselect="siteRover?.activateInstrument(null)"
    />
    <!-- LGA Mailbox panel (shown when LGA antenna selected) -->
    <LGAMailbox
      v-if="!deploying && !descending && activeInstrumentSlot === 11"
      :messages="lgaMailbox.messages.value"
      :unread-count="lgaUnreadCount"
      @mark-read="lgaMailbox.markRead"
      @open-message="(msg: LGAMessage) => { openedMessage = msg }"
      style="position: fixed; top: 168px; left: 10px; z-index: 40;"
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
      style="position: fixed; top: 168px; left: 10px; z-index: 40;"
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
      <div v-if="!isSleeping" class="power-hud-top-controls">
        <button
          type="button"
          class="wheels-hud-btn"
          :class="{ active: profileOpen }"
          title="Rover Profile [0]"
          @click="profileOpen = !profileOpen"
        >
          <span class="wheels-hud-key font-instrument">0</span>
          <span class="wheels-hud-icon">&#x1F6F0;</span>
          <span class="wheels-hud-name">ROVER</span>
        </button>
      </div>
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
import { ref, computed, watch, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { MARS_TIME_OF_DAY_06_00, SOL_DURATION, MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'
import {
  roverHeadingRadToCompassDeg,
  signedRelativeBearingDeg,
  worldBearingDegToPoi,
} from '@/lib/sitePoiBearing'
import { useMarsData } from '@/composables/useMarsData'
import { useSiteMissionPois } from '@/composables/useSiteMissionPois'
import MartianSiteNavbar from '@/components/MartianSiteNavbar.vue'
import type { TerrainParams } from '@/three/terrain/TerrainGenerator'
import {
  createMarsSiteViewController,
  formatRtgShuntCooldownLabel,
  type MarsSiteViewControllerHandle,
} from '@/views/MarsSiteViewController'
import { buildMarsSiteViewContext } from '@/views/martianSiteViewContext'
import ChemCamActiveHud from '@/components/ChemCamActiveHud.vue'
import MastCamActiveHud from '@/components/MastCamActiveHud.vue'
import RtgStatusBanners from '@/components/RtgStatusBanners.vue'
import RoverDeployOverlays from '@/components/RoverDeployOverlays.vue'
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
import ProfilePanel from '@/components/ProfilePanel.vue'
import { useInventory, devSpawnRandomInventoryItems, devSpawnInventoryItem } from '@/composables/useInventory'
import { useSamExperiments } from '@/composables/useSamExperiments'
import { useSamQueue, type SamQueueEntry } from '@/composables/useSamQueue'
import { useSamArchive } from '@/composables/useSamArchive'
import { useOrbitalDrops } from '@/composables/useOrbitalDrops'
import { useMarsGameClock } from '@/composables/useMarsGameClock'
import { useMarsPower, POWER_SLEEP_THRESHOLD_PCT } from '@/composables/useMarsPower'
import { useMarsThermal } from '@/composables/useMarsThermal'
import { useSiteRemsWeather } from '@/composables/useSiteRemsWeather'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useSciencePoints } from '@/composables/useSciencePoints'
import { useRewardTrack } from '@/composables/useRewardTrack'
import { useMartianSiteAchievements } from '@/composables/useMartianSiteAchievements'
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
  HEATER_OVERDRIVE_BATTERY_COST,
  HEATER_SLOT,
  REMS_SLOT,
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
import { computeAPXSSp, APXS_ELEMENTS, type APXSComposition, type APXSElementId } from '@/lib/apxsComposition'
import type { APXSCountdownState } from '@/views/site-controllers/APXSTickHandler'
import { useInstrumentDurability } from '@/composables/useInstrumentDurability'
import { useMissions } from '@/composables/useMissions'
import type { LGAMessage } from '@/types/lgaMailbox'
import MessageDialog from '@/components/MessageDialog.vue'
import MissionLogDialog from '@/components/MissionLogDialog.vue'
import MissionTracker from '@/components/MissionTracker.vue'
import { addWaypointMarker, removeWaypointMarker, clearWaypointMarkers } from '@/three/WaypointMarkers'
import { usePoiArrival, clearPoiArrival } from '@/composables/usePoiArrival'

const route = useRoute()
const siteId = route.params.siteId as string

const { tryRepair, getBySlot } = useInstrumentDurability()

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

const activeDurability = computed(() => {
  if (activeInstrumentSlot.value === null) return undefined
  return getBySlot(activeInstrumentSlot.value)
})

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
const heaterOverdriveReady = ref(false)
const heaterHeatBoostActive = ref(false)
const heaterHeatBoostProgressElapsed01 = ref(0)

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
  if (!w) return { powerStr: '—', statusStr: '—', healthPct: 100, speedPct: 100, speedBuffs: [] }
  const moving = roverIsMoving.value
  const draw = w.getDrivePowerW()
  const powerStr = moving ? `${draw.toFixed(0)} W` : '0 W'
  const statusStr = !w.operational ? 'OFFLINE' : moving ? 'DRIVING' : 'READY'

  // Speed buff breakdown
  const buffs: { label: string; value: string; color: string }[] = []
  const fmtBuff = (v: number) => {
    const pct = Math.round(v * 100)
    return pct >= 0 ? `+${pct}%` : `${pct}%`
  }
  const green = '#5dc9a5'
  const red = '#e05030'
  const dim = 'rgba(196,117,58,0.6)'

  // Archetype
  if (playerProfile.archetype) {
    const ms = ARCHETYPES[playerProfile.archetype].modifiers.movementSpeed
    if (ms) buffs.push({ label: ARCHETYPES[playerProfile.archetype].name.toUpperCase(), value: fmtBuff(ms), color: ms > 0 ? green : red })
  }
  // Foundation
  if (playerProfile.foundation) {
    const ms = FOUNDATIONS[playerProfile.foundation].modifiers.movementSpeed
    if (ms) buffs.push({ label: FOUNDATIONS[playerProfile.foundation].name.toUpperCase(), value: fmtBuff(ms), color: ms > 0 ? green : red })
  }
  // Patron
  if (playerProfile.patron) {
    const ms = PATRONS[playerProfile.patron].modifiers.movementSpeed
    if (ms) buffs.push({ label: PATRONS[playerProfile.patron].name.toUpperCase(), value: fmtBuff(ms), color: ms > 0 ? green : red })
  }
  // Reward track
  const rtMod = trackModifiers.value.movementSpeed
  if (rtMod) buffs.push({ label: 'REWARD TRACK', value: fmtBuff(rtMod), color: rtMod > 0 ? green : red })

  // Night penalty
  const nf = currentNightFactor.value
  if (nf > 0.01) {
    const penaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
    const nightPenalty = -(nf * penaltyFactor)
    buffs.push({ label: hasPerk('night-vision') ? 'NIGHT (NV)' : 'NIGHT', value: fmtBuff(nightPenalty), color: red })
  }

  // RTG overdrive
  const rtg = siteRover.value?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
  const rtgBoost = rtg?.speedMultiplier ?? 1.0
  if (rtgBoost > 1) buffs.push({ label: 'RTG OVERDRIVE', value: fmtBuff(rtgBoost - 1), color: green })

  // Final effective speed %
  const profileMult = playerMod('movementSpeed')
  const nightPenaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
  const nightPenalty = 1.0 - nf * nightPenaltyFactor
  const speedPct = profileMult * nightPenalty * rtgBoost * 100

  // Add base label if no buffs
  if (buffs.length === 0) buffs.push({ label: 'BASELINE', value: '100%', color: dim })

  return { powerStr, statusStr, healthPct: w.durabilityPct, speedPct, speedBuffs: buffs }
})

function handleInstrumentRepair() {
  if (activeInstrumentSlot.value === null) return
  // Find the instrument ID for the active slot
  const snap = getBySlot(activeInstrumentSlot.value)
  if (!snap) return
  const result = tryRepair(snap.id)
  if (!result.ok && result.message) {
    // Show error toast if available
    sampleToastRef.value?.showError?.(result.message)
  }
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
const { HEATER_MISSION_DURATIONS } = gameClock
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
  drainBatteryFraction,
} = useMarsPower()
const { internalTempC, ambientEffectiveC, heaterW, heaterEffectiveW, zone: thermalZone, tickThermal } = useMarsThermal()
const {
  solClockAmbientC,
  remsHud,
  remsStormIncomingText,
  remsStormActiveText,
  tickRemsWeather,
} = useSiteRemsWeather()
const remsSurveying = ref(false)
/** True when automatic thermostat is drawing bus power (heaterW from thermal tick). */
const heaterThermostatOn = computed(() => heaterW.value > 0.5)
const heaterHudButtonTitle = computed(() =>
  heaterThermostatOn.value
    ? `Thermal / heater [H] — heating ~${Math.round(heaterEffectiveW.value)} W`
    : 'Thermal / heater [H]',
)
const { mod: playerMod, applyRewardTrack, profile: playerProfile, ARCHETYPES, FOUNDATIONS, PATRONS } = usePlayerProfile()
const { totalSP, sessionSP, chemcamSP, lastGain, award: awardSP, awardAck, awardDAN, awardSAM, awardAPXS, awardSurvival, awardTransmission } = useSciencePoints()
const { milestones: rewardTrackMilestones, loaded: rewardTrackLoaded, trackModifiers, unlockedPerks, unlockedTrackIds, prevSP: rewardTrackPrevSP, hasPerk, loadRewardTrack } = useRewardTrack()

const {
  libsAchievements,
  danAchievements,
  survivalAchievements,
  unlockedAchievementIds,
  totalAchievementCount,
  unlockedAchievementCount,
  triggerDanAchievement,
  triggerSamAchievement,
  triggerAPXSAchievement,
} = useMartianSiteAchievements({
  achievementRef,
  sampleToastRef,
  chemcamSP,
  totalSP,
  marsSol,
  rewardTrackMilestones,
  rewardTrackLoaded,
  unlockedTrackIds,
  rewardTrackPrevSP,
  loadRewardTrack,
  trackModifiers,
  applyRewardTrack,
  awardSurvival,
})

const lgaMailbox = useLGAMailbox()
const orbitalPasses = useOrbitalPasses()

const {
  activeMissions,
  completedMissions,
  trackedMissionId,
  unlockedInstruments,
  loadCatalog,
  accept,
  checkAllObjectives,
  isObjectiveEligible,
  getMissionDef,
  wireArchiveCheckers,
  startTransmitCompletion,
  transmitProgress,
} = useMissions()

const { dwellStates } = usePoiArrival()

// Mission UI state
const missionLogOpen = ref(false)
const openedMessage = ref<LGAMessage | null>(null)

// Computed for tracked mission
const trackedMission = computed(() =>
  activeMissions.value.find((m) => m.missionId === trackedMissionId.value) ?? null
)
const trackedMissionDef = computed(() =>
  trackedMissionId.value ? getMissionDef(trackedMissionId.value) ?? null : null
)

// POI dwell progress for the active dwelling POI (shown in tracker)
const activeDwellPoiId = computed(() => {
  const dwelling = dwellStates.value.find((s) => s.progress > 0 && !s.arrived)
  return dwelling?.poiId ?? null
})
const activeDwellProgress = computed(() => {
  const dwelling = dwellStates.value.find((s) => s.progress > 0 && !s.arrived)
  return dwelling?.progress ?? 0
})

function handleMissionTransmit() {
  if (!trackedMissionId.value) return
  startTransmitCompletion(trackedMissionId.value, marsSol.value)
}

// Clean up POIs + 3D markers as individual objectives complete
watch(
  () => activeMissions.value.map((m) => m.objectives.map((o) => o.done)),
  () => {
    const scene = siteHandle.value?.siteScene
    for (const state of activeMissions.value) {
      const def = getMissionDef(state.missionId)
      if (!def) continue
      for (let i = 0; i < state.objectives.length; i++) {
        if (!state.objectives[i].done) continue
        const objDef = def.objectives[i]
        if (objDef?.type === 'go-to' && objDef.params.poiId) {
          removePoi(objDef.params.poiId)
          clearPoiArrival(objDef.params.poiId)
          if (scene) removeWaypointMarker(objDef.params.poiId, scene.scene)
        }
      }
    }
  },
  { deep: true },
)

// Clean up any remaining markers when missions complete
watch(completedMissions, (completed) => {
  const scene = siteHandle.value?.siteScene
  for (const state of completed) {
    const def = getMissionDef(state.missionId)
    if (!def) continue
    for (const obj of def.objectives) {
      if (obj.type === 'go-to' && obj.params.poiId) {
        removePoi(obj.params.poiId)
        if (scene) removeWaypointMarker(obj.params.poiId, scene.scene)
      }
    }
  }
})

// Helper for MissionLogDialog
function getObjLabel(missionId: string, objectiveId: string): string {
  const def = getMissionDef(missionId)
  return def?.objectives.find((o) => o.id === objectiveId)?.label ?? ''
}

// Mission acceptance handler
function handleAcceptMission(missionId: string | undefined) {
  if (!missionId) return
  const sol = marsSol.value
  accept(missionId, sol)

  // Register POIs for go-to objectives so they show on the compass
  const def = getMissionDef(missionId)
  if (def) {
    const rx = roverWorldX.value
    const rz = roverWorldZ.value
    const goToObjs = def.objectives.filter((o) => o.type === 'go-to')
    goToObjs.forEach((obj, i) => {
      // Place markers in a ring around the rover, 60-120 units out
      const angle = (i / goToObjs.length) * Math.PI * 2 - Math.PI / 2
      const dist = 8 + i * 5
      const px = Math.max(-390, Math.min(390, rx + Math.cos(angle) * dist))
      const pz = Math.max(-390, Math.min(390, rz + Math.sin(angle) * dist))
      upsertPoi({
        id: obj.params.poiId,
        label: obj.label,
        x: px,
        z: pz,
        color: '#66ffee',
      })
      // Place 3D marker in the scene
      const scene = siteHandle.value?.siteScene
      if (scene) {
        const groundY = scene.terrain.heightAt(px, pz)
        addWaypointMarker(obj.params.poiId, px, pz, groundY, scene.scene)
      }
    })
  }

  openedMessage.value = null
}
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

/** Cumulative APXS stats for event-based achievements (composable holds per-event triggers). */
const apxsAnalysisCount = ref(0)
const apxsAnomalyCount = ref(0)
const apxsSGradeCount = ref(0)

let apxsCompositionData: Record<string, Record<string, number>> = {}
fetch('/data/apxs-compositions.json')
  .then(r => r.json())
  .then((data: Record<string, Record<string, number>>) => { apxsCompositionData = data })
  .catch(() => {})

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

  const baseTime = 10 + Math.random() * 5
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
  // Store dominant surface elements (>3%) so the drill can drop bonus traces
  const comp = apxsGameComposition.value!
  const dominantEls = APXS_ELEMENTS.filter(el => comp[el] > 3).sort((a, b) => comp[b] - comp[a]).slice(0, 4)
  const rover = siteHandle.value?.rover
  if (rover) {
    const apxsInst = rover.instruments.find(i => i.id === 'apxs') as any
    if (apxsInst && 'markAnalyzed' in apxsInst && apxsInst.currentTargetResult) {
      apxsInst.markAnalyzed(apxsInst.currentTargetResult.rock, dominantEls)
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

// APXS results shown via SEE RESULTS button on instrument card, not auto-opened

const showOverdriveConfirm = ref(false)
const showHeaterOverdriveConfirm = ref(false)
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
  } else if (siteRover.value.activeInstrument instanceof HeaterController) {
    showHeaterOverdriveConfirm.value = true
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

function confirmHeaterOverdrive() {
  showHeaterOverdriveConfirm.value = false
  if (!siteRover.value || isSleeping.value) return
  const h = siteRover.value.activeInstrument
  if (h instanceof HeaterController && h.canActivateOverdrive) {
    drainBatteryFraction(HEATER_OVERDRIVE_BATTERY_COST)
    h.activateOverdrive()
    siteRover.value.activateInstrument(null)
  }
}

function cancelHeaterOverdrive() {
  showHeaterOverdriveConfirm.value = false
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

function createSiteControllerContext() {
  return buildMarsSiteViewContext({
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
    tickRemsWeather,
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
    getApxsCompositionWeights: () => apxsCompositionData,
    apxsGameRockUuid,
    apxsGameRockType,
    apxsGameRockLabel,
    apxsGameComposition,
    apxsGameDuration,
    apxsMinigameOpen,
    apxsState,
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
      heaterOverdriveReady,
      heaterHeatBoostActive,
      heaterHeatBoostProgressElapsed01,
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
      heaterEffectiveW,
      thermalZone,
      samIsProcessing,
      apxsCountdown,
      apxsState,
      uhfPassActive,
      uhfTransmitting,
      uhfCurrentOrbiter,
      uhfTransmissionProgress,
      uhfQueueLength,
      uhfWindowRemainingSec,
      uhfNextPassInSec,
      uhfTransmittedThisPass,
      lgaUnreadCount,
      solClockAmbientC,
      remsHud,
      remsStormIncomingText,
      remsStormActiveText,
      remsSurveying,
    },
  })
}

onMounted(async () => {
  const handle = createMarsSiteViewController(createSiteControllerContext())
  await handle.mount()
  siteHandle.value = handle
})

onUnmounted(() => {
  siteHandle.value?.dispose()
  siteHandle.value = null
})


</script>

<style scoped src="./MartianSiteView.css"></style>
