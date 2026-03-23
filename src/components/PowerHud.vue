<template>
  <div class="power-panel" :class="{ 'low-soc': socPct < 20 }">
    <div class="pp-label">PWR</div>
    <div class="pp-bar-track">
      <div
        class="pp-bar-fill"
        :class="barClass"
        :style="{ height: Math.min(100, socPct) + '%' }"
      />
      <div
        class="pp-bar-threshold"
        role="img"
        :aria-label="`Sleep threshold at ${POWER_SLEEP_THRESHOLD_PCT} percent charge`"
        :style="{ bottom: POWER_SLEEP_THRESHOLD_PCT + '%' }"
      />
    </div>
    <div class="pp-wh-row" aria-label="State of charge watt-hours">
      <span class="pp-wh-main">{{ whDisplay }}</span><span class="pp-wh-cap">/{{ capDisplay }}Wh</span>
    </div>
    <div class="pp-divider" />
    <HudCursorTooltip title="Net power" :body="tipNet" as="div">
      <div class="pp-net" :class="netPositive ? 'charge' : 'drain'">
        {{ netPositive ? '+' : '' }}{{ netW.toFixed(0) }}W
      </div>
    </HudCursorTooltip>
    <HudCursorTooltip title="Generation" :body="tipGeneration" as="div">
      <div class="pp-detail">
        <span class="pp-detail-val">{{ generationW.toFixed(0) }}</span>W gen
      </div>
    </HudCursorTooltip>
    <HudCursorTooltip title="Consumption" :body="tipConsumption" as="div">
      <div class="pp-detail">
        <span class="pp-detail-val">{{ consumptionW.toFixed(0) }}</span>W use
      </div>
    </HudCursorTooltip>
    <div class="pp-divider" />
    <HudCursorTooltip title="Solar at a glance" :body="tipSolarIcons" as="div">
      <div class="pp-source-icons">{{ solarIcons }}</div>
    </HudCursorTooltip>
    <HudCursorTooltip title="RTG" :body="tipRtg" as="div">
      <div class="pp-source-label">&#x25C9; RTG</div>
    </HudCursorTooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import HudCursorTooltip from '@/components/HudCursorTooltip.vue'
import { POWER_SLEEP_THRESHOLD_PCT, useMarsPower } from '@/composables/useMarsPower'

const props = defineProps<{
  batteryWh: number
  capacityWh: number
  generationW: number
  consumptionW: number
  netW: number
  socPct: number
  nightFactor?: number
}>()

const { powerGenerationDetail, powerConsumptionLines, powerBusLoadFactor } = useMarsPower()

const whDisplay = computed(() => Math.round(props.batteryWh).toString())
const capDisplay = computed(() => Math.round(props.capacityWh).toString())
const netPositive = computed(() => props.netW >= 0)

const barClass = computed(() => {
  if (props.socPct < 20) return 'red'
  if (props.socPct < 50) return 'amber'
  return 'green'
})

/**
 * Two-cell solar hint from modeled array power only (same thresholds as sim tuning).
 * ☀ = strong cell, ░ = weak / shaded cell.
 */
const solarIcons = computed(() => {
  const solar = powerGenerationDetail.solarW
  if (solar > 30) return '\u2600\u2600'
  if (solar > 10) return '\u2600\u2591'
  if (solar > 0) return '\u2591\u2591'
  return '  '
})

const tipNet = computed(() => {
  const g = props.generationW.toFixed(1)
  const u = props.consumptionW.toFixed(1)
  const n = props.netW.toFixed(1)
  return `${g} W generation\n${u} W consumption\n= ${n} W net (what moves the battery)`
})

const tipGeneration = computed(() => {
  const d = powerGenerationDetail
  const dayPct = (d.daylight01 * 100).toFixed(0)
  const sky = d.daylight01 <= 0.02 ? 'night' : d.daylight01 >= 0.98 ? 'full day' : 'partial sol'
  const arr = d.arraysUnshadowed
    ? 'arrays unshadowed'
    : `arrays in terrain shadow (solar ×${d.solarShadeMul})`
  return [
    `RTG: ${d.rtgW.toFixed(1)} W`,
    `Solar arrays: ${d.solarW.toFixed(1)} W`,
    `Sky: ${sky} · daylight ${dayPct}%`,
    arr,
  ].join('\n')
})

const tipConsumption = computed(() => {
  const lines = powerConsumptionLines.value
  const body = lines.map((l) => `${l.label}: ${l.w.toFixed(1)} W`).join('\n')
  const lf = powerBusLoadFactor.value
  const note =
    Math.abs(lf - 1) > 1e-6
      ? `\n—\nAll lines include bus load ×${lf.toFixed(2)} (RTG conservation).`
      : ''
  return body + note
})

const tipSolarIcons = computed(() => {
  const d = powerGenerationDetail
  const sw = d.solarW
  const glyphs = solarIcons.value
  const visible = glyphs.trim() === '' ? '(blank — no array power)' : `"${glyphs}"`
  let band: string
  if (sw > 30) band = '☀☀ both strong (solar > 30 W)'
  else if (sw > 10) band = '☀░ strong + weak (10–30 W)'
  else if (sw > 0) band = '░░ both weak (0–10 W)'
  else band = 'no cells lit (0 W solar)'
  return [
    `Showing now: ${visible}`,
    '☀ = strong harvest cell   ░ = weak / shaded cell',
    `${band}`,
    `Modeled solar: ${sw.toFixed(1)} W · daylight ${(d.daylight01 * 100).toFixed(0)}% · ${d.arraysUnshadowed ? 'unshadowed' : 'shadow ×' + d.solarShadeMul}`,
  ].join('\n')
})

const tipRtg = computed(() => {
  const d = powerGenerationDetail
  return `RTG output: ${d.rtgW.toFixed(1)} W (steady, counted in ${props.generationW.toFixed(1)} W total gen)`
})
</script>

<style scoped>
.power-panel {
  position: relative;
  z-index: 42;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 10px;
  min-width: 92px;
  width: max-content;
  max-width: 120px;
  background: rgba(10, 5, 2, 0.8);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  pointer-events: none;
  transition: border-color 0.5s ease;
}

.power-panel.low-soc {
  border-color: rgba(224, 80, 48, 0.5);
}

.pp-label {
  font-size: 11px;
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

/* Sleep threshold SOC — matches POWER_SLEEP_THRESHOLD_PCT; horizontal notch from bar bottom */
.pp-bar-threshold {
  position: absolute;
  left: -2px;
  right: -2px;
  height: 2px;
  background: rgba(255, 248, 235, 0.92);
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 0 6px rgba(255, 120, 80, 0.45);
  pointer-events: none;
  z-index: 2;
}

.pp-wh-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: baseline;
  justify-content: center;
  gap: 0;
  white-space: nowrap;
  letter-spacing: normal;
  line-height: 1.15;
}

.pp-wh-main {
  font-family: var(--font-instrument);
  font-size: 12px;
  font-weight: bold;
  color: #e8a060;
  font-variant-numeric: tabular-nums;
}

.pp-wh-cap {
  font-family: var(--font-instrument);
  font-size: 11px;
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
  font-family: var(--font-instrument);
  font-size: 12px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  letter-spacing: normal;
  white-space: nowrap;
  transition: color 0.3s ease;
}

.pp-net.charge {
  color: #5dc9a5;
}

.pp-net.drain {
  color: #e05030;
}

.pp-detail {
  font-size: 12px;
  color: #6b4a30;
  letter-spacing: normal;
  white-space: nowrap;
  text-align: center;
  width: 100%;
}

.pp-detail-val {
  font-family: var(--font-instrument);
  font-variant-numeric: tabular-nums;
  color: #6b4a30;
  font-weight: bold;
}

.pp-source-icons {
  font-size: 12px;
  letter-spacing: 2px;
  opacity: 0.9;
  white-space: nowrap;
  text-align: center;
}

.pp-source-label {
  font-size: 12px;
  color: #6b4a30;
  letter-spacing: normal;
  white-space: nowrap;
  text-align: center;
}
</style>
