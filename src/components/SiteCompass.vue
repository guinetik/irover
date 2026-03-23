<template>
  <div class="compass-strip">
    <div class="compass-track" :style="{ transform: `translateX(${offset}px)` }">
      <div v-for="tick in ticks" :key="tick.deg" class="tick" :class="{ cardinal: tick.cardinal, major: tick.major }">
        <div class="tick-line" />
        <span v-if="tick.label" class="tick-label">{{ tick.label }}</span>
      </div>
    </div>
    <div class="poi-layer" aria-hidden="true">
      <div
        v-for="m in poiMarkers"
        :key="m.id"
        class="poi-marker"
        :class="{
          focused: m.focused,
          'clamp-left': m.clamped === 'left',
          'clamp-right': m.clamped === 'right',
        }"
        :style="poiMarkerStyle(m)"
        :title="m.label"
      />
    </div>
    <div class="compass-pointer" />
    <div class="heading-readout font-instrument">{{ headingDeg }}&deg;</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** Mission / survey POI: relative bearing in degrees from rover nose (−180…180). */
export interface SiteCompassPoi {
  id: string
  label: string
  relativeDeg: number
  focused?: boolean
  color?: string
}

const props = withDefaults(
  defineProps<{
    heading: number
    pois?: SiteCompassPoi[]
  }>(),
  { pois: () => [] },
)

const TICK_SPACING = 4 // px per degree
const STRIP_HALF_W = 160
const MAX_POI_OFFSET = STRIP_HALF_W - 14
const LABELS: Record<number, string> = {
  0: 'N', 45: 'NE', 90: 'E', 135: 'SE',
  180: 'S', 225: 'SW', 270: 'W', 315: 'NW',
}

const headingDeg = computed(() => {
  return Math.round((((-props.heading * 180 / Math.PI) % 360) + 360) % 360)
})

const offset = computed(() => {
  return -headingDeg.value * TICK_SPACING
})

// Generate 720° of ticks (full wrap + extra for seamless scroll)
const ticks = computed(() => {
  const result = []
  for (let d = -180; d <= 540; d += 5) {
    const normalized = ((d % 360) + 360) % 360
    result.push({
      deg: d,
      cardinal: normalized % 90 === 0,
      major: normalized % 45 === 0,
      label: LABELS[normalized] || (normalized % 30 === 0 ? `${normalized}` : null),
    })
  }
  return result
})

const poiMarkers = computed(() => {
  const raw = props.pois ?? []
  const withClamp = raw.map((p) => {
    let offsetPx = p.relativeDeg * TICK_SPACING
    let clamped: 'left' | 'right' | null = null
    if (offsetPx < -MAX_POI_OFFSET) {
      offsetPx = -MAX_POI_OFFSET
      clamped = 'left'
    } else if (offsetPx > MAX_POI_OFFSET) {
      offsetPx = MAX_POI_OFFSET
      clamped = 'right'
    }
    return {
      id: p.id,
      label: p.label,
      focused: p.focused ?? false,
      color: p.color,
      offsetPx,
      clamped,
    }
  })
  let leftI = 0
  let rightI = 0
  return withClamp.map((m) => {
    if (m.clamped === 'left') {
      const stack = leftI++
      return { ...m, stack }
    }
    if (m.clamped === 'right') {
      const stack = rightI++
      return { ...m, stack }
    }
    return { ...m, stack: 0 }
  })
})

function poiMarkerStyle(m: {
  offsetPx: number
  clamped: 'left' | 'right' | null
  stack: number
  color?: string
  focused: boolean
}): Record<string, string> {
  const top = `${6 + m.stack * 7}px`
  const border = m.focused ? '2px solid rgba(196, 117, 58, 0.95)' : 'none'
  const bg = m.color ?? 'rgba(94, 184, 255, 0.92)'
  const base: Record<string, string> = {
    top,
    background: bg,
    boxShadow: m.focused ? `0 0 8px ${m.color ?? '#5eb8ff'}` : 'none',
    border,
  }
  if (m.clamped === 'left') {
    return {
      ...base,
      left: '12px',
      transform: 'none',
    }
  }
  if (m.clamped === 'right') {
    return {
      ...base,
      left: 'auto',
      right: '12px',
      transform: 'none',
    }
  }
  return {
    ...base,
    left: '50%',
    transform: `translateX(calc(-50% + ${m.offsetPx}px))`,
  }
}
</script>

<style scoped>
.compass-strip {
  position: fixed;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 36px;
  overflow: hidden;
  z-index: 30;
  pointer-events: none;
  background: rgba(10, 5, 2, 0.5);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 4px;
  /* Fade edges */
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20%, black 80%, transparent 100%);
}

.poi-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.poi-marker {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-sizing: content-box;
}

.poi-marker.clamp-left,
.poi-marker.clamp-right {
  opacity: 0.95;
}

.compass-track {
  position: absolute;
  top: 0;
  left: 50%;
  display: flex;
  height: 100%;
  align-items: flex-start;
  will-change: transform;
  z-index: 1;
}

.tick {
  width: 20px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 4px;
}

.tick-line {
  width: 1px;
  height: 8px;
  background: rgba(196, 117, 58, 0.2);
}

.tick.major .tick-line {
  height: 12px;
  background: rgba(196, 117, 58, 0.4);
}

.tick.cardinal .tick-line {
  height: 14px;
  width: 1.5px;
  background: rgba(196, 117, 58, 0.7);
}

.tick-label {
  font-family: var(--font-ui);
  font-size: 11px;
  letter-spacing: 0.1em;
  color: rgba(196, 149, 106, 0.4);
  margin-top: 1px;
  white-space: nowrap;
}

.tick.cardinal .tick-label {
  font-size: 11px;
  font-weight: bold;
  color: rgba(196, 149, 106, 0.8);
}

.compass-pointer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid #c4753a;
  z-index: 3;
}

.heading-readout {
  position: absolute;
  bottom: 2px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 11px;
  color: #c4753a;
  letter-spacing: 0.15em;
}
</style>
