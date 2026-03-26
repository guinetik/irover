<template>
  <div class="patron-root">
    <canvas ref="patronCanvas" class="patron-canvas" />

    <!-- Placeholder form area for calibration -->
    <div class="form-area">
      <p class="placeholder-label">PATRON SELECTION — FORM AREA</p>
      <button class="skip-btn" @click="skipToGlobe">[ SKIP TO GLOBE ]</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { PatronScene } from '@/three/patron/PatronScene'

const router = useRouter()
const { setProfile, profile } = usePlayerProfile()

const patronCanvas = ref<HTMLCanvasElement | null>(null)
let scene: PatronScene | null = null

function skipToGlobe(): void {
  setProfile(profile.archetype!, profile.foundation!, 'trc')
  router.push('/globe')
}

function onMouseMove(e: MouseEvent): void {
  if (!scene) return
  // Normalize to -1..1
  const x = (e.clientX / window.innerWidth) * 2 - 1
  const y = -((e.clientY / window.innerHeight) * 2 - 1)
  scene.setMouse(x, y)
}

function onResize(): void {
  if (!scene || !patronCanvas.value) return
  const rect = patronCanvas.value.getBoundingClientRect()
  scene.resize(rect.width, rect.height)
}

onMounted(async () => {
  if (!patronCanvas.value) return
  const canvas = patronCanvas.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * Math.min(window.devicePixelRatio, 2)
  canvas.height = rect.height * Math.min(window.devicePixelRatio, 2)

  scene = new PatronScene(rect.width / rect.height)
  await scene.init(canvas)
  scene.startLoop()

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  scene?.dispose()
  scene = null
})
</script>

<style scoped>
.patron-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.patron-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.form-area {
  position: absolute;
  z-index: 1;
  left: 50%;
  top: 55%;
  transform: translateX(-50%);
  width: 40%;
  height: 35%;
  border: 1px dashed rgba(196, 149, 106, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.placeholder-label {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.4);
}

.skip-btn {
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s;
}

.skip-btn:hover {
  border-color: rgba(196, 149, 106, 0.6);
  color: rgba(196, 149, 106, 1);
}
</style>
