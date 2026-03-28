<template>
  <Teleport to="body">
    <div v-if="active" class="death-root">
      <!-- Phase 1: White flash -->
      <div class="flash" :class="{ visible: phase === 'flash' }" />

      <!-- Phase 2: Static noise -->
      <div class="static" :class="{ visible: phase === 'static' }">
        <canvas ref="noiseCanvas" class="noise-canvas" />
      </div>

      <!-- Phase 3: Fade to black + terminal -->
      <div class="terminal" :class="{ visible: phase === 'terminal' }">
        <div class="terminal-content font-instrument">
          <p class="signal-lost">
            <ScrambleText text="SIGNAL LOST" :play="phase === 'terminal'" :speed="25" />
          </p>
          <p class="detail">
            <ScrambleText text="ROVER TELEMETRY: NO RESPONSE" :play="phase === 'terminal'" :delay="800" :speed="20" />
          </p>
          <p class="detail">
            <ScrambleText :text="DEATH_MESSAGES[cause ?? 'meteor'].status" :play="phase === 'terminal'" :delay="1600" :speed="20" />
          </p>
          <button class="restart-btn" :class="{ visible: showRestart }" @click="$emit('restart')">
            <ScrambleText text="[ RESTART MISSION ]" :play="showRestart" :delay="200" />
          </button>
          <button class="restart-btn site-btn" :class="{ visible: showRestart }" @click="$emit('siteSelect')">
            <ScrambleText text="[ SITE SELECT ]" :play="showRestart" :delay="400" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import ScrambleText from '@/components/ScrambleText.vue'

export type DeathCause = 'meteor' | 'rtg'

const DEATH_MESSAGES: Record<DeathCause, { status: string }> = {
  meteor: { status: 'LAST KNOWN STATUS: CATASTROPHIC IMPACT' },
  rtg: { status: 'LAST KNOWN STATUS: RTG FAILURE — TOTAL POWER LOSS' },
}

const props = defineProps<{ active: boolean; cause?: DeathCause }>()
defineEmits<{
  (e: 'restart'): void
  (e: 'siteSelect'): void
}>()

type Phase = 'flash' | 'static' | 'terminal'
const phase = ref<Phase>('flash')
const showRestart = ref(false)
const noiseCanvas = ref<HTMLCanvasElement | null>(null)
let noiseInterval: ReturnType<typeof setInterval> | null = null

function drawNoise(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = 256
  canvas.height = 256
  const img = ctx.createImageData(256, 256)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = v
    img.data[i + 1] = v * 0.6
    img.data[i + 2] = v * 0.3
    img.data[i + 3] = 200 + Math.random() * 55
  }
  ctx.putImageData(img, 0, 0)
}

watch(() => props.active, (active) => {
  if (!active) return
  phase.value = 'flash'
  showRestart.value = false

  setTimeout(() => {
    phase.value = 'static'
    if (noiseCanvas.value) {
      noiseInterval = setInterval(() => {
        if (noiseCanvas.value) drawNoise(noiseCanvas.value)
      }, 50)
    }
  }, 300)

  setTimeout(() => {
    phase.value = 'terminal'
    if (noiseInterval) { clearInterval(noiseInterval); noiseInterval = null }
  }, 1500)

  setTimeout(() => {
    showRestart.value = true
  }, 4000)
})

onUnmounted(() => {
  if (noiseInterval) clearInterval(noiseInterval)
})
</script>

<style scoped>
.death-root {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.flash {
  position: absolute;
  inset: 0;
  background: white;
  opacity: 0;
  transition: opacity 0.1s;
}
.flash.visible { opacity: 1; }

.static {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition: opacity 0.2s;
}
.static.visible { opacity: 1; }

.noise-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  opacity: 0.7;
}

.terminal {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 0;
  transition: opacity 1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}
.terminal.visible { opacity: 1; }

.terminal-content {
  text-align: center;
  color: rgba(230, 180, 130, 1);
}

.signal-lost {
  font-size: 28px;
  letter-spacing: 0.2em;
  margin-bottom: 24px;
}

.detail {
  font-size: 14px;
  color: rgba(230, 180, 130, 0.7);
  margin: 8px 0;
  letter-spacing: 0.1em;
}

.restart-btn {
  display: block;
  margin: 12px auto 0;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 16px;
  color: #ff9932;
  cursor: pointer;
  letter-spacing: 0.12em;
  opacity: 0;
  transition: opacity 0.5s, color 0.15s, text-shadow 0.15s;
  text-shadow: 0 0 10px rgba(255, 153, 50, 0.5);
}
.restart-btn.visible { opacity: 1; }
.restart-btn:hover {
  color: #ffb060;
  text-shadow: 0 0 14px rgba(255, 153, 50, 0.7), 0 0 30px rgba(255, 153, 50, 0.3);
}

.site-btn {
  margin-top: 8px;
  font-size: 14px;
  color: rgba(255, 153, 50, 0.6);
}
</style>
