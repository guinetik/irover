<template>
  <div class="martian-site-view w-full h-full">
    <LoadingOverlay :is-loading="siteLoading" :site-name="siteId" />
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
      :show-sol-clock="introComplete"
      :mars-sol="marsSol"
      :mars-time-of-day="marsTimeOfDay"
      :current-night-factor="currentNightFactor"
      :ambient-celsius="solClockAmbientC"
      :rover-heading="roverHeading"
      :compass-pois="siteCompassPois"
      :unlocked-achievement-count="unlockedAchievementCount"
      :total-achievement-count="totalAchievementCount"
      :total-sp="totalSP"
      :show-science-button="hasScienceDiscoveries && introComplete"
      :achievements-expanded="achievementsOpen"
      :sp-ledger-expanded="spLedgerOpen"
      :active-mission-count="activeMissions.length"
      :show-archive-button="dsnUnlocked"
      :archive-unread-count="dsnUnreadCount"
      @open-achievements="achievementsOpen = true"
      @open-sp-ledger="spLedgerOpen = true"
      @open-science-log="scienceLogOpen = true"
      @open-mission-log="handleOpenMissionLog"
      @open-archive="showArchive = true"
      @request-restart="showRestartConfirm = true"
    />
    <DANProspectBar :phase="danProspectPhase" :progress="danProspectProgress" />
    <IntroSequence
      :skip-intro="skipIntro"
      :site-loading="siteLoading"
      :descending="descending"
      :deploying="deploying"
      :deploy-progress="deployProgress"
      :site-id="siteId"
      :latitude="siteLat"
      :longitude="siteLon"
      :archetype-name="playerProfile.archetype ?? 'UNKNOWN'"
      @intro-complete="onIntroComplete"
      @video-overlay-visible="introVideoOverlayVisible = $event"
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
        v-if="introComplete"
        :active-slot="activeInstrumentSlot"
        :inventory-open="inventoryOpen"
        :chem-cam-unread="chemCamUnreadCount"
        :sam-unread="samUnread"
        :apxs-unread="apxsUnread"
        :dan-scanning="!!(siteRover?.instruments.find(i => i.id === 'dan') as DANController | undefined)?.passiveSubsystemEnabled"
        :unlocked-instruments="unlockedInstruments"
        :sandbox="playerProfile.sandbox"
        :newly-unlocked="newlyUnlockedInstruments"
        @select="(slot: number) => { if (!isSleeping) { siteRover?.activateInstrument(slot); const inst = siteRover?.instruments.find(i => i.slot === slot); if (inst) dismissNewlyUnlocked(inst.id) } }"
        @deselect="siteRover?.activateInstrument(null)"
        @toggle-inventory="toggleInventoryFromToolbar"
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
      :instrument-speed-hud="instrumentSpeedHudForSlot"
      :instrument-accuracy-hud="instrumentAccuracyHud"
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
      @install-upgrade="handleInstrumentUpgrade"
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
      :lga-upgraded="lgaUpgraded"
      :has-upgrade="activeInstrumentHasUpgrade"
      :is-upgraded="activeInstrumentIsUpgraded"
      :rad-zone="radZone"
      :rad-dose-rate="radDoseRate"
      :rad-enabled="radEnabled"
      @toggle-dsn-archaeology="handleToggleDsnArchaeology"
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
      :rad-events="radArchivedEvents"
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
    <DSNArchiveDialog :open="showArchive" @close="showArchive = false" />
    <RewardTrackDialog
      :open="rewardTrackOpen"
      :milestones="rewardTrackMilestones"
      :unlocked-ids="unlockedTrackIds"
      :total-sp="totalSP"
      @close="rewardTrackOpen = false"
    />
    <MessageDialog
      :message="openedMessage"
      :mission-accepted="missionAccepted"
      :mission-completed="missionCompleted"
      @close="handleCloseMessage"
      @accept-mission="handleAcceptMission"
    />
    <MissionLogDialog
      :open="missionLogOpen"
      :active-missions="activeMissions"
      :completed-missions="completedMissions"
      :tracked-mission-id="trackedMissionId"
      :get-def="getMissionDef"
      :get-obj-label="getObjLabel"
      @close="handleCloseMissionLog"
      @track="handleTrackMission"
    />
    <MissionTracker
      v-if="introComplete"
      :mission="trackedMission"
      :mission-def="trackedMissionDef"
      :is-eligible="(objId: string) => trackedMissionId ? isObjectiveEligible(trackedMissionId, objId) : false"
      :lga-active="lgaActive"
      :transmit-progress="transmitProgress"
      :dwell-poi-id="activeDwellPoiId"
      :dwell-progress="activeDwellProgress"
      @untrack="handleUntrack"
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
    <RADEventAlert
      :visible="radEventAlertPending"
      @decode="onRadDecode"
      @dismiss="onRadDismiss"
    />
    <RADDecodeOverlay
      :active="radDecoding"
      :event-id="(radActiveEventId as import('@/lib/radiation').RadEventId) ?? 'gcr-fluctuation'"
      @complete="onRadDecodeComplete"
    />
    <RADResultDisplay
      v-if="radResultVisible"
      :visible="radResultVisible"
      v-bind="radResultData"
      @acknowledge="onRadAcknowledge"
    />
    <SampleToast ref="sampleToastRef" />
    <AchievementBanner ref="achievementRef" />
    <MissionCompleteBanner ref="missionCompleteRef" />
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
      <Transition name="deploy-fade">
        <div v-if="showRestartConfirm" key="restart-confirm" class="overdrive-confirm-overlay">
          <div class="overdrive-confirm restart-confirm-dialog">
            <div class="overdrive-icon">&#x21BB;</div>
            <div class="overdrive-title">RESTART</div>
            <div class="overdrive-desc">
              Clear all saved game data in this browser and return to the main menu. Progress includes science points,
              missions, inventory, achievements, and site state.
            </div>
            <div class="overdrive-warning">
              This cannot be undone.
            </div>
            <div class="overdrive-buttons">
              <button type="button" class="overdrive-btn confirm restart-confirm-btn" @click="confirmRestart()">
                RESTART
              </button>
              <button type="button" class="overdrive-btn cancel" @click="cancelRestart()">CANCEL</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <Transition name="deploy-fade">
      <div v-if="isSleeping && introComplete" class="sleep-overlay">
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
      v-if="introComplete"
      :active-slot="activeInstrumentSlot"
      :uhf-unlocked="playerProfile.sandbox || unlockedInstruments.includes('antenna-uhf')"
      :lga-alert="lgaUnreadCount > 0 && activeInstrumentSlot !== 11"
      @select="(slot: number) => { lgaEverToggled = true; siteRover?.activateInstrument(slot) }"
      @deselect="() => { lgaEverToggled = true; siteRover?.activateInstrument(null) }"
    />
    <!-- Comm panels container: stacks LGA mailbox and UHF uplink vertically beside the CommToolbar -->
    <div
      v-if="introComplete && ((!lgaEverToggled || activeInstrumentSlot === 11) || activeInstrumentSlot === 12)"
      style="position: fixed; top: 58px; left: 76px; z-index: 40; display: flex; flex-direction: column; gap: 6px;"
    >
      <LGAMailbox
        v-if="!lgaEverToggled || activeInstrumentSlot === 11"
        :messages="lgaMailbox.messages.value"
        :unread-count="lgaUnreadCount"
        @mark-read="lgaMailbox.markRead"
        @open-message="handleOpenMessage"
      />
      <UHFUplinkPanel
        v-if="activeInstrumentSlot === 12"
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
      />
    </div>
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
    <RADHud
      :enabled="radEnabled"
      :zone="radZone"
      :level="radLevel"
      :dose-rate="radDoseRate"
      :cumulative-dose="radCumulativeDose"
      :particle-rate="radParticleRate"
    />
    <div v-if="introComplete" class="power-hud-stack">
      <div v-if="!isSleeping" class="power-hud-top-controls">
        <button
          type="button"
          class="wheels-hud-btn"
          :class="{ active: profileOpen }"
          title="Rover Profile [0]"
          @click="toggleProfilePanel"
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
        :booted="powerBooted"
        @boot="handlePowerBoot"
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
        <button
          type="button"
          class="wheels-hud-btn wheels-hud-btn--mic"
          :class="{
            active: activeInstrumentSlot === MIC_SLOT,
            disabled: wheelsHudBlocked,
            'wheels-hud-btn--mic-on': micListening,
          }"
          :disabled="wheelsHudBlocked"
          :title="micListening ? 'Microphone [M] — LISTENING' : 'Microphone [M]'"
          @click="toggleMicPanel"
        >
          <span class="wheels-hud-key font-instrument">M</span>
          <span class="wheels-hud-icon wheels-hud-mic-icon" aria-hidden="true">&#x1F399;</span>
          <span class="wheels-hud-name">MIC</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, shallowRef, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  MARS_TIME_OF_DAY_06_00,
  MARS_SOL_CLOCK_MINUTES,
  SOL_DURATION,
} from '@/lib/marsTimeConstants'
import {
  roverHeadingRadToCompassDeg,
  signedRelativeBearingDeg,
  worldBearingDegToPoi,
} from '@/lib/sitePoiBearing'
import { useMarsData } from '@/composables/useMarsData'
import { useSiteMissionPois } from '@/composables/useSiteMissionPois'
import MartianSiteNavbar from '@/components/MartianSiteNavbar.vue'
import type { TerrainParams } from '@/types/terrain'
import {
  createMarsSiteViewController,
  formatRtgShuntCooldownLabel,
  type MarsSiteViewControllerHandle,
} from '@/views/MarsSiteViewController'
import { buildMarsSiteViewContext } from '@/views/martianSiteViewContext'
import ChemCamActiveHud from '@/components/ChemCamActiveHud.vue'
import MastCamActiveHud from '@/components/MastCamActiveHud.vue'
import RtgStatusBanners from '@/components/RtgStatusBanners.vue'
import InstrumentToolbar from '@/components/InstrumentToolbar.vue'
import InstrumentOverlay from '@/components/InstrumentOverlay.vue'
import ChemCamExperimentPanel from '@/components/ChemCamExperimentPanel.vue'
import ScienceLogDialog from '@/components/ScienceLogDialog.vue'
import SciencePointsDialog from '@/components/SciencePointsDialog.vue'
import AchievementsDialog from '@/components/AchievementsDialog.vue'
import DSNArchiveDialog from '@/components/DSNArchiveDialog.vue'
import RewardTrackDialog from '@/components/RewardTrackDialog.vue'
import AchievementBanner from '@/components/AchievementBanner.vue'
import MissionCompleteBanner from '@/components/MissionCompleteBanner.vue'
import MastTelemetry from '@/components/MastTelemetry.vue'
import InstrumentCrosshair from '@/components/InstrumentCrosshair.vue'
import InventoryPanel from '@/components/InventoryPanel.vue'
import SampleToast from '@/components/SampleToast.vue'
import SAMDialog from '@/components/SAMDialog.vue'
import SAMResultDialog from '@/components/SAMResultDialog.vue'
import DANDialog from '@/components/DANDialog.vue'
import DANProspectBar from '@/components/DANProspectBar.vue'
import PowerHud from '@/components/PowerHud.vue'
import RADHud from '@/components/RADHud.vue'
import RADEventAlert from '@/components/RADEventAlert.vue'
import RADDecodeOverlay from '@/components/RADDecodeOverlay.vue'
import RADResultDisplay from '@/components/RADResultDisplay.vue'
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
  MIC_SLOT,
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
import { useRadArchive } from '@/composables/useRadArchive'
import { RAD_EVENT_DEFS } from '@/lib/radiation'
import type { RadQualityGrade } from '@/lib/radiation'
import { useAPXSQueue, type APXSQueueEntry } from '@/composables/useAPXSQueue'
import { computeAPXSSp, APXS_ELEMENTS, type APXSComposition, type APXSElementId } from '@/lib/apxsComposition'
import type { APXSCountdownState } from '@/views/site-controllers/APXSTickHandler'
import { useInstrumentDurability } from '@/composables/useInstrumentDurability'
import type { DSNTransmission } from '@/types/dsnArchive'
import { useMissionUI } from '@/composables/useMissionUI'
import { useMissions } from '@/composables/useMissions'
import { useLegacy } from '@/composables/useLegacy'
import { useDSNArchive } from '@/composables/useDSNArchive'
import type { LGAMessage } from '@/types/lgaMailbox'
import MessageDialog from '@/components/MessageDialog.vue'
import MissionLogDialog from '@/components/MissionLogDialog.vue'
import MissionTracker from '@/components/MissionTracker.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import IntroSequence from '@/components/IntroSequence.vue'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { buildSpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'
import { computeStormPerformancePenalty } from '@/lib/hazards'
import { getMissionSolForSite, setMissionSolForSite } from '@/lib/siteMissionSolStorage'
import { useAudio } from '@/audio/useAudio'
import { useUiSound } from '@/composables/useUiSound'

const route = useRoute()
const siteId = route.params.siteId as string
const audio = useAudio()
const { playUiCue } = useUiSound()
const { incrementLegacy } = useLegacy()

const POWER_BOOTED_KEY = 'mars-power-booted'
const powerBooted = ref(localStorage.getItem(POWER_BOOTED_KEY) === '1')

function handlePowerBoot(): void {
  powerBooted.value = true
  try { localStorage.setItem(POWER_BOOTED_KEY, '1') } catch { /* ignore */ }
  useMissions().notifyPowerBooted()
  playUiCue('ui.switch')
}

if (powerBooted.value) {
  useMissions().notifyPowerBooted()
}

const { tryRepair, tryUpgrade, getBySlot } = useInstrumentDurability()
const { unlocked: dsnUnlocked, unreadCount: dsnUnreadCount } = useDSNArchive()

const siteHandle = shallowRef<MarsSiteViewControllerHandle | null>(null)
/** Rover controller — use `siteRover` in template (unwraps); use `siteRover.value` in `<script>`. */
const siteRover = computed(() => siteHandle.value?.rover ?? null)
const { archiveAcknowledgedReadout, spectra: chemCamArchivedSpectra, queueForTransmission: queueChemCamTx, dequeueFromTransmission: dequeueChemCamTx } = useChemCamArchive()
const {
  archiveProspect: archiveDanProspect,
  prospects: danArchivedProspects,
  queueForTransmission: queueDanTx,
  dequeueFromTransmission: dequeueDanTx,
  getLatestPersistedDanDrillSiteForSite,
} = useDanArchive()
const scienceLogOpen = ref(false)
const spLedgerOpen = ref(false)
const achievementsOpen = ref(false)

function toggleInventoryFromToolbar(): void {
  playUiCue('ui.switch')
  inventoryOpen.value = !inventoryOpen.value
}

function toggleProfilePanel(): void {
  playUiCue('ui.switch')
  profileOpen.value = !profileOpen.value
  if (profileOpen.value) useMissions().notifyUiInspected('profile')
}

const rewardTrackOpen = ref(false)
const showArchive = ref(false)
const hasScienceDiscoveries = computed(() => chemCamArchivedSpectra.value.length > 0 || danArchivedProspects.value.length > 0 || samArchivedDiscoveries.value.length > 0 || apxsArchivedAnalyses.value.length > 0)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// --- Theme music: loops for the duration of the site view ---
let themePlayback: AudioPlaybackHandle | null = null

// --- DSN voice: one owned playback; first user gesture unlocks Howler; manager queues early DSN until then ---
let dsnVoicePlayback: AudioPlaybackHandle | null = null

/** Toast + DSN SFX/voice batched here when transmissions arrive before {@link introComplete}. */
const pendingDsnTransmissionsForCue = ref<DSNTransmission[] | null>(null)

/**
 * Mission toast, DSN incoming sting, and optional voice log for pulled archive transmissions.
 */
function playDsnReceiveCue(txs: DSNTransmission[]): void {
  const count = txs.length
  const label = count === 1 ? '1 DSN transmission received' : `${count} DSN transmissions received`
  sampleToastRef.value?.showComm?.(label)
  dsnVoicePlayback?.stop()
  const firstWithAudio = txs.find(tx => tx.audioUrl)
  audio.play('sfx.dsnIncoming' as import('@/audio/audioManifest').AudioSoundId, {
    onEnd: firstWithAudio?.audioUrl
      ? () => { dsnVoicePlayback = audio.play('voice.dsnTransmission', { src: firstWithAudio.audioUrl }) }
      : undefined,
  })
}

function ensureAudioUnlocked() {
  audio.unlock()
  window.removeEventListener('keydown', ensureAudioUnlocked)
  window.removeEventListener('pointerdown', ensureAudioUnlocked)
}
window.addEventListener('keydown', ensureAudioUnlocked, { once: false })
window.addEventListener('pointerdown', ensureAudioUnlocked, { once: false })
const roverHeading = ref(0)
/** Mirrors {@link RoverController.isMoving} into Vue so wheels HUD updates when translation stops (heading alone is not enough). */
const roverIsMoving = ref(false)
/** After first W/S drive while deployed, hide the centered driving tips (per session). */
const controlsHintDismissed = ref(false)
const siteLoading = ref(true)
const skipIntro = isSiteIntroSequenceSkipped()
const introComplete = ref(skipIntro)
/** True while the intro MP4 overlay is up; sky-crane SFX stay off so muted video matches silent ambience. */
const introVideoOverlayVisible = ref(!skipIntro)

function onIntroComplete() {
  introComplete.value = true
  if (!themePlayback) {
    themePlayback = audio.play('music.theme' as import('@/audio/audioManifest').AudioSoundId, { loop: true })
  }
}
const descending = ref(true)
const deploying = ref(false)
const deployProgress = ref(0)
const activeInstrumentSlot = ref<number | null>(null)
const lgaEverToggled = ref(false)
/** Bumped when a passive instrument (DAN/REMS/RAD/comms) toggles STANDBY so the overlay re-reads bus state. */
const passiveUiRevision = ref(0)

const activeDurability = computed(() => {
  if (activeInstrumentSlot.value === null) return undefined
  return getBySlot(activeInstrumentSlot.value)
})

const activeInstrumentHasUpgrade = computed(() => {
  void passiveUiRevision.value
  void activeInstrumentSlot.value
  const inst = siteRover.value?.activeInstrument
  return inst ? inst.upgradeItemId !== null : false
})

const activeInstrumentIsUpgraded = computed(() => {
  void passiveUiRevision.value
  void activeInstrumentSlot.value
  const inst = siteRover.value?.activeInstrument
  return inst?.upgraded ?? false
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
  if (activeInstrumentSlot.value === MIC_SLOT) {
    const micInst = siteRover.value?.instruments.find(inst => inst.id === 'mic')
    if (micInst) {
      return {
        only: true as const,
        enabled: on,
        hud: {
          power: micInst.passiveSubsystemEnabled ? '1W' : '0W',
          powerColor: micInst.passiveSubsystemEnabled ? '#5dc9a5' : '#6b4a30',
          status: micInst.passiveSubsystemEnabled ? 'LISTENING' : 'STANDBY',
          statusColor: micInst.passiveSubsystemEnabled ? '#40c8f0' : '#6b4a30',
        },
      }
    }
  }
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

watch(
  [activeInstrumentSlot, isInstrumentActive],
  ([newSlot, newIsActive], [oldSlot]) => {
    // Play once when a different instrument enters overlay mode, regardless of input source.
    if (newIsActive || newSlot === null || newSlot === oldSlot) return
    audio.unlock()
    audio.play('ui.instrument')
  },
)

watch(activeInstrumentSlot, (slot) => {
  if (slot === WHLS_SLOT) useMissions().notifyUiInspected('wheels')
  if (slot === HEATER_SLOT) useMissions().notifyUiInspected('heater')
  if (slot === 11) useMissions().notifyUiInspected('lga')
})

// Antenna system refs
const uhfPassActive = ref(false)
const uhfTransmitting = ref(false)
const uhfCurrentOrbiter = ref('')
const uhfTransmissionProgress = ref(0)
const uhfQueueLength = ref(0)
const uhfWindowRemainingSec = ref(0)
const uhfNextPassInSec = ref(0)
const uhfTransmittedThisPass = ref(0)
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

// --- RAD state ---
const radZone = ref<import('@/lib/radiation').RadiationZone>('safe')
const radLevel = ref(0)
const radDoseRate = ref(0)
const radCumulativeDose = ref(0)
const radParticleRate = ref(0)
const radEnabled = ref(false)
const radEventAlertPending = ref(false)
const radActiveEventId = ref<string | null>(null)
const radDecoding = ref(false)
const radResultVisible = ref(false)
const radResultData = ref<{
  eventId: import('@/lib/radiation').RadEventId
  classifiedAs: import('@/lib/radiation').RadEventId
  resolved: boolean
  caught: number
  total: number
  grade: string
  sp: number
  confidence: number
  sideProducts: Array<{ itemId: string; quantity: number }>
}>({
  eventId: 'gcr-fluctuation',
  classifiedAs: 'gcr-fluctuation',
  resolved: false,
  caught: 0,
  total: 0,
  grade: 'D',
  sp: 0,
  confidence: 0,
  sideProducts: [],
})

// If RAD is turned off or power dies during processing/results, lose the analysis
watch(radEnabled, (enabled) => {
  if (!enabled && (radResultVisible.value || radDecoding.value)) {
    radResultVisible.value = false
    radDecoding.value = false
    radEventAlertPending.value = false
    radActiveEventId.value = null
    sampleToastRef.value?.showComm?.('RAD powered off — analysis lost')
  }
})

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
const drillSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const chemCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const mastCamSpeedBreakdown = ref<SpeedBreakdown | null>(null)
const apxsSpeedBreakdown = ref<SpeedBreakdown | null>(null)

const instrumentSpeedHudForSlot = computed(() => {
  switch (activeInstrumentSlot.value) {
    case 3: return drillSpeedBreakdown.value
    case 2: return chemCamSpeedBreakdown.value
    case 1: return mastCamSpeedBreakdown.value
    case 4: return apxsSpeedBreakdown.value
    default: return null
  }
})

/** Slots that benefit from instrumentAccuracy: MastCam, ChemCam, Drill, DAN, SAM, LGA, UHF */
const ACCURACY_SLOTS = new Set([1, 2, 3, 5, 6, 11, 12])
const instrumentAccuracyHud = computed(() => {
  if (!activeInstrumentSlot.value || !ACCURACY_SLOTS.has(activeInstrumentSlot.value)) return null
  const activeInst = siteRover.value?.instruments.find(i => i.slot === activeInstrumentSlot.value)
  const activeStormLevel = siteWeather.value.dustStormPhase === 'active' ? (siteWeather.value.dustStormLevel ?? 0) : 0
  return buildSpeedBreakdown({
    modifierKey: 'instrumentAccuracy',
    archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
    foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
    patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    trackModifiers: trackModifiers.value,
    stormLevel: activeStormLevel,
    instrumentTier: activeInst?.tier,
  })
})

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

  // Night penalty extra
  const nf = currentNightFactor.value
  const nightExtras: { label: string; value: string; color: string }[] = []
  if (nf > 0.01) {
    const penaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
    const nightPenalty = -(nf * penaltyFactor)
    const pct = Math.round(nightPenalty * 100)
    nightExtras.push({
      label: hasPerk('night-vision') ? 'NIGHT (NV)' : 'NIGHT',
      value: pct >= 0 ? `+${pct}%` : `${pct}%`,
      color: '#e05030',
    })
  }

  // RTG overdrive extra
  const rtg = siteRover.value?.instruments.find(i => i.id === 'rtg') as RTGController | undefined
  const rtgBoost = rtg?.speedMultiplier ?? 1.0
  if (rtgBoost > 1) {
    const pct = Math.round((rtgBoost - 1) * 100)
    nightExtras.push({ label: 'RTG OVERDRIVE', value: `+${pct}%`, color: '#5dc9a5' })
  }

  // Final speed % (profile * night * rtg)
  const profileMult = playerMod('movementSpeed')
  const nightPenaltyFactor = hasPerk('night-vision') ? 0.35 : 0.5
  const nightPenalty = 1.0 - nf * nightPenaltyFactor
  const speedPct = profileMult * nightPenalty * rtgBoost * 100

  const { buffs: speedBuffs } = buildSpeedBreakdown({
    modifierKey: 'movementSpeed',
    archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
    foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
    patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    trackModifiers: trackModifiers.value,
    extras: nightExtras.length > 0 ? nightExtras : undefined,
    speedPctOverride: speedPct,
  })

  return { powerStr, statusStr, healthPct: w.durabilityPct, speedPct, speedBuffs }
})

function handleInstrumentRepair() {
  if (activeInstrumentSlot.value === null) return
  // Find the instrument ID for the active slot
  const snap = getBySlot(activeInstrumentSlot.value)
  if (!snap) return
  const result = tryRepair(snap.id)
  if (result.ok) {
    useMissions().notifyRepairKitUsed()
  } else if (result.message) {
    sampleToastRef.value?.showError?.(result.message)
  }
}

function handleInstrumentUpgrade() {
  if (activeInstrumentSlot.value === null) return
  const snap = getBySlot(activeInstrumentSlot.value)
  if (!snap) return
  const result = tryUpgrade(snap.id)
  if (result.ok) {
    useMissions().notifyUpgradeInstalled(snap.id)
    sampleToastRef.value?.showComm?.(`${snap.name} — UPGRADE INSTALLED`)
    // Force reactive recalc — controller fields aren't Vue-reactive
    passiveUiRevision.value++
  } else if (result.message) {
    sampleToastRef.value?.showError?.(result.message)
  }
}

const lgaUpgraded = computed(() => {
  void passiveUiRevision.value // re-evaluate when upgrade state changes
  const lga = siteRover.value?.instruments.find(i => i.id === 'antenna-lg')
  return lga?.upgraded ?? false
})

// When LGA gets upgraded (or was already upgraded from localStorage), unlock DSN archaeology
watch(lgaUpgraded, (upgraded) => {
  if (upgraded && !dsnUnlocked.value) {
    useDSNArchive().unlock()
  }
})

function handleToggleDsnArchaeology() {
  showArchive.value = true
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

function toggleMicPanel() {
  if (!siteRover.value || isSleeping.value || wheelsHudBlocked.value) return
  playUiCue('ui.instrument')
  if (activeInstrumentSlot.value === MIC_SLOT) siteRover.value.activateInstrument(null)
  else siteRover.value.activateInstrument(MIC_SLOT)
}

function handleQueueForTx(source: 'chemcam' | 'dan' | 'sam' | 'apxs' | 'rad', archiveId: string) {
  if (source === 'chemcam') queueChemCamTx(archiveId)
  else if (source === 'dan') queueDanTx(archiveId)
  else if (source === 'sam') queueSamTx(archiveId)
  else if (source === 'apxs') queueAPXSTx(archiveId)
  else if (source === 'rad') queueRadTx(archiveId)
}

function handleDequeueFromTx(source: 'chemcam' | 'dan' | 'sam' | 'apxs' | 'rad', archiveId: string) {
  if (source === 'chemcam') dequeueChemCamTx(archiveId)
  else if (source === 'dan') dequeueDanTx(archiveId)
  else if (source === 'sam') dequeueSamTx(archiveId)
  else if (source === 'apxs') dequeueAPXSTx(archiveId)
  else if (source === 'rad') dequeueRadTx(archiveId)
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
const missionCompleteRef = ref<InstanceType<typeof MissionCompleteBanner> | null>(null)
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

const marsSol = ref(getMissionSolForSite(siteId))
watch(marsSol, (sol) => {
  const id = route.params.siteId as string
  if (id) setMissionSolForSite(id, sol)
})
const mastPan = ref(0)
const mastTilt = ref(0)
const mastFov = ref(50)
const mastTargetRange = ref(-1)
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
  siteWeather,
  tickRemsWeather,
  triggerStorm,
} = useSiteRemsWeather()
const remsSurveying = ref(false)
const micListening = ref(false)
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
  triggerRadAchievement,
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
/** Single source of truth with {@link useLGAMailbox} (avoids stale ref only updated inside antenna tick). */
const lgaUnreadCount = computed(() => lgaMailbox.unreadCount.value)
const orbitalPasses = useOrbitalPasses()

watch(introComplete, (done, wasDone) => {
  if (!done) return
  if (pendingDsnTransmissionsForCue.value?.length) {
    const txs = pendingDsnTransmissionsForCue.value
    pendingDsnTransmissionsForCue.value = null
    playDsnReceiveCue(txs)
  }
  // Mail may have arrived while the intro video ran; LGA chime was suppressed — play once when systems wake.
  if (wasDone === false && lgaMailbox.unreadCount.value > 0) {
    audio.unlock()
    audio.play('sfx.lgaUplink' as import('@/audio/audioManifest').AudioSoundId)
  }
})

// Transmission teaching toasts for m00-checkout
watch(
  () => useMissions().awaitingTransmit.value,
  (awaiting) => {
    const isCheckout = awaiting.some(s => s.missionId === 'm00-checkout')
    if (!isCheckout) return

    // Toast 1: immediate guidance
    sampleToastRef.value?.showComm?.('Select the LGA [R] to transmit completed missions')

    // Toast 2: delayed flavor (after reward/achievement toasts settle)
    setTimeout(() => {
      sampleToastRef.value?.showComm?.('Transmission is how data becomes science. Get used to the uplink.')
    }, 10_000)
  },
)

// Increment legacy when m13-deep-signal completes
watch(
  () => useMissions().completedMissions.value,
  (completed, prev) => {
    const wasCompleted = prev?.some(s => s.missionId === 'm13-deep-signal') ?? false
    const nowCompleted = completed.some(s => s.missionId === 'm13-deep-signal')
    if (nowCompleted && !wasCompleted) {
      const { landmarks } = useMarsData()
      const site = landmarks.value.find(l => l.id === siteId)
      if (site) {
        incrementLegacy(site.tier)
      }
    }
  },
)

// --- Mission UI (extracted to composable) ---
const mission = useMissionUI({
  siteHandle,
  roverWorldX,
  roverWorldZ,
  marsSol,
  activeInstrumentSlot,
  onMissionComplete: (name, sp, unlock) => {
    missionCompleteRef.value?.show(name, sp, unlock)
  },
})
const {
  missionLogOpen, openedMessage,
  activeMissions, completedMissions, trackedMissionId, unlockedInstruments, transmitProgress,
  trackedMission, trackedMissionDef, activeDwellPoiId, activeDwellProgress, lgaActive, missionAccepted, missionCompleted,
  getMissionDef, getObjLabel, isObjectiveEligible,
  handleAcceptMission, handleMissionTransmit, handleOpenMessage, handleCloseMessage,
  handleOpenMissionLog, handleCloseMissionLog, handleTrackMission, handleUntrack,
  newlyUnlockedInstruments, dismissNewlyUnlocked,
  syncActiveMissionsLayoutFromRover,
} = mission

/** Static site POIs load asynchronously; when they replace `missionPois`, re-apply active mission go-tos. */
watch(
  () => route.params.siteId as string,
  (id) => {
    controlsHintDismissed.value = false
    if (!id) return
    marsSol.value = getMissionSolForSite(id)
    void (async () => {
      await loadPoisForSite(id)
      await nextTick()
      if (siteHandle.value) syncActiveMissionsLayoutFromRover()
    })()
  },
  { immediate: true },
)

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
const { events: radArchivedEvents, archiveRadEvent, queueForTransmission: queueRadTx, dequeueFromTransmission: dequeueRadTx } = useRadArchive()

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
  // Apply analysis speed modifier and storm penalty to processing duration
  const samInst = siteRover.value?.instruments.find(i => i.id === 'sam')
  const samStormPenalty = siteWeather.value.dustStormPhase === 'active' && samInst
    ? computeStormPerformancePenalty(siteWeather.value.dustStormLevel ?? 0, samInst.tier)
    : 1
  const speedMult = playerMod('analysisSpeed')
  const adjustedRemaining = entry.remainingTimeSec * samStormPenalty / speedMult
  const adjustedTotal = entry.totalTimeSec * samStormPenalty / speedMult
  const fullEntry = { ...entry, startedAtSol: marsSol.value, remainingTimeSec: adjustedRemaining, totalTimeSec: adjustedTotal }
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
  const apxsInst = siteRover.value?.instruments.find(i => i.id === 'apxs')
  const apxsStormPenalty = siteWeather.value.dustStormPhase === 'active' && apxsInst
    ? computeStormPerformancePenalty(siteWeather.value.dustStormLevel ?? 0, apxsInst.tier)
    : 1
  const processingTime = baseTime * apxsStormPenalty / playerMod('analysisSpeed')

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
const showRestartConfirm = ref(false)
const orbitalDropInteractHint = computed(() => {
  if (!introComplete.value || isSleeping.value) return ''
  if (!orbitalDrops.nearbyDrop.value) return ''
  return 'PAYLOAD IN RANGE \u00b7 PRESS F TO COLLECT'
})
const centerHintText = computed(() => {
  if (introComplete.value && activeInstrumentSlot.value === null && rtgPhase.value === 'idle' && rtgConservationMode.value !== 'active' && !controlsHintDismissed.value) {
    return 'WASD drive · drag orbit · 1-9 TOOLS'
  }
  if (orbitalDropInteractHint.value) return orbitalDropInteractHint.value
  if (introComplete.value && activeInstrumentSlot.value === null && rtgConservationMode.value === 'active') {
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
    audio.unlock()
    audio.play('ui.switch')
    const inst = siteRover.value.activeInstrument
    const passive = inst?.passiveSubsystemOnly
    siteRover.value.enterActiveMode()
    if (passive) passiveUiRevision.value++
    // Notify mission system when REMS is activated
    if (inst?.id === 'rems' && inst.passiveSubsystemEnabled) {
      useMissions().notifyRemsActivated()
    }
  }
}

function confirmOverdrive() {
  showOverdriveConfirm.value = false
  if (!siteRover.value) return
  const rtg = siteRover.value.activeInstrument
  if (rtg instanceof RTGController) {
    rtg.activateOverdrive()
    audio.play('sfx.rtgOverdrive' as import('@/audio/audioManifest').AudioSoundId)
    siteRover.value.activateInstrument(null)
    // Notify mission system that overdrive was used
    useMissions().notifyRtgOverdrive()
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
    audio.play('sfx.rtgShunt' as import('@/audio/audioManifest').AudioSoundId)
    fillBatteryFull()
    siteRover.value.activateInstrument(null)
    useMissions().notifyRtgShunt()
  }
}

function cancelConservation() {
  showConservationConfirm.value = false
}

/**
 * Clears localStorage and loads home so singleton state resets (full document navigation).
 */
function confirmRestart(): void {
  showRestartConfirm.value = false
  try {
    localStorage.clear()
  } catch {
    /* private mode / quota */
  }
  const base = import.meta.env.BASE_URL || '/'
  window.location.href = base
}

function cancelRestart(): void {
  showRestartConfirm.value = false
}

function handleOrbitalDropOpen(): void {
  const drop = orbitalDrops.nearbyDrop.value
  if (!drop || siteRover.value?.mode !== 'driving') return
  orbitalDrops.openDrop(drop.id, addComponentsBatch)
}

function handleDanProspect(): void {
  siteHandle.value?.handleDanProspect()
}

function onRadDecode(): void {
  siteHandle.value?.handleRadDecode()
}

function onRadDismiss(): void {
  siteHandle.value?.handleRadDismiss()
}

function onRadDecodeComplete(result: {
  eventId: import('@/lib/radiation').RadEventId
  classifiedAs: import('@/lib/radiation').RadEventId
  confidence: number
  resolved: boolean
  caught: number
  total: number
  grade: string
  sp: number
  sideProducts: Array<{ itemId: string; quantity: number }>
}): void {
  // End decode in the tick handler
  siteHandle.value?.handleRadDismiss()

  // Store result and show processing → result screen (SP/archive on acknowledge)
  radResultData.value = {
    eventId: result.eventId,
    classifiedAs: result.classifiedAs,
    resolved: result.resolved,
    caught: result.caught,
    total: result.total,
    grade: result.grade,
    sp: result.sp,
    confidence: result.confidence,
    sideProducts: result.sideProducts,
  }
  radResultVisible.value = true
}

function onRadAcknowledge(): void {
  const result = radResultData.value
  radResultVisible.value = false

  // Award SP
  if (result.sp > 0) {
    const gain = awardSurvival(`RAD: ${result.classifiedAs}`, result.sp)
    if (gain) sampleToastRef.value?.showSP(gain.amount, 'RAD', gain.bonus)
  }

  // Add side products to inventory
  if (result.sideProducts.length > 0) {
    addComponentsBatch(result.sideProducts.map(sp => ({ itemId: sp.itemId, quantity: sp.quantity })))
  }

  // Archive RAD event
  archiveRadEvent({
    eventId: result.eventId,
    classifiedAs: result.classifiedAs,
    eventName: RAD_EVENT_DEFS[result.classifiedAs].name,
    rarity: RAD_EVENT_DEFS[result.classifiedAs].rarity,
    resolved: result.resolved,
    confidence: result.confidence,
    caught: result.caught,
    total: result.total,
    grade: result.grade as RadQualityGrade,
    spEarned: result.sp,
    sideProducts: result.sideProducts,
    capturedSol: marsSol.value,
    siteId,
    latitudeDeg: siteLat.value,
    longitudeDeg: siteLon.value,
  })

  // RAD achievements
  const radDecodeCount = radArchivedEvents.value.length
  if (radDecodeCount === 1) triggerRadAchievement('first-decode')
  if (radDecodeCount === 5) triggerRadAchievement('five-decodes')

  const classifiedId = result.classifiedAs
  if (classifiedId === 'soft-sep' || classifiedId === 'hard-sep') {
    triggerRadAchievement('first-sep')
  }
  if (classifiedId === 'forbush-decrease') {
    triggerRadAchievement('forbush-detected')
  }

  if (result.grade === 'S') {
    triggerRadAchievement('s-grade')
  }
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.code === 'Tab') {
    if (e.repeat) return
    e.preventDefault()
    toggleInventoryFromToolbar()
  }
  if (e.code === 'Digit0' || e.code === 'Backquote') {
    if (e.repeat) return
    toggleProfilePanel()
  }
  if (e.key === 'm' || e.key === 'M') {
    toggleMicPanel()
    return
  }
  if (e.code === 'KeyF' && !e.repeat && orbitalDrops.nearbyDrop.value) {
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
    profileSources: {
      archetype: playerProfile.archetype ? ARCHETYPES[playerProfile.archetype] : null,
      foundation: playerProfile.foundation ? FOUNDATIONS[playerProfile.foundation] : null,
      patron: playerProfile.patron ? PATRONS[playerProfile.patron] : null,
    },
    trackModifiers,
    hasPerk,
    tickPower,
    tickThermal,
    tickRemsWeather,
    triggerStorm,
    sampleToastRef,
    upsertPoi,
    removePoi,
    setFocusPoi,
    focusPoiId,
    awardSP,
    awardDAN,
    archiveDanProspect,
    getLatestPersistedDanDrillSite: getLatestPersistedDanDrillSiteForSite,
    samTick,
    apxsTick,
    totalSP,
    triggerDanAchievement,
    awardTransmission,
    playInstrumentActionSound: (soundId) => {
      audio.unlock()
      audio.play(soundId)
    },
    startInstrumentActionLoop: (soundId) => {
      audio.unlock()
      return audio.play(soundId, { loop: true })
    },
    stopInstrumentActionSound: (soundId) => {
      audio.stopSound(soundId)
    },
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
    playAmbientLoop: (soundId) => audio.play(soundId, { loop: true }),
    playSoundWithHandle: (soundId) => audio.play(soundId),
    setAmbientVolume: (handle, volume) => handle.setVolume(volume),
    commCuesAudible: () => introComplete.value,
    descentSfxAudible: () => !introVideoOverlayVisible.value,
    onDSNTransmissionsReceived: (txs) => {
      if (!introComplete.value) {
        const cur = pendingDsnTransmissionsForCue.value
        pendingDsnTransmissionsForCue.value = cur?.length ? [...cur, ...txs] : txs
        return
      }
      playDsnReceiveCue(txs)
    },
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
      siteWeather,
      remsSurveying,
      micEnabled: micListening,
      drillSpeedBreakdown,
      chemCamSpeedBreakdown,
      mastCamSpeedBreakdown,
      apxsSpeedBreakdown,
      // RAD
      radZone,
      radLevel,
      radDoseRate,
      radCumulativeDose,
      radParticleRate,
      radEnabled,
      radEventAlertPending,
      radActiveEventId,
      radDecoding,
    },
  })
}

onMounted(async () => {
  const handle = createMarsSiteViewController(createSiteControllerContext())
  await handle.mount()
  siteHandle.value = handle
  siteLoading.value = false
  audio.unlock()
  // Theme music starts after intro sequence completes (video + descent + deploy).
  // For skip-intro players, introComplete is already true so this fires immediately.
  if (introComplete.value) {
    themePlayback = audio.play('music.theme' as import('@/audio/audioManifest').AudioSoundId, { loop: true })
  }
  // Kick reactive computeds after upgrade hydration from localStorage (runs on first frame)
  requestAnimationFrame(() => { passiveUiRevision.value++ })
  await nextTick()
  syncActiveMissionsLayoutFromRover()
})

onUnmounted(() => {
  siteHandle.value?.dispose()
  siteHandle.value = null
  window.removeEventListener('keydown', ensureAudioUnlocked)
  window.removeEventListener('pointerdown', ensureAudioUnlocked)
  themePlayback?.stop()
  themePlayback = null
  dsnVoicePlayback?.stop()
  dsnVoicePlayback = null
})


</script>

<style scoped src="./MartianSiteView.css"></style>
