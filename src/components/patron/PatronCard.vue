<template>
  <button
    class="patron-card"
    :class="{ highlighted }"
    @click="$emit('select')"
    @mouseenter="$emit('hover')"
  >
    <p class="full-name">{{ patron.fullName }}</p>
    <p class="abbrev">{{ patron.name }}</p>
    <div class="preview-img">
      <img :src="`/patrons/${patron.id}.webp`" :alt="patron.fullName" @error="($event.target as HTMLImageElement).style.display='none'" />
    </div>
    <p class="identity">{{ orgName }}</p>
    <p class="motto">"{{ motto }}"</p>
    <p class="desc">{{ patron.description }}</p>
    <div class="modifiers">
      <p
        v-for="mod in modifierList"
        :key="mod.label"
        class="mod"
        :class="mod.positive ? 'buff' : 'debuff'"
      >
        {{ mod.positive ? '+' : '' }}{{ mod.value }} {{ mod.label }}
      </p>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PatronDef, ProfileModifiers } from '@/composables/usePlayerProfile'

const props = defineProps<{
  patron: PatronDef
  motto: string
  orgName: string
  highlighted: boolean
}>()

defineEmits<{
  select: []
  hover: []
}>()

const MODIFIER_LABELS: Record<string, string> = {
  movementSpeed: 'Movement',
  analysisSpeed: 'Analysis',
  powerConsumption: 'Power draw',
  heaterDraw: 'Heater draw',
  spYield: 'SP yield',
  inventorySpace: 'Inventory',
  instrumentAccuracy: 'Accuracy',
  repairCost: 'Repair cost',
  upgradeCost: 'Upgrade cost',
  weatherWarning: 'Weather warning',
  batteryCapacity: 'Battery',
  danScanRadius: 'DAN radius',
  buildSpeed: 'Build speed',
  structureDurability: 'Durability',
}

const modifierList = computed(() => {
  const mods = props.patron.modifiers as Partial<ProfileModifiers>
  return Object.entries(mods)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([key, value]) => ({
      label: MODIFIER_LABELS[key] ?? key,
      value: `${Math.round(value! * 100)}%`,
      positive: value! > 0,
    }))
})
</script>

<style scoped>
.patron-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 14px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(196, 149, 106, 0.15);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  color: rgba(230, 180, 130, 0.8);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.patron-card:hover,
.patron-card.highlighted {
  border-color: rgba(255, 170, 60, 0.6);
  box-shadow: 0 0 20px rgba(255, 153, 50, 0.15), inset 0 0 15px rgba(255, 153, 50, 0.05);
}

.full-name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 200, 140, 1);
  margin: 0;
}

.abbrev {
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(230, 180, 130, 0.5);
  margin: 0;
}

.preview-img {
  width: 100%;
  height: 100px;
  border-radius: 4px;
  overflow: hidden;
  background: rgba(196, 149, 106, 0.05);
  margin: 4px 0;
}

.preview-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.8;
}

.identity {
  font-size: 15px;
  font-weight: 600;
  color: #ff9932;
  margin: 4px 0 0;
}

.motto {
  font-size: 13px;
  font-style: italic;
  color: rgba(230, 180, 130, 0.5);
  margin: 0;
}

.desc {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
  margin: 6px 0 0;
}

.modifiers {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(196, 149, 106, 0.1);
}

.mod {
  font-size: 13px;
  font-size: 11px;
  margin: 0;
}

.buff {
  color: rgba(100, 220, 100, 0.85);
}

.debuff {
  color: rgba(255, 100, 80, 0.75);
}
</style>
