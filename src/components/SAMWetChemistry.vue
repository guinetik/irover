<template>
  <div class="wetchem-game" ref="containerRef">
    <canvas ref="canvasRef" />

    <SAMMiniGameTutorial
      :visible="!started"
      title="WET CHEMISTRY"
      icon="&#x1F9EA;"
      :diagram="'<span style=&quot;color:#e05030&quot;>HCl</span> &nbsp; <span style=&quot;color:#ef9f27&quot;>CH₂Cl₂</span> &nbsp; <span style=&quot;color:#378add&quot;>H₂O</span><br>▕██▏ ▕██▏ ▕██▏ ← drag to match <span style=&quot;color:#5dc9a5&quot;>---</span> targets<br>then press SPACE'"
      :steps="[
        { key: 'DRAG', text: 'Click and drag the three reagent sliders to set concentration levels' },
        { text: 'Green dashed lines show the target — match them as closely as you can' },
        { key: 'SPACE', text: 'Press to begin the 10-second reaction' },
        { text: 'Targets drift during the reaction — closer = higher quality' },
      ]"
      @start="onStart"
    />

    <!-- HUD overlay -->
    <div class="wc-hud-top" v-show="started">
      <div class="wc-hud-phase">{{ reacting ? 'ANALYZING' : 'SET REAGENT LEVELS' }}</div>
      <div class="wc-hud-time">{{ reacting ? `${Math.floor(reactionTime)}s / 10s` : '—' }}</div>
    </div>

    <!-- Quality bar -->
    <div class="wc-quality-bar" v-show="started">
      <div class="wc-quality-fill" :style="{ height: quality + '%', background: qualityGradient }" />
    </div>
    <div class="wc-quality-label" v-show="started">QUAL</div>

    <!-- Hint -->
    <div class="wc-hint" v-show="started">{{ reacting ? 'REACTION IN PROGRESS...' : 'CLICK + DRAG sliders — press SPACE to run' }}</div>

    <SAMMiniGameResult
      :visible="finished"
      :quality="finalQuality"
      @continue="emit('complete', finalQuality)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SAMMiniGameTutorial from '@/components/SAMMiniGameTutorial.vue'
import SAMMiniGameResult from '@/components/SAMMiniGameResult.vue'

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
const quality = ref(50)
const reacting = ref(false)
const reactionTime = ref(0)
const qualityGradient = computed(() =>
  quality.value > 70
    ? 'linear-gradient(180deg, #5dc9a5, #3d9975)'
    : quality.value > 40
      ? 'linear-gradient(180deg, #ef9f27, #ba7517)'
      : 'linear-gradient(180deg, #e05030, #a03020)',
)

const started = ref(false)
const finished = ref(false)
const finalQuality = ref(0)

let reagents = [50, 50, 50]
let sweetSpots = [50, 50, 50]
let bubbles: { x: number; y: number; vy: number; life: number; size: number }[] = []
let draggingSlider = -1
let animId = 0
let lastTime = 0
let running = true
let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let dpr = 1

const LABELS = ['HCl 6M', 'CH\u2082Cl\u2082', 'H\u2082O']
const COLORS = ['#e05030', '#ef9f27', '#378add']
const SLIDER_PAD_TOP = 60
const SLIDER_PAD_BOT = 60

function sliderX(i: number): number {
  return W * 0.2 + i * (W * 0.25)
}
function sliderTop(): number { return SLIDER_PAD_TOP }
function sliderBot(): number { return H - SLIDER_PAD_BOT }

function handleMouseDown(e: MouseEvent) {
  if (reacting.value) return
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  for (let i = 0; i < 3; i++) {
    if (Math.abs(mx - sliderX(i)) < 30) {
      draggingSlider = i
      break
    }
  }
}

function handleMouseUp() {
  draggingSlider = -1
}

function handleMouseMove(e: MouseEvent) {
  if (draggingSlider < 0 || !containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  const my = e.clientY - rect.top
  const sTop = sliderTop()
  const sBot = sliderBot()
  const pct = 1 - (my - sTop) / (sBot - sTop)
  reagents[draggingSlider] = Math.max(0, Math.min(100, pct * 100))
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space' && !reacting.value && running) {
    e.preventDefault()
    reacting.value = true
    reactionTime.value = 0
  }
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
  if (reacting.value) {
    reactionTime.value += dt

    // Sweet spots drift slowly
    for (let i = 0; i < 3; i++) {
      sweetSpots[i] += Math.sin(reactionTime.value * 2 + i) * 0.3
    }

    // Quality: accuracy based on distance to sweet spots
    let totalError = 0
    for (let i = 0; i < 3; i++) totalError += Math.abs(reagents[i] - sweetSpots[i])
    const accuracy = Math.max(0, 100 - totalError)
    quality.value = quality.value * 0.95 + accuracy * 0.05

    // Spawn bubbles
    if (Math.random() < 0.3) {
      bubbles.push({
        x: W * 0.5 + (Math.random() - 0.5) * 60,
        y: H * 0.5,
        vy: -20 - Math.random() * 40,
        life: 1,
        size: 2 + Math.random() * 4,
      })
    }
    bubbles.forEach(b => { b.y += b.vy * dt; b.life -= dt * 0.8 })
    bubbles = bubbles.filter(b => b.life > 0)

    // Quality hits 0 = fail
    if (quality.value <= 0) {
      running = false
      finalQuality.value = 0
      finished.value = true
      return
    }

    // Time up = complete
    if (reactionTime.value > 10) {
      running = false
      finalQuality.value = Math.round(quality.value)
      finished.value = true
      return
    }
  }
}

function draw() {
  if (!ctx) return
  const c = ctx
  c.clearRect(0, 0, W, H)

  const sTop = sliderTop()
  const sBot = sliderBot()
  const sh = sBot - sTop

  for (let i = 0; i < 3; i++) {
    const sx = sliderX(i)

    // Beaker outline
    c.strokeStyle = 'rgba(196,117,58,0.2)'
    c.lineWidth = 1
    c.beginPath()
    c.roundRect(sx - 20, sTop, 40, sh, 4)
    c.stroke()

    // Fill level
    const fillH = (reagents[i] / 100) * sh
    c.fillStyle = COLORS[i] + '30'
    c.beginPath()
    c.roundRect(sx - 18, sBot - fillH, 36, fillH, 3)
    c.fill()

    // Sweet spot marker — always visible so player can aim
    const ssY = sBot - (sweetSpots[i] / 100) * sh
    c.strokeStyle = '#5dc9a5'
    c.lineWidth = 1
    c.setLineDash([3, 3])
    c.beginPath()
    c.moveTo(sx - 22, ssY)
    c.lineTo(sx + 22, ssY)
    c.stroke()
    c.setLineDash([])

    // Fill level indicator dot
    const fillY = sBot - fillH
    c.fillStyle = COLORS[i]
    c.beginPath()
    c.arc(sx, fillY, 5, 0, Math.PI * 2)
    c.fill()

    // Label
    c.fillStyle = '#a08060'
    c.font = '10px "IBM Plex Mono"'
    c.textAlign = 'center'
    c.fillText(LABELS[i], sx, sBot + 16)
    c.fillText(Math.round(reagents[i]) + '%', sx, sTop - 8)
    c.textAlign = 'left'
  }

  // Reaction vessel (center circle)
  c.strokeStyle = 'rgba(196,117,58,0.15)'
  c.lineWidth = 1
  c.beginPath()
  c.arc(W * 0.5, H * 0.5, 40, 0, Math.PI * 2)
  c.stroke()

  // Bubbles
  bubbles.forEach(b => {
    c.fillStyle = `rgba(93,201,165,${(b.life * 0.6).toFixed(2)})`
    c.beginPath()
    c.arc(b.x, b.y, b.size, 0, Math.PI * 2)
    c.fill()
  })

  // Prompt to start
  if (!reacting.value) {
    c.fillStyle = 'rgba(196,117,58,0.3)'
    c.font = '11px "IBM Plex Mono"'
    c.textAlign = 'center'
    c.fillText('[ SPACE ] to begin reaction', W * 0.5, H * 0.5 + 4)
    c.textAlign = 'left'
  }
}

function loop(now: number) {
  if (!running) return
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  update(dt)
  draw()
  animId = requestAnimationFrame(loop)
}

function onStart() {
  started.value = true
  lastTime = performance.now()
  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  // Init sweet spots with some randomness
  sweetSpots = [30 + Math.random() * 40, 30 + Math.random() * 40, 30 + Math.random() * 40]
  reagents = [50, 50, 50]
  bubbles = []

  resize()
  window.addEventListener('resize', resize)
  containerRef.value?.addEventListener('mousedown', handleMouseDown)
  window.addEventListener('mouseup', handleMouseUp)
  containerRef.value?.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  running = false
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  containerRef.value?.removeEventListener('mousedown', handleMouseDown)
  window.removeEventListener('mouseup', handleMouseUp)
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.wetchem-game {
  position: relative;
  width: 100%;
  height: 100%;
  background: #080503;
  cursor: ns-resize;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.wc-hud-top {
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

.wc-hud-phase,
.wc-hud-time {
  background: rgba(10, 5, 2, 0.8);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  color: #e8a060;
}

.wc-quality-bar {
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

.wc-quality-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  transition: height 0.3s;
  border-radius: 3px;
}

.wc-quality-label {
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

.wc-hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 9px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.1em;
  pointer-events: none;
  white-space: nowrap;
}
</style>
