<template>
  <Transition name="map-fade">
    <div v-if="open" class="map-overlay" @click.self="$emit('close')" @keydown.escape="$emit('close')">
      <div class="map-overlay__panel">
        <div class="map-overlay__header font-instrument">
          <span class="map-overlay__title">{{ siteName }} — TERRAIN MAP</span>
          <button class="map-overlay__mode-btn" @click="toggleMode">
            {{ mode === 'mars' ? 'HYPSOMETRIC' : 'MARS COLOR' }}
          </button>
          <button class="map-overlay__close-btn" @click="$emit('close')">ESC</button>
        </div>
        <div class="map-overlay__canvas-wrap" ref="wrapRef">
          <canvas
            ref="displayCanvas"
            class="map-overlay__canvas"
            @mousemove="onMouseMove"
            @mouseleave="cursorLatLon = null"
          />
          <!-- Rover dot -->
          <div
            v-if="roverPixel"
            class="map-overlay__rover-dot"
            :style="{ left: roverPixel.x + 'px', top: roverPixel.y + 'px' }"
          />
          <!-- Cursor readout -->
          <div
            v-if="cursorLatLon"
            class="map-overlay__cursor-readout font-instrument"
            :style="{ left: cursorScreenPos.x + 'px', top: cursorScreenPos.y + 'px' }"
          >
            {{ cursorLatLon.latStr }} {{ cursorLatLon.lonStr }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const DEG_PER_METER = 1 / 59200

const props = defineProps<{
  open: boolean
  siteName: string
  mapCanvasMars: HTMLCanvasElement | null
  mapCanvasHypso: HTMLCanvasElement | null
  baseLat: number
  baseLon: number
  roverX: number
  roverZ: number
  terrainScale: number
  gridSize: number
}>()

defineEmits<{ close: [] }>()

const displayCanvas = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const mode = ref<'mars' | 'hypso'>('mars')
const cursorLatLon = ref<{ latStr: string; lonStr: string } | null>(null)
const cursorScreenPos = ref({ x: 0, y: 0 })

function toggleMode() {
  mode.value = mode.value === 'mars' ? 'hypso' : 'mars'
}

/** Convert world X/Z to pixel coordinates on the displayed canvas. */
function worldToPixel(wx: number, wz: number) {
  const canvas = displayCanvas.value
  if (!canvas) return null
  const px = ((wx / props.terrainScale + 0.5) * canvas.width)
  const py = ((wz / props.terrainScale + 0.5) * canvas.height)
  return { x: px, y: py }
}

/** Convert pixel to lat/lon strings. */
function pixelToLatLon(px: number, py: number, canvasW: number, canvasH: number) {
  const wx = (px / canvasW - 0.5) * props.terrainScale
  const wz = (py / canvasH - 0.5) * props.terrainScale
  const lat = props.baseLat + (-wz * DEG_PER_METER)
  const cosLat = Math.cos((props.baseLat * Math.PI) / 180)
  const degPerMeterLon = DEG_PER_METER / (cosLat || 1)
  const lon = props.baseLon + (wx * degPerMeterLon)
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'
  return {
    latStr: `${Math.abs(lat).toFixed(4)}\u00B0${latDir}`,
    lonStr: `${Math.abs(lon).toFixed(4)}\u00B0${lonDir}`,
  }
}

const roverPixel = computed(() => {
  const dc = displayCanvas.value
  if (!dc) return null
  // Normalized [0,1] position
  const nx = props.roverX / props.terrainScale + 0.5
  const ny = props.roverZ / props.terrainScale + 0.5
  // Map to CSS displayed size
  const rect = dc.getBoundingClientRect()
  return { x: nx * rect.width, y: ny * rect.height }
})

function onMouseMove(e: MouseEvent) {
  const canvas = displayCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  // Map mouse position to canvas pixel coords (account for CSS scaling)
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const cx = (e.clientX - rect.left) * scaleX
  const cy = (e.clientY - rect.top) * scaleY
  cursorLatLon.value = pixelToLatLon(cx, cy, canvas.width, canvas.height)
  // Position readout relative to the canvas wrapper
  cursorScreenPos.value = {
    x: e.clientX - rect.left + 12,
    y: e.clientY - rect.top - 24,
  }
}

/** Draw the map + grid onto the display canvas. */
function redraw() {
  const dc = displayCanvas.value
  const src = mode.value === 'mars' ? props.mapCanvasMars : props.mapCanvasHypso
  if (!dc || !src) return

  dc.width = src.width
  dc.height = src.height
  const ctx = dc.getContext('2d')!

  // Draw base map
  ctx.drawImage(src, 0, 0)

  // Draw grid lines
  drawGrid(ctx, dc.width, dc.height)
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const totalDegreesLat = (props.terrainScale * DEG_PER_METER)
  const cosLat = Math.cos((props.baseLat * Math.PI) / 180)
  const degPerMeterLon = DEG_PER_METER / (cosLat || 1)
  const totalDegreesLon = (props.terrainScale * degPerMeterLon)

  // Pick a grid spacing that gives ~5-8 lines
  const spacing = pickGridSpacing(Math.max(totalDegreesLat, totalDegreesLon))

  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  ctx.font = '10px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.6)'

  // Lat lines (horizontal)
  const latMin = props.baseLat - totalDegreesLat / 2
  const latMax = props.baseLat + totalDegreesLat / 2
  const firstLatLine = Math.ceil(latMin / spacing) * spacing
  for (let lat = firstLatLine; lat <= latMax; lat += spacing) {
    const wz = -(lat - props.baseLat) / DEG_PER_METER
    const py = (wz / props.terrainScale + 0.5) * h
    ctx.beginPath()
    ctx.moveTo(0, py)
    ctx.lineTo(w, py)
    ctx.stroke()
    const dir = lat >= 0 ? 'N' : 'S'
    ctx.fillText(`${Math.abs(lat).toFixed(3)}\u00B0${dir}`, 4, py - 3)
  }

  // Lon lines (vertical)
  const lonMin = props.baseLon - totalDegreesLon / 2
  const lonMax = props.baseLon + totalDegreesLon / 2
  const firstLonLine = Math.ceil(lonMin / spacing) * spacing
  for (let lon = firstLonLine; lon <= lonMax; lon += spacing) {
    const wx = (lon - props.baseLon) / degPerMeterLon
    const px = (wx / props.terrainScale + 0.5) * w
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
    const dir = lon >= 0 ? 'E' : 'W'
    ctx.fillText(`${Math.abs(lon).toFixed(3)}\u00B0${dir}`, px + 3, h - 6)
  }
}

/** Pick a sensible grid spacing in degrees for ~5-8 grid lines. */
function pickGridSpacing(totalDegrees: number): number {
  const candidates = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1]
  for (const s of candidates) {
    if (totalDegrees / s >= 4 && totalDegrees / s <= 10) return s
  }
  return totalDegrees / 6
}

// Redraw when mode changes or overlay opens
watch([mode, () => props.open], async () => {
  if (props.open) {
    await nextTick()
    redraw()
  }
})

// Also redraw when map canvases arrive (they may load after mount)
watch([() => props.mapCanvasMars, () => props.mapCanvasHypso], () => {
  if (props.open) redraw()
})
</script>

<style scoped>
.map-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-overlay__panel {
  display: flex;
  flex-direction: column;
  max-width: 90vw;
  max-height: 90vh;
}

.map-overlay__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #e0b888;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.map-overlay__title {
  flex: 1;
}

.map-overlay__mode-btn,
.map-overlay__close-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(224, 184, 136, 0.3);
  color: #e0b888;
  padding: 4px 12px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.map-overlay__mode-btn:hover,
.map-overlay__close-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.map-overlay__canvas-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-overlay__canvas {
  max-width: 80vw;
  max-height: 80vh;
  image-rendering: pixelated;
  cursor: crosshair;
}

.map-overlay__rover-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #00ffcc;
  box-shadow: 0 0 8px #00ffcc, 0 0 16px rgba(0, 255, 204, 0.4);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: rover-pulse 1.5s ease-in-out infinite;
}

@keyframes rover-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.7; }
}

.map-overlay__cursor-readout {
  position: absolute;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.8);
  color: #e0b888;
  padding: 2px 6px;
  font-size: 11px;
  white-space: nowrap;
  border: 1px solid rgba(224, 184, 136, 0.3);
}

.map-fade-enter-active,
.map-fade-leave-active {
  transition: opacity 0.2s ease;
}
.map-fade-enter-from,
.map-fade-leave-to {
  opacity: 0;
}
</style>
