<template>
  <div class="pyrolysis-game" ref="containerRef">
    <canvas ref="canvasRef" />

    <!-- HUD overlay -->
    <div class="pyro-hud-top">
      <div class="pyro-hud-phase">PHASE {{ phase + 1 }}/4 — {{ phaseName }}</div>
      <div class="pyro-hud-time">{{ Math.floor(gameTime) }}s / 20s</div>
    </div>

    <!-- Quality bar -->
    <div class="pyro-quality-bar">
      <div class="pyro-quality-fill" :style="{ height: quality + '%', background: qualityGradient }" />
    </div>
    <div class="pyro-quality-label">QUAL</div>

    <!-- Current temperature -->
    <div class="pyro-temp-readout font-instrument">{{ Math.round(temperature) }}°C</div>

    <!-- Target hint -->
    <div v-if="currentPhase" class="pyro-target-hint">TARGET: {{ currentPhase.target }}°C ±{{ currentPhase.range }}</div>

    <!-- Hint -->
    <div class="pyro-hint">MOUSE Y to control oven temperature</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

defineProps<{
  modeId: string
  sampleId: string
}>()

const emit = defineEmits<{
  complete: [quality: number]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// Game state
const phases = [
  { name: 'WATER RELEASE', target: 180, range: 40 },
  { name: 'SULFUR EXTRACTION', target: 350, range: 35 },
  { name: 'ORGANIC VOLATILES', target: 520, range: 30 },
  { name: 'DEEP REFRACTORY', target: 720, range: 40 },
]

const phase = ref(0)
const currentPhase = computed(() => phases[Math.min(phase.value, 3)] ?? null)
const phaseName = computed(() => currentPhase.value?.name ?? 'COMPLETE')
const temperature = ref(100)
const quality = ref(50)
const gameTime = ref(0)
const qualityGradient = computed(() =>
  quality.value > 70
    ? 'linear-gradient(180deg, #5dc9a5, #3d9975)'
    : quality.value > 40
      ? 'linear-gradient(180deg, #ef9f27, #ba7517)'
      : 'linear-gradient(180deg, #e05030, #a03020)',
)

let mouseY = 0.5
let history: number[] = []
let animId = 0
let lastTime = 0
let running = true
let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let dpr = 1

function handleMouseMove(e: MouseEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  mouseY = 1 - (e.clientY - rect.top) / rect.height
}

function resize() {
  if (!canvasRef.value || !containerRef.value) return
  dpr = window.devicePixelRatio || 1
  W = containerRef.value.clientWidth
  H = containerRef.value.clientHeight
  canvasRef.value.width = W * dpr
  canvasRef.value.height = H * dpr
  ctx = canvasRef.value.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function update(dt: number) {
  // Heating: mouse Y controls heater power (0 at bottom, 850 at top)
  const heaterPower = mouseY * 850
  // Heat gain — lerp toward heater target
  temperature.value += (heaterPower - temperature.value) * 0.035
  // Mild passive heat loss toward ambient
  const heatLoss = (temperature.value - 20) * 0.003
  temperature.value -= heatLoss
  temperature.value = Math.max(20, Math.min(830, temperature.value))

  history.push(temperature.value)
  const maxLen = W - 80
  if (history.length > maxLen) history.shift()

  // Quality — in band: slow gain. Out of band: drain scales with distance
  const p = phases[Math.min(phase.value, 3)]
  const dist = Math.abs(temperature.value - p.target)
  const inBand = dist < p.range
  if (inBand) {
    quality.value = Math.min(100, quality.value + dt * 10)
  } else {
    // Further from target = faster drain
    const penalty = 6 + (dist / 100) * 12
    quality.value = Math.max(0, quality.value - dt * penalty)
  }

  // Quality hits 0 = experiment fails
  if (quality.value <= 0) {
    running = false
    emit('complete', 0)
    return
  }

  // Phase advancement
  gameTime.value += dt
  if (gameTime.value > (phase.value + 1) * 5) {
    phase.value++
    if (phase.value >= 4) {
      running = false
      emit('complete', Math.round(quality.value))
      return
    }
  }
}

function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const p = phases[Math.min(phase.value, 3)]
  const margin = 50
  const gw = W - margin * 2 - 40
  const gh = H - 80
  const gx = margin
  const gy = 40

  // Grid lines
  ctx.strokeStyle = 'rgba(196,117,58,0.08)'
  ctx.lineWidth = 0.5
  for (let t = 0; t <= 800; t += 100) {
    const y = gy + gh - (t / 830) * gh
    ctx.beginPath()
    ctx.moveTo(gx, y)
    ctx.lineTo(gx + gw, y)
    ctx.stroke()
    ctx.fillStyle = 'rgba(196,117,58,0.25)'
    ctx.font = '9px Courier New'
    ctx.fillText(t + '°C', 4, y + 3)
  }

  // Target band
  const bandTop = gy + gh - ((p.target + p.range) / 830) * gh
  const bandBot = gy + gh - ((p.target - p.range) / 830) * gh
  ctx.fillStyle = 'rgba(93,201,165,0.08)'
  ctx.fillRect(gx, bandTop, gw, bandBot - bandTop)
  ctx.strokeStyle = 'rgba(93,201,165,0.3)'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath(); ctx.moveTo(gx, bandTop); ctx.lineTo(gx + gw, bandTop); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(gx, bandBot); ctx.lineTo(gx + gw, bandBot); ctx.stroke()
  ctx.setLineDash([])

  // Temperature history line
  if (history.length > 1) {
    const inBand = Math.abs(temperature.value - p.target) < p.range
    ctx.strokeStyle = inBand ? '#e8a060' : '#e05030'
    ctx.lineWidth = 2
    ctx.shadowColor = inBand ? 'rgba(232,160,96,0.5)' : 'rgba(224,80,48,0.3)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    for (let i = 0; i < history.length; i++) {
      const x = gx + (i / Math.max(1, maxLen())) * gw
      const y = gy + gh - (history[i] / 830) * gh
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.shadowBlur = 0
  }
}

function maxLen() {
  return W - 80
}

function loop(now: number) {
  if (!running) return
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  update(dt)
  draw()
  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  containerRef.value?.addEventListener('mousemove', handleMouseMove)
  lastTime = performance.now()
  animId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
.pyrolysis-game {
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

.pyro-hud-top {
  position: absolute;
  top: 12px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  font-family: var(--font-ui);
  font-size: 10px;
  letter-spacing: 0.12em;
}

.pyro-hud-phase,
.pyro-hud-time {
  background: rgba(10, 5, 2, 0.8);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  color: #e8a060;
}

.pyro-quality-bar {
  position: absolute;
  right: 16px;
  top: 60px;
  width: 28px;
  height: 180px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 4px;
  overflow: hidden;
  pointer-events: none;
}

.pyro-quality-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  transition: height 0.3s;
  border-radius: 3px;
}

.pyro-quality-label {
  position: absolute;
  right: 16px;
  top: 245px;
  font-family: var(--font-ui);
  font-size: 8px;
  letter-spacing: 0.15em;
  color: rgba(196, 117, 58, 0.4);
  pointer-events: none;
  text-align: center;
  width: 28px;
}

.pyro-temp-readout {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 22px;
  font-weight: bold;
  color: #e8a060;
  pointer-events: none;
  text-shadow: 0 0 12px rgba(232, 160, 96, 0.3);
}

.pyro-target-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 9px;
  letter-spacing: 0.1em;
  color: rgba(93, 201, 165, 0.5);
  pointer-events: none;
}

.pyro-hint {
  position: absolute;
  bottom: 12px;
  right: 16px;
  font-family: var(--font-ui);
  font-size: 9px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.1em;
  pointer-events: none;
}
</style>
