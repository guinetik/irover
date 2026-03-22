<template>
  <div class="mast-telemetry">
    <div class="mt-row">
      <span class="mt-label">LAT</span>
      <span class="mt-value">{{ latStr }}</span>
    </div>
    <div class="mt-row">
      <span class="mt-label">LON</span>
      <span class="mt-value">{{ lonStr }}</span>
    </div>
    <div class="mt-sep" />
    <div class="mt-row">
      <span class="mt-label">AZ</span>
      <span class="mt-value">{{ azStr }}&deg;</span>
    </div>
    <div class="mt-row">
      <span class="mt-label">EL</span>
      <span class="mt-value">{{ elStr }}&deg;</span>
    </div>
    <div class="mt-row">
      <span class="mt-label">FOV</span>
      <span class="mt-value">{{ fov.toFixed(0) }}&deg;</span>
    </div>
    <div class="mt-sep" />
    <div class="mt-row">
      <span class="mt-label">RNG</span>
      <span class="mt-value">{{ rangeStr }}m</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Site base latitude (degrees) */
  baseLat: number
  /** Site base longitude (degrees) */
  baseLon: number
  /** Rover world X position */
  roverX: number
  /** Rover world Z position */
  roverZ: number
  /** Mast pan angle (radians, 0 = forward, positive = left) */
  panAngle: number
  /** Mast tilt angle (radians, 0 = level, positive = down) */
  tiltAngle: number
  /** Camera FOV (degrees) */
  fov: number
  /** Rover heading (radians) */
  heading: number
  /** Distance to current target (meters), -1 if no target */
  targetRange: number
}>()

// ~1 world unit = 1 meter. Mars: 1° lat ≈ 59.2 km
const DEG_PER_METER = 1 / 59200

const latStr = computed(() => {
  const lat = props.baseLat + (-props.roverZ * DEG_PER_METER)
  const dir = lat >= 0 ? 'N' : 'S'
  return `${Math.abs(lat).toFixed(4)}\u00B0${dir}`
})

const lonStr = computed(() => {
  const cosLat = Math.cos((props.baseLat * Math.PI) / 180)
  const degPerMeterLon = DEG_PER_METER / (cosLat || 1)
  const lon = props.baseLon + (props.roverX * degPerMeterLon)
  const dir = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lon).toFixed(4)}\u00B0${dir}`
})

// Azimuth: rover heading + pan angle, converted to compass bearing (0=N, 90=E)
const azStr = computed(() => {
  // heading is rover's Y rotation, panAngle is relative to rover forward
  // In Three.js: heading 0 = +Z direction. Compass: 0 = N = -Z.
  // Azimuth = (heading + panAngle) converted to degrees, mapped to 0-360
  const azRad = props.heading + props.panAngle + Math.PI
  let azDeg = ((azRad * 180) / Math.PI) % 360
  if (azDeg < 0) azDeg += 360
  return azDeg.toFixed(1)
})

// Elevation: negative tilt = looking up (+), positive tilt = looking down (-)
const elStr = computed(() => {
  const elDeg = -(props.tiltAngle * 180) / Math.PI
  return `${elDeg >= 0 ? '+' : ''}${elDeg.toFixed(1)}`
})

const rangeStr = computed(() => {
  if (props.targetRange < 0) return '---'
  return props.targetRange.toFixed(1)
})
</script>

<style scoped>
.mast-telemetry {
  position: fixed;
  top: 92px;
  left: 10px;
  z-index: 42;
  background: rgba(10, 5, 2, 0.7);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(102, 255, 238, 0.15);
  border-radius: 6px;
  padding: 8px 12px;
  font-family: 'Courier New', monospace;
  pointer-events: none;
  min-width: 130px;
}

.mt-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  line-height: 1.6;
}

.mt-label {
  font-size: 8px;
  color: rgba(102, 255, 238, 0.4);
  letter-spacing: 0.12em;
  font-weight: bold;
}

.mt-value {
  font-size: 10px;
  color: rgba(102, 255, 238, 0.85);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.mt-sep {
  height: 1px;
  background: rgba(102, 255, 238, 0.1);
  margin: 3px 0;
}
</style>
