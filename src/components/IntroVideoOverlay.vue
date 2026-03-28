<template>
  <div class="intro-video-overlay">
    <video
      ref="videoRef"
      class="intro-video"
      autoplay
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
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.telemetry-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.telemetry-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(228, 147, 62, 0.5);
  text-transform: uppercase;
  padding: 24px;
}

.telemetry-corner.tl { top: 0; left: 0; }
.telemetry-corner.tr { top: 0; right: 0; text-align: right; }
.telemetry-corner.bl { bottom: 0; left: 0; }
.telemetry-corner.br { bottom: 0; right: 0; text-align: right; }

.telemetry-line {
  white-space: nowrap;
}

.mission-clock {
  font-size: 13px;
  color: rgba(228, 147, 62, 0.6);
}

.skip-prompt {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(228, 147, 62, 0.5);
}

.deploy-fade-enter-active,
.deploy-fade-leave-active {
  transition: opacity 0.8s ease;
}

.deploy-fade-enter-from,
.deploy-fade-leave-to {
  opacity: 0;
}

/* Subtle scanline effect */
.telemetry-hud::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
}
</style>
