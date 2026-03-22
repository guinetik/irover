<template>
  <Teleport to="body">
    <Transition name="inv-slide">
      <div v-if="open" class="inventory-panel">
        <div class="inv-header">
          <span class="inv-title">INVENTORY</span>
          <span class="inv-weight" :class="{ full: isFull }">
            {{ currentWeight }} / {{ capacityKg }} KG
            <span v-if="isFull" class="inv-full-badge">FULL</span>
          </span>
        </div>

        <div class="inv-bar-track">
          <div
            class="inv-bar-fill"
            :class="{ warning: fillPct > 80, full: fillPct >= 100 }"
            :style="{ width: Math.min(100, fillPct) + '%' }"
          />
        </div>

        <div v-if="samples.length === 0" class="inv-empty">NO SAMPLES</div>

        <div v-else class="inv-list">
          <div
            v-for="sample in samples"
            :key="sample.id"
            class="inv-row"
          >
            <span class="inv-sample-icon" :style="{ color: rockColor(sample.type) }">&#x25CF;</span>
            <span class="inv-sample-label">{{ sample.label }}</span>
            <span class="inv-sample-weight">{{ sample.weightKg.toFixed(2) }} kg</span>
            <button type="button" class="inv-dump-btn" @click="$emit('dump', sample.id)">DUMP</button>
          </div>
        </div>

        <div class="inv-footer">[I] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Sample } from '@/composables/useInventory'
import { ROCK_TYPES, type RockTypeId } from '@/three/terrain/RockTypes'

const props = defineProps<{
  open: boolean
  samples: Sample[]
  currentWeightKg: number
  capacityKg: number
  isFull: boolean
}>()

defineEmits<{
  dump: [id: string]
}>()

const currentWeight = computed(() => props.currentWeightKg.toFixed(1))
const fillPct = computed(() => (props.currentWeightKg / props.capacityKg) * 100)

function rockColor(type: RockTypeId): string {
  return ROCK_TYPES[type]?.color ?? '#c4753a'
}
</script>

<style scoped>
.inventory-panel {
  position: fixed;
  bottom: 80px;
  left: 16px;
  width: 260px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  padding: 12px;
  z-index: 45;
  font-family: 'Courier New', monospace;
}

.inv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.inv-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.inv-weight {
  font-size: 10px;
  color: rgba(196, 149, 106, 0.6);
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}

.inv-weight.full {
  color: #e05030;
}

.inv-full-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 8px;
  font-weight: bold;
  color: #1a0d08;
  background: #e05030;
  border-radius: 3px;
  letter-spacing: 0.1em;
}

.inv-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 10px;
}

.inv-bar-fill {
  height: 100%;
  background: rgba(93, 201, 165, 0.7);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.inv-bar-fill.warning {
  background: rgba(239, 159, 39, 0.8);
}

.inv-bar-fill.full {
  background: rgba(224, 80, 48, 0.8);
}

.inv-empty {
  font-size: 9px;
  color: rgba(196, 117, 58, 0.3);
  text-align: center;
  padding: 12px;
  letter-spacing: 0.15em;
}

.inv-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 9px;
}

.inv-sample-icon {
  font-size: 8px;
  text-shadow: 0 0 4px currentColor;
}

.inv-sample-label {
  flex: 1;
  color: rgba(196, 149, 106, 0.7);
  letter-spacing: 0.04em;
}

.inv-sample-weight {
  color: rgba(196, 149, 106, 0.4);
  font-variant-numeric: tabular-nums;
}

.inv-dump-btn {
  font-family: 'Courier New', monospace;
  font-size: 7px;
  letter-spacing: 0.1em;
  color: rgba(224, 80, 48, 0.6);
  background: transparent;
  border: 1px solid rgba(224, 80, 48, 0.2);
  border-radius: 3px;
  padding: 2px 5px;
  cursor: pointer;
  transition: all 0.15s;
}

.inv-dump-btn:hover {
  color: #e05030;
  border-color: rgba(224, 80, 48, 0.5);
}

.inv-footer {
  text-align: center;
  margin-top: 8px;
  font-size: 8px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.15em;
}

.inv-slide-enter-active,
.inv-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.inv-slide-enter-from,
.inv-slide-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
