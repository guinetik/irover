<template>
  <Teleport to="body">
    <Transition name="overlay-slide">
      <div v-if="instrument" class="instrument-overlay">
        <!-- Header -->
        <div class="ov-header">
          <div class="ov-icon">{{ instrument.icon }}</div>
          <div class="ov-title">
            <div class="ov-name">{{ instrument.name }}</div>
            <div class="ov-type">{{ instrument.type }}</div>
          </div>
          <div class="ov-slot">{{ instrument.slot }}</div>
          <button
            v-if="helpDef?.help"
            type="button"
            class="ov-help-btn"
            title="Field reference"
            @click="helpOpen = true"
          >?</button>
        </div>

        <!-- Description -->
        <div class="ov-desc">{{ instrument.desc }}</div>

        <!-- Stats (thermal override for heater) -->
        <div v-if="activeSlot === HEATER_SLOT && thermal" class="ov-stats ov-stats-thermal">
          <div class="ov-stat">
            <div class="ov-stat-label">ROVER</div>
            <div class="ov-stat-value" :style="{ color: thermalZoneColor }">{{ thermal.internalTempC >= 0 ? '+' : '' }}{{ Math.round(thermal.internalTempC) }}&deg;C</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">AMBIENT</div>
            <div
              class="ov-stat-value"
              style="color: #6b4a30"
              :title="thermal.ambientMeasured ? '' : 'REMS on mast required for ambient air sensing'"
            >{{ thermal.ambientMeasured ? Math.round(thermal.ambientC) + '\u00B0C' : '\u2014' }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">HEATER</div>
            <div class="ov-stat-value" :style="{ color: thermal.heaterW > 0 ? '#ef9f27' : 'rgba(196,117,58,0.4)' }">{{ thermal.heaterW > 0 ? '\u2668 ' + thermal.heaterW.toFixed(0) + 'W' : 'OFF' }}</div>
          </div>
          <div class="ov-stat ov-stat-zone" :style="{ background: thermalZoneBg }">
            <div class="ov-stat-label">ZONE</div>
            <div class="ov-stat-value" :style="{ color: thermalZoneColor }">{{ thermal.zone }}</div>
          </div>
        </div>
        <div v-else-if="activeSlot === REMS_SLOT && remsHud" class="ov-stats ov-stats-rems">
          <div class="ov-stat">
            <div class="ov-stat-label">POWER</div>
            <div class="ov-stat-value" :style="{ color: statPowerColor }">{{ statPower }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">STATUS</div>
            <div class="ov-stat-value" :style="{ color: statStatusColor }">{{ statStatus }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">HEALTH</div>
            <div class="ov-stat-value" :style="{ color: healthColor }">{{ instrument.health }}</div>
          </div>
          <template v-if="remsHud.available">
            <div class="ov-stat">
              <div class="ov-stat-label">PRESS</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.pressureHpa.toFixed(1) }} hPa</div>
            </div>
            <div class="ov-stat">
              <div class="ov-stat-label">RH</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.humidityPct.toFixed(1) }}%</div>
            </div>
            <div class="ov-stat">
              <div class="ov-stat-label">AIR</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.tempC >= 0 ? '+' : '' }}{{ remsHud.tempC.toFixed(1) }}&deg;C</div>
            </div>
            <div class="ov-stat">
              <div class="ov-stat-label">WIND</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.windMs.toFixed(1) }} m/s {{ remsHud.windDirCompass }}</div>
            </div>
            <div class="ov-stat">
              <div class="ov-stat-label">UV</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.uvIndex.toFixed(1) }}</div>
            </div>
            <div class="ov-stat">
              <div class="ov-stat-label">ELEV</div>
              <div class="ov-stat-value" style="color: #9ec8d4">{{ remsHud.elevationKm >= 0 ? '+' : '' }}{{ remsHud.elevationKm.toFixed(1) }} km</div>
            </div>
            <div
              v-if="remsHud.dustStormLevel != null"
              class="ov-rems-dust-storm"
            >
              Dust storm L{{ remsHud.dustStormLevel }} — {{ remsDustStormLabel }}
            </div>
          </template>
          <div v-else class="ov-rems-offline">Ambient sensing off — ACTIVATE REMS for pressure, humidity, air temp, wind, and storm alerts.</div>
        </div>
        <div v-else class="ov-stats">
          <div class="ov-stat">
            <div class="ov-stat-label">POWER</div>
            <div class="ov-stat-value" :style="{ color: statPowerColor }">{{ statPower }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">STATUS</div>
            <div class="ov-stat-value" :style="{ color: statStatusColor }">{{ statStatus }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">HEALTH</div>
            <div class="ov-stat-value" :style="{ color: healthColor }">{{ instrument.health }}</div>
          </div>
        </div>

        <!-- WHLS: movement speed indicator -->
        <div v-if="activeSlot === WHLS_SLOT && wheelsHud" class="ov-spd-speed">
          <div class="ov-spd-speed-row">
            <span class="ov-spd-speed-label">MOVE SPD</span>
            <span class="ov-spd-speed-value" :style="{ color: wheelsSpeedColor }">{{ wheelsSpeedStr }}</span>
          </div>
          <div class="ov-spd-speed-bar-track">
            <div class="ov-spd-speed-bar-fill" :style="{ width: wheelsSpeedBarPct + '%', background: wheelsSpeedColor }" />
          </div>
          <div class="ov-spd-buffs">
            <div
              v-for="buff in wheelsHud.speedBuffs"
              :key="buff.label"
              class="ov-spd-buff"
            >
              <span class="ov-spd-buff-label">{{ buff.label }}</span>
              <span class="ov-spd-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
            </div>
          </div>
        </div>

        <!-- Instrument analysis speed indicator -->
        <div v-if="instrumentSpeedHud && ANALYSIS_INSTRUMENT_SLOTS.has(activeSlot ?? -1)" class="ov-spd-speed">
          <div class="ov-spd-speed-row">
            <span class="ov-spd-speed-label">{{ instrumentSpeedLabel }}</span>
            <span class="ov-spd-speed-value" :style="{ color: instrumentSpeedColor }">{{ instrumentSpeedStr }}</span>
          </div>
          <div class="ov-spd-speed-bar-track">
            <div class="ov-spd-speed-bar-fill" :style="{ width: instrumentSpeedBarPct + '%', background: instrumentSpeedColor }" />
          </div>
          <div class="ov-spd-buffs">
            <div
              v-for="buff in instrumentSpeedHud.buffs"
              :key="buff.label"
              class="ov-spd-buff"
            >
              <span class="ov-spd-buff-label">{{ buff.label }}</span>
              <span class="ov-spd-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
            </div>
          </div>
        </div>

        <!-- Instrument accuracy indicator -->
        <div v-if="instrumentAccuracyHud" class="ov-spd-speed">
          <div class="ov-spd-speed-row">
            <span class="ov-spd-speed-label">ACCURACY</span>
            <span class="ov-spd-speed-value" :style="{ color: accuracyColor }">{{ accuracyStr }}</span>
          </div>
          <div class="ov-spd-speed-bar-track">
            <div class="ov-spd-speed-bar-fill" :style="{ width: accuracyBarPct + '%', background: accuracyColor }" />
          </div>
          <div class="ov-spd-buffs">
            <div
              v-for="buff in instrumentAccuracyHud.buffs"
              :key="buff.label"
              class="ov-spd-buff"
            >
              <span class="ov-spd-buff-label">{{ buff.label }}</span>
              <span class="ov-spd-buff-value" :style="{ color: buff.color }">{{ buff.value }}</span>
            </div>
          </div>
        </div>

        <!-- Durability bar (all instruments) -->
        <div v-if="durabilityPct !== undefined && durabilityPct < 100" class="ov-durability">
          <div class="ov-durability-row">
            <span class="ov-durability-label">DURABILITY</span>
            <span class="ov-durability-value" :style="{ color: durabilityColor }">{{ Math.round(durabilityPct) }}%</span>
            <span v-if="maxDurability < 100" class="ov-durability-max">/ {{ Math.round(maxDurability) }}%</span>
          </div>
          <div class="ov-durability-bar-track">
            <div class="ov-durability-bar-fill" :style="{ width: durabilityPct + '%', background: durabilityColor }" />
          </div>
        </div>

        <!-- Broken state -->
        <div v-if="instrumentOperational === false" class="ov-broken">
          {{ activeSlot === 7 ? 'RTG CRITICAL — TOTAL FAILURE IMMINENT' : 'PERMANENTLY DAMAGED' }}
        </div>

        <!-- Hint -->
        <div class="ov-hint">{{ instrument.hint }}</div>

        <!-- Temperature warning -->
        <div v-if="instrument.temp" class="ov-temp">{{ instrument.temp }}</div>

        <!-- ChemCam: background sequence progress + shots + See Results -->
        <div v-if="activeSlot === 2" class="ov-chemcam-block">
          <div v-if="chemCamSequenceActive" class="ov-cc-sequence">
            <div class="ov-cc-seq-label">{{ chemCamSequenceLabel }}</div>
            <div class="ov-cc-seq-track">
              <div
                class="ov-cc-seq-fill"
                :class="chemCamSequencePulse ? 'pulse' : 'integrate'"
                :style="{ width: chemCamSequenceProgress + '%' }"
              />
            </div>
          </div>
          <div class="ov-chemcam-status">
            <div class="ov-stat">
              <div class="ov-stat-label">SHOTS</div>
              <div class="ov-stat-value" style="color: #66ffee">{{ chemCamShots }}</div>
            </div>
            <button
              v-if="chemCamUnread > 0"
              class="ov-btn-see-results"
              @click="emitSeeChemCamResults"
            >SEE RESULTS <span class="ov-results-badge font-instrument">{{ chemCamUnread }}</span></button>
          </div>
        </div>

        <!-- SAM: experiment progress + See Results -->
        <div v-if="activeSlot === 6" class="ov-sam-block">
          <div v-if="samProcessing" class="ov-cc-sequence">
            <div class="ov-cc-seq-label">{{ samProgressLabel }}</div>
            <div class="ov-cc-seq-track">
              <div class="ov-cc-seq-fill integrate" :style="{ width: samProgressPct + '%' }" />
            </div>
          </div>
          <div v-if="(samUnread ?? 0) > 0" class="ov-chemcam-status">
            <button type="button" class="ov-btn-see-results" @click="emitSamSeeResults">
              SEE RESULTS <span class="ov-results-badge font-instrument">{{ samUnread }}</span>
            </button>
          </div>
        </div>

        <!-- APXS: analysis progress + See Results -->
        <div v-if="activeSlot === 4" class="ov-sam-block">
          <div v-if="apxsProcessing" class="ov-cc-sequence">
            <div class="ov-cc-seq-label">{{ apxsProgressLabel }}</div>
            <div class="ov-cc-seq-track">
              <div class="ov-cc-seq-fill integrate" :style="{ width: apxsProgressPct + '%' }" />
            </div>
          </div>
          <div v-if="(apxsUnread ?? 0) > 0" class="ov-chemcam-status">
            <button type="button" class="ov-btn-see-results" @click="emitApxsSeeResults">
              SEE RESULTS <span class="ov-results-badge font-instrument">{{ apxsUnread }}</span>
            </button>
          </div>
        </div>

        <!-- Buttons -->
        <div class="ov-buttons">
          <template v-if="activeSlot === 7">
            <button
              class="ov-btn-primary ov-btn-rtg-overdrive"
              :class="{ disabled: !rtgOverdriveReady || isActiveMode }"
              :disabled="!rtgOverdriveReady || isActiveMode"
              @click="handleRtgOverdriveClick"
            >OVERDRIVE</button>
            <button
              class="ov-btn-primary ov-btn-rtg-shunt"
              :class="{ disabled: !rtgConservationReady || isActiveMode }"
              :disabled="!rtgConservationReady || isActiveMode"
              :title="rtgConservationCooldownTitle"
              @click="handleRtgConservationClick"
            >POWER SHUNT</button>
          </template>
          <template v-else-if="activeSlot === HEATER_SLOT">
            <button
              class="ov-btn-primary ov-btn-rtg-overdrive"
              :class="{ disabled: !heaterOverdriveReady || isActiveMode }"
              :disabled="!heaterOverdriveReady || isActiveMode"
              @click="emitHeaterOverdrive"
            >OVERDRIVE</button>
          </template>
          <template v-else-if="passiveSubsystemOnly">
            <button
              class="ov-btn-primary"
              :class="{ disabled: !canActivate || isActiveMode }"
              :disabled="!canActivate || isActiveMode"
              @click="handleActivateClick"
            >{{ passiveSubsystemEnabled ? 'STANDBY' : 'ACTIVATE' }}</button>
            <button
              v-if="activeSlot === 5 && danHitAvailable && danProspectPhase === 'idle'"
              class="ov-btn-see-results ov-btn-dan-prospect"
              @click="emitDanProspect"
            >PROSPECT</button>
          </template>
          <template v-else>
            <button
              class="ov-btn-primary"
              :class="{ disabled: !canActivate || isActiveMode }"
              :disabled="!canActivate || isActiveMode"
              @click="handleActivateClick"
            >ACTIVATE</button>
          </template>
          <div class="ov-btn-row">
            <button type="button" class="ov-btn-secondary" @click="emitRepair"
              :disabled="instrumentOperational === false"
            >
              REPAIR
              <span v-if="(repairCostWire ?? 0) > 0" class="ov-repair-cost">
                {{ repairCostWire }}W
                <template v-if="(repairCostComponentQty ?? 0) > 0"> + {{ repairCostComponentQty }}C</template>
              </span>
            </button>
            <button
              v-if="hasUpgrade"
              class="ov-btn-secondary"
              :class="{ active: upgradeOpen, disabled: isUpgraded }"
              :disabled="isUpgraded"
              @click="toggleUpgradePanel"
            >{{ isUpgraded ? 'UPGRADED' : 'UPGRADE' }}</button>
          </div>
        </div>

        <!-- Upgrade panel -->
        <Transition name="overlay-slide">
          <div v-if="upgradeOpen" class="ov-upgrade">
            <div class="ov-upgrade-label">NEXT UPGRADE</div>
            <div class="ov-upgrade-name">{{ instrument.upgName }}</div>
            <div class="ov-upgrade-desc">{{ instrument.upgDesc }}</div>
            <div class="ov-upgrade-req">{{ instrument.upgReq }}</div>
            <button type="button" class="ov-btn-primary ov-btn-install" @click="emitInstallUpgrade">INSTALL</button>
          </div>
        </Transition>

        <!-- DSN Archaeology (LGA slot only, after upgrade) -->
        <div v-if="lgaUpgraded && activeSlot === 11" class="ov-dsn-action">
          <button type="button" class="ov-btn-primary ov-btn-dsn" @click="emitToggleDsnArchaeology">
            📡 DSN ARCHAEOLOGY
          </button>
        </div>

        <div class="ov-esc">{{ isActiveMode ? '[ESC] BACK TO OVERVIEW' : '[ESC] BACK TO DRIVING' }}</div>

        <!-- Radiation lockout overlay -->
        <div v-if="isRadiationBlocked" class="ov-rad-lockout">
          <div class="ov-rad-icon">&#x2622;</div>
          <div class="ov-rad-title">RADIATION ENVIRONMENT UNSAFE</div>
          <div class="ov-rad-body">
            Ambient dose rate: {{ radDoseRate.toFixed(2) }} mGy/day<br>
            Instrument readings unreliable at this level.<br>
            Relocate to safe zone to resume operations.
          </div>
          <div v-if="!radEnabled" class="ov-rad-safe" style="opacity: 0.5">
            Enable RAD to locate safe zones.
          </div>
        </div>
      </div>
    </Transition>
    <InstrumentHelpDialog
      :help="helpDef?.help ?? null"
      :instrument-name="helpDef?.name ?? ''"
      :open="helpOpen"
      @close="helpOpen = false"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, withDefaults } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import InstrumentHelpDialog from '@/components/InstrumentHelpDialog.vue'
import { useInstrumentProvider } from '@/composables/useInstrumentProvider'
import { HEATER_SLOT, REMS_SLOT, WHLS_SLOT } from '@/three/instruments'
import { DUST_STORM_LEVEL_LABELS, type RemsHudSnapshot } from '@/composables/useSiteRemsWeather'
import type { SpeedBreakdown } from '@/lib/instrumentSpeedBreakdown'

export interface InstrumentData {
  slot: number
  icon: string
  name: string
  type: string
  desc: string
  power: string
  powerColor: string
  status: string
  statusColor: string
  health: string
  hint: string
  temp: string
  upgName: string
  upgDesc: string
  upgReq: string
}

const INSTRUMENTS: Record<number, InstrumentData> = {
  1: {
    slot: 1, icon: 'CAM', name: 'MASTCAM', type: 'SURVEY CAMERA',
    desc: 'Twin mast cameras for wide-area survey (visible + optional IR). Filter by rock type — matches show as wireframe-style highlights. Fix a target with a scan to tag it on the compass before you spend laser or drill time.',
    power: '4–31W', powerColor: '#ef9f27', status: 'READY', statusColor: '#5dc9a5', health: '92%',
    hint: 'Set survey filter, pan the mast. Hold [E] on a rock to scan and tag. Scroll to zoom.',
    temp: '',
    upgName: 'INFRARED / MULTISPECTRAL', upgDesc: 'Stronger mineral contrast in the passive survey view — still no laser.', upgReq: 'Requires: Science Pack Alpha drop',
  },
  2: {
    slot: 2, icon: 'LZR', name: 'CHEMCAM', type: 'LASER SPECTROGRAPH',
    desc: 'Standoff laser spectroscopy: vaporizes a pin spot and reads elemental composition. Use after MastCam to judge if a rock is worth SAM or contact science — get chemistry before you drill.',
    power: '6–111W', powerColor: '#ef9f27', status: '8/10 SHOTS', statusColor: '#ef9f27', health: '87%',
    hint: 'MastCam-tagged rock in range. Hold [E] to fire IR; release to stop. Full pulse then integration — CHEM badge, SEE RESULTS for spectrum. Saved for SAM.',
    temp: 'Cold penalty \u2014 range reduced 20%',
    upgName: 'MULTI-SHOT BURST', upgDesc: '3 shots on different spots for averaged reading. Better accuracy.', upgReq: 'Requires: Science Pack Alpha drop',
  },
  3: {
    slot: 3, icon: 'ARM', name: 'DRILL', type: 'ARM POWDER SAMPLER',
    desc: 'Rotary percussive bit on the arm turret: collects powdered rock for the lab after MastCam/ChemCam tell you what to hit. Shares the arm with APXS on the real rover.',
    power: '6W / 100W drilling', powerColor: '#ef9f27', status: 'READY', statusColor: '#5dc9a5', health: '95%',
    hint: 'Drive within 1.5m of target. Aim the arm with mouse. Hold [E] to drill and collect powder.',
    temp: '',
    upgName: 'BIT WEAR KIT', upgDesc: 'Reduces drill time on tagged rocks.', upgReq: 'Requires: Deep Analysis Kit drop',
  },
  4: {
    slot: 4, icon: '\u2295', name: 'APXS', type: 'CONTACT SPECTROMETER',
    desc: 'Alpha particle X-ray spectrometer on the arm turret: placed on rock or soil for bulk chemistry. Gameplay integration (integrations, light curves) is not wired yet — use ACTIVATE to model contact-science bus load and aim with WASD like the drill.',
    power: '5W idle / 18W active', powerColor: '#ef9f27', status: 'STANDBY', statusColor: '#6b4a30', health: '96%',
    hint: 'Orbit view ~5W. ACTIVATE for ~18W stub load. WASD aims shoulder/elbow; no sample yet.',
    temp: '',
    upgName: 'LONG INTEGRATION', upgDesc: 'Future: longer dwells, lower detection limits.', upgReq: 'Requires: Contact Science Package drop',
  },
  5: {
    slot: 5, icon: 'NEU', name: 'DAN', type: 'NEUTRON SCANNER',
    desc: 'Fires neutrons into the ground, detects hydrogen. Maps subsurface water content while driving. Paints a heatmap trail on the terrain.',
    power: '10W', powerColor: '#e05030', status: 'SCANNING', statusColor: '#ef9f27', health: '78%',
    hint: 'Draws ~10W on the main bus while running (see power HUD). ACTIVATE / STANDBY or [E] toggles; when on, billed while you drive. Future: heatmap + anomalies.',
    temp: '',
    upgName: 'DEPTH EXTENDER', upgDesc: 'Scan depth from 0.5m to 1.0m below surface.', upgReq: 'Requires: Subsurface Package drop',
  },
  6: {
    slot: 6, icon: 'DRL', name: 'SAM', type: 'SAMPLE ANALYSIS SUITE',
    desc: 'The full chemistry lab inside the rover. Drills rock samples and runs mass spectrometry to detect organic molecules.',
    power: '25W', powerColor: '#e05030', status: '2/3 SAMPLES', statusColor: '#ef9f27', health: '81%',
    hint: 'Park at target. Drill with [E] \u2014 control pressure with mouse Y. Then wait for analysis.',
    temp: 'Cold \u2014 DRILL LOCKED below -20C',
    upgName: 'SENSITIVITY MODULE', upgDesc: 'Detects organics at 10x lower concentration.', upgReq: 'Requires: Full Science Suite drop',
  },
  7: {
    slot: 7, icon: '\u26A1', name: 'RTG', type: 'POWER GENERATOR',
    desc: 'Radioisotope Thermoelectric Generator. Converts plutonium-238 decay heat into electrical power. The rover\u2019s only power source.',
    power: '110W', powerColor: '#5dc9a5', status: '87W', statusColor: '#5dc9a5', health: '94%',
    hint: 'OVERDRIVE: 2× speed, then instrument lockout. POWER SHUNT: fills battery, −50% load ~3h, no driving — 24h cooldown.',
    temp: '',
    upgName: 'HEAT EXCHANGER', upgDesc: 'Improves thermal efficiency. Faster charge rate.', upgReq: 'Requires: Engineering Package drop',
  },
  8: {
    slot: 8, icon: '\u2602', name: 'REMS', type: 'WEATHER STATION',
    desc: 'Twin boom sensors on the mast measure temperature, wind, pressure, humidity, and UV radiation. Provides continuous environmental monitoring and alerts for weather events.',
    power: '1W', powerColor: '#5dc9a5', status: 'SURVEYING', statusColor: '#5dc9a5', health: '98%',
    hint: '~1W on the bus while surveying. ACTIVATE / STANDBY or [E] toggles (STANDBY saves power). +10% sample quality within 3m when on.',
    temp: '',
    upgName: 'DUST STORM PREDICTOR', upgDesc: 'Forecasts storms 2 sols ahead. Gives time to find shelter or stow instruments.', upgReq: 'Requires: Meteorology Package drop',
  },
  9: {
    slot: 9, icon: '\u2622', name: 'RAD', type: 'RADIATION DETECTOR',
    desc: 'Measures high-energy radiation on the Martian surface \u2014 protons, heavy ions, neutrons, and gamma rays. Monitors cumulative dose and alerts on solar particle events.',
    power: '2W', powerColor: '#5dc9a5', status: 'MONITORING', statusColor: '#5dc9a5', health: '96%',
    hint: '~2W on the bus while monitoring. ACTIVATE / STANDBY or [E] toggles. Tracks dose; storm alerts when on.',
    temp: '',
    upgName: 'PARTICLE SPECTROMETER', upgDesc: 'Identifies individual isotopes in cosmic ray flux. Better storm prediction.', upgReq: 'Requires: Deep Space Package drop',
  },
  10: {
    slot: 10, icon: '\u2668', name: 'HEATER', type: 'THERMAL MANAGEMENT',
    desc: 'Warm Electronics Box heating system. Keeps internal rover temperature above survival thresholds. Draws from the main power bus \u2014 competes with science instruments for watts.',
    power: '0\u201312W', powerColor: '#ef9f27', status: 'AUTO', statusColor: '#5dc9a5', health: '100%',
    hint: 'Automatic thermostat. Heater kicks in below -10\u00B0C, shuts off above +5\u00B0C. Colder sites = more power to survive = less for science. [H] or the HTR control under WHLS beside the power HUD.',
    temp: '',
    upgName: 'INSULATION UPGRADE', upgDesc: 'Reduces heat loss rate by 30%. Less heater draw at cold sites.', upgReq: 'Requires: Engineering Package drop',
  },
  11: {
    slot: 11, icon: '\uD83D\uDCE1', name: 'LGA', type: 'LOW-GAIN ANTENNA',
    desc: 'Omnidirectional low-gain antenna for direct-to-Earth communication. Slow but reliable \u2014 works regardless of rover orientation. Primary command uplink.',
    power: '5W', powerColor: '#5dc9a5', status: 'CONNECTED', statusColor: '#5dc9a5', health: '99%',
    hint: '~5W on the bus while linked. ACTIVATE / STANDBY or [E] toggles. Low data rate (0.5 kbps) when on.',
    temp: '',
    upgName: 'SIGNAL AMPLIFIER', upgDesc: 'Doubles direct-to-Earth data rate. Better for sending compressed science.', upgReq: 'Requires: Comms Package drop',
  },
  12: {
    slot: 12, icon: '\uD83D\uDCF6', name: 'UHF', type: 'UHF RELAY ANTENNA',
    desc: 'High-bandwidth UHF antenna for relay communication via overhead orbiters (MRO, MAVEN). Fast data bursts during orbital passes \u2014 primary science downlink.',
    power: '8W', powerColor: '#5dc9a5', status: 'RELAY LOCK', statusColor: '#5dc9a5', health: '97%',
    hint: '~8W on the bus while relay hardware is up. ACTIVATE / STANDBY or [E] toggles. 128 kbps burst when on.',
    temp: '',
    upgName: 'DUAL-BAND MODULE', upgDesc: 'Enables simultaneous uplink/downlink during passes. Halves transfer time.', upgReq: 'Requires: Comms Package drop',
  },
  13: {
    slot: 13, icon: '\u25CB', name: 'WHLS', type: 'MOBILITY / DRIVE',
    desc: 'Rocker-bogie wheel motors and steering actuators. Load appears on the main bus only while the chassis translates (same line as power HUD "Rover wheels"). Future wear can reduce efficiency or strand the rover until repaired.',
    power: '0\u20135W', powerColor: '#ef9f27', status: 'READY', statusColor: '#5dc9a5', health: '100%',
    hint: 'Select with [B] (slot 13). WASD to drive. REPAIR restores traction hardware. UPGRADE track reserved for drive efficiency / tread packages.',
    temp: '',
    upgName: 'EFFICIENCY MOTORS', upgDesc: 'Lower draw per meter; same top speed.', upgReq: 'Requires: Engineering Package drop',
  },
  14: {
    slot: 14, icon: '\uD83C\uDF99', name: 'MIC', type: 'AUDIO SENSOR',
    desc: 'Rover-mounted microphone capturing Mars ambient sound. Audio sourced from NASA Perseverance recordings. Layers wind, atmosphere, day/night ambience, and storm rumble.',
    power: '1W', powerColor: '#5dc9a5', status: 'LISTENING', statusColor: '#40c8f0', health: '100%',
    hint: '~1W on the bus while listening. ACTIVATE / STANDBY or [E] toggles. Ambient audio reacts to wind speed, time of day, and storm intensity.',
    temp: '',
    upgName: 'HIGH-FIDELITY MIC', upgDesc: 'Wider frequency response captures faint geological sounds at greater distance.', upgReq: 'Requires: Science Pack Alpha drop',
  },
}

const emit = defineEmits<{
  activate: []
  repair: []
  installUpgrade: []
  seeResults: []
  rtgOverdrive: []
  rtgConservation: []
  heaterOverdrive: []
  danProspect: []
  samSeeResults: []
  apxsSeeResults: []
  toggleDsnArchaeology: []
}>()
const { playUiCue } = useUiSound()

export interface ThermalDisplay {
  internalTempC: number
  ambientC: number
  /** False when REMS is on STANDBY — ambient air is not measured for HUD. */
  ambientMeasured: boolean
  /** Modeled bus watts (doubles during HTR overdrive when active). */
  heaterW: number
  zone: string
}

/** One line in the speed-buff tooltip breakdown. */
export interface SpeedBuffEntry {
  label: string
  value: string
  color: string
}

/** Live fields merged onto the static wheels card (slot 13). */
export interface WheelsHudDisplay {
  powerStr: string
  statusStr: string
  healthPct: number
  /** Effective speed as percentage of baseline (100 = no buffs). */
  speedPct: number
  /** Contributing buff / debuff entries for the tooltip. */
  speedBuffs: SpeedBuffEntry[]
}

const props = withDefaults(
  defineProps<{
    activeSlot: number | null
    canActivate?: boolean
    isActiveMode?: boolean
    wheelsHud?: WheelsHudDisplay | null
    thermal?: ThermalDisplay | null
    chemCamShots?: string
    chemCamUnread?: number
    /** ChemCam card: show firing/integration bar when sequence runs outside active view */
    chemCamSequenceActive?: boolean
    chemCamSequenceProgress?: number
    chemCamSequenceLabel?: string
    chemCamSequencePulse?: boolean
    /** REMS card: live environment readouts while surveying */
    remsHud?: RemsHudSnapshot | null
    /** RTG card: overdrive (idle, not in shunt cooldown) */
    rtgOverdriveReady?: boolean
    /** RTG card: power shunt available */
    rtgConservationReady?: boolean
    /** Tooltip when shunt on cooldown */
    rtgConservationCooldownTitle?: string
    /** HTR card: emergency heat overdrive (not in sol lockout) */
    heaterOverdriveReady?: boolean
    /** DAN / REMS / RAD / comms: ACTIVATE only toggles bus power */
    passiveSubsystemOnly?: boolean
    passiveSubsystemEnabled?: boolean
    /** Live POWER + STATUS when a passive-toggle instrument card is open */
    passiveInstrumentHud?: { power: string; powerColor: string; status: string; statusColor: string } | null
    danHitAvailable?: boolean
    danProspectPhase?: string
    samProcessing?: boolean
    samProgressPct?: number
    samProgressLabel?: string
    samUnread?: number
    apxsProcessing?: boolean
    apxsProgressPct?: number
    apxsProgressLabel?: string
    apxsUnread?: number
    durabilityPct?: number
    maxDurability?: number
    instrumentOperational?: boolean
    repairCostWire?: number
    repairCostComponentId?: string
    repairCostComponentQty?: number
    lgaUpgraded?: boolean
    /** True when the active instrument has an upgrade path (show UPGRADE button) */
    hasUpgrade?: boolean
    /** True when the active instrument is already fully upgraded */
    isUpgraded?: boolean
    /** Speed breakdown for active analysis instruments (Drill, ChemCam, MastCam, APXS). */
    instrumentSpeedHud?: SpeedBreakdown | null
    /** Accuracy breakdown for instruments that use instrumentAccuracy. */
    instrumentAccuracyHud?: SpeedBreakdown | null
    /** Radiation zone: 'safe' | 'intermediate' | 'hazardous' */
    radZone?: string
    /** Current RAD dose rate in mGy/day */
    radDoseRate?: number
    /** Whether RAD instrument is enabled (for safe-zone hint) */
    radEnabled?: boolean
  }>(),
  {
    canActivate: true,
    isActiveMode: false,
    wheelsHud: null,
    thermal: null,
    chemCamShots: '10/10',
    chemCamUnread: 0,
    chemCamSequenceActive: false,
    chemCamSequenceProgress: 0,
    chemCamSequenceLabel: '',
    chemCamSequencePulse: false,
    remsHud: null,
    rtgOverdriveReady: false,
    rtgConservationReady: false,
    rtgConservationCooldownTitle: '',
    heaterOverdriveReady: false,
    passiveSubsystemOnly: false,
    passiveSubsystemEnabled: false,
    passiveInstrumentHud: null,
    danHitAvailable: false,
    danProspectPhase: 'idle',
    samProcessing: false,
    samProgressPct: 0,
    samProgressLabel: '',
    samUnread: 0,
    apxsProcessing: false,
    apxsProgressPct: 0,
    apxsProgressLabel: '',
    apxsUnread: 0,
    durabilityPct: 100,
    maxDurability: 100,
    instrumentOperational: true,
    repairCostWire: 0,
    repairCostComponentId: '',
    repairCostComponentQty: 0,
    lgaUpgraded: false,
    radZone: 'safe',
    radDoseRate: 0,
    radEnabled: false,
  },
)

const upgradeOpen = ref(false)

const { defBySlot } = useInstrumentProvider()
const helpOpen = ref(false)
const helpDef = computed(() => props.activeSlot != null ? defBySlot(props.activeSlot) : undefined)

/**
 * Dispatches activation from either activate button variant.
 */
function handleActivateClick(): void {
  if (!props.canActivate || props.isActiveMode) return
  emit('activate')
}

/**
 * Plays the shared switch cue before opening RTG overdrive confirmation.
 */
function handleRtgOverdriveClick(): void {
  if (!props.rtgOverdriveReady || props.isActiveMode) return
  playUiCue('ui.switch')
  emit('rtgOverdrive')
}

/**
 * Plays the shared switch cue before opening RTG power shunt confirmation.
 */
function handleRtgConservationClick(): void {
  if (!props.rtgConservationReady || props.isActiveMode) return
  playUiCue('ui.switch')
  emit('rtgConservation')
}

function emitSeeChemCamResults(): void {
  playUiCue('ui.science')
  emit('seeResults')
}

function emitSamSeeResults(): void {
  playUiCue('ui.science')
  emit('samSeeResults')
}

function emitApxsSeeResults(): void {
  playUiCue('ui.science')
  emit('apxsSeeResults')
}

function emitDanProspect(): void {
  playUiCue('ui.confirm')
  emit('danProspect')
}

function emitRepair(): void {
  playUiCue('ui.switch')
  emit('repair')
}

function toggleUpgradePanel(): void {
  playUiCue('ui.switch')
  upgradeOpen.value = !upgradeOpen.value
}

function emitInstallUpgrade(): void {
  playUiCue('ui.confirm')
  emit('installUpgrade')
}

function emitToggleDsnArchaeology(): void {
  playUiCue('ui.switch')
  emit('toggleDsnArchaeology')
}

function emitHeaterOverdrive(): void {
  if (!props.heaterOverdriveReady || props.isActiveMode) return
  playUiCue('ui.switch')
  emit('heaterOverdrive')
}

// Reset upgrade panel when switching instruments
watch(() => props.activeSlot, () => {
  upgradeOpen.value = false
})

const instrument = computed(() => {
  if (props.activeSlot === null) return null
  const base = INSTRUMENTS[props.activeSlot]
  if (!base) return null
  const wh = props.wheelsHud
  if (props.activeSlot === WHLS_SLOT && wh) {
    const offline = wh.statusStr === 'OFFLINE'
    return {
      ...base,
      power: wh.powerStr,
      status: wh.statusStr,
      health: `${Math.round(wh.healthPct)}%`,
      statusColor: offline ? '#e05030' : wh.statusStr === 'DRIVING' ? '#ef9f27' : '#5dc9a5',
      powerColor: wh.powerStr.startsWith('0 W') ? '#6b4a30' : '#ef9f27',
    }
  }
  return base
})

const statPower = computed(() => props.passiveInstrumentHud?.power ?? instrument.value?.power ?? '')
const statPowerColor = computed(() => props.passiveInstrumentHud?.powerColor ?? instrument.value?.powerColor ?? '#ef9f27')
const statStatus = computed(() => props.passiveInstrumentHud?.status ?? instrument.value?.status ?? '')
const statStatusColor = computed(() => props.passiveInstrumentHud?.statusColor ?? instrument.value?.statusColor ?? '#5dc9a5')

const healthColor = computed(() => {
  if (!instrument.value) return '#5dc9a5'
  const val = parseInt(instrument.value.health)
  if (val > 85) return '#5dc9a5'
  if (val > 60) return '#ef9f27'
  return '#e05030'
})

const wheelsSpeedStr = computed(() => {
  const pct = props.wheelsHud?.speedPct ?? 100
  return `${Math.round(pct)}%`
})

const wheelsSpeedColor = computed(() => {
  const pct = props.wheelsHud?.speedPct ?? 100
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const wheelsSpeedBarPct = computed(() => {
  const pct = props.wheelsHud?.speedPct ?? 100
  return Math.min(100, Math.max(0, pct / 1.5))
})

const ANALYSIS_INSTRUMENT_SLOTS = new Set([1, 2, 3, 4])  // MastCam, ChemCam, Drill, APXS

const instrumentSpeedLabel = computed(() => {
  switch (props.activeSlot) {
    case 3: return 'DRILL SPD'
    case 2: return 'SCAN SPD'
    case 1: return 'SURVEY SPD'
    case 4: return 'ANALYSIS SPD'
    default: return 'SPD'
  }
})

const instrumentSpeedStr = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  return `${Math.round(pct)}%`
})

const instrumentSpeedColor = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const instrumentSpeedBarPct = computed(() => {
  const pct = props.instrumentSpeedHud?.speedPct ?? 100
  return Math.min(100, Math.max(0, pct / 1.5))
})

const accuracyStr = computed(() => {
  const pct = props.instrumentAccuracyHud?.speedPct ?? 100
  return `${Math.round(pct)}%`
})

const accuracyColor = computed(() => {
  const pct = props.instrumentAccuracyHud?.speedPct ?? 100
  if (pct > 105) return '#5dc9a5'
  if (pct >= 95) return '#ef9f27'
  return '#e05030'
})

const accuracyBarPct = computed(() => {
  const pct = props.instrumentAccuracyHud?.speedPct ?? 100
  return Math.min(100, Math.max(0, pct / 1.5))
})

const ZONE_COLORS: Record<string, string> = {
  OPTIMAL: '#5dc9a5',
  COLD: '#ef9f27',
  FRIGID: '#e05030',
  CRITICAL: '#64a0e0',
}

const ZONE_BGS: Record<string, string> = {
  OPTIMAL: 'rgba(93,201,165,0.15)',
  COLD: 'rgba(239,159,39,0.15)',
  FRIGID: 'rgba(224,80,48,0.15)',
  CRITICAL: 'rgba(100,160,224,0.15)',
}

const thermalZoneColor = computed(() =>
  ZONE_COLORS[props.thermal?.zone ?? 'OPTIMAL'] ?? '#5dc9a5',
)
const thermalZoneBg = computed(() =>
  ZONE_BGS[props.thermal?.zone ?? 'OPTIMAL'] ?? 'rgba(0,0,0,0.3)',
)

const remsDustStormLabel = computed(() => {
  const L = props.remsHud?.dustStormLevel
  if (L == null) return ''
  return DUST_STORM_LEVEL_LABELS[L] ?? ''
})

const durabilityColor = computed(() => {
  const pct = props.durabilityPct ?? 100
  if (pct >= 85) return '#40c8f0'   // cyan
  if (pct >= 60) return '#40f080'   // green
  if (pct >= 40) return '#f0e040'   // yellow
  if (pct > 25) return '#f0a030'    // orange
  return '#804020'                   // dim brown
})

/** Slots for science instruments blocked by radiation hazard */
const RADIATION_BLOCKED_SLOTS = new Set([1, 2, 3, 4, 5, 6, 8]) // mastcam, chemcam, drill, apxs, dan, sam, rems

const isRadiationBlocked = computed(() => {
  if (props.radZone !== 'hazardous') return false
  return props.activeSlot != null && RADIATION_BLOCKED_SLOTS.has(props.activeSlot)
})
</script>

<style scoped>
.instrument-overlay {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 320px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 10px;
  padding: 16px;
  z-index: 50;
  font-family: var(--font-ui);
  overflow: hidden;
}

/* Header */
.ov-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.ov-icon {
  width: 40px;
  height: 40px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #e8a060;
  font-weight: bold;
  flex-shrink: 0;
}

.ov-name {
  font-size: 14px;
  color: #e8a060;
  font-weight: bold;
  letter-spacing: 0.15em;
}

.ov-type {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.12em;
  margin-top: 1px;
}

.ov-slot {
  margin-left: auto;
  font-size: 11px;
  color: rgba(196, 117, 58, 0.4);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 4px;
  padding: 2px 8px;
}

/* Description */
.ov-desc {
  font-size: 12px;
  color: rgba(196, 117, 58, 0.65);
  letter-spacing: 0.04em;
  line-height: 1.6;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.12);
}

/* Stats */
.ov-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.ov-stat {
  flex: 1;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 8px;
  text-align: center;
}

.ov-stat-label {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.12em;
  margin-bottom: 3px;
}

.ov-stat-value {
  font-family: var(--font-instrument);
  font-size: 13px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

/* Hint */
.ov-hint {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.06em;
  line-height: 1.5;
  margin-bottom: 14px;
  padding: 8px;
  background: rgba(196, 117, 58, 0.06);
  border-radius: 6px;
  border-left: 2px solid rgba(196, 117, 58, 0.2);
}

/* Temperature warning */
.ov-temp {
  font-size: 11px;
  color: #ef9f27;
  letter-spacing: 0.06em;
  margin-bottom: 12px;
  padding: 6px 8px;
  background: rgba(239, 159, 39, 0.08);
  border-radius: 6px;
  border-left: 2px solid rgba(239, 159, 39, 0.3);
}

/* Buttons */
.ov-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ov-btn-primary {
  width: 100%;
  padding: 10px;
  background: #c4753a;
  border: none;
  border-radius: 6px;
  color: #1a0d08;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ov-btn-primary:hover {
  opacity: 0.85;
}

.ov-btn-rtg-shunt {
  background: linear-gradient(90deg, #1e5c52 0%, #2f8f7a 100%);
  color: #e8faf6;
}

.ov-btn-rtg-shunt:hover {
  opacity: 0.92;
}

.ov-btn-row {
  display: flex;
  gap: 6px;
}

.ov-btn-secondary {
  flex: 1;
  padding: 8px;
  background: transparent;
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 6px;
  color: #a08060;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.15em;
  cursor: pointer;
  transition: all 0.15s;
}

.ov-btn-secondary:hover {
  border-color: rgba(196, 117, 58, 0.5);
  color: #c4956a;
}

.ov-btn-secondary.active {
  color: #ef9f27;
  border-color: rgba(239, 159, 39, 0.4);
}

/* Upgrade panel */
.ov-upgrade {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  border: 1px solid rgba(196, 117, 58, 0.15);
}

.ov-upgrade-label {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}

.ov-upgrade-name {
  font-size: 11px;
  color: #ef9f27;
  font-weight: bold;
  letter-spacing: 0.1em;
  margin-bottom: 4px;
}

.ov-upgrade-desc {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.5);
  line-height: 1.5;
  margin-bottom: 8px;
}

.ov-upgrade-req {
  font-size: 11px;
  color: #e05030;
  letter-spacing: 0.08em;
}

/* DSN archaeology action */
.ov-dsn-action {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(102, 255, 238, 0.15);
}
.ov-btn-dsn {
  background: linear-gradient(90deg, #1a4a44 0%, #2a7a6a 100%);
  color: #e8faf6;
}
.ov-btn-install {
  margin-top: 8px;
  width: 100%;
}

/* ESC hint */
.ov-esc {
  text-align: center;
  margin-top: 10px;
  font-size: 11px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.15em;
}

/* Transition */
.overlay-slide-enter-active,
.overlay-slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.overlay-slide-enter-from {
  transform: translateY(-50%) translateX(30px);
  opacity: 0;
}

.overlay-slide-leave-to {
  transform: translateY(-50%) translateX(30px);
  opacity: 0;
}

/* ChemCam card block */
.ov-chemcam-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.ov-cc-sequence {
  width: 100%;
}

.ov-cc-seq-label {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: #66ffee;
  margin-bottom: 4px;
}

.ov-cc-seq-track {
  height: 4px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 2px;
  overflow: hidden;
}

.ov-cc-seq-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.08s linear;
}

.ov-cc-seq-fill.pulse {
  background: linear-gradient(90deg, #ff6644, #ff4422);
}

.ov-cc-seq-fill.integrate {
  background: linear-gradient(90deg, #ffcc44, #66ffee);
}

/* ChemCam status + See Results */
.ov-chemcam-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ov-chemcam-status .ov-stat {
  flex-shrink: 0;
}

.ov-btn-see-results {
  flex: 1;
  padding: 8px 12px;
  background: rgba(102, 255, 238, 0.12);
  border: 1px solid rgba(102, 255, 238, 0.4);
  border-radius: 6px;
  color: #66ffee;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ov-btn-see-results:hover {
  background: rgba(102, 255, 238, 0.2);
  border-color: rgba(102, 255, 238, 0.6);
}

.ov-results-badge {
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

.ov-btn-primary.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Thermal stats grid */
.ov-stats-thermal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.ov-stat-zone {
  grid-column: 1 / -1;
}

.ov-stats-rems {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.ov-rems-offline {
  grid-column: 1 / -1;
  font-size: 11px;
  line-height: 1.35;
  color: rgba(196, 149, 106, 0.75);
  padding: 4px 0 2px;
}

.ov-rems-dust-storm {
  grid-column: 1 / -1;
  margin-top: 4px;
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #e8a878;
  background: rgba(196, 80, 40, 0.12);
  border: 1px solid rgba(232, 140, 80, 0.35);
  border-radius: 4px;
}

.ov-btn-dan-prospect {
  background: rgba(68, 170, 255, 0.1);
  border: 1px solid rgba(68, 170, 255, 0.4);
  border-radius: 4px;
  color: #44aaff;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  cursor: pointer;
  padding: 6px 14px;
  animation: dan-pulse 2s ease-in-out infinite;
}

@keyframes dan-pulse {
  0%, 100% { box-shadow: 0 0 4px rgba(68, 170, 255, 0.2); }
  50% { box-shadow: 0 0 12px rgba(68, 170, 255, 0.5); }
}

/* Speed section (wheels + instruments) */
.ov-spd-speed {
  padding: 6px 16px 2px;
  border-top: 1px solid rgba(196, 117, 58, 0.15);
}

.ov-spd-speed-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 4px;
}

.ov-spd-speed-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(196, 117, 58, 0.6);
}

.ov-spd-speed-value {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.ov-spd-speed-bar-track {
  height: 3px;
  background: rgba(196, 117, 58, 0.12);
  border-radius: 2px;
  margin-bottom: 6px;
  overflow: hidden;
}

.ov-spd-speed-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background 0.3s ease;
}

.ov-spd-buffs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 4px;
}

.ov-spd-buff {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.ov-spd-buff-label {
  color: rgba(196, 117, 58, 0.45);
}

.ov-spd-buff-value {
  font-family: var(--font-ui);
  font-weight: 600;
}

.ov-sam-block {
  padding: 0 16px 8px;
}

.ov-durability {
  padding: 4px 16px 2px;
}
.ov-durability-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}
.ov-durability-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(196, 117, 58, 0.6);
}
.ov-durability-value {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
}
.ov-durability-max {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.35);
}
.ov-durability-bar-track {
  height: 3px;
  background: rgba(196, 117, 58, 0.12);
  border-radius: 2px;
  overflow: hidden;
}
.ov-durability-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background 0.3s ease;
}
.ov-broken {
  padding: 8px 16px;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  color: #804020;
  background: rgba(128, 64, 32, 0.1);
  border: 1px solid rgba(128, 64, 32, 0.2);
  border-radius: 4px;
  margin: 4px 16px;
}
.ov-repair-cost {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.5);
  margin-left: 4px;
}

/* Radiation lockout overlay */
.ov-rad-lockout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  z-index: 10;
}
.ov-rad-icon {
  font-size: 48px;
  color: #44dd88;
  text-shadow: 0 0 20px rgba(68, 221, 136, 0.5);
  animation: rad-pulse 2s ease-in-out infinite;
}
@keyframes rad-pulse {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
}
.ov-rad-title { color: #ff6644; font-size: 14px; letter-spacing: 0.15em; margin-top: 8px; }
.ov-rad-body { color: #b8a888; font-size: 11px; text-align: center; margin-top: 8px; line-height: 1.6; }
.ov-rad-safe { color: #44dd88; font-size: 11px; margin-top: 12px; }

.ov-help-btn {
  background: rgba(196, 149, 106, 0.08);
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 4px;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-instrument, monospace);
  font-size: 11px;
  font-weight: 600;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-left: 6px;
  flex-shrink: 0;
}

.ov-help-btn:hover {
  background: rgba(196, 149, 106, 0.18);
  border-color: rgba(196, 149, 106, 0.45);
  color: rgba(220, 210, 200, 0.9);
}
</style>
