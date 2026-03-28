<template>
  <div class="intro-video-overlay">
    <!-- TEMP: muted — drop `muted` when you want intro clip audio back -->
    <video
      ref="videoRef"
      class="intro-video"
      autoplay
      muted
      playsinline
      @ended="onVideoEnded"
    >
      <source src="/intro.mp4" type="video/mp4" />
    </video>

    <div class="telemetry-hud">
      <!-- Top-left: Mission designation + signal -->
      <div class="telemetry-corner tl">
        <ScrambleText
          :text="'MEC-7720 // MARS INSERTION'"
          :play="true"
          :speed="25"
          :scramble-frames="12"
          :stagger="1"
        />
        <div class="telemetry-line">SIGNAL: {{ signalStrength }}%</div>
        <div class="telemetry-line">TRANSMISSION: ACTIVE</div>
      </div>

      <!-- Top-right: Descent telemetry -->
      <div class="telemetry-corner tr">
        <div class="telemetry-line">VELOCITY: {{ velocity }} m/s</div>
        <div class="telemetry-line">ALTITUDE: {{ altitude }} km</div>
        <div class="telemetry-line">TRAJECTORY: NOMINAL</div>
      </div>

      <!-- Bottom-left: Coordinates (generic → real) -->
      <div class="telemetry-corner bl">
        <ScrambleText
          v-if="showRealCoords"
          :key="coordsText"
          :text="coordsText"
          :play="true"
          :speed="20"
          :scramble-frames="10"
          :stagger="1"
        />
        <div v-else class="telemetry-line">TARGET COORDINATES: RESOLVING...</div>
        <ScrambleText
          v-if="showRealCoords"
          :text="'SITE: ' + siteId.toUpperCase()"
          :play="true"
          :speed="25"
          :scramble-frames="10"
          :stagger="1"
          :delay="400"
        />
        <ScrambleText
          v-if="showRealCoords"
          :text="'OPERATOR CLASS: ' + archetypeName.toUpperCase()"
          :play="true"
          :speed="25"
          :scramble-frames="10"
          :stagger="1"
          :delay="800"
        />
      </div>

      <!-- Bottom-right: Mission clock -->
      <div class="telemetry-corner br">
        <div class="telemetry-line mission-clock">T-{{ missionClock }}</div>
      </div>
    </div>

    <!-- ESC skip prompt -->
    <Transition name="deploy-fade">
      <div v-if="canSkip" class="skip-prompt">ESC TO SKIP</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import ScrambleText from '@/components/ScrambleText.vue'

const props = defineProps<{
  siteId: string
  latitude: number
  longitude: number
  archetypeName: string
  sceneReady: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const videoEnded = ref(false)
const videoProgress = ref(0)
const elapsed = ref(0)

// Telemetry ticking values
const signalStrength = ref('97.3')
const velocity = ref('5,842')
const altitude = ref('125.4')

// Show real coordinates at ~75% video progress
const showRealCoords = computed(() => videoProgress.value >= 0.75)

const coordsText = computed(() => {
  const latDir = props.latitude >= 0 ? 'N' : 'S'
  const lonDir = props.longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(props.latitude).toFixed(2)}°${latDir}  ${Math.abs(props.longitude).toFixed(2)}°${lonDir}`
})

// Mission clock T-00:00:XX
const missionClock = computed(() => {
  const s = Math.floor(elapsed.value)
  const m = Math.floor(s / 60)
  const sec = s % 60
  const hr = Math.floor(m / 60)
  const min = m % 60
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

// Can skip only when scene is loaded and video hasn't ended yet
const canSkip = computed(() => props.sceneReady && !videoEnded.value)

let tickInterval: number | null = null

function tickTelemetry() {
  elapsed.value += 0.5

  // Random signal jitter 94–99%
  signalStrength.value = (94 + Math.random() * 5).toFixed(1)

  // Velocity ticks down from ~5842 to ~200 over the video
  const vBase = 5842 * (1 - videoProgress.value * 0.97)
  const vJitter = (Math.random() - 0.5) * 40
  velocity.value = Math.max(50, Math.round(vBase + vJitter)).toLocaleString()

  // Altitude ticks down from ~125 to ~0.3
  const aBase = 125.4 * (1 - videoProgress.value * 0.997)
  const aJitter = (Math.random() - 0.5) * 0.5
  altitude.value = Math.max(0.1, aBase + aJitter).toFixed(1)

  // Update video progress
  const v = videoRef.value
  if (v && v.duration > 0) {
    videoProgress.value = v.currentTime / v.duration
  }
}

function onVideoEnded() {
  videoEnded.value = true
  if (props.sceneReady) {
    emit('complete')
  }
  // If scene not ready, we wait — the watch below handles it
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && canSkip.value) {
    videoEnded.value = true
    emit('complete')
  }
}

// If video ended but scene wasn't ready, complete when scene becomes ready
watch(() => props.sceneReady, (ready) => {
  if (ready && videoEnded.value) {
    emit('complete')
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  tickInterval = window.setInterval(tickTelemetry, 500)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (tickInterval !== null) {
    clearInterval(tickInterval)
  }
  // Pause video to stop any lingering playback
  videoRef.value?.pause()
})
</script>

<style scoped>
.intro-video-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: #000;
}

.intro-video {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Warm Mars color grade — matches dust-atmosphere shader's warm push + shadow lift */
  filter: sepia(0.15) saturate(1.2) brightness(0.92) contrast(1.08);
}

.telemetry-hud {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  isolation: isolate;
}

.telemetry-corner {
  position: absolute;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: #ffffff;
  /* Hard white core + stacked white bloom (phosphor / CRT leak) */
  text-shadow:
    0 0 1px #fff,
    0 0 2px rgba(255, 255, 255, 1),
    0 0 8px rgba(255, 255, 255, 0.95),
    0 0 16px rgba(255, 255, 255, 0.85),
    0 0 28px rgba(255, 255, 255, 0.65),
    0 0 44px rgba(255, 255, 255, 0.45),
    0 0 64px rgba(255, 255, 255, 0.28);
  text-transform: uppercase;
  padding: 24px;
}

/* Component roots don’t inherit parent text-shadow — match corner glow */
.telemetry-corner :deep(.scramble-text) {
  color: #ffffff;
  text-shadow: inherit;
}

.telemetry-line,
.mission-clock {
  text-shadow: inherit;
}

.telemetry-corner.tl { top: 0; left: 0; }
.telemetry-corner.tr { top: 0; right: 0; text-align: right; }
.telemetry-corner.bl { bottom: 0; left: 0; }
.telemetry-corner.br { bottom: 0; right: 0; text-align: right; }

.telemetry-line {
  white-space: nowrap;
  color: #ffffff;
}

.mission-clock {
  font-size: 13px;
  color: #ffffff;
}

.skip-prompt {
  position: absolute;
  z-index: 6;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #ffffff;
  text-shadow:
    0 0 2px #fff,
    0 0 10px rgba(255, 255, 255, 0.9),
    0 0 24px rgba(255, 255, 255, 0.55);
}

.deploy-fade-enter-active,
.deploy-fade-leave-active {
  transition: opacity 0.8s ease;
}

.deploy-fade-enter-from,
.deploy-fade-leave-to {
  opacity: 0;
}

/* ── Post-processing layers (CSS equivalent of dust-atmosphere shader) ── */

/* Vignette — dark edges, matching shader's smoothstep falloff */
.intro-video-overlay::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  background: radial-gradient(
    ellipse at center,
    transparent 45%,
    rgba(0, 0, 0, 0.3) 75%,
    rgba(0, 0, 0, 0.7) 100%
  );
  pointer-events: none;
}

/* Scanlines — behind HUD copy (z-index) so type stays white, not striped gray */
.telemetry-hud::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.04) 2px,
    rgba(0, 0, 0, 0.04) 4px
  );
  pointer-events: none;
}

/* Film grain — animated noise texture via SVG filter */
.intro-video-overlay::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  opacity: 0.12;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 256px 256px;
  mix-blend-mode: overlay;
  animation: grain 0.3s steps(4) infinite;
}

@keyframes grain {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-5%, -5%); }
  50% { transform: translate(5%, 2%); }
  75% { transform: translate(-2%, 5%); }
  100% { transform: translate(0, 0); }
}

/* Chromatic aberration — offset red/cyan shadows on the video element */
.intro-video {
  text-shadow: none;
  /* The CA is achieved by layered box-shadows on the overlay container instead */
}

.intro-video-overlay .intro-video {
  /* Subtle barrel distortion feel via slight scale */
  transform: scale(1.02);
}

/* CA layer — two offset color channels via box-shadow on the overlay */
.telemetry-hud::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  /* Subtle red/cyan fringe at edges — simulates chromatic aberration */
  box-shadow:
    inset 2px 0 8px -2px rgba(255, 60, 30, 0.08),
    inset -2px 0 8px -2px rgba(30, 180, 255, 0.08);
  pointer-events: none;
}
</style>
