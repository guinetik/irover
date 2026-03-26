<template>
  <div class="create-root">
  <canvas ref="terminalCanvas" class="terminal-canvas" />
  <div class="create-view">
    <header v-if="currentStep <= 5" class="header">
      <p class="org">MARS EXPLORATION CONSORTIUM — OPERATOR APPLICATION PORTAL v7.3.1</p>
      <p class="form">Form MEC-7720-B | Remote Vehicle Operations Division</p>
      <p class="section">SECTION {{ currentStep }} OF 5 — {{ sectionTitle }}</p>
    </header>

    <main class="content">
      <Transition name="fade" mode="out-in">
        <StepArchetype
          v-if="currentStep === 1"
          key="archetype"
          v-model="archetype"
        />
        <StepMotivation
          v-else-if="currentStep === 2"
          key="motivation"
          v-model="motivation"
        />
        <StepOrigin
          v-else-if="currentStep === 3"
          key="origin"
          v-model="origin"
        />
        <StepFoundation
          v-else-if="currentStep === 4"
          key="foundation"
          v-model="foundation"
        />
        <StepPosition
          v-else-if="currentStep === 5"
          key="position"
          v-model="position"
        />
        <ProcessingSequence
          v-else-if="currentStep === 6"
          key="processing"
          :position-choice="position!"
          @continue="currentStep = 7"
        />
        <AcceptanceScreen
          v-else-if="currentStep === 7"
          key="acceptance"
          @accept="onAccept"
        />
      </Transition>
    </main>

    <footer v-if="currentStep <= 5" class="nav">
      <button
        v-if="currentStep > 1"
        class="nav-btn"
        @click="currentStep--"
      >[ &lt; BACK ]</button>
      <span v-else />
      <button
        class="nav-btn"
        :disabled="!canAdvance"
        @click="currentStep++"
      >[ NEXT &gt; ]</button>
    </footer>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile, type ArchetypeId, type FoundationId, type OriginId, type MotivationId } from '@/composables/usePlayerProfile'
import StepArchetype from '@/components/create/StepArchetype.vue'
import StepMotivation from '@/components/create/StepMotivation.vue'
import StepOrigin from '@/components/create/StepOrigin.vue'
import StepFoundation from '@/components/create/StepFoundation.vue'
import StepPosition from '@/components/create/StepPosition.vue'
import type { PositionId } from '@/components/create/StepPosition.vue'
import ProcessingSequence from '@/components/create/ProcessingSequence.vue'
import AcceptanceScreen from '@/components/create/AcceptanceScreen.vue'
import { TerminalScene } from '@/three/terminal/TerminalScene'

const terminalCanvas = ref<HTMLCanvasElement | null>(null)
let terminalScene: TerminalScene | null = null

onMounted(async () => {
  if (!terminalCanvas.value) return
  const canvas = terminalCanvas.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * Math.min(window.devicePixelRatio, 2)
  canvas.height = rect.height * Math.min(window.devicePixelRatio, 2)
  terminalScene = new TerminalScene(rect.width / rect.height)
  await terminalScene.init(canvas, (phase) => {
    console.log('Phase:', phase)
  })
  terminalScene.startLoop()
})

onUnmounted(() => {
  terminalScene?.dispose()
})

const router = useRouter()
const { setProfile, setIdentity } = usePlayerProfile()

const currentStep = ref(1)
const archetype = ref<ArchetypeId | null>(null)
const motivation = ref<MotivationId | null>(null)
const origin = ref<OriginId | null>(null)
const foundation = ref<FoundationId | null>(null)
const position = ref<PositionId | null>(null)

const sectionTitles: Record<number, string> = {
  1: 'OPERATOR PROFILE',
  2: 'PSYCHOLOGICAL EVALUATION',
  3: 'BIOGRAPHICAL DATA',
  4: 'PROFESSIONAL BACKGROUND',
  5: 'POSITION PREFERENCE',
}

const sectionTitle = computed(() => sectionTitles[currentStep.value] ?? '')

const canAdvance = computed(() => {
  switch (currentStep.value) {
    case 1: return archetype.value !== null
    case 2: return motivation.value !== null
    case 3: return origin.value !== null
    case 4: return foundation.value !== null
    case 5: return position.value !== null
    default: return false
  }
})

function onAccept(): void {
  setIdentity(origin.value!, motivation.value!)
  setProfile(archetype.value!, foundation.value!, null)
  router.push('/patron')
}
</script>

<style scoped>
.create-root {
  position: relative;
  width: 100%;
  height: 100%;
}

.terminal-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.create-view {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 48px 64px;
  box-sizing: border-box;
  overflow-y: auto;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 40px;
}

.org {
  font-size: 11px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.4);
  margin: 0;
}

.form {
  font-size: 11px;
  color: rgba(196, 149, 106, 0.25);
  margin: 0;
}

.section {
  margin-top: 16px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(196, 149, 106, 0.6);
}

.content {
  flex: 1;
}

.nav {
  display: flex;
  justify-content: space-between;
  padding-top: 32px;
}

.nav-btn {
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 13px;
  color: #c4956a;
  cursor: pointer;
  padding: 8px 0;
  letter-spacing: 0.1em;
  transition: color 0.15s;
}

.nav-btn:hover {
  color: rgba(196, 149, 106, 1);
}

.nav-btn:disabled {
  color: rgba(196, 149, 106, 0.2);
  cursor: not-allowed;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
