<template>
  <Transition name="map-fade">
    <div v-if="open" class="map-minimap-root">
      <div class="map-overlay__panel" role="dialog" aria-label="Terrain minimap">
        <div class="map-overlay__header font-instrument">
          <span class="map-overlay__title" :title="`${siteName} — terrain`">{{ siteName }}</span>
          <div class="map-overlay__header-actions">
            <button
              type="button"
              class="map-overlay__mode-btn"
              :title="mode === 'mars' ? 'Hypsometric ramp' : 'Mars color ramp'"
              @click="toggleMode"
            >
              {{ mode === 'mars' ? 'HYPSO' : 'MARS' }}
            </button>
            <button type="button" class="map-overlay__close-btn" @click="emit('close')">ESC</button>
          </div>
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
            class="map-overlay__dot map-overlay__dot--rover"
            :style="{ left: roverPixel.x + 'px', top: roverPixel.y + 'px' }"
          />
          <!-- Generic markers -->
          <div
            v-for="dot in markerPixels"
            :key="dot.id"
            class="map-overlay__dot"
            :class="dot.pulse && 'map-overlay__dot--pulse'"
            :style="{ left: dot.px + 'px', top: dot.py + 'px', '--dot-color': dot.color }"
            :title="dot.label"
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
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'

const DEG_PER_METER = 1 / 59200

export interface MapMarker {
  id: string
  /** World-space X (same coordinate system as rover position). */
  x: number
  /** World-space Z. */
  z: number
  /** CSS color for the dot and glow. */
  color: string
  /** Optional tooltip text. */
  label?: string
  /** Whether the dot should pulse (default false). */
  pulse?: boolean
}

const props = withDefaults(
  defineProps<{
    open: boolean
    siteName: string
    mapCanvasMars: HTMLCanvasElement | null
    mapCanvasHypso: HTMLCanvasElement | null
    baseLat: number
    baseLon: number
    roverX: number
    roverZ: number
    terrainScale: number
    markers?: MapMarker[]
  }>(),
  { markers: () => [] },
)

const emit = defineEmits<{ close: [] }>()

/** Close on Escape from anywhere while open (panel is not focus-trapped). */
function onDocumentKeyDown(e: KeyboardEvent): void {
  if (!props.open || e.key !== 'Escape') return
  e.preventDefault()
  emit('close')
}

const displayCanvas = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLElement | null>(null)
const mode = ref<'mars' | 'hypso'>('mars')
const cursorLatLon = ref<{ latStr: string; lonStr: string } | null>(null)
const cursorScreenPos = ref({ x: 0, y: 0 })
/** Reactive canvas display size (updated by ResizeObserver). */
const canvasDisplaySize = ref({ w: 0, h: 0 })
let resizeObs: ResizeObserver | null = null

function toggleMode() {
  mode.value = mode.value === 'mars' ? 'hypso' : 'mars'
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

function worldToPixel(wx: number, wz: number, displayW: number, displayH: number) {
  return {
    x: (wx / props.terrainScale + 0.5) * displayW,
    y: (wz / props.terrainScale + 0.5) * displayH,
  }
}

const roverPixel = computed(() => {
  const { w, h } = canvasDisplaySize.value
  if (w === 0 || h === 0) return null
  return worldToPixel(props.roverX, props.roverZ, w, h)
})

const markerPixels = computed(() => {
  const { w, h } = canvasDisplaySize.value
  if (w === 0 || h === 0) return []
  return props.markers.map(m => {
    const p = worldToPixel(m.x, m.z, w, h)
    return { id: m.id, px: p.x, py: p.y, color: m.color, label: m.label ?? '', pulse: m.pulse ?? false }
  })
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

// Track canvas display size reactively for rover dot positioning
function observeCanvas() {
  resizeObs?.disconnect()
  const dc = displayCanvas.value
  if (!dc) return
  resizeObs = new ResizeObserver(([entry]) => {
    canvasDisplaySize.value = { w: entry.contentRect.width, h: entry.contentRect.height }
  })
  resizeObs.observe(dc)
}

// Redraw when mode changes or overlay opens
watch([mode, () => props.open], async () => {
  if (props.open) {
    await nextTick()
    redraw()
    observeCanvas()
  }
})

// Also redraw when map canvases arrive (they may load after mount)
watch([() => props.mapCanvasMars, () => props.mapCanvasHypso], () => {
  if (props.open) redraw()
})

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onDocumentKeyDown)
    else window.removeEventListener('keydown', onDocumentKeyDown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onDocumentKeyDown)
  resizeObs?.disconnect()
})
</script>

<style scoped>
/* Bottom-left minimap: no fullscreen scrim — clicks pass through except on the panel */
.map-minimap-root {
  position: fixed;
  left: 8px;
  bottom: 24px;
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  pointer-events: none;
}

.map-overlay__panel {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  width: min(260px, 34vw);
  max-width: calc(100vw - 16px);
  max-height: min(380px, 42vh);
  background: rgba(10, 5, 2, 0.92);
  border: 1px solid rgba(196, 117, 58, 0.38);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.map-overlay__header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 6px 8px;
  color: #e0b888;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
  flex-shrink: 0;
}

.map-overlay__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.map-overlay__header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.map-overlay__mode-btn,
.map-overlay__close-btn {
  flex: 0 0 auto;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(224, 184, 136, 0.3);
  color: #e0b888;
  padding: 3px 8px;
  font-family: inherit;
  font-size: 10px;
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
  flex: 1;
  min-height: 0;
  padding: 4px;
}

.map-overlay__canvas {
  width: 100%;
  height: auto;
  max-height: min(320px, 36vh);
  display: block;
  image-rendering: pixelated;
  cursor: crosshair;
}

.map-overlay__dot {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dot-color, #ffffff);
  border: 2px solid color-mix(in srgb, var(--dot-color, #ffffff) 55%, black);
  box-shadow: 0 0 6px var(--dot-color, #ffffff);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.map-overlay__dot--rover {
  --dot-color: #00ffcc;
  animation: map-dot-pulse 1.5s ease-in-out infinite;
}

.map-overlay__dot--pulse {
  animation: map-dot-pulse 1.5s ease-in-out infinite;
}

@keyframes map-dot-pulse {
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
