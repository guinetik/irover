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
        </div>

        <!-- Description -->
        <div class="ov-desc">{{ instrument.desc }}</div>

        <!-- Stats (thermal override for heater) -->
        <div v-if="activeSlot === 9 && thermal" class="ov-stats ov-stats-thermal">
          <div class="ov-stat">
            <div class="ov-stat-label">ROVER</div>
            <div class="ov-stat-value" :style="{ color: thermalZoneColor }">{{ thermal.internalTempC >= 0 ? '+' : '' }}{{ Math.round(thermal.internalTempC) }}&deg;C</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">AMBIENT</div>
            <div class="ov-stat-value" style="color: #6b4a30">{{ Math.round(thermal.ambientC) }}&deg;C</div>
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
        <div v-else class="ov-stats">
          <div class="ov-stat">
            <div class="ov-stat-label">POWER</div>
            <div class="ov-stat-value" :style="{ color: instrument.powerColor }">{{ instrument.power }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">STATUS</div>
            <div class="ov-stat-value" :style="{ color: instrument.statusColor }">{{ instrument.status }}</div>
          </div>
          <div class="ov-stat">
            <div class="ov-stat-label">HEALTH</div>
            <div class="ov-stat-value" :style="{ color: healthColor }">{{ instrument.health }}</div>
          </div>
        </div>

        <!-- Hint -->
        <div class="ov-hint">{{ instrument.hint }}</div>

        <!-- Temperature warning -->
        <div v-if="instrument.temp" class="ov-temp">{{ instrument.temp }}</div>

        <!-- ChemCam shots + See Results -->
        <div v-if="activeSlot === 2" class="ov-chemcam-status">
          <div class="ov-stat">
            <div class="ov-stat-label">SHOTS</div>
            <div class="ov-stat-value" style="color: #66ffee">{{ chemCamShots }}</div>
          </div>
          <button
            v-if="chemCamUnread > 0"
            class="ov-btn-see-results"
            @click="$emit('seeResults')"
          >SEE RESULTS <span class="ov-results-badge">{{ chemCamUnread }}</span></button>
        </div>

        <!-- Buttons -->
        <div class="ov-buttons">
          <button
            class="ov-btn-primary"
            :class="{ disabled: !canActivate || isActiveMode }"
            :disabled="!canActivate || isActiveMode"
            @click="canActivate && !isActiveMode && $emit('activate')"
          >ACTIVATE</button>
          <div class="ov-btn-row">
            <button class="ov-btn-secondary" @click="$emit('repair')">REPAIR</button>
            <button
              class="ov-btn-secondary"
              :class="{ active: upgradeOpen }"
              @click="upgradeOpen = !upgradeOpen"
            >UPGRADE</button>
          </div>
        </div>

        <!-- Upgrade panel -->
        <Transition name="overlay-slide">
          <div v-if="upgradeOpen" class="ov-upgrade">
            <div class="ov-upgrade-label">NEXT UPGRADE</div>
            <div class="ov-upgrade-name">{{ instrument.upgName }}</div>
            <div class="ov-upgrade-desc">{{ instrument.upgDesc }}</div>
            <div class="ov-upgrade-req">{{ instrument.upgReq }}</div>
          </div>
        </Transition>

        <div class="ov-esc">{{ isActiveMode ? '[ESC] BACK TO OVERVIEW' : '[ESC] BACK TO DRIVING' }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, withDefaults } from 'vue'

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
    power: '3W', powerColor: '#5dc9a5', status: 'READY', statusColor: '#5dc9a5', health: '92%',
    hint: 'Set survey filter, pan the mast. Hold [E] on a rock to scan and tag. Scroll to zoom.',
    temp: '',
    upgName: 'INFRARED / MULTISPECTRAL', upgDesc: 'Stronger mineral contrast in the passive survey view — still no laser.', upgReq: 'Requires: Science Pack Alpha drop',
  },
  2: {
    slot: 2, icon: 'LZR', name: 'CHEMCAM', type: 'LASER SPECTROGRAPH',
    desc: 'Standoff laser spectroscopy: vaporizes a pin spot and reads elemental composition. Use after MastCam to judge if a rock is worth SAM or contact science — get chemistry before you drill.',
    power: '12W', powerColor: '#ef9f27', status: '8/10 SHOTS', statusColor: '#ef9f27', health: '87%',
    hint: 'MastCam-tagged rock in range. [E] fires pulses; ~few s to ready — same toast as samples, CHEM badge, then SEE RESULTS for spectrum. Saved for SAM.',
    temp: 'Cold penalty \u2014 range reduced 20%',
    upgName: 'MULTI-SHOT BURST', upgDesc: '3 shots on different spots for averaged reading. Better accuracy.', upgReq: 'Requires: Science Pack Alpha drop',
  },
  3: {
    slot: 3, icon: 'ARM', name: 'APXS', type: 'CONTACT SPECTROMETER',
    desc: 'Sensor on the robotic arm tip. Pressed against rock for high-precision elemental chemistry. Reveals water alteration and trace elements.',
    power: '6W', powerColor: '#5dc9a5', status: 'READY', statusColor: '#5dc9a5', health: '95%',
    hint: 'Drive within 1.5m of target. Position the arm head with mouse. Hold [E] to analyze.',
    temp: '',
    upgName: 'PRECISION MODULE', upgDesc: 'Detects trace elements below 0.1% concentration.', upgReq: 'Requires: Deep Analysis Kit drop',
  },
  4: {
    slot: 4, icon: 'NEU', name: 'DAN', type: 'NEUTRON SCANNER',
    desc: 'Fires neutrons into the ground, detects hydrogen. Maps subsurface water content while driving. Paints a heatmap trail on the terrain.',
    power: '10W', powerColor: '#e05030', status: 'SCANNING', statusColor: '#ef9f27', health: '78%',
    hint: 'Toggle on, then drive. Blue = water signal. Ping rate shows intensity. Mark anomalies with [E].',
    temp: '',
    upgName: 'DEPTH EXTENDER', upgDesc: 'Scan depth from 0.5m to 1.0m below surface.', upgReq: 'Requires: Subsurface Package drop',
  },
  5: {
    slot: 5, icon: 'DRL', name: 'SAM', type: 'SAMPLE ANALYSIS SUITE',
    desc: 'The full chemistry lab inside the rover. Drills rock samples and runs mass spectrometry to detect organic molecules.',
    power: '25W', powerColor: '#e05030', status: '2/3 SAMPLES', statusColor: '#ef9f27', health: '81%',
    hint: 'Park at target. Drill with [E] \u2014 control pressure with mouse Y. Then wait for analysis.',
    temp: 'Cold \u2014 DRILL LOCKED below -20C',
    upgName: 'SENSITIVITY MODULE', upgDesc: 'Detects organics at 10x lower concentration.', upgReq: 'Requires: Full Science Suite drop',
  },
  6: {
    slot: 6, icon: '\u26A1', name: 'RTG', type: 'POWER GENERATOR',
    desc: 'Radioisotope Thermoelectric Generator. Converts plutonium-238 decay heat into electrical power. The rover\u2019s only power source.',
    power: '110W', powerColor: '#5dc9a5', status: '87W', statusColor: '#5dc9a5', health: '94%',
    hint: 'ACTIVATE to overdrive emergency power. 2x movement speed for 1 sol, but all instruments are locked during cooldown.',
    temp: '',
    upgName: 'HEAT EXCHANGER', upgDesc: 'Improves thermal efficiency. Faster charge rate.', upgReq: 'Requires: Engineering Package drop',
  },
  7: {
    slot: 7, icon: '\u2602', name: 'REMS', type: 'WEATHER STATION',
    desc: 'Twin boom sensors on the mast measure temperature, wind, pressure, humidity, and UV radiation. Provides continuous environmental monitoring and alerts for weather events.',
    power: '1W', powerColor: '#5dc9a5', status: 'SURVEYING', statusColor: '#5dc9a5', health: '98%',
    hint: 'Passive instrument \u2014 always active. Provides +10% sample quality within 3m radius. Weather alerts will warn of dust storms and thermal events.',
    temp: '',
    upgName: 'DUST STORM PREDICTOR', upgDesc: 'Forecasts storms 2 sols ahead. Gives time to find shelter or stow instruments.', upgReq: 'Requires: Meteorology Package drop',
  },
  8: {
    slot: 8, icon: '\u2622', name: 'RAD', type: 'RADIATION DETECTOR',
    desc: 'Measures high-energy radiation on the Martian surface \u2014 protons, heavy ions, neutrons, and gamma rays. Monitors cumulative dose and alerts on solar particle events.',
    power: '2W', powerColor: '#5dc9a5', status: 'MONITORING', statusColor: '#5dc9a5', health: '96%',
    hint: 'Passive instrument \u2014 always active. Tracks cumulative radiation exposure. Solar storm alerts trigger shelter warnings.',
    temp: '',
    upgName: 'PARTICLE SPECTROMETER', upgDesc: 'Identifies individual isotopes in cosmic ray flux. Better storm prediction.', upgReq: 'Requires: Deep Space Package drop',
  },
  9: {
    slot: 9, icon: '\u2668', name: 'HEATER', type: 'THERMAL MANAGEMENT',
    desc: 'Warm Electronics Box heating system. Keeps internal rover temperature above survival thresholds. Draws from the main power bus \u2014 competes with science instruments for watts.',
    power: '0\u201312W', powerColor: '#ef9f27', status: 'AUTO', statusColor: '#5dc9a5', health: '100%',
    hint: 'Automatic thermostat. Heater kicks in below -10\u00B0C, shuts off above +5\u00B0C. Colder sites = more power to survive = less for science.',
    temp: '',
    upgName: 'INSULATION UPGRADE', upgDesc: 'Reduces heat loss rate by 30%. Less heater draw at cold sites.', upgReq: 'Requires: Engineering Package drop',
  },
}

defineEmits<{
  activate: []
  repair: []
  seeResults: []
}>()

export interface ThermalDisplay {
  internalTempC: number
  ambientC: number
  heaterW: number
  zone: string
}

const props = withDefaults(
  defineProps<{
    activeSlot: number | null
    canActivate?: boolean
    isActiveMode?: boolean
    thermal?: ThermalDisplay | null
    chemCamShots?: string
    chemCamUnread?: number
  }>(),
  {
    canActivate: true,
    isActiveMode: false,
    thermal: null,
    chemCamShots: '10/10',
    chemCamUnread: 0,
  },
)

const upgradeOpen = ref(false)

// Reset upgrade panel when switching instruments
watch(() => props.activeSlot, () => {
  upgradeOpen.value = false
})

const instrument = computed(() => {
  if (props.activeSlot === null) return null
  return INSTRUMENTS[props.activeSlot] ?? null
})

const healthColor = computed(() => {
  if (!instrument.value) return '#5dc9a5'
  const val = parseInt(instrument.value.health)
  if (val > 85) return '#5dc9a5'
  if (val > 60) return '#ef9f27'
  return '#e05030'
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
</script>

<style scoped>
.instrument-overlay {
  position: fixed;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 280px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 10px;
  padding: 16px;
  z-index: 50;
  font-family: 'Courier New', monospace;
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
  font-size: 9px;
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
  font-size: 10px;
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
  font-size: 8px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.12em;
  margin-bottom: 3px;
}

.ov-stat-value {
  font-size: 13px;
  font-weight: bold;
}

/* Hint */
.ov-hint {
  font-size: 9px;
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
  font-size: 9px;
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
  font-family: 'Courier New', monospace;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.2em;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ov-btn-primary:hover {
  opacity: 0.85;
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
  font-family: 'Courier New', monospace;
  font-size: 9px;
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
  font-size: 9px;
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
  font-size: 9px;
  color: rgba(196, 117, 58, 0.5);
  line-height: 1.5;
  margin-bottom: 8px;
}

.ov-upgrade-req {
  font-size: 9px;
  color: #e05030;
  letter-spacing: 0.08em;
}

/* ESC hint */
.ov-esc {
  text-align: center;
  margin-top: 10px;
  font-size: 8px;
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

/* ChemCam status + See Results */
.ov-chemcam-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
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
  font-family: 'Courier New', monospace;
  font-size: 10px;
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
  font-size: 8px;
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
</style>
