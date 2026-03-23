<template>
  <Teleport to="body">
    <Transition name="sam-fade">
      <div v-if="visible" class="sam-overlay">
        <div class="sam-dialog">
          <div class="sam-header">
            <span class="sam-icon">&#x2394;</span>
            <span class="sam-title">SAM — SAMPLE ANALYSIS AT MARS</span>
            <div class="sam-steps">
              <span
                v-for="s in 3"
                :key="s"
                class="sam-step-dot"
                :class="{ 'sam-step-dot--active': s === currentStep }"
              >{{ s }}</span>
            </div>
            <div class="sam-header-right">
              <span class="sam-esc" @click="emit('close')">[ESC] CLOSE</span>
            </div>
          </div>
          <div class="sam-body">
            <SAMStepInstrument
              v-if="currentStep === 1"
              :modes="samExp.unlockedModes(totalSP)"
              :total-s-p="totalSP"
              @select="onModeSelect"
            />
            <SAMStepReagents
              v-if="currentStep === 2 && selectedMode"
              :mode="selectedMode"
              :stacks="stacks"
              :sample-consumption-kg="sampleConsumptionKg"
              :possible-discoveries="currentDiscoveries"
              @confirm="onReagentConfirm"
              @back="currentStep = 1"
              @sample-selected="onSampleSelected"
            />
            <component
              v-if="currentStep === 3 && selectedModeId && selectedSampleId"
              :is="miniGameComponent"
              :mode-id="selectedModeId"
              :sample-id="selectedSampleId"
              @complete="onMiniGameComplete"
            />
          </div>
          <div class="sam-footer">
            <span class="sam-footer-status">STANDBY</span>
            <span class="sam-footer-power">
              {{ selectedMode ? `${selectedMode.powerW}W` : '0W' }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { InventoryStack } from '@/types/inventory'
import { INVENTORY_CATALOG } from '@/types/inventory'
import { useSamExperiments } from '@/composables/useSamExperiments'
import SAMStepInstrument from '@/components/SAMStepInstrument.vue'
import SAMStepReagents from '@/components/SAMStepReagents.vue'
import SAMMiniGameStub from '@/components/SAMMiniGameStub.vue'
import SAMPyrolysis from '@/components/SAMPyrolysis.vue'
import SAMWetChemistry from '@/components/SAMWetChemistry.vue'

const props = defineProps<{
  visible: boolean
  stacks: InventoryStack[]
  totalSP: number
  sampleConsumptionKg: number
}>()

const emit = defineEmits<{
  close: []
  enqueue: [entry: any]
}>()

const samExp = useSamExperiments()

// Internal wizard state
const currentStep = ref(1)
const selectedModeId = ref<string | null>(null)
const selectedSampleId = ref<string | null>(null)

const selectedMode = computed(() =>
  samExp.modes.value.find(m => m.id === selectedModeId.value) ?? null,
)

const miniGameComponent = computed(() => {
  switch (selectedModeId.value) {
    case 'pyrolysis': return SAMPyrolysis
    case 'wet-chemistry': return SAMWetChemistry
    default: return SAMMiniGameStub
  }
})

const currentDiscoveries = computed(() => {
  if (!selectedModeId.value || !selectedSampleId.value) return []
  return samExp.possibleDiscoveries(selectedModeId.value, selectedSampleId.value)
})

// Ensure data is loaded when dialog becomes visible
watch(() => props.visible, (v) => {
  if (v) samExp.ensureLoaded()
})

// Reset wizard when dialog closes
watch(() => props.visible, (v) => {
  if (!v) resetWizard()
})

function resetWizard() {
  currentStep.value = 1
  selectedModeId.value = null
  selectedSampleId.value = null
}

function onModeSelect(modeId: string) {
  selectedModeId.value = modeId
  currentStep.value = 2
}

function onSampleSelected(sampleId: string) {
  selectedSampleId.value = sampleId
}

function onReagentConfirm(sampleId: string) {
  selectedSampleId.value = sampleId
  currentStep.value = 3
}

function onMiniGameComplete(quality: number) {
  const roll = samExp.rollDiscovery(selectedModeId.value!, selectedSampleId.value!, quality)
  if (!roll) return

  const mode = samExp.modes.value.find(m => m.id === selectedModeId.value)!
  const sampleLabel = INVENTORY_CATALOG[selectedSampleId.value!]?.label ?? selectedSampleId.value!

  emit('enqueue', {
    modeId: selectedModeId.value!,
    modeName: mode.name,
    sampleId: selectedSampleId.value!,
    sampleLabel,
    quality,
    discoveryId: roll.discovery.id,
    discoveryName: roll.discovery.name,
    discoveryRarity: roll.discovery.rarity,
    discoveryDescription: roll.discovery.description,
    spReward: roll.spReward,
    sideProducts: roll.sideProducts,
    remainingTimeSec: mode.baseDurationSec,
    totalTimeSec: mode.baseDurationSec,
    startedAtSol: 0,
    powerW: mode.powerW,
  })

  resetWizard()
}
</script>

<style scoped>
.sam-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.sam-dialog {
  width: 75vw;
  height: 75vh;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(196, 117, 58, 0.25);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  overflow: hidden;
  pointer-events: auto;
  box-shadow: 0 0 60px rgba(0, 0, 0, 0.5);
}

.sam-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.15);
  flex-shrink: 0;
}

.sam-icon {
  font-size: 18px;
  color: #e8a060;
}

.sam-title {
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.sam-steps {
  display: flex;
  gap: 8px;
  margin-left: 24px;
  font-size: 10px;
  letter-spacing: 0.1em;
}

.sam-step-dot {
  color: rgba(196, 117, 58, 0.25);
  padding: 2px 6px;
  border-radius: 3px;
  transition: color 0.2s ease, background 0.2s ease;
}

.sam-step-dot--active {
  color: #e8a060;
  background: rgba(196, 117, 58, 0.15);
}

.sam-header-right {
  margin-left: auto;
}

.sam-esc {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.1em;
  cursor: pointer;
}

.sam-body {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  min-height: 0;
  overflow: auto;
}

.sam-body > * {
  width: 100%;
}

.sam-footer {
  display: flex;
  justify-content: space-between;
  padding: 10px 20px;
  font-size: 10px;
  letter-spacing: 0.12em;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
  flex-shrink: 0;
}

.sam-footer-status {
  color: rgba(196, 117, 58, 0.4);
}

.sam-footer-power {
  color: rgba(93, 201, 165, 0.5);
}

/* Transition */
.sam-fade-enter-active,
.sam-fade-leave-active {
  transition: opacity 0.3s ease;
}
.sam-fade-enter-active .sam-dialog,
.sam-fade-leave-active .sam-dialog {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.sam-fade-enter-from,
.sam-fade-leave-to {
  opacity: 0;
}
.sam-fade-enter-from .sam-dialog,
.sam-fade-leave-to .sam-dialog {
  opacity: 0;
  transform: scale(0.97);
}
</style>
