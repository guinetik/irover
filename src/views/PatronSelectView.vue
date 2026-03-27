<template>
  <div class="patron-root">
    <canvas ref="patronCanvas" class="patron-canvas" />

    <div class="form-area" :class="{ visible: formVisible }">
      <p class="form-title anim-item">PATRON SELECTION — MISSION SPONSORSHIP</p>
      <p class="form-sub anim-item">Your mission requires institutional backing. Choose carefully.</p>
      <div class="cards-row">
        <PatronCard
          v-for="(patron, i) in patronList"
          :key="patron.id"
          :class="['card-anim', `card-${i}`]"
          :patron="patron"
          :motto="mottos[patron.id]"
          :org-name="orgNames[patron.id]"
          :highlighted="highlightIndex === i"
          @select="selectPatron(patron.id)"
          @hover="() => { highlightIndex = i; audio.play('ui.click' as AudioSoundId) }"
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
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'

const audio = useAudio()

const router = useRouter()
const { setProfile, profile } = usePlayerProfile()

const patronCanvas = ref<HTMLCanvasElement | null>(null)
let scene: PatronScene | null = null

const highlightIndex = ref(-1)
const formVisible = ref(false)
const patronList = computed(() => Object.values(PATRONS))

const mottos: Record<PatronId, string> = {
  trc: 'Improvement at all cost.',
  isf: 'Understanding before exploitation.',
  msi: 'Home is where you build it.',
}

const orgNames: Record<PatronId, string> = {
  trc: 'Terran Resource Consortium',
  isf: 'Interplanetary Science Foundation',
  msi: 'Mars Settlement Initiative',
}

function selectPatron(id: PatronId): void {
  audio.play('ui.confirm' as AudioSoundId)
  setProfile(profile.archetype!, profile.foundation!, id)
  formVisible.value = false
  setTimeout(() => {
    router.push('/globe')
  }, 600)
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    e.preventDefault()
    highlightIndex.value = highlightIndex.value >= patronList.value.length - 1 ? 0 : highlightIndex.value + 1
    audio.play('ui.click' as AudioSoundId)
  } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    e.preventDefault()
    highlightIndex.value = highlightIndex.value <= 0 ? patronList.value.length - 1 : highlightIndex.value - 1
    audio.play('ui.click' as AudioSoundId)
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

  // Show form after skull morph completes
  setTimeout(() => {
    formVisible.value = true
  }, 3000)

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
  top: 36%;
  transform: translateX(-50%);
  width: 42%;
  max-height: 60%;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  opacity: 0;
  transition: opacity 0.6s ease;
}

.form-area.visible {
  opacity: 1;
}

/* Staggered title/subtitle animations */
.anim-item {
  opacity: 0;
  transform: perspective(600px) rotateX(-15deg) translateY(10px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.form-area.visible .anim-item:nth-child(1) {
  opacity: 1;
  transform: perspective(600px) rotateX(0) translateY(0);
  transition-delay: 0.1s;
}

.form-area.visible .anim-item:nth-child(2) {
  opacity: 1;
  transform: perspective(600px) rotateX(0) translateY(0);
  transition-delay: 0.25s;
}

/* Card flip animations — each card flips in from rotateY(180) */
.card-anim {
  opacity: 0;
  transform: perspective(800px) rotateY(180deg);
  transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.form-area.visible .card-0 {
  opacity: 1;
  transform: perspective(800px) rotateY(0);
  transition-delay: 0.4s;
}

.form-area.visible .card-1 {
  opacity: 1;
  transform: perspective(800px) rotateY(0);
  transition-delay: 0.6s;
}

.form-area.visible .card-2 {
  opacity: 1;
  transform: perspective(800px) rotateY(0);
  transition-delay: 0.8s;
}

.form-title {
  font-family: var(--font-mono);
  font-size: 15px;
  letter-spacing: 0.15em;
  color: rgba(255, 200, 140, 1);
  margin: 0;
}

.form-sub {
  font-family: var(--font-mono);
  font-size: 14px;
  color: rgba(255, 255, 255, 0.95);
  margin: 0;
}

.cards-row {
  display: flex;
  gap: 12px;
}
</style>
