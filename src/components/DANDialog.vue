<template>
  <Teleport to="body">
    <Transition name="dan-slide">
      <div v-if="visible" class="dan-dialog">
        <div class="dan-header">
          <span class="dan-icon">&#x2261;</span>
          <span class="dan-title">DAN — NEUTRON PROSPECTING</span>
          <button type="button" class="dan-close" aria-label="Close" @click="emitClose">&times;</button>
        </div>
        <div class="dan-body">
          <div class="dan-graphic">
            <img
              v-if="danImgSrc"
              :src="danImgSrc"
              alt="DAN traverse reference"
              class="dan-img"
            />
            <div v-else class="dan-graphic-placeholder">
              <div class="dan-gp-icon">&#x2261;</div>
              <div class="dan-gp-text">TRAVERSE MAP</div>
              <div class="dan-gp-sub">Visualization pending</div>
            </div>
          </div>
          <div class="dan-data">
            <div class="dan-stat">
              <div class="dan-stat-label">SIGNAL STRENGTH</div>
              <div class="dan-stat-bar-track">
                <div class="dan-stat-bar-fill" :style="{ width: Math.round(signalStrength * 100) + '%' }" />
              </div>
              <div class="dan-stat-value">{{ Math.round(signalStrength * 100) }}%</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">QUALITY</div>
              <div class="dan-stat-value" :style="{ color: qualityColor }">{{ qualityLabel }}</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">WATER ICE INDEX</div>
              <div class="dan-stat-value">{{ (waterIceIndex * 100).toFixed(0) }}%</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">SAMPLES</div>
              <div class="dan-stat-value">{{ totalSamples }}</div>
            </div>
            <div class="dan-stat">
              <div class="dan-stat-label">STATUS</div>
              <div class="dan-stat-value" :style="{ color: statusColor }">{{ statusLabel }}</div>
            </div>
          </div>
        </div>
        <div class="dan-footer">
          <template v-if="waterConfirmed && pendingDeploy">
            <template v-if="extractorCount > 0">
              <button type="button" class="dan-action-btn dan-deploy-btn" @click="emitDeploy">
                DEPLOY EXTRACTOR <span class="dan-cost">(1× DAN Extractor)</span>
              </button>
              <button type="button" class="dan-action-btn dan-skip-btn" @click="emitSkip">SKIP</button>
            </template>
            <span v-else class="dan-no-extractor">NO DAN EXTRACTOR IN INVENTORY — <button type="button" class="dan-action-btn dan-skip-btn" @click="emitSkip">SKIP</button></span>
          </template>
          <template v-else>[ESC] CLOSE</template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiSound } from '@/composables/useUiSound'

const props = defineProps<{
  visible: boolean
  signalStrength: number
  waterIceIndex: number
  totalSamples: number
  prospectPhase: string
  waterConfirmed: boolean | null
  pendingDeploy: boolean
  extractorCount: number
}>()

const emit = defineEmits<{ close: []; deploy: []; skip: [] }>()

const { playUiCue } = useUiSound()

function emitClose(): void {
  playUiCue('ui.confirm')
  emit('close')
}

function emitDeploy(): void {
  playUiCue('ui.confirm')
  emit('deploy')
}

function emitSkip(): void {
  playUiCue('ui.confirm')
  emit('skip')
}

const danImgSrc = computed(() => {
  try { return new URL('/inspo/dan.png', import.meta.url).href } catch { return '' }
})

const qualityLabel = computed(() => {
  if (props.signalStrength >= 0.7) return 'STRONG'
  if (props.signalStrength >= 0.5) return 'MODERATE'
  return 'WEAK'
})

const qualityColor = computed(() => {
  if (props.signalStrength >= 0.7) return '#44aaff'
  if (props.signalStrength >= 0.5) return '#66ccff'
  return '#88aacc'
})

const statusLabel = computed(() => {
  if (props.waterConfirmed === true) return 'COMPLETE — WATER CONFIRMED'
  if (props.waterConfirmed === false) return 'COMPLETE — INCONCLUSIVE'
  switch (props.prospectPhase) {
    case 'drive-to-zone': return 'DRIVE TO ZONE'
    case 'initiating': return 'INITIATING...'
    case 'prospecting': return 'PROSPECTING...'
    default: return 'PENDING'
  }
})

const statusColor = computed(() => {
  if (props.waterConfirmed === true) return '#44aaff'
  if (props.waterConfirmed === false) return '#88aacc'
  if (props.prospectPhase === 'prospecting') return '#44aaff'
  return '#c4753a'
})
</script>

<style scoped>
.dan-dialog {
  position: fixed;
  top: 50%;
  right: 320px;
  transform: translateY(-50%);
  width: 580px;
  height: 320px;
  background: rgba(5, 10, 25, 0.94);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(68, 170, 255, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  font-family: var(--font-ui);
  overflow: hidden;
}
.dan-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid rgba(68, 170, 255, 0.15); }
.dan-icon { font-size: 16px; color: #44aaff; }
.dan-title { font-size: 11px; font-weight: 600; letter-spacing: 0.12em; color: rgba(68, 170, 255, 0.9); }
.dan-close { margin-left: auto; background: none; border: none; color: rgba(255,255,255,0.3); font-size: 18px; cursor: pointer; }
.dan-body { display: flex; flex: 1; overflow: hidden; }
.dan-graphic { flex: 0 0 45%; display: flex; align-items: center; justify-content: center; border-right: 1px solid rgba(68, 170, 255, 0.1); padding: 12px; }
.dan-img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; opacity: 0.85; }
.dan-graphic-placeholder { text-align: center; color: rgba(68, 170, 255, 0.3); }
.dan-gp-icon { font-size: 32px; margin-bottom: 8px; }
.dan-gp-text { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; }
.dan-gp-sub { font-size: 10px; margin-top: 4px; opacity: 0.6; }
.dan-data { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.dan-stat { display: flex; flex-direction: column; gap: 2px; }
.dan-stat-label { font-size: 9px; font-weight: 600; letter-spacing: 0.1em; color: rgba(68, 170, 255, 0.5); }
.dan-stat-value { font-size: 12px; color: rgba(200, 220, 240, 0.9); }
.dan-stat-bar-track { height: 4px; background: rgba(68, 170, 255, 0.1); border-radius: 2px; overflow: hidden; }
.dan-stat-bar-fill { height: 100%; background: #44aaff; border-radius: 2px; transition: width 0.3s ease; }
.dan-footer { display: flex; align-items: center; gap: 8px; padding: 8px 16px; font-size: 10px; color: rgba(255, 255, 255, 0.2); letter-spacing: 0.1em; border-top: 1px solid rgba(68, 170, 255, 0.1); }
.dan-action-btn { background: none; border: 1px solid rgba(68, 170, 255, 0.3); border-radius: 4px; padding: 4px 10px; font-size: 10px; font-family: var(--font-ui); letter-spacing: 0.08em; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.dan-deploy-btn { color: #44aaff; border-color: rgba(68, 170, 255, 0.5); }
.dan-deploy-btn:hover { background: rgba(68, 170, 255, 0.12); border-color: #44aaff; }
.dan-skip-btn { color: rgba(255, 255, 255, 0.35); }
.dan-skip-btn:hover { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.3); }
.dan-cost { color: rgba(68, 170, 255, 0.55); font-size: 9px; }
.dan-no-extractor { display: flex; align-items: center; gap: 8px; color: rgba(255, 150, 80, 0.7); font-size: 10px; letter-spacing: 0.08em; }
.dan-slide-enter-active, .dan-slide-leave-active { transition: all 0.25s ease; }
.dan-slide-enter-from { opacity: 0; transform: translateY(-50%) translateX(20px); }
.dan-slide-leave-to { opacity: 0; transform: translateY(-50%) translateX(20px); }
</style>
