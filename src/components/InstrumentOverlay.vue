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

        <!-- Stats -->
        <div class="ov-stats">
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

        <!-- Buttons -->
        <div class="ov-buttons">
          <button class="ov-btn-primary" @click="$emit('activate')">ACTIVATE</button>
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

        <div class="ov-esc">[ESC] BACK TO DRIVING</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
    desc: 'Two box cameras mounted on the mast. Point at rocks and scan to reveal type, mineral composition, and scientific interest level.',
    power: '3W', powerColor: '#5dc9a5', status: 'READY', statusColor: '#5dc9a5', health: '92%',
    hint: 'Aim at target + hold [E] to scan. Scroll to zoom. Results tag the rock on your compass.',
    temp: '',
    upgName: 'INFRARED FILTER', upgDesc: 'Reveals mineral signatures invisible to standard scan.', upgReq: 'Requires: Science Pack Alpha drop',
  },
  2: {
    slot: 2, icon: 'LZR', name: 'CHEMCAM', type: 'LASER SPECTROGRAPH',
    desc: 'Fires a laser at rocks up to 7m away, vaporizing a spot into plasma. Spectrograph reads the light to determine elemental composition.',
    power: '12W', powerColor: '#ef9f27', status: '8/10 SHOTS', statusColor: '#ef9f27', health: '87%',
    hint: 'Aim at tagged rock within range. Press [E] to fire. Watch the spectrograph readout.',
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
}

const props = defineProps<{
  activeSlot: number | null
}>()

defineEmits<{
  activate: []
  repair: []
}>()

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
</style>
