<template>
  <div class="apxs-game" ref="containerRef">
    <canvas ref="canvasRef" />

    <SAMMiniGameTutorial
      :visible="!started"
      title="APXS"
      icon="&#x1F91A;"
      :diagram="'Catch fluorescent X-ray photons to map the rock\'s surface composition'"
      :steps="[
        { key: 'MOUSE', text: 'Move the detector to catch X-ray photons' },
        { text: 'Colored dots are element signatures — catch them all' },
        { text: 'Rare trace elements glow brighter and show keV labels' },
        { text: 'Match the true composition as closely as possible' },
      ]"
      @start="onStart"
    />

    <!-- HUD overlay -->
    <div class="apxs-hud-top" v-show="started && !finished">
      <div class="apxs-hud-left">
        <div class="hud-label">Photons Caught</div>
        <div class="hud-value font-instrument">{{ totalCaught }}</div>
        <div class="apxs-rock-type">{{ props.rockType }}</div>
      </div>
      <div class="apxs-power-bar-container">
        <div class="hud-label">Source Power</div>
        <div class="apxs-power-bar-bg">
          <div
            class="apxs-power-bar-fill"
            :style="{ width: powerLeft * 100 + '%', background: powerBarColor }"
          />
        </div>
      </div>
      <div class="apxs-hud-right">
        <div class="hud-label">Accuracy</div>
        <div class="hud-value font-instrument" :style="{ color: accuracyColor }">
          {{ accuracyDisplay }}
        </div>
      </div>
    </div>

    <!-- Spectrum bar chart (HTML) -->
    <div class="apxs-spectrum-panel" v-show="started && !finished">
      <div class="apxs-spectrum-header">
        <div class="apxs-spectrum-title">X-Ray Fluorescence Spectrum</div>
        <div class="apxs-spectrum-legend">
          <span class="legend-true">&#x25AE; true</span>
          <span class="legend-measured">&#x25AE; measured</span>
        </div>
      </div>
      <div class="apxs-spectrum-bars">
        <div v-for="el in APXS_ELEMENTS" :key="el" class="el-col">
          <div class="el-bar-wrap">
            <div
              class="el-bar-true"
              :style="{
                height: trueBarHeight(el) + '%',
                background: ELEMENT_COLORS[el],
              }"
            />
            <div
              class="el-bar-measured"
              :style="{
                height: measuredBarHeight(el) + '%',
                background: ELEMENT_COLORS[el],
              }"
            />
          </div>
          <div class="el-label" :style="{ color: ELEMENT_COLORS[el] }">{{ el }}</div>
          <div class="el-pct">{{ measuredPctText(el) }}</div>
        </div>
      </div>
    </div>

    <SAMMiniGameResult
      :visible="finished"
      :quality="finalAccuracy"
      @continue="handleComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SAMMiniGameTutorial from '@/components/SAMMiniGameTutorial.vue'
import SAMMiniGameResult from '@/components/SAMMiniGameResult.vue'
import type { APXSComposition, APXSElementId } from '@/lib/apxsComposition'
import { APXS_ELEMENTS, ELEMENT_COLORS, ELEMENT_KEV, computeAccuracy } from '@/lib/apxsComposition'

const props = defineProps<{
  rockType: string
  composition: APXSComposition
  durationSec: number
}>()

const emit = defineEmits<{
  complete: [result: {
    accuracy: number
    measuredComposition: APXSComposition
    caughtElements: Set<APXSElementId>
    totalCaught: number
    totalEmitted: number
  }]
}>()

// --- Constants ---
const TOTAL_PHOTON_BUDGET = 200
const PHOTON_BASE_SPEED = 3.5
const DETECTOR_RADIUS = 16
/** Dead zone radius around rock center — detector hidden, no catches */
const DEAD_ZONE_RADIUS = 80

// --- Refs ---
const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const finished = ref(false)
const finalAccuracy = ref(0)
const totalCaught = ref(0)
const powerLeft = ref(1.0)

// --- Types ---
interface Photon {
  x: number; y: number
  vx: number; vy: number
  element: APXSElementId
  life: number
  trail: { x: number; y: number }[]
  size: number
  pulse: number
  isTrace: boolean
}

interface AlphaParticle {
  x: number; y: number
  vx: number; vy: number
  targetDist: number
  traveled: number
}

interface CatchFlash {
  x: number; y: number
  color: string
  life: number
  label: string
  isTrace: boolean
}

interface RockGrain {
  x: number; y: number
  r: number
  element: APXSElementId
  brightness: number
}

interface SensorRing {
  radius: number
  opacity: number
  dashOffset: number
}

// --- Game state (mutable, not reactive for perf) ---
let mouseX = 0
let mouseY = 0
let detectorActive = true
let photons: Photon[] = []
let alphaParticles: AlphaParticle[] = []
let catchFlashes: CatchFlash[] = []
let rockGrains: RockGrain[] = []
let sensorRings: SensorRing[] = []
let emittedCounts: Record<APXSElementId, number> = {} as Record<APXSElementId, number>
let caughtCounts: Record<APXSElementId, number> = {} as Record<APXSElementId, number>
let emitAccumulators: Record<APXSElementId, number> = {} as Record<APXSElementId, number>
let totalEmittedLocal = 0
let totalCaughtLocal = 0
let gameTime = 0
let animId = 0
let lastTime = 0
let running = false
let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let dpr = 1

// --- Computed for HUD ---
const powerBarColor = computed(() =>
  powerLeft.value < 0.25
    ? 'linear-gradient(90deg,#ff4444,#ff7744)'
    : 'linear-gradient(90deg,#e8a54b,#ffcc66)',
)

const accuracyDisplay = computed(() => {
  if (totalCaughtLocal <= 5) return '\u2014'
  return currentAccuracy().toFixed(1) + '%'
})

const accuracyColor = computed(() => {
  const acc = currentAccuracy()
  if (acc > 95) return '#44dd88'
  if (acc > 80) return '#e8a54b'
  return '#ff7744'
})

// --- Helpers ---
function currentAccuracy(): number {
  if (totalCaughtLocal < 3) return 0
  const measured = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    measured[el] = totalCaughtLocal > 0 ? (caughtCounts[el] / totalCaughtLocal) * 100 : 0
  }
  return computeAccuracy(props.composition, measured)
}

function maxTrue(): number {
  return Math.max(...APXS_ELEMENTS.map((el) => props.composition[el]))
}

function trueBarHeight(el: APXSElementId): number {
  const mt = maxTrue()
  return mt > 0 ? (props.composition[el] / mt) * 100 : 0
}

function measuredBarHeight(el: APXSElementId): number {
  if (totalCaughtLocal <= 0) return 0
  const mp = (caughtCounts[el] / totalCaughtLocal) * 100
  const mt = maxTrue()
  return mt > 0 ? Math.min(100, (mp / mt) * 100) : 0
}

function measuredPctText(el: APXSElementId): string {
  if (totalCaughtLocal <= 0) return ''
  return ((caughtCounts[el] / totalCaughtLocal) * 100).toFixed(1) + '%'
}

function photonBudgetFor(elId: APXSElementId): number {
  return Math.max(1, Math.round((props.composition[elId] / 100) * TOTAL_PHOTON_BUDGET))
}

function photonSpeed(elId: APXSElementId): number {
  const pct = props.composition[elId]
  if (pct > 10) return PHOTON_BASE_SPEED + Math.random() * 0.5
  if (pct > 2) return PHOTON_BASE_SPEED + 0.8 + Math.random() * 0.6
  return PHOTON_BASE_SPEED + 1.5 + Math.random() * 1.0
}

// --- Init helpers ---
function generateRockGrains() {
  rockGrains = []
  const cx = W / 2
  const cy = H / 2 - 40
  for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * 100
    let roll = Math.random() * 100
    let cum = 0
    let grainEl: APXSElementId = APXS_ELEMENTS[0]
    for (const el of APXS_ELEMENTS) {
      cum += props.composition[el]
      if (roll <= cum) { grainEl = el; break }
    }
    rockGrains.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist * 0.6,
      r: 2 + Math.random() * 6,
      element: grainEl,
      brightness: 0.1 + Math.random() * 0.3,
    })
  }
}

function generateSensorRings() {
  sensorRings = []
  for (let i = 0; i < 6; i++) {
    sensorRings.push({
      radius: 160 + i * 55,
      opacity: 0.06 - i * 0.008,
      dashOffset: Math.random() * 100,
    })
  }
}

// --- Spawn ---
function spawnPhoton(elId: APXSElementId) {
  const cx = W / 2
  const cy = H / 2 - 40
  const oa = Math.random() * Math.PI * 2
  const od = Math.random() * 60
  const ox = cx + Math.cos(oa) * od
  const oy = cy + Math.sin(oa) * od * 0.5
  const fa = Math.atan2(oy - cy, ox - cx) + (Math.random() - 0.5) * 1.0
  const spd = photonSpeed(elId)
  const isTrace = props.composition[elId] < 2
  photons.push({
    x: ox, y: oy,
    vx: Math.cos(fa) * spd, vy: Math.sin(fa) * spd,
    element: elId,
    life: 1.0,
    trail: [],
    size: isTrace ? 5.5 : 3.5,
    pulse: Math.random() * Math.PI * 2,
    isTrace,
  })
}

function spawnAlpha() {
  const cx = W / 2
  const cy = H / 2 - 40
  const e = Math.random()
  let sx: number, sy: number
  if (e < 0.33) { sx = Math.random() * W; sy = -10 }
  else if (e < 0.66) { sx = -10; sy = Math.random() * H * 0.5 }
  else { sx = W + 10; sy = Math.random() * H * 0.5 }
  const tx = cx + (Math.random() - 0.5) * 120
  const ty = cy + (Math.random() - 0.5) * 60
  const a = Math.atan2(ty - sy, tx - sx)
  alphaParticles.push({
    x: sx, y: sy,
    vx: Math.cos(a) * 5, vy: Math.sin(a) * 5,
    targetDist: Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2),
    traveled: 0,
  })
}

// --- Update ---
function update(dt: number) {
  if (!running) return
  gameTime += dt

  // Dead zone: detector hidden near rock center
  const cx = W / 2
  const cy = H / 2 - 40
  const distFromCenter = Math.sqrt((mouseX - cx) ** 2 + (mouseY - cy) ** 2)
  detectorActive = distFromCenter > DEAD_ZONE_RADIUS
  powerLeft.value = Math.max(0, 1.0 - gameTime / props.durationSec)
  if (powerLeft.value <= 0) { endGame(); return }

  // Emit photons
  const emitRate = TOTAL_PHOTON_BUDGET / props.durationSec
  for (const el of APXS_ELEMENTS) {
    const budget = photonBudgetFor(el)
    if (emittedCounts[el] >= budget) continue
    emitAccumulators[el] += (props.composition[el] / 100) * emitRate * dt
    while (emitAccumulators[el] >= 1 && emittedCounts[el] < budget) {
      emitAccumulators[el] -= 1
      emittedCounts[el]++
      totalEmittedLocal++
      spawnPhoton(el)
    }
  }

  // Spawn alpha particles (visual only)
  if (Math.random() < 0.3) spawnAlpha()

  // Update photons
  for (let i = photons.length - 1; i >= 0; i--) {
    const p = photons[i]
    p.x += p.vx; p.y += p.vy
    p.life -= dt * 0.25
    p.pulse += dt * 8
    p.trail.push({ x: p.x, y: p.y })
    if (p.trail.length > 8) p.trail.shift()

    // Hit detection (skip if detector is in the dead zone)
    const dx = p.x - mouseX
    const dy = p.y - mouseY
    if (detectorActive && Math.sqrt(dx * dx + dy * dy) < DETECTOR_RADIUS + p.size) {
      caughtCounts[p.element]++
      totalCaughtLocal++
      totalCaught.value = totalCaughtLocal
      catchFlashes.push({
        x: p.x, y: p.y,
        color: ELEMENT_COLORS[p.element],
        life: 1.0,
        label: p.element,
        isTrace: p.isTrace,
      })
      photons.splice(i, 1)
      continue
    }

    // Remove off-screen or expired
    if (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) {
      photons.splice(i, 1)
    }
  }

  // Update alpha particles
  for (let i = alphaParticles.length - 1; i >= 0; i--) {
    const a = alphaParticles[i]
    a.x += a.vx; a.y += a.vy
    a.traveled += Math.sqrt(a.vx ** 2 + a.vy ** 2)
    if (a.traveled >= a.targetDist) alphaParticles.splice(i, 1)
  }

  // Update catch flashes
  for (let i = catchFlashes.length - 1; i >= 0; i--) {
    catchFlashes[i].life -= dt * 2.5
    if (catchFlashes[i].life <= 0) catchFlashes.splice(i, 1)
  }
}

// --- Draw ---
function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const cy = H / 2 - 40

  // Background
  const bg = ctx.createRadialGradient(cx, cy, 30, cx, H / 2, W * 0.6)
  bg.addColorStop(0, '#1a1410')
  bg.addColorStop(0.4, '#0d0a07')
  bg.addColorStop(1, '#050302')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Sensor rings
  sensorRings.forEach((r) => {
    ctx!.strokeStyle = `rgba(232,165,75,${r.opacity})`
    ctx!.lineWidth = 1
    ctx!.setLineDash([4, 12])
    ctx!.lineDashOffset = r.dashOffset + (running ? gameTime * 20 : 0)
    ctx!.beginPath()
    ctx!.ellipse(cx, cy, r.radius, r.radius * 0.65, 0, 0, Math.PI * 2)
    ctx!.stroke()
    ctx!.setLineDash([])
  })

  // Rock glow
  if (running) {
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 130)
    rg.addColorStop(0, 'rgba(180,140,90,0.25)')
    rg.addColorStop(0.5, 'rgba(120,90,50,0.08)')
    rg.addColorStop(1, 'rgba(80,60,30,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.ellipse(cx, cy, 130, 80, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Rock grains
  rockGrains.forEach((g) => {
    ctx!.fillStyle = ELEMENT_COLORS[g.element]
    ctx!.globalAlpha = running
      ? 0.15 + Math.sin(gameTime * 3 + g.x) * 0.05
      : g.brightness * 0.3
    ctx!.beginPath()
    ctx!.arc(g.x, g.y, g.r, 0, Math.PI * 2)
    ctx!.fill()
    ctx!.globalAlpha = 1
  })

  // Alpha particles
  alphaParticles.forEach((a) => {
    const al = 0.4 * (1 - a.traveled / a.targetDist)
    ctx!.strokeStyle = `rgba(100,150,255,${al})`
    ctx!.lineWidth = 1.5
    ctx!.beginPath()
    ctx!.moveTo(a.x - a.vx * 3, a.y - a.vy * 3)
    ctx!.lineTo(a.x, a.y)
    ctx!.stroke()
    ctx!.fillStyle = `rgba(100,180,255,${al + 0.2})`
    ctx!.beginPath()
    ctx!.arc(a.x, a.y, 2, 0, Math.PI * 2)
    ctx!.fill()
  })

  // Photons
  photons.forEach((p) => {
    // Trail
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i]
      ctx!.fillStyle = ELEMENT_COLORS[p.element]
      ctx!.globalAlpha = (i / p.trail.length) * 0.3 * p.life
      ctx!.beginPath()
      ctx!.arc(t.x, t.y, p.size * 0.4, 0, Math.PI * 2)
      ctx!.fill()
    }
    ctx!.globalAlpha = 1

    const pulse = 1 + Math.sin(p.pulse) * 0.25
    const sz = p.size * pulse

    ctx!.shadowColor = ELEMENT_COLORS[p.element]
    ctx!.shadowBlur = p.isTrace ? 18 : 10
    ctx!.fillStyle = ELEMENT_COLORS[p.element]
    ctx!.globalAlpha = p.life * 0.9
    ctx!.beginPath()
    ctx!.arc(p.x, p.y, sz, 0, Math.PI * 2)
    ctx!.fill()

    // White core
    ctx!.fillStyle = '#fff'
    ctx!.globalAlpha = p.life * 0.6
    ctx!.beginPath()
    ctx!.arc(p.x, p.y, sz * 0.4, 0, Math.PI * 2)
    ctx!.fill()
    ctx!.shadowBlur = 0
    ctx!.globalAlpha = 1

    // keV label for trace elements
    if (p.isTrace && p.life > 0.7) {
      ctx!.fillStyle = ELEMENT_COLORS[p.element]
      ctx!.globalAlpha = (p.life - 0.5) * 1.5
      ctx!.font = '9px var(--font-ui, "IBM Plex Mono", monospace)'
      ctx!.fillText(`${ELEMENT_KEV[p.element]}keV`, p.x + sz + 4, p.y + 3)
      ctx!.globalAlpha = 1
    }
  })

  // Catch flashes
  catchFlashes.forEach((f) => {
    const r = (1 - f.life) * (f.isTrace ? 50 : 30)
    ctx!.strokeStyle = f.color
    ctx!.globalAlpha = f.life * 0.6
    ctx!.lineWidth = f.isTrace ? 2.5 : 1.5
    ctx!.beginPath()
    ctx!.arc(f.x, f.y, r, 0, Math.PI * 2)
    ctx!.stroke()

    if (f.life > 0.6) {
      ctx!.fillStyle = f.color
      ctx!.globalAlpha = f.life
      ctx!.font = `${f.isTrace ? 'bold 14' : '11'}px var(--font-ui, "IBM Plex Mono", monospace)`
      ctx!.textAlign = 'center'
      ctx!.fillText(f.label, f.x, f.y - r - 6)
      ctx!.textAlign = 'left'
    }
    ctx!.globalAlpha = 1
  })

  // Detector (hidden in dead zone near rock center)
  if (running && detectorActive) {
    ctx.strokeStyle = 'rgba(232,165,75,0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(mouseX, mouseY, DETECTOR_RADIUS, 0, Math.PI * 2)
    ctx.stroke()

    // Crosshair
    ctx.strokeStyle = 'rgba(232,165,75,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(mouseX - 8, mouseY)
    ctx.lineTo(mouseX + 8, mouseY)
    ctx.moveTo(mouseX, mouseY - 8)
    ctx.lineTo(mouseX, mouseY + 8)
    ctx.stroke()

    // Detector fill
    const dg = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, DETECTOR_RADIUS)
    dg.addColorStop(0, 'rgba(232,165,75,0.06)')
    dg.addColorStop(1, 'rgba(232,165,75,0)')
    ctx.fillStyle = dg
    ctx.beginPath()
    ctx.arc(mouseX, mouseY, DETECTOR_RADIUS, 0, Math.PI * 2)
    ctx.fill()

    // Pulsing outer ring
    const pr = DETECTOR_RADIUS + Math.sin(gameTime * 4) * 3
    ctx.strokeStyle = `rgba(232,165,75,${0.15 + Math.sin(gameTime * 4) * 0.05})`
    ctx.lineWidth = 1
    ctx.setLineDash([3, 6])
    ctx.beginPath()
    ctx.arc(mouseX, mouseY, pr, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// --- End game ---
function endGame() {
  running = false
  const measured = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    measured[el] = totalCaughtLocal > 0 ? (caughtCounts[el] / totalCaughtLocal) * 100 : 0
  }
  finalAccuracy.value = computeAccuracy(props.composition, measured)
  finished.value = true
}

function handleComplete() {
  const measured = {} as APXSComposition
  for (const el of APXS_ELEMENTS) {
    measured[el] = totalCaughtLocal > 0 ? (caughtCounts[el] / totalCaughtLocal) * 100 : 0
  }
  const caught = new Set<APXSElementId>()
  for (const el of APXS_ELEMENTS) {
    if (caughtCounts[el] > 0) caught.add(el)
  }
  emit('complete', {
    accuracy: computeAccuracy(props.composition, measured),
    measuredComposition: measured,
    caughtElements: caught,
    totalCaught: totalCaughtLocal,
    totalEmitted: totalEmittedLocal,
  })
}

// --- Resize ---
function resize() {
  if (!canvasRef.value || !containerRef.value) return
  dpr = window.devicePixelRatio || 1
  W = containerRef.value.clientWidth
  H = containerRef.value.clientHeight
  canvasRef.value.width = W * dpr
  canvasRef.value.height = H * dpr
  ctx = canvasRef.value.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Re-center mouse
  mouseX = W / 2
  mouseY = H / 2
}

// --- Mouse ---
function handleMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouseX = (e.clientX - rect.left) * (W / rect.width)
  mouseY = (e.clientY - rect.top) * (H / rect.height)
}

// --- Start ---
function onStart() {
  started.value = true

  // Reset state
  photons = []
  alphaParticles = []
  catchFlashes = []
  totalEmittedLocal = 0
  totalCaughtLocal = 0
  totalCaught.value = 0
  gameTime = 0
  powerLeft.value = 1.0

  caughtCounts = {} as Record<APXSElementId, number>
  emittedCounts = {} as Record<APXSElementId, number>
  emitAccumulators = {} as Record<APXSElementId, number>
  for (const el of APXS_ELEMENTS) {
    caughtCounts[el] = 0
    emittedCounts[el] = 0
    emitAccumulators[el] = 0
  }

  generateRockGrains()
  generateSensorRings()

  running = true
  lastTime = performance.now()
  animId = requestAnimationFrame(loop)
}

// --- Game loop ---
function loop(now: number) {
  if (!running && !finished.value) return
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  if (running) update(dt)
  draw()
  if (running || !finished.value) {
    animId = requestAnimationFrame(loop)
  }
}

// --- Lifecycle ---
onMounted(() => {
  resize()
  generateRockGrains()
  generateSensorRings()
  window.addEventListener('resize', resize)
  containerRef.value?.addEventListener('mousemove', handleMouseMove)

  // Start idle draw loop for background visuals
  lastTime = performance.now()
  animId = requestAnimationFrame(function idleLoop(now: number) {
    lastTime = now
    draw()
    if (!running && !finished.value) {
      animId = requestAnimationFrame(idleLoop)
    }
  })
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
.apxs-game {
  position: relative;
  width: 100%;
  height: 100%;
  background: #080503;
  cursor: crosshair;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

/* --- HUD Top --- */
.apxs-hud-top {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  pointer-events: none;
  z-index: 10;
}

.hud-label {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 10px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #8b6b3a;
}

.hud-value {
  font-size: 22px;
  font-weight: 700;
  color: #e8a54b;
  text-shadow: 0 0 12px rgba(232, 165, 75, 0.4);
}

.apxs-rock-type {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #6b5a3a;
  margin-top: 2px;
}

.apxs-hud-right {
  text-align: right;
}

/* --- Power Bar --- */
.apxs-power-bar-container {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  pointer-events: none;
  text-align: center;
}

.apxs-power-bar-bg {
  width: 100%;
  height: 6px;
  background: rgba(232, 165, 75, 0.1);
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}

.apxs-power-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.1s linear;
  box-shadow: 0 0 8px rgba(232, 165, 75, 0.4);
}

/* --- Spectrum Panel --- */
.apxs-spectrum-panel {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  height: 140px;
  background: rgba(10, 8, 5, 0.88);
  border: 1px solid rgba(232, 165, 75, 0.2);
  border-radius: 6px;
  padding: 8px 12px;
  pointer-events: none;
  z-index: 10;
  backdrop-filter: blur(4px);
}

.apxs-spectrum-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.apxs-spectrum-title {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 9px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #8b6b3a;
}

.apxs-spectrum-legend {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 8px;
  color: #5a4a2a;
}

.apxs-spectrum-legend span {
  margin-left: 12px;
}

.legend-true {
  color: rgba(232, 165, 75, 0.35);
}

.legend-measured {
  color: #e8a54b;
}

.apxs-spectrum-bars {
  display: flex;
  gap: 4px;
  height: 100px;
  align-items: flex-end;
}

.el-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.el-bar-wrap {
  width: 100%;
  height: 70px;
  position: relative;
  overflow: hidden;
  border-radius: 2px;
  margin-bottom: 3px;
}

.el-bar-true {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-radius: 2px 2px 0 0;
  opacity: 0.15;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.el-bar-measured {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-radius: 2px 2px 0 0;
  opacity: 0.85;
  transition: height 0.12s ease-out;
}

.el-label {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 10px;
  font-weight: 600;
}

.el-pct {
  font-family: var(--font-ui, 'IBM Plex Mono', monospace);
  font-size: 8px;
  color: #8b6b3a;
  height: 12px;
}
</style>
