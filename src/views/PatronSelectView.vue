<template>
  <div class="patron-root">
    <canvas ref="patronCanvas" class="patron-canvas" />

    <div class="form-area">
      <p class="form-title">PATRON SELECTION — MISSION SPONSORSHIP</p>
      <p class="form-sub">Your mission requires institutional backing. Choose carefully.</p>
      <div class="cards-row">
        <PatronCard
          v-for="(patron, i) in patronList"
          :key="patron.id"
          :patron="patron"
          :motto="mottos[patron.id]"
          :highlighted="highlightIndex === i"
          @select="selectPatron(patron.id)"
          @hover="highlightIndex = i"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile, PATRONS, type PatronId } from '@/composables/usePlayerProfile'
import { PatronScene } from '@/three/patron/PatronScene'
import PatronCard from '@/components/patron/PatronCard.vue'

const router = useRouter()
const { setProfile, profile } = usePlayerProfile()

const patronCanvas = ref<HTMLCanvasElement | null>(null)
let scene: PatronScene | null = null

const highlightIndex = ref(-1)
const patronList = computed(() => Object.values(PATRONS))

const mottos: Record<PatronId, string> = {
  trc: 'Improvement at all cost.',
  isf: 'Understanding before exploitation.',
  msi: 'Home is where you build it.',
}

function selectPatron(id: PatronId): void {
  setProfile(profile.archetype!, profile.foundation!, id)
  router.push('/globe')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    e.preventDefault()
    highlightIndex.value = highlightIndex.value >= patronList.value.length - 1 ? 0 : highlightIndex.value + 1
  } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    e.preventDefault()
    highlightIndex.value = highlightIndex.value <= 0 ? patronList.value.length - 1 : highlightIndex.value - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightIndex.value >= 0 && highlightIndex.value < patronList.value.length) {
      selectPatron(patronList.value[highlightIndex.value].id)
    }
  }
}

function onMouseMove(e: MouseEvent): void {
  if (!scene) return
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
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
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
  top: 48%;
  transform: translateX(-50%);
  width: 65%;
  max-height: 48%;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.form-title {
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.15em;
  color: rgba(255, 200, 140, 0.9);
  margin: 0;
}

.form-sub {
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(230, 180, 130, 0.5);
  margin: 0;
}

.cards-row {
  display: flex;
  gap: 12px;
}
</style>
