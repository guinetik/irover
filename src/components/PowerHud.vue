<template>
  <div class="power-panel" :class="{ 'low-soc': socPct < 20 }">
    <div class="pp-label">PWR</div>
    <div class="pp-bar-track">
      <div
        class="pp-bar-fill"
        :class="barClass"
        :style="{ height: Math.min(100, socPct) + '%' }"
      />
    </div>
    <div class="pp-wh-main">{{ whDisplay }}</div>
    <div class="pp-wh-cap">/{{ capDisplay }}Wh</div>
    <div class="pp-divider" />
    <div class="pp-net" :class="netPositive ? 'charge' : 'drain'">
      {{ netPositive ? '+' : '' }}{{ netW.toFixed(0) }}W
    </div>
    <div class="pp-detail"><span class="pp-detail-val">{{ generationW.toFixed(0) }}</span>W gen</div>
    <div class="pp-detail"><span class="pp-detail-val">{{ consumptionW.toFixed(0) }}</span>W use</div>
    <div class="pp-divider" />
    <div class="pp-source-icons">{{ solarIcons }}</div>
    <div class="pp-source-label">&#x25C9; RTG</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  batteryWh: number
  capacityWh: number
  generationW: number
  consumptionW: number
  netW: number
  socPct: number
  nightFactor?: number
}>()

const whDisplay = computed(() => Math.round(props.batteryWh).toString())
const capDisplay = computed(() => Math.round(props.capacityWh).toString())
const netPositive = computed(() => props.netW >= 0)

const barClass = computed(() => {
  if (props.socPct < 20) return 'red'
  if (props.socPct < 50) return 'amber'
  return 'green'
})

const solarIcons = computed(() => {
  const solar = props.generationW - 15 // approx RTG subtracted
  if (solar > 30) return '\u2600\u2600'
  if (solar > 10) return '\u2600\u2591'
  if (solar > 0) return '\u2591\u2591'
  return '  '
})
</script>

<style scoped>
.power-panel {
  position: fixed;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 6px;
  width: 62px;
  background: rgba(10, 5, 2, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  font-size: 8px;
  letter-spacing: 0.1em;
  pointer-events: none;
  transition: border-color 0.5s ease;
}

.power-panel.low-soc {
  border-color: rgba(224, 80, 48, 0.5);
}

.pp-label {
  font-size: 8px;
  color: #6b4a30;
  letter-spacing: 0.15em;
}

.pp-bar-track {
  width: 26px;
  height: 80px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
  position: relative;
}

.pp-bar-fill {
  width: 100%;
  border-radius: 2px;
  transition: height 0.5s ease, background 0.5s ease;
}

.pp-bar-fill.green {
  background: linear-gradient(180deg, #5dc9a5, #3d9975);
}

.pp-bar-fill.amber {
  background: linear-gradient(180deg, #ef9f27, #ba7517);
}

.pp-bar-fill.red {
  background: linear-gradient(180deg, #e05030, #a03020);
}

.pp-wh-main {
  font-size: 10px;
  font-weight: bold;
  color: #e8a060;
  font-variant-numeric: tabular-nums;
}

.pp-wh-cap {
  font-size: 8px;
  color: #6b4a30;
  font-variant-numeric: tabular-nums;
}

.pp-divider {
  height: 1px;
  width: 80%;
  background: rgba(196, 117, 58, 0.15);
  margin: 2px 0;
}

.pp-net {
  font-size: 10px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
}

.pp-net.charge {
  color: #5dc9a5;
}

.pp-net.drain {
  color: #e05030;
}

.pp-detail {
  font-size: 7px;
  color: #6b4a30;
}

.pp-detail-val {
  color: #6b4a30;
  font-weight: bold;
}

.pp-source-icons {
  font-size: 10px;
  letter-spacing: 2px;
  opacity: 0.9;
}

.pp-source-label {
  font-size: 7px;
  color: #6b4a30;
}
</style>
