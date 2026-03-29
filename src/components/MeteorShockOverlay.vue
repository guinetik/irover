<template>
  <Transition name="glitch" @enter="startNoise" @after-leave="stopNoise">
    <div v-if="active" class="shock-root">
      <canvas ref="noiseCanvas" class="noise-canvas" />
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'

defineProps<{ active: boolean }>()

const noiseCanvas = ref<HTMLCanvasElement | null>(null)
let noiseInterval: ReturnType<typeof setInterval> | null = null

function drawNoise(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = 192
  canvas.height = 192
  const img = ctx.createImageData(192, 192)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = v
    img.data[i + 1] = v * 0.6
    img.data[i + 2] = v * 0.3
    img.data[i + 3] = 160 + Math.random() * 95
  }
  ctx.putImageData(img, 0, 0)
}

function startNoise() {
  if (noiseCanvas.value) {
    drawNoise(noiseCanvas.value)
    noiseInterval = setInterval(() => {
      if (noiseCanvas.value) drawNoise(noiseCanvas.value)
    }, 40)
  }
}

function stopNoise() {
  if (noiseInterval) { clearInterval(noiseInterval); noiseInterval = null }
}

onUnmounted(stopNoise)
</script>

<style scoped>
.shock-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
  background: #000;
}

.noise-canvas {
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  opacity: 0.8;
}

.glitch-enter-active {
  transition: opacity 0.05s ease;
}
.glitch-leave-active {
  transition: opacity 0.08s ease;
}
.glitch-enter-from,
.glitch-leave-to {
  opacity: 0;
}
</style>
