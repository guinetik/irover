<template>
  <div
    class="sol-clock"
    role="status"
    aria-live="polite"
    :aria-label="ariaLabel"
  >
    <div class="sc-icon-wrap" aria-hidden="true">
      <span class="sc-icon">{{ icon }}</span>
    </div>
    <div class="sc-main">
      <span class="sc-time font-instrument">{{ marsTime }}</span>
      <span class="sc-dot" aria-hidden="true">&middot;</span>
      <span class="sc-sol">
        <span class="sc-sol-label">Sol</span>
        <span class="font-instrument sc-sol-num">{{ sol }}</span>
      </span>
      <template v-if="ambientDisplay !== null">
        <span class="sc-dot" aria-hidden="true">&middot;</span>
        <span class="sc-ambient" :title="ambientTitle">{{ ambientDisplay }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MARS_SOL_CLOCK_MINUTES } from '@/three/MarsSky'

const props = defineProps<{
  sol: number
  /** 0..1 from MarsSky.timeOfDay */
  timeOfDay: number
  /** 0..1 MarsSky.nightFactor */
  nightFactor?: number
  /**
   * Site ambient air temperature (°C), same diurnal curve as the heater thermal readout.
   * When omitted, the clock hides this segment.
   */
  ambientCelsius?: number | null
}>()

const ambientDisplay = computed(() => {
  const t = props.ambientCelsius
  if (t === undefined || t === null || Number.isNaN(t)) return null
  return `${Math.round(t)}\u00B0C`
})

const ambientTitle = computed(() => 'Ambient (site air)')

const marsTime = computed(() => {
  const totalMin = (props.timeOfDay % 1) * MARS_SOL_CLOCK_MINUTES
  const h = Math.floor(totalMin / 60)
  const m = Math.floor(totalMin % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

const icon = computed(() => {
  const nf = props.nightFactor ?? 0
  if (nf > 0.8) return '\u263E'
  if (nf > 0.4) return '\uD83C\uDF05'
  return '\u2600'
})

const ariaLabel = computed(() => {
  const parts = [`Mars local time ${marsTime.value}`, `sol ${props.sol}`]
  if (ambientDisplay.value) parts.push(`ambient ${ambientDisplay.value}`)
  return parts.join(', ')
})
</script>

<style scoped>
.sol-clock {
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  flex-shrink: 0;
  min-height: 32px;
  max-height: 36px;
  padding: 2px 2px 2px 4px;
  background:
    linear-gradient(165deg, rgba(28, 22, 18, 0.92) 0%, rgba(12, 8, 6, 0.88) 100%);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 220, 180, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
  font-family: var(--font-ui);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.sc-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  margin: 2px 2px 2px 4px;
  border-radius: 4px;
  background: rgba(196, 117, 58, 0.12);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.25);
}

.sc-icon {
  font-size: 15px;
  line-height: 1;
  color: #f0b878;
  filter: drop-shadow(0 0 6px rgba(232, 160, 80, 0.35));
}

.sc-main {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 7px;
  min-width: 0;
  padding: 4px 10px 4px 4px;
}

.sc-time {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #f2dcc4;
}

.sc-dot {
  flex-shrink: 0;
  color: rgba(196, 149, 106, 0.5);
  font-size: 11px;
  line-height: 1;
  user-select: none;
}

.sc-sol {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  white-space: nowrap;
}

.sc-sol-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(196, 149, 106, 0.65);
}

.sc-sol-num {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #e8b878;
}

.sc-ambient {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #9ec8d4;
  text-shadow: 0 0 10px rgba(120, 200, 220, 0.2);
  white-space: nowrap;
}
</style>
