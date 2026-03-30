<template>
  <Teleport to="body">
    <Transition name="ext-slide">
      <div v-if="visible" class="ext-overlay">
      <div class="ext-dialog">
        <div class="ext-header">
          <span class="ext-icon">&#x25C6;</span>
          <span class="ext-title">DAN EXTRACTOR — {{ fluidLabel }}</span>
        </div>

        <div class="ext-body">
          <div class="ext-stat">
            <div class="ext-stat-label">STORED</div>
            <div class="ext-stat-bar-track">
              <div class="ext-stat-bar-fill" :style="{ width: storagePct + '%' }" />
            </div>
            <div class="ext-stat-value">{{ storedKg.toFixed(2) }} / {{ maxStorageKg.toFixed(1) }} kg</div>
          </div>

          <div class="ext-stat">
            <div class="ext-stat-label">CHARGE RATE</div>
            <div class="ext-stat-bar-track">
              <div class="ext-stat-bar-fill ext-stat-bar-fill--rate" :style="{ width: chargeRatePct + '%' }" />
            </div>
            <div class="ext-stat-value">{{ chargeRateKgPerSol.toFixed(2) }} kg/sol</div>
          </div>
        </div>

        <div v-if="cargoFull" class="ext-cargo-warn">CARGO FULL — MAKE ROOM TO EXTRACT</div>

        <div class="ext-footer">
          <button
            type="button"
            class="ext-btn ext-btn--extract"
            :disabled="storedKg <= 0 || cargoFull"
            @click="emitExtract"
          >
            EXTRACT (100g)
            <span class="ext-power-cost">{{ extractPowerW.toFixed(1) }}W</span>
          </button>
          <button type="button" class="ext-btn ext-btn--undock" @click="emitUndock">UNDOCK</button>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ExtractorFluidType } from '@/types/extractorDock'
import { useUiSound } from '@/composables/useUiSound'

const props = defineProps<{
  visible: boolean
  fluidType: ExtractorFluidType
  storedKg: number
  maxStorageKg: number
  chargeRateKgPerSol: number
  extractPowerW: number
  cargoFull?: boolean
}>()

const emit = defineEmits<{ extract: []; undock: [] }>()

const { playUiCue } = useUiSound()

function emitExtract(): void {
  playUiCue('ui.confirm')
  emit('extract')
}

function emitUndock(): void {
  playUiCue('ui.confirm')
  emit('undock')
}

const FLUID_LABELS: Record<ExtractorFluidType, string> = {
  water: 'WATER ICE',
  co2: 'CO₂ GAS',
  methane: 'METHANE GAS',
}

const fluidLabel = computed(() => FLUID_LABELS[props.fluidType])

const storagePct = computed(() =>
  props.maxStorageKg > 0 ? Math.round((props.storedKg / props.maxStorageKg) * 100) : 0,
)

// chargeRate at quality 1.0 = 1.0 kg/sol; use that as 100% bar
const chargeRatePct = computed(() => Math.min(100, Math.round(props.chargeRateKgPerSol * 100)))
</script>

<style scoped>
.ext-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 50;
}

.ext-dialog {
  width: 420px;
  background: rgba(5, 10, 25, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(93, 201, 165, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  overflow: hidden;
}

.ext-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(93, 201, 165, 0.15);
}

.ext-icon { font-size: 12px; color: #5dc9a5; }
.ext-title { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: rgba(93, 201, 165, 0.9); }

.ext-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ext-stat { display: flex; flex-direction: column; gap: 4px; }
.ext-stat-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; color: rgba(93, 201, 165, 0.5); }
.ext-stat-value { font-size: 12px; color: rgba(200, 220, 240, 0.9); }
.ext-stat-bar-track { height: 4px; background: rgba(93, 201, 165, 0.1); border-radius: 2px; overflow: hidden; }
.ext-stat-bar-fill { height: 100%; background: #5dc9a5; border-radius: 2px; transition: width 0.3s ease; }
.ext-stat-bar-fill--rate { background: #44aaff; }

.ext-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-top: 1px solid rgba(93, 201, 165, 0.1);
}

.ext-btn {
  background: none;
  border: 1px solid rgba(93, 201, 165, 0.3);
  border-radius: 4px;
  padding: 5px 12px;
  font-size: 10px;
  font-family: var(--font-ui);
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.ext-btn--extract {
  color: #5dc9a5;
  border-color: rgba(93, 201, 165, 0.5);
  display: flex;
  align-items: center;
  gap: 8px;
}

.ext-btn--extract:hover:not(:disabled) { background: rgba(93, 201, 165, 0.1); border-color: #5dc9a5; }
.ext-btn--extract:disabled { opacity: 0.35; cursor: not-allowed; }

.ext-power-cost { font-size: 9px; color: rgba(255, 180, 60, 0.7); }

.ext-btn--undock { color: rgba(255, 255, 255, 0.35); margin-left: auto; }
.ext-btn--undock:hover { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.3); }

.ext-cargo-warn {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: #e05030;
  text-align: center;
  padding: 6px 16px 0;
}

.ext-slide-enter-active, .ext-slide-leave-active { transition: opacity 0.25s ease; }
.ext-slide-enter-from, .ext-slide-leave-to { opacity: 0; }
</style>
