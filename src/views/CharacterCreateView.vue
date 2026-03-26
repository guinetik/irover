<template>
  <div class="create-root">
    <!-- Layer 0: Three.js canvas -->
    <canvas ref="terminalCanvas" class="terminal-canvas" />

    <!-- Layer 1+2: Overlay + Form (visible during launch/active/exit phases) -->
    <div
      class="screen-overlay"
      :class="{
        visible: overlayVisible,
        launching: phase === 'launch',
        exiting: phase === 'exit',
      }"
    >
      <div class="form-content">
        <header v-if="currentStep <= 5" class="header">
          <p class="org">MARS EXPLORATION CONSORTIUM — OPERATOR APPLICATION PORTAL v7.3.1</p>
          <p class="form-id">Form MEC-7720-B | Remote Vehicle Operations Division</p>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile, type ArchetypeId, type FoundationId, type OriginId, type MotivationId } from '@/composables/usePlayerProfile'
import { TerminalScene, type TerminalPhase } from '@/three/terminal/TerminalScene'
import StepArchetype from '@/components/create/StepArchetype.vue'
import StepMotivation from '@/components/create/StepMotivation.vue'
import StepOrigin from '@/components/create/StepOrigin.vue'
import StepFoundation from '@/components/create/StepFoundation.vue'
import StepPosition from '@/components/create/StepPosition.vue'
import type { PositionId } from '@/components/create/StepPosition.vue'
import ProcessingSequence from '@/components/create/ProcessingSequence.vue'
import AcceptanceScreen from '@/components/create/AcceptanceScreen.vue'

const router = useRouter()
const { setProfile, setIdentity } = usePlayerProfile()

// --- Phase state ---
const phase = ref<TerminalPhase>('intro')
const overlayVisible = ref(false)

// --- Form state ---
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

// --- Keyboard navigation ---
const stepOptions: Record<number, { values: readonly string[]; ref: ReturnType<typeof ref> }> = {
  1: { values: ['maker', 'manager', 'methodist'], ref: archetype },
  2: { values: ['legacy', 'therapist', 'commute'], ref: motivation },
  3: { values: ['earth', 'metropolis', 'lunar'], ref: origin },
  4: { values: ['technologist', 'phd', 'astronaut'], ref: foundation },
  5: { values: ['ceo', 'personality', 'operator'], ref: position },
}

function onKeydown(e: KeyboardEvent): void {
  if (phase.value !== 'active' && phase.value !== 'launch') return
  if (currentStep.value > 5) return

  const opts = stepOptions[currentStep.value]
  if (!opts) return

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    e.preventDefault()
    const current = opts.values.indexOf(opts.ref.value as string)
    const next = current <= 0 ? opts.values.length - 1 : current - 1
    opts.ref.value = opts.values[next] as any
  } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    e.preventDefault()
    const current = opts.values.indexOf(opts.ref.value as string)
    const next = current >= opts.values.length - 1 ? 0 : current + 1
    opts.ref.value = opts.values[next] as any
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (canAdvance.value) {
      currentStep.value++
    }
  } else if (e.key === 'Backspace' || e.key === 'Escape') {
    e.preventDefault()
    if (currentStep.value > 1) {
      currentStep.value--
    }
  }
}

// --- Three.js scene ---
const terminalCanvas = ref<HTMLCanvasElement | null>(null)
let scene: TerminalScene | null = null

function onPhaseChange(newPhase: TerminalPhase): void {
  phase.value = newPhase

  if (newPhase === 'launch') {
    overlayVisible.value = true
    // After launch animation completes, mark as active
    setTimeout(() => {
      phase.value = 'active'
    }, 400)
  } else if (newPhase === 'done') {
    router.push('/patron')
  }
}

function onAccept(): void {
  setIdentity(origin.value!, motivation.value!)
  setProfile(archetype.value!, foundation.value!, null)
  // Trigger exit → outro → done → navigate
  phase.value = 'exit'
  // After overlay fade-out, start 3D outro
  setTimeout(() => {
    overlayVisible.value = false
    scene?.startOutro()
  }, 500)
}

function onResize(): void {
  if (!scene || !terminalCanvas.value) return
  const rect = terminalCanvas.value.getBoundingClientRect()
  scene.resize(rect.width, rect.height)
}

onMounted(async () => {
  if (!terminalCanvas.value) return
  const canvas = terminalCanvas.value
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * Math.min(window.devicePixelRatio, 2)
  canvas.height = rect.height * Math.min(window.devicePixelRatio, 2)

  scene = new TerminalScene(rect.width / rect.height)
  await scene.init(canvas, onPhaseChange)
  scene.startLoop()

  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
  scene?.dispose()
  scene = null
})
</script>

<style scoped>
.create-root {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.terminal-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

/* Overlay positioned over the CRT screen area */
.screen-overlay {
  position: absolute;
  z-index: 1;
  /* Approximate CRT screen position from calibrated camera zoom */
  left: 35.5%;
  top: 27%;
  width: 35.5%;
  height: 52%;
  background: rgba(0, 0, 0, 0.88);
  opacity: 0;
  pointer-events: none;
  overflow: hidden;
  border-radius: 14px;
  /* Soft edges that blend into the screen */
  box-shadow: 0 0 40px 20px rgba(0, 0, 0, 0.7);
  transform-origin: center center;
  perspective: 800px;

  /* Default: hidden */
  transform: perspective(800px) rotateX(4deg) scale(0.85);
  transition: opacity 0.35s ease, transform 0.35s ease;
}

/* "App launch" animation — scales up from center of screen */
.screen-overlay.visible {
  opacity: 1;
  transform: perspective(800px) rotateX(4deg) scale(1);
  pointer-events: auto;
}

.screen-overlay.launching {
  opacity: 1;
  transform: perspective(800px) rotateX(4deg) scale(1);
  transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Exit: form fades and shrinks slightly */
.screen-overlay.exiting {
  opacity: 0;
  transform: perspective(800px) rotateX(4deg) scale(0.92);
  transition: opacity 0.4s ease, transform 0.4s ease;
  pointer-events: none;
}

.form-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: rgba(196, 149, 106, 0.9);
  font-family: var(--font-mono);
  padding: 20px 28px;
  box-sizing: border-box;
  overflow-y: auto;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 20px;
}

.org {
  font-size: 13px;
  letter-spacing: 0.12em;
  color: rgba(196, 149, 106, 0.7);
  margin: 0;
}

.form-id {
  font-size: 11px;
  color: rgba(196, 149, 106, 0.5);
  margin: 0;
}

.section {
  margin-top: 10px;
  font-size: 14px;
  letter-spacing: 0.18em;
  color: rgba(196, 149, 106, 1);
}

.content {
  flex: 1;
}

.nav {
  display: flex;
  justify-content: space-between;
  padding: 12px 8px 0;
}

.nav-btn {
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 600;
  color: #ff9932;
  cursor: pointer;
  padding: 6px 0;
  letter-spacing: 0.12em;
  transition: color 0.15s, text-shadow 0.15s;
  text-shadow: 0 0 10px rgba(255, 153, 50, 0.5), 0 0 20px rgba(255, 153, 50, 0.2);
}

.nav-btn:hover {
  color: #ffb060;
  text-shadow: 0 0 14px rgba(255, 153, 50, 0.7), 0 0 30px rgba(255, 153, 50, 0.3);
}

.nav-btn:disabled {
  color: rgba(255, 153, 50, 0.2);
  text-shadow: none;
  cursor: not-allowed;
}

/* Fade transition for step content */
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
