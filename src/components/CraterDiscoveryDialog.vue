<template>
  <Teleport to="body">
    <Transition name="result-fade">
      <div v-if="result" class="result-backdrop" @click.self="$emit('close')">
        <div class="result-dialog">
          <!-- Rarity banner -->
          <div class="result-rarity-banner" :class="`rarity--${result.rarity.toLowerCase()}`">
            {{ result.rarity.toUpperCase() }} DISCOVERY
          </div>

          <!-- Discovery name -->
          <div class="result-body">
            <h2 class="result-name">{{ result.name }}</h2>

            <p class="result-description">{{ description }}</p>

            <!-- SP reward -->
            <div class="result-sp">+{{ result.sp }} SP</div>

            <!-- Side products -->
            <div v-if="result.sideProducts.length > 0" class="result-side-products">
              <span
                v-for="sp in result.sideProducts"
                :key="sp.itemId"
                class="result-side-product-chip"
              >
                {{ sp.quantity }}x {{ INVENTORY_CATALOG[sp.itemId]?.label ?? sp.itemId }}
              </span>
            </div>

            <!-- Vent tag -->
            <div v-if="result.ventType" class="result-vent-tag">
              <span class="vent-dot" :style="{ background: ventColor }" />
              {{ ventLabel }} VENT EXPOSED
            </div>

            <!-- Metadata row -->
            <div class="result-meta">
              <span>Source: <strong>METEOR CRATER</strong></span>
              <span class="result-meta-sep">|</span>
              <span>Method: <strong>DAN CRATER MODE</strong></span>
            </div>
          </div>

          <!-- Buttons -->
          <div class="result-actions">
            <button type="button" class="btn-acknowledge" @click="emitAcknowledge">
              ACKNOWLEDGE
            </button>
            <button class="btn-transmit" disabled>
              TRANSMIT
              <span class="btn-transmit-sub">Requires antenna downlink</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUiSound } from '@/composables/useUiSound'
import { INVENTORY_CATALOG } from '@/types/inventory'
import type { CraterDiscovery } from '@/lib/meteor/craterDiscovery'

const props = defineProps<{
  result: CraterDiscovery | null
}>()

const emit = defineEmits<{
  acknowledge: []
  close: []
}>()

const { playUiCue } = useUiSound()

function emitAcknowledge(): void {
  playUiCue('ui.confirm')
  emit('acknowledge')
}

const DESCRIPTIONS: Record<string, string> = {
  DC01: 'Subsurface CO\u2082 pocket detected beneath the impact fracture. Pneumatic fracturing has exposed a viable gas vent.',
  DC02: 'Thermal decomposition of carbonate minerals in the regolith. Calcium trace elements recovered from the ejecta.',
  DC03: 'Adsorbed water molecules released from regolith grains during the impact shockwave. Ice sample recovered.',
  DC04: 'Trace methane signature detected in the fracture network beneath the crater. A rare subsurface methane vent has been exposed.',
  DC05: 'Deep regolith stratigraphy exposed by the impact. Layered depositional history recorded for analysis.',
}

const description = computed(() =>
  props.result ? DESCRIPTIONS[props.result.id] ?? '' : '',
)

const ventColor = computed(() =>
  props.result?.ventType === 'co2' ? '#ff8844' : '#44ff88',
)

const ventLabel = computed(() =>
  props.result?.ventType === 'co2' ? 'CO\u2082' : 'CH\u2084',
)
</script>

<style scoped>
.result-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}

.result-dialog {
  width: 500px;
  max-width: calc(100vw - 32px);
  background: rgba(10, 5, 2, 0.92);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(68, 170, 255, 0.25);
  border-radius: 10px;
  overflow: hidden;
  font-family: var(--font-ui, monospace);
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.6);
}

/* Rarity banner */
.result-rarity-banner {
  width: 100%;
  padding: 10px 20px;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.25em;
  text-align: center;
  color: rgba(255, 255, 255, 0.9);
}

.rarity--common    { background: #555; }
.rarity--uncommon  { background: #2a5a6b; }
.rarity--rare      { background: #6b4a1a; }

/* Body */
.result-body {
  padding: 28px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.result-name {
  margin: 0;
  font-size: 22px;
  font-weight: bold;
  color: #ffffff;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.result-description {
  margin: 0;
  font-size: 13px;
  color: rgba(68, 170, 255, 0.6);
  line-height: 1.6;
  max-width: 400px;
}

.result-sp {
  font-size: 26px;
  font-weight: bold;
  color: #5dc9a5;
  letter-spacing: 0.05em;
}

/* Side products */
.result-side-products {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.result-side-product-chip {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: rgba(93, 201, 165, 0.8);
  background: rgba(93, 201, 165, 0.08);
  border: 1px solid rgba(93, 201, 165, 0.2);
  border-radius: 4px;
  padding: 3px 10px;
}

/* Vent tag */
.result-vent-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.85);
}

.vent-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  animation: vent-pulse 1.5s ease-in-out infinite;
}

@keyframes vent-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Metadata row */
.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(68, 170, 255, 0.4);
  letter-spacing: 0.08em;
}

.result-meta strong {
  color: rgba(68, 170, 255, 0.7);
  font-weight: 600;
}

.result-meta-sep {
  color: rgba(68, 170, 255, 0.15);
}

/* Actions */
.result-actions {
  display: flex;
  gap: 12px;
  padding: 16px 28px 24px;
  justify-content: center;
  align-items: center;
  border-top: 1px solid rgba(68, 170, 255, 0.1);
}

.btn-acknowledge {
  padding: 10px 28px;
  background: rgba(68, 170, 255, 0.12);
  border: 1px solid rgba(68, 170, 255, 0.5);
  border-radius: 6px;
  color: #6ab8e8;
  font-family: inherit;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-acknowledge:hover {
  background: rgba(68, 170, 255, 0.25);
  border-color: rgba(68, 170, 255, 0.85);
}

.btn-transmit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 18px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.2);
  font-family: inherit;
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 0.15em;
  cursor: not-allowed;
  opacity: 0.5;
}

.btn-transmit-sub {
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.08em;
}

/* Transitions */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: opacity 0.25s ease;
}
.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
}
</style>
