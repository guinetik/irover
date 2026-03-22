<template>
  <div class="power-hud">
    <div class="ph-block">
      <div class="ph-label">PWR</div>
      <div class="ph-bar-track">
        <div
          class="ph-bar-fill"
          :class="{ low: fillPct < 25, mid: fillPct >= 25 && fillPct < 60 }"
          :style="{ height: Math.min(100, fillPct) + '%' }"
        />
      </div>
      <div class="ph-wh">{{ whDisplay }} / {{ capDisplay }} Wh</div>
      <div class="ph-net" :class="netPositive ? 'charge' : 'drain'">
        {{ netPositive ? '+' : '' }}{{ netW.toFixed(0) }}W
      </div>
    </div>
    <div class="ph-divider" />
    <div class="ph-sol">
      <div class="ph-sol-num">Sol {{ sol }}</div>
      <div class="ph-time">{{ marsTime }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  batteryWh: number
  capacityWh: number
  netW: number
  sol: number
  /** 0..1 from MarsSky.timeOfDay */
  timeOfDay: number
}>()

const MARS_DAY_MINUTES = 24 * 60 + 37

const fillPct = computed(() =>
  props.capacityWh > 0 ? (props.batteryWh / props.capacityWh) * 100 : 0,
)
const whDisplay = computed(() => props.batteryWh.toFixed(0))
const capDisplay = computed(() => props.capacityWh.toFixed(0))
const netPositive = computed(() => props.netW >= 0)

const marsTime = computed(() => {
  const totalMin = (props.timeOfDay % 1) * MARS_DAY_MINUTES
  const h = Math.floor(totalMin / 60)
  const m = Math.floor(totalMin % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})
</script>

<style scoped>
.power-hud {
  position: fixed;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 42;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 8px;
  font-family: 'Courier New', monospace;
  pointer-events: none;
  min-width: 88px;
}

.ph-label {
  font-size: 9px;
  letter-spacing: 0.2em;
  color: #c4753a;
  margin-bottom: 4px;
}

.ph-bar-track {
  width: 8px;
  height: 56px;
  margin: 0 auto 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  flex-direction: column-reverse;
}

.ph-bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #5dc9a5, #3a9a7a);
  border-radius: 2px;
  transition: height 0.2s ease;
}

.ph-bar-fill.mid {
  background: linear-gradient(180deg, #ef9f27, #c4753a);
}

.ph-bar-fill.low {
  background: linear-gradient(180deg, #e05030, #a03020);
}

.ph-wh {
  font-size: 9px;
  color: rgba(196, 149, 106, 0.85);
  text-align: center;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}

.ph-net {
  font-size: 10px;
  font-weight: bold;
  text-align: center;
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.ph-net.charge {
  color: #5dc9a5;
}

.ph-net.drain {
  color: #e05030;
}

.ph-divider {
  height: 1px;
  background: rgba(196, 117, 58, 0.2);
  margin: 2px 0;
}

.ph-sol {
  text-align: center;
}

.ph-sol-num {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.55);
  letter-spacing: 0.12em;
}

.ph-time {
  font-size: 11px;
  color: #e8a060;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
}
</style>
