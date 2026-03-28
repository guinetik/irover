<template>
  <Teleport to="body">
    <Transition name="rad-decode-fade">
      <div v-if="active" class="rad-decode-overlay" @mousemove="onMouseMove">
        <canvas
          ref="canvasRef"
          :width="W"
          :height="H"
          class="rad-decode-canvas"
          @click="handleClick"
        />
        <div class="rad-hud">
          <div class="hud-top">
            <div>
              <div class="hud-label">Particles Caught</div>
              <div class="hud-value catch-count">{{ totalCaught }}</div>
            </div>
            <div style="text-align:center">
              <div class="hud-label">RAD Decode</div>
              <div class="timer-display">{{ timerText }}</div>
            </div>
            <div style="text-align:right">
              <div class="hud-label">Event</div>
              <div class="hud-value event-label" :style="{ color: eventColor }">{{ eventRarityLabel }}</div>
            </div>
          </div>
          <div class="cmb-bar"><div class="cmb-fill" :style="{ width: progressPct + '%' }" /></div>
          <div class="detector-zone" :class="{ 'detector-pulse': detectorPulseActive }">
            <div class="detector-icon">&#x2622;</div>
            <div class="detector-label">RAD</div>
          </div>
          <div class="composition">
            <div v-for="key in PTYPE_KEYS" :key="key" class="comp-col">
              <div class="comp-bar-wrap">
                <div
                  class="comp-bar-fill"
                  :style="{
                    height: compBarHeight(key) + '%',
                    background: PTYPES[key].color,
                    opacity: 0.75,
                  }"
                />
              </div>
              <div class="comp-label" :style="{ color: PTYPES[key].color }">{{ PTYPES[key].label }}</div>
              <div class="comp-count">{{ caughtCounts[key] }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import type { RadEventId, RadParticleType, RadQualityGrade } from '@/lib/radiation'
import {
  RAD_EVENT_DEFS,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  classifyByComposition,
  computeQualityGrade,
  computeSPReward,
} from '@/lib/radiation'

// ── Props & Emits ──
const props = defineProps<{
  active: boolean
  eventId: RadEventId
}>()

const emit = defineEmits<{
  complete: [{
    eventId: RadEventId
    classifiedAs: RadEventId
    confidence: number
    resolved: boolean
    caught: number
    total: number
    grade: string
    sp: number
    sideProducts: Array<{ itemId: string; quantity: number }>
  }]
}>()

// ── Constants ──
const W = 960
const H = 720
const GAME_DURATION = 20
const DETECTOR_POS = { x: 60, y: H - 60 }

const PTYPES: Record<RadParticleType, {
  id: string; color: string; glowColor: string; size: number
  speed: number; onScreen: number; label: string
}> = {
  proton:  { id: 'p+',  color: '#ff7733', glowColor: 'rgba(255,119,51,', size: 4,   speed: 2.8, onScreen: 1.5, label: 'p+' },
  neutron: { id: 'n',   color: '#6699cc', glowColor: 'rgba(102,153,204,', size: 5,   speed: 2.2, onScreen: 2.0, label: 'n' },
  gamma:   { id: 'γ',   color: '#eeeeff', glowColor: 'rgba(238,238,255,', size: 2.5, speed: 4.0, onScreen: 1.0, label: 'γ' },
  hze:     { id: 'HZE', color: '#cc55ff', glowColor: 'rgba(204,85,255,',  size: 7,   speed: 1.4, onScreen: 2.5, label: 'HZE' },
}
const PTYPE_KEYS: RadParticleType[] = ['proton', 'neutron', 'gamma', 'hze']

// ── Rate curve mapping ──
const RATE_CURVES: Record<string, (t: number) => number> = {
  'steady':       (t: number) => 0.9,
  'ramp-up':      (t: number) => 0.8 + t * 1.2,
  'peak-mid':     (t: number) => 2.0 + Math.sin(t * Math.PI) * 1.0,
  'front-loaded': (t: number) => t < 0.25 ? 1.6 : 0.08,
}

// ── Rarity color mapping ──
const RARITY_COLORS: Record<string, string> = {
  common: '#55dd88',
  uncommon: '#55bbff',
  rare: '#ff8844',
  legendary: '#cc55ff',
}

// ── Particle interface ──
interface Particle {
  x: number; y: number
  vx: number; vy: number
  type: RadParticleType
  pt: typeof PTYPES[RadParticleType]
  life: number
  trail: Array<{ x: number; y: number }>
  pulse: number
  isGhost: boolean
  opacity: number
  absorbed: boolean
  absorbStart: { x: number; y: number } | null
  absorbProgress: number
  absorbControlPoint: { x: number; y: number } | null
  size: number
}

interface CatchFlash {
  x: number; y: number
  color: string
  life: number
  label: string
}

interface DetectorPulse {
  life: number
  color: string
}

// ── Reactive state ──
const canvasRef = ref<HTMLCanvasElement | null>(null)
const totalCaught = ref(0)
const caughtCounts = ref<Record<RadParticleType, number>>({ proton: 0, neutron: 0, gamma: 0, hze: 0 })
const timerText = ref('20.0s')
const progressPct = ref(0)
const detectorPulseActive = ref(false)
const eventRarityLabel = ref('--')
const eventColor = ref('#55dd88')

// ── Internal game state ──
let gameTime = 0
let totalSpawned = 0
let emitAccumulator = 0
let particles: Particle[] = []
let catchFlashes: CatchFlash[] = []
let detectorPulses: DetectorPulse[] = []
let mouseX = W / 2
let mouseY = H / 2
let stars: Array<{ x: number; y: number; size: number; brightness: number; twinkleSpeed: number }> = []
let skyGradientTime = 0
let animFrameId = 0
let lastTime = 0
let running = false

// ── Stars ──
function generateStars() {
  stars = []
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.5,
      size: 0.5 + Math.random() * 1.5,
      brightness: 0.15 + Math.random() * 0.25,
      twinkleSpeed: 1 + Math.random() * 3,
    })
  }
}

function compBarHeight(key: RadParticleType): number {
  const maxCount = Math.max(1, ...PTYPE_KEYS.map(k => caughtCounts.value[k]))
  return (caughtCounts.value[key] / maxCount) * 100
}

// ── Pick particle type based on event composition ──
function pickParticleType(composition: Record<RadParticleType, number>): RadParticleType {
  const roll = Math.random()
  let cum = 0
  for (const key of PTYPE_KEYS) {
    cum += composition[key]
    if (roll <= cum) return key
  }
  return 'proton'
}

// ── Spawn a particle ──
function spawnParticle(typeKey: RadParticleType, isGhost: boolean) {
  const pt = PTYPES[typeKey]
  const sx = W * 0.2 + Math.random() * W * 0.6
  const sy = -10 - Math.random() * 30
  const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.6
  const speed = pt.speed * (0.8 + Math.random() * 0.4)

  totalSpawned++

  particles.push({
    x: sx, y: sy,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    type: typeKey,
    pt,
    life: 1.0,
    trail: [],
    pulse: Math.random() * Math.PI * 2,
    isGhost,
    opacity: isGhost ? 0.2 : 1.0,
    absorbed: false,
    absorbStart: null,
    absorbProgress: 0,
    absorbControlPoint: null,
    size: pt.size * (isGhost ? 0.8 : 1.0),
  })
}

// ── Update ──
function update(dt: number) {
  const eventDef = RAD_EVENT_DEFS[props.eventId]
  if (!eventDef) return

  gameTime += dt
  const progress = gameTime / GAME_DURATION

  if (gameTime >= GAME_DURATION) {
    endGame()
    return
  }

  // Update HUD refs
  timerText.value = Math.max(0, GAME_DURATION - gameTime).toFixed(1) + 's'
  progressPct.value = progress * 100

  // Emit particles via accumulator
  const rateCurveFn = RATE_CURVES[eventDef.rateCurve] ?? RATE_CURVES['steady']
  const rate = rateCurveFn(progress)
  emitAccumulator += rate * dt

  while (emitAccumulator >= 1 && totalSpawned < eventDef.totalParticles) {
    emitAccumulator -= 1
    const isGhostPhase = eventDef.id === 'forbush-decrease' && progress > 0.4
    const typeKey = pickParticleType(eventDef.composition)
    spawnParticle(typeKey, isGhostPhase)
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]

    if (p.absorbed) {
      p.absorbProgress += dt * 2.5
      if (p.absorbProgress >= 1) {
        // Reached detector
        caughtCounts.value[p.type]++
        totalCaught.value++
        detectorPulses.push({ life: 1.0, color: p.pt.color })
        detectorPulseActive.value = true
        setTimeout(() => { detectorPulseActive.value = false }, 300)
        particles.splice(i, 1)
        continue
      }
      // Bezier curve to detector
      const t = p.absorbProgress
      const ct = 1 - t
      if (!p.absorbControlPoint && p.absorbStart) {
        p.absorbControlPoint = {
          x: (p.absorbStart.x + DETECTOR_POS.x) / 2 + (Math.random() - 0.5) * 20,
          y: (p.absorbStart.y + DETECTOR_POS.y) / 2 - 40,
        }
      }
      const cp = p.absorbControlPoint!
      const start = p.absorbStart!
      p.x = ct * ct * start.x + 2 * ct * t * cp.x + t * t * DETECTOR_POS.x
      p.y = ct * ct * start.y + 2 * ct * t * cp.y + t * t * DETECTOR_POS.y
      p.opacity = 1.0 - t * 0.3
      continue
    }

    p.x += p.vx
    p.y += p.vy
    p.vy += 0.02 // gravity
    p.life -= dt * (1.0 / p.pt.onScreen)
    p.pulse += dt * 6

    p.trail.push({ x: p.x, y: p.y })
    if (p.trail.length > 10) p.trail.shift()

    // Remove if off screen or dead
    if (p.y > H + 20 || p.x < -30 || p.x > W + 30 || p.life <= 0) {
      particles.splice(i, 1)
    }
  }

  // Catch flashes
  for (let i = catchFlashes.length - 1; i >= 0; i--) {
    catchFlashes[i].life -= dt * 3
    if (catchFlashes[i].life <= 0) catchFlashes.splice(i, 1)
  }

  // Detector pulses
  for (let i = detectorPulses.length - 1; i >= 0; i--) {
    detectorPulses[i].life -= dt * 3
    if (detectorPulses[i].life <= 0) detectorPulses.splice(i, 1)
  }
}

// ── Draw ──
function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, W, H)
  skyGradientTime += 0.016

  // Mars sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H)
  skyGrad.addColorStop(0, '#1a0e06')
  skyGrad.addColorStop(0.3, '#2a1508')
  skyGrad.addColorStop(0.7, '#3d2010')
  skyGrad.addColorStop(1.0, '#4a2a14')
  ctx.fillStyle = skyGrad
  ctx.fillRect(0, 0, W, H)

  // Atmospheric dust haze
  const hazeGrad = ctx.createRadialGradient(W / 2, H, 100, W / 2, H / 2, W)
  hazeGrad.addColorStop(0, 'rgba(180,120,60,0.06)')
  hazeGrad.addColorStop(1, 'rgba(180,120,60,0)')
  ctx.fillStyle = hazeGrad
  ctx.fillRect(0, 0, W, H)

  // Stars
  stars.forEach(s => {
    const tw = 0.5 + 0.5 * Math.sin(skyGradientTime * s.twinkleSpeed)
    ctx.fillStyle = `rgba(255,240,220,${s.brightness * tw})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
    ctx.fill()
  })

  // Green radiation overlay
  const radGrad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7)
  radGrad.addColorStop(0, 'rgba(40,180,80,0.03)')
  radGrad.addColorStop(1, 'rgba(40,180,80,0)')
  ctx.fillStyle = radGrad
  ctx.fillRect(0, 0, W, H)

  // Faint green scanlines
  ctx.globalAlpha = 0.03
  for (let y = 0; y < H; y += 3) {
    const lineAlpha = 0.5 + 0.5 * Math.sin((y + skyGradientTime * 80) * 0.1)
    if (lineAlpha > 0.7) {
      ctx.fillStyle = 'rgba(80,220,120,0.5)'
      ctx.fillRect(0, y, W, 1)
    }
  }
  ctx.globalAlpha = 1

  // Particles
  particles.forEach(p => {
    const baseOpacity = p.opacity * (p.absorbed ? 1.0 : Math.min(1, p.life * 2))

    // Trail
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i]
      const ta = (i / p.trail.length) * 0.25 * baseOpacity
      ctx.fillStyle = p.pt.color
      ctx.globalAlpha = ta
      ctx.beginPath()
      ctx.arc(t.x, t.y, p.size * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // Body
    const pulse = 1 + Math.sin(p.pulse) * 0.2
    const sz = p.size * pulse

    // Glow
    ctx.shadowColor = p.pt.color
    ctx.shadowBlur = p.isGhost ? 6 : (p.type === 'hze' ? 20 : 12)
    ctx.fillStyle = p.pt.color
    ctx.globalAlpha = baseOpacity * 0.85
    ctx.beginPath()
    ctx.arc(p.x, p.y, sz, 0, Math.PI * 2)
    ctx.fill()

    // Bright core
    ctx.fillStyle = '#fff'
    ctx.globalAlpha = baseOpacity * 0.5
    ctx.beginPath()
    ctx.arc(p.x, p.y, sz * 0.35, 0, Math.PI * 2)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.globalAlpha = 1

    // HZE afterglow ring
    if (p.type === 'hze' && !p.isGhost) {
      ctx.strokeStyle = p.pt.color
      ctx.globalAlpha = baseOpacity * 0.2
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(p.x, p.y, sz * 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Gamma streak
    if (p.type === 'gamma' && !p.absorbed) {
      ctx.strokeStyle = p.pt.color
      ctx.globalAlpha = baseOpacity * 0.4
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x - p.vx * 6, p.y - p.vy * 6)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })

  // Catch flashes
  catchFlashes.forEach(f => {
    const r = (1 - f.life) * 30
    ctx.strokeStyle = f.color
    ctx.globalAlpha = f.life * 0.5
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(f.x, f.y, r, 0, Math.PI * 2)
    ctx.stroke()

    if (f.life > 0.5) {
      ctx.fillStyle = f.color
      ctx.globalAlpha = f.life
      ctx.font = 'bold 11px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText(f.label, f.x, f.y - r - 5)
      ctx.textAlign = 'left'
    }
    ctx.globalAlpha = 1
  })

  // Detector pulses on canvas
  detectorPulses.forEach(dp => {
    const r = (1 - dp.life) * 40
    ctx.strokeStyle = dp.color
    ctx.globalAlpha = dp.life * 0.4
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(DETECTOR_POS.x, DETECTOR_POS.y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  })

  // Crosshair cursor
  ctx.strokeStyle = 'rgba(100,220,130,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(mouseX, mouseY, 18, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(100,220,130,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(mouseX - 6, mouseY); ctx.lineTo(mouseX + 6, mouseY)
  ctx.moveTo(mouseX, mouseY - 6); ctx.lineTo(mouseX, mouseY + 6)
  ctx.stroke()

  // Rover deck silhouette
  ctx.fillStyle = '#0d0906'
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.lineTo(0, H - 30)
  ctx.quadraticCurveTo(W * 0.15, H - 50, W * 0.3, H - 25)
  ctx.lineTo(W * 0.7, H - 25)
  ctx.quadraticCurveTo(W * 0.85, H - 45, W, H - 20)
  ctx.lineTo(W, H)
  ctx.fill()

  // Detector glow on deck
  const detGlow = ctx.createRadialGradient(DETECTOR_POS.x, DETECTOR_POS.y + 10, 5, DETECTOR_POS.x, DETECTOR_POS.y + 10, 40)
  detGlow.addColorStop(0, 'rgba(100,220,130,0.15)')
  detGlow.addColorStop(1, 'rgba(100,220,130,0)')
  ctx.fillStyle = detGlow
  ctx.beginPath()
  ctx.arc(DETECTOR_POS.x, DETECTOR_POS.y + 10, 40, 0, Math.PI * 2)
  ctx.fill()
}

// ── Click handler ──
function handleClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas || !running) return

  const rect = canvas.getBoundingClientRect()
  const cx = (e.clientX - rect.left) * (W / rect.width)
  const cy = (e.clientY - rect.top) * (H / rect.height)

  let closest: Particle | null = null
  let closestDist = 30

  for (const p of particles) {
    if (p.absorbed) continue
    const dx = p.x - cx
    const dy = p.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < closestDist) {
      closestDist = dist
      closest = p
    }
  }

  if (closest) {
    closest.absorbed = true
    closest.absorbStart = { x: closest.x, y: closest.y }
    closest.absorbProgress = 0
    closest.opacity = 1.0
    closest.absorbControlPoint = null // will be set on first update tick

    catchFlashes.push({
      x: closest.x, y: closest.y,
      color: closest.pt.color,
      life: 1.0,
      label: closest.pt.label,
    })
  }
}

// ── Mouse move (scaled to canvas coords) ──
function onMouseMove(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  mouseX = (e.clientX - rect.left) * (W / rect.width)
  mouseY = (e.clientY - rect.top) * (H / rect.height)
}

// ── End game ──
function endGame() {
  running = false
  if (animFrameId) cancelAnimationFrame(animFrameId)

  const eventDef = RAD_EVENT_DEFS[props.eventId]
  if (!eventDef) return

  // Classify
  const classification = classifyByComposition(caughtCounts.value)
  const grade = computeQualityGrade(totalCaught.value, totalSpawned)
  const resolved = classification.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD
  const sp = computeSPReward(eventDef.sp, grade, resolved)

  emit('complete', {
    eventId: props.eventId,
    classifiedAs: classification.eventId,
    confidence: classification.confidence,
    resolved,
    caught: totalCaught.value,
    total: totalSpawned,
    grade,
    sp,
    sideProducts: resolved ? eventDef.sideProducts : [],
  })
}

// ── Game loop ──
function loop(timestamp: number) {
  if (!running) return
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05)
  lastTime = timestamp
  update(dt)
  draw()
  animFrameId = requestAnimationFrame(loop)
}

// ── Start / stop ──
function startGame() {
  const eventDef = RAD_EVENT_DEFS[props.eventId]
  if (!eventDef) return

  gameTime = 0
  totalSpawned = 0
  emitAccumulator = 0
  totalCaught.value = 0
  caughtCounts.value = { proton: 0, neutron: 0, gamma: 0, hze: 0 }
  particles = []
  catchFlashes = []
  detectorPulses = []
  mouseX = W / 2
  mouseY = H / 2
  timerText.value = '20.0s'
  progressPct.value = 0

  eventRarityLabel.value = eventDef.rarity.toUpperCase()
  eventColor.value = RARITY_COLORS[eventDef.rarity] ?? '#55dd88'

  generateStars()
  running = true
  lastTime = performance.now()
  animFrameId = requestAnimationFrame(loop)
}

function stopGame() {
  running = false
  if (animFrameId) {
    cancelAnimationFrame(animFrameId)
    animFrameId = 0
  }
}

// ── Watch active prop ──
watch(() => props.active, async (isActive) => {
  if (isActive) {
    await nextTick()
    startGame()
  } else {
    stopGame()
  }
})

onUnmounted(() => {
  stopGame()
})
</script>

<style scoped>
.rad-decode-overlay {
  position: fixed;
  inset: 0;
  z-index: 900;
  background: #050302;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: none;
  user-select: none;
  font-family: 'Oxanium', sans-serif;
  color: #e8a54b;
}

.rad-decode-canvas {
  display: block;
  border-radius: 4px;
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
}

/* HUD overlay on top of canvas */
.rad-hud {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 960px;
  height: 720px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}

.hud-top {
  position: absolute;
  top: 12px;
  left: 16px;
  right: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.hud-label {
  font-size: 9px;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(100, 200, 120, 0.5);
  font-family: 'JetBrains Mono', monospace;
}

.hud-value {
  font-size: 20px;
  font-weight: 700;
  text-shadow: 0 0 12px rgba(100, 220, 130, 0.3);
}

.catch-count {
  color: #55dd88;
}

.timer-display {
  color: rgba(100, 200, 120, 0.6);
  font-size: 14px;
}

.event-label {
  font-size: 13px;
  color: rgba(100, 200, 120, 0.5);
}

/* CMB progress bar */
.cmb-bar {
  position: absolute;
  top: 50px;
  left: 16px;
  right: 16px;
  height: 3px;
  background: rgba(100, 220, 130, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.cmb-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, rgba(100, 220, 130, 0.4), rgba(100, 220, 130, 0.15));
  border-radius: 2px;
  transition: width 0.2s linear;
}

/* Detector zone */
.detector-zone {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 80px;
  height: 80px;
  border: 2px solid rgba(100, 220, 130, 0.3);
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(100, 220, 130, 0.08) 0%, transparent 70%);
}

.detector-icon {
  font-size: 22px;
}

.detector-label {
  font-size: 8px;
  letter-spacing: 2px;
  color: rgba(100, 220, 130, 0.5);
  font-family: 'JetBrains Mono', monospace;
  margin-top: 2px;
}

.detector-pulse {
  animation: detectorPulseAnim 0.3s ease-out;
}

@keyframes detectorPulseAnim {
  0% { box-shadow: 0 0 0 0 rgba(100, 220, 130, 0.4); }
  100% { box-shadow: 0 0 20px 10px rgba(100, 220, 130, 0); }
}

/* Composition bars */
.composition {
  position: absolute;
  bottom: 12px;
  left: 120px;
  right: 16px;
  height: 50px;
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.comp-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.comp-bar-wrap {
  width: 100%;
  height: 30px;
  position: relative;
  border: 1px solid rgba(100, 220, 130, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 2px;
}

.comp-bar-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  border-radius: 1px 1px 0 0;
  transition: height 0.15s ease-out;
}

.comp-label {
  font-size: 9px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
}

.comp-count {
  font-size: 7px;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(100, 200, 120, 0.4);
  height: 10px;
}

/* Transition */
.rad-decode-fade-enter-active,
.rad-decode-fade-leave-active {
  transition: opacity 0.3s ease;
}
.rad-decode-fade-enter-from,
.rad-decode-fade-leave-to {
  opacity: 0;
}
</style>
