<template>
  <div class="isotope-game" ref="containerRef">
    <canvas ref="canvasRef" />

    <SAMMiniGameTutorial
      :visible="!started"
      title="ISOTOPE ANALYSIS"
      icon="&#x1F52C;"
      :diagram="'LASER ━━━━ <span style=&quot;color:#b0a0d8&quot;>◇</span> prism ━━ tether<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;│<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;▼<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style=&quot;color:#378add&quot;>~~~~</span> spectrum <span style=&quot;color:#378add&quot;>~~~~</span> ← find peaks'"
      :steps="[
        { key: 'MOUSE X', text: 'Slides the prism to scan different wavelengths' },
        { text: 'Hold the laser on a peak to lock it — sharp bright peaks are real isotopes' },
        { text: 'Wide dim bumps are artifacts — locking one costs quality' },
        { text: 'Lock 5 real peaks before the 30s timer runs out' },
      ]"
      @start="onStart"
    />

    <!-- HUD overlay -->
    <div class="iso-hud-top" v-show="started">
      <div class="iso-hud-phase">PEAKS CAPTURED: {{ realLockedCount }} / 5</div>
      <div class="iso-hud-time">{{ Math.ceil(timer) }}s</div>
    </div>

    <!-- Quality bar -->
    <div class="iso-quality-bar" v-show="started">
      <div class="iso-quality-fill" :style="{ height: quality + '%', background: qualityGradient }" />
    </div>
    <div class="iso-quality-label" v-show="started">QUAL</div>

    <!-- Wavelength readout -->
    <div class="iso-freq-readout font-instrument" v-show="started">{{ freqDisplay }} nm</div>

    <!-- Hint -->
    <div class="iso-hint" v-show="started">MOUSE X to tune laser — hold on peaks to lock</div>

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
const timer = ref(30)
const realLockedCount = ref(0)
const freqDisplay = ref('0.0')
const qualityGradient = computed(() =>
  quality.value > 70
    ? 'linear-gradient(180deg, #5dc9a5, #3d9975)'
    : quality.value > 40
      ? 'linear-gradient(180deg, #ef9f27, #ba7517)'
      : 'linear-gradient(180deg, #e05030, #a03020)',
)

interface Peak {
  pos: number
  width: number
  depth: number
  real: boolean
  label: string
  locked: boolean
}

const started = ref(false)
const finished = ref(false)
const finalQuality = ref(0)

const PEAK_LABELS = [
  'C\u00b9\u00b2', 'C\u00b9\u00b3', 'D/H', 'O\u00b9\u2076', 'O\u00b9\u2078', 'S\u00b3\u00b2',
  'Fe', 'Mg', 'N\u00b9\u2074', 'Ar\u00b3\u2076', 'CO\u2082', 'H\u2082O',
]

// Baseline noise seeds (fixed per session so the wave is stable)
let noiseSeeds: number[] = []

// Gas particle system for background
interface GasParticle {
  x: number; y: number; vx: number; vy: number
  size: number; alpha: number; life: number; maxLife: number
}
let gasParticles: GasParticle[] = []

let peaks: Peak[] = []
let lockedPeaks: Peak[] = []
let lockProgress = 0
let lockTarget = -1
let spectrumOffset = 0
let gameTime = 0
let mouseX = 0.5
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
  mouseX = (e.clientX - rect.left) / rect.width
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

/** Simple seeded noise — sum of sines at different frequencies */
function baselineNoise(freq: number, t: number): number {
  let v = 0
  for (let i = 0; i < noiseSeeds.length; i++) {
    const s = noiseSeeds[i]
    v += Math.sin(freq * (12 + i * 7.3) + s + t * (0.4 + i * 0.15)) * (0.03 / (1 + i * 0.3))
  }
  return v
}

/** Evaluate the full spectrum value at a given frequency */
function spectrumAt(freq: number, t: number): number {
  let val = baselineNoise(freq, t)
  for (const p of peaks) {
    const dx = freq - p.pos
    if (p.real) {
      // Lorentzian — sharp
      val += p.depth / (1 + (dx / p.width) * (dx / p.width))
    } else {
      // Gaussian — wider, softer
      val += p.depth * Math.exp(-(dx * dx) / (2 * p.width * p.width))
    }
  }
  return val
}

function spawnGasParticle(): GasParticle {
  const maxLife = 2 + Math.random() * 3
  return {
    x: Math.random() * W,
    y: Math.random() * H * 0.55,
    vx: (Math.random() - 0.5) * 8,
    vy: (Math.random() - 0.5) * 4,
    size: 15 + Math.random() * 35,
    alpha: 0,
    life: 0,
    maxLife,
  }
}

function update(dt: number) {
  timer.value -= dt
  gameTime += dt
  spectrumOffset += dt * 0.08

  const laserFreq = spectrumOffset + mouseX * 0.8
  freqDisplay.value = (laserFreq * 1000).toFixed(1)

  // Find peak under laser
  let onPeak = -1
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i].locked) continue
    const dist = Math.abs(laserFreq - peaks[i].pos)
    if (dist < peaks[i].width * 2) { onPeak = i; break }
  }

  if (onPeak >= 0) {
    if (lockTarget === onPeak) {
      lockProgress += dt
      if (lockProgress > 0.75) {
        peaks[onPeak].locked = true
        if (peaks[onPeak].real) {
          lockedPeaks.push(peaks[onPeak])
          realLockedCount.value = lockedPeaks.length
          quality.value = Math.min(100, quality.value + 8)
        } else {
          quality.value = Math.max(0, quality.value - 12)
        }
        lockProgress = 0
        lockTarget = -1
      }
    } else {
      lockTarget = onPeak
      lockProgress = 0
    }
  } else {
    lockProgress = Math.max(0, lockProgress - dt * 2)
    if (lockProgress <= 0) lockTarget = -1
  }

  // Update gas particles
  gasParticles.forEach(p => {
    p.life += dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    const ratio = p.life / p.maxLife
    p.alpha = ratio < 0.2 ? ratio / 0.2 : ratio > 0.8 ? (1 - ratio) / 0.2 : 1
    p.alpha *= 0.06
  })
  gasParticles = gasParticles.filter(p => p.life < p.maxLife)
  while (gasParticles.length < 50) gasParticles.push(spawnGasParticle())

  // Quality hits 0 = fail
  if (quality.value <= 0) {
    running = false
    finalQuality.value = 0
    finished.value = true
    return
  }

  // End conditions
  if (timer.value <= 0 || lockedPeaks.length >= 5) {
    running = false
    finalQuality.value = Math.round(quality.value)
    finished.value = true
    return
  }
}

function draw() {
  if (!ctx) return
  const c = ctx
  c.clearRect(0, 0, W, H)

  // === BACKGROUND: gas chamber ===
  const chamberH = H * 0.55

  // Dark chamber area
  c.fillStyle = 'rgba(8,12,18,0.6)'
  c.fillRect(0, 0, W, chamberH)

  // Gas particles (soft blobs)
  for (const p of gasParticles) {
    const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
    grad.addColorStop(0, `rgba(60,100,160,${p.alpha})`)
    grad.addColorStop(1, 'rgba(60,100,160,0)')
    c.fillStyle = grad
    c.beginPath()
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    c.fill()
  }

  // === LAYOUT ===
  const margin = 40
  const gw = W - margin * 2 - 40
  const specH = H - chamberH - 50
  const specY = chamberH + 10
  const baseline = specY + specH * 0.3

  // Laser cursor X on the spectrum (maps mouseX to spectrum graph)
  const laserSpecX = margin + mouseX * gw

  // Prism sits on the laser beam, directly above the spectrum cursor
  const laserY = chamberH * 0.5
  const prismX = laserSpecX
  const prismY = laserY
  const prismSize = 14
  const beamAlpha = 0.6 + Math.sin(gameTime * 12) * 0.15

  // === LASER: source → prism (horizontal), prism → spectrum (vertical down) ===

  // Horizontal beam: source → prism
  const beamGrad = c.createLinearGradient(0, laserY - 8, 0, laserY + 8)
  beamGrad.addColorStop(0, 'rgba(224,80,48,0)')
  beamGrad.addColorStop(0.5, `rgba(224,80,48,${0.12 + Math.sin(gameTime * 8) * 0.04})`)
  beamGrad.addColorStop(1, 'rgba(224,80,48,0)')
  c.fillStyle = beamGrad
  c.fillRect(0, laserY - 8, prismX - prismSize, 16)
  // Core line
  c.strokeStyle = `rgba(255,100,60,${beamAlpha})`
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(0, laserY)
  c.lineTo(prismX - prismSize, laserY)
  c.stroke()

  // Prism — triangle (point up, base down)
  // Glow
  const prismGlow = c.createRadialGradient(prismX, prismY, 0, prismX, prismY, prismSize * 2.5)
  prismGlow.addColorStop(0, 'rgba(200,180,255,0.1)')
  prismGlow.addColorStop(1, 'rgba(200,180,255,0)')
  c.fillStyle = prismGlow
  c.beginPath()
  c.arc(prismX, prismY, prismSize * 2.5, 0, Math.PI * 2)
  c.fill()
  // Body
  c.strokeStyle = 'rgba(180,160,220,0.6)'
  c.fillStyle = 'rgba(120,100,180,0.15)'
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(prismX - prismSize, prismY - prismSize * 0.7)
  c.lineTo(prismX, prismY + prismSize * 0.7)
  c.lineTo(prismX + prismSize, prismY - prismSize * 0.7)
  c.closePath()
  c.fill()
  c.stroke()

  // Tether: prism → right edge (cable/rail)
  c.strokeStyle = 'rgba(160,150,140,0.3)'
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(prismX + prismSize, laserY)
  c.lineTo(W, laserY)
  c.stroke()
  // Small anchor on right edge
  c.fillStyle = 'rgba(160,150,140,0.4)'
  c.fillRect(W - 4, laserY - 4, 4, 8)

  // Refracted beam: straight down from prism to spectrum
  const refractStartY = prismY + prismSize * 0.7
  const refractEndY = specY + specH
  // Glow
  const refGrad = c.createLinearGradient(prismX - 4, 0, prismX + 4, 0)
  refGrad.addColorStop(0, 'rgba(224,80,48,0)')
  refGrad.addColorStop(0.5, `rgba(224,80,48,0.08)`)
  refGrad.addColorStop(1, 'rgba(224,80,48,0)')
  c.fillStyle = refGrad
  c.fillRect(prismX - 4, refractStartY, 8, refractEndY - refractStartY)
  // Core line
  c.strokeStyle = `rgba(255,100,60,${beamAlpha * 0.5})`
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(prismX, refractStartY)
  c.lineTo(prismX, refractEndY)
  c.stroke()

  // Glow dot at bottom
  const dotGrad = c.createRadialGradient(prismX, refractEndY, 0, prismX, refractEndY, 8)
  dotGrad.addColorStop(0, 'rgba(255,120,60,0.6)')
  dotGrad.addColorStop(1, 'rgba(255,120,60,0)')
  c.fillStyle = dotGrad
  c.beginPath()
  c.arc(prismX, refractEndY, 8, 0, Math.PI * 2)
  c.fill()

  // Chamber border
  c.strokeStyle = 'rgba(55,138,221,0.12)'
  c.lineWidth = 1
  c.beginPath()
  c.moveTo(0, chamberH)
  c.lineTo(W, chamberH)
  c.stroke()

  // Labels
  c.fillStyle = 'rgba(224,80,48,0.25)'
  c.font = '8px "IBM Plex Mono"'
  c.fillText('LASER SOURCE', 6, laserY - 10)
  c.fillStyle = 'rgba(55,138,221,0.2)'
  c.fillText('GAS SAMPLE CHAMBER', 6, 14)

  // Axis line
  c.strokeStyle = 'rgba(55,138,221,0.15)'
  c.lineWidth = 0.5
  c.beginPath()
  c.moveTo(margin, baseline)
  c.lineTo(margin + gw, baseline)
  c.stroke()

  // Draw continuous spectrum — one unbroken waveform
  c.strokeStyle = '#378add'
  c.lineWidth = 1.5
  c.shadowColor = 'rgba(55,138,221,0.4)'
  c.shadowBlur = 6
  c.beginPath()
  const step = 2 // pixels per sample for performance
  for (let px = 0; px <= gw; px += step) {
    const freq = spectrumOffset + (px / gw) * 0.8
    const val = spectrumAt(freq, gameTime)
    const y = baseline + val * specH * 0.65
    px === 0 ? c.moveTo(margin + px, y) : c.lineTo(margin + px, y)
  }
  c.stroke()
  c.shadowBlur = 0

  // Peak markers (locked peaks get labels)
  for (const p of peaks) {
    const screenX = margin + ((p.pos - spectrumOffset) / 0.8) * gw
    if (screenX < margin - 10 || screenX > margin + gw + 10) continue
    const val = spectrumAt(p.pos, gameTime)
    const peakY = baseline + val * specH * 0.65

    if (p.locked) {
      c.fillStyle = p.real ? 'rgba(93,201,165,0.8)' : 'rgba(224,80,48,0.6)'
      c.font = '9px "IBM Plex Mono"'
      c.textAlign = 'center'
      c.fillText(p.real ? p.label : 'ARTIFACT', screenX, peakY + 14)
      // Small marker dot
      c.beginPath()
      c.arc(screenX, peakY, 3, 0, Math.PI * 2)
      c.fill()
      c.textAlign = 'left'
    }
  }

  // (refracted beam already marks the cursor position)

  // Lock progress ring
  if (lockTarget >= 0 && lockProgress > 0) {
    const p = peaks[lockTarget]
    const sx = margin + ((p.pos - spectrumOffset) / 0.8) * gw
    const val = spectrumAt(p.pos, gameTime)
    const sy = baseline + val * specH * 0.65
    c.strokeStyle = '#e8a060'
    c.lineWidth = 2
    c.beginPath()
    c.arc(sx, sy, 12, -Math.PI / 2, -Math.PI / 2 + (lockProgress / 0.75) * Math.PI * 2)
    c.stroke()
  }

  // Locked peaks list (right side)
  c.fillStyle = '#5dc9a5'
  c.font = '10px "IBM Plex Mono"'
  const listX = W - 100
  for (let i = 0; i < lockedPeaks.length; i++) {
    c.fillText('> ' + lockedPeaks[i].label, listX, chamberH + 24 + i * 16)
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

onMounted(() => {
  // Baseline noise seeds
  noiseSeeds = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2)

  // Generate peaks — spread evenly, no dead zones
  peaks = []
  const TOTAL_PEAKS = 20
  const RANGE = 3.4
  for (let i = 0; i < TOTAL_PEAKS; i++) {
    const real = i < 7
    const slot = (i / TOTAL_PEAKS) * RANGE + 0.05
    const jitter = (Math.random() - 0.5) * (RANGE / TOTAL_PEAKS) * 0.6
    peaks.push({
      pos: slot + jitter,
      width: real ? 0.008 + Math.random() * 0.012 : 0.015 + Math.random() * 0.018,
      depth: real ? 0.5 + Math.random() * 0.4 : 0.25 + Math.random() * 0.35,
      real,
      label: PEAK_LABELS[i % PEAK_LABELS.length],
      locked: false,
    })
  }
  // Shuffle
  for (let i = peaks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[peaks[i], peaks[j]] = [peaks[j], peaks[i]]
  }

  lockedPeaks = []
  lockProgress = 0
  lockTarget = -1
  spectrumOffset = 0
  gameTime = 0
  gasParticles = []

  resize()
  window.addEventListener('resize', resize)
  containerRef.value?.addEventListener('mousemove', handleMouseMove)
})

function onStart() {
  started.value = true
  lastTime = performance.now()
  animId = requestAnimationFrame(loop)
}

onUnmounted(() => {
  running = false
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
})
</script>

<style scoped>
.isotope-game {
  position: relative;
  width: 100%;
  height: 100%;
  background: #050810;
  cursor: crosshair;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.iso-hud-top {
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

.iso-hud-phase,
.iso-hud-time {
  background: rgba(10, 5, 2, 0.8);
  border: 1px solid rgba(196, 117, 58, 0.2);
  border-radius: 6px;
  padding: 6px 12px;
  color: #e8a060;
}

.iso-quality-bar {
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

.iso-quality-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  transition: height 0.3s;
  border-radius: 3px;
}

.iso-quality-label {
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

.iso-freq-readout {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 22px;
  font-weight: bold;
  color: #e05030;
  pointer-events: none;
  text-shadow: 0 0 12px rgba(224, 80, 48, 0.3);
}

.iso-hint {
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
