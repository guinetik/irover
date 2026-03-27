<template>
  <Teleport to="body">
    <Transition name="result-fade">
      <div v-if="result" class="result-backdrop" @click.self="emitClose">
        <div class="result-dialog">
          <!-- Rarity banner -->
          <div class="result-rarity-banner" :class="`rarity--${result.discoveryRarity}`">
            {{ rarityLabel(result.discoveryRarity) }}
          </div>

          <!-- Discovery name -->
          <div class="result-body">
            <h2 class="result-name">{{ result.discoveryName }}</h2>

            <!-- Description -->
            <p class="result-description">{{ result.discoveryDescription }}</p>

            <!-- SP reward -->
            <div class="result-sp">+{{ result.spReward }} SP</div>

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

            <!-- Metadata row -->
            <div class="result-meta">
              <span>Quality: <strong>{{ result.quality }}%</strong></span>
              <span class="result-meta-sep">|</span>
              <span>Mode: <strong>{{ result.modeName }}</strong></span>
              <span class="result-meta-sep">|</span>
              <span>Sample: <strong>{{ result.sampleLabel }}</strong></span>
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
import { useUiSound } from '@/composables/useUiSound'
import type { SamQueueEntry } from '@/composables/useSamQueue'
import { INVENTORY_CATALOG } from '@/types/inventory'
import type { DiscoveryRarity } from '@/types/samExperiments'

defineProps<{
  result: SamQueueEntry | null
}>()

const emit = defineEmits<{
  acknowledge: []
  close: []
}>()

const { playUiCue } = useUiSound()

function emitClose(): void {
  playUiCue('ui.confirm')
  emit('close')
}

function emitAcknowledge(): void {
  playUiCue('ui.confirm')
  emit('acknowledge')
}

function rarityLabel(rarity: DiscoveryRarity): string {
  const labels: Record<DiscoveryRarity, string> = {
    common: 'COMMON DISCOVERY',
    uncommon: 'UNCOMMON DISCOVERY',
    rare: 'RARE DISCOVERY',
    legendary: 'LEGENDARY DISCOVERY',
  }
  return labels[rarity]
}
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
  border: 1px solid rgba(196, 117, 58, 0.25);
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

.rarity--common    { background: #666; }
.rarity--uncommon  { background: #2a6b5a; }
.rarity--rare      { background: #6b4a1a; }
.rarity--legendary { background: #4a1a6b; }

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
  color: rgba(196, 150, 80, 0.75);
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

/* Metadata row */
.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.08em;
}

.result-meta strong {
  color: rgba(196, 117, 58, 0.85);
  font-weight: 600;
}

.result-meta-sep {
  color: rgba(196, 117, 58, 0.2);
}

/* Actions */
.result-actions {
  display: flex;
  gap: 12px;
  padding: 16px 28px 24px;
  justify-content: center;
  align-items: center;
  border-top: 1px solid rgba(196, 117, 58, 0.1);
}

.btn-acknowledge {
  padding: 10px 28px;
  background: rgba(196, 117, 58, 0.15);
  border: 1px solid rgba(196, 117, 58, 0.6);
  border-radius: 6px;
  color: #e8a060;
  font-family: inherit;
  font-size: 12px;
  font-weight: bold;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-acknowledge:hover {
  background: rgba(196, 117, 58, 0.28);
  border-color: rgba(196, 117, 58, 0.9);
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
  font-weight: normal;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.2);
}

/* Transition */
.result-fade-enter-active,
.result-fade-leave-active {
  transition: opacity 0.25s ease;
}

.result-fade-enter-active .result-dialog,
.result-fade-leave-active .result-dialog {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.result-fade-enter-from,
.result-fade-leave-to {
  opacity: 0;
}

.result-fade-enter-from .result-dialog,
.result-fade-leave-to .result-dialog {
  opacity: 0;
  transform: scale(0.95);
}
</style>
