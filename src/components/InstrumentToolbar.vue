<template>
  <div class="instrument-toolbar">
    <button
      v-for="inst in visibleInstruments"
      :key="inst.slot"
      class="instrument-slot"
      :class="{ active: activeSlot === inst.slot, 'newly-unlocked': newlyUnlocked?.includes(inst.id) }"
      @click="handleClick(inst.slot)"
    >
      <span class="slot-key font-instrument">{{ inst.slot }}</span>
      <span class="slot-icon">{{ inst.icon }}</span>
      <span class="slot-name">{{ inst.name }}</span>
      <span v-if="inst.slot === 2 && (chemCamUnread ?? 0) > 0" class="badge-dot font-instrument">{{ chemCamUnread }}</span>
      <span v-if="inst.slot === 5 && (danScanning ?? false)" class="badge-dan">&#x2022;</span>
      <span v-if="inst.slot === 4 && (apxsUnread ?? 0) > 0" class="badge-dot font-instrument">{{ apxsUnread }}</span>
      <span v-if="inst.slot === 6 && (samUnread ?? 0) > 0" class="badge-dot font-instrument">{{ samUnread }}</span>
    </button>

    <div class="toolbar-divider" />

    <button
      class="instrument-slot inventory-btn"
      :class="{ active: inventoryOpen }"
      @click="emit('toggleInventory')"
    >
      <span class="slot-key font-instrument">Tab</span>
      <span class="slot-icon">&#x2261;</span>
      <span class="slot-name">INV</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  activeSlot: number | null
  inventoryOpen?: boolean
  chemCamUnread?: number
  danScanning?: boolean
  samUnread?: number
  apxsUnread?: number
  unlockedInstruments: string[]
  sandbox: boolean
  newlyUnlocked?: string[]
}>()

const emit = defineEmits<{
  select: [slot: number]
  deselect: []
  toggleInventory: []
}>()

interface ToolbarInstrument {
  slot: number
  id: string
  name: string
  icon: string
}

const instruments: ToolbarInstrument[] = [
  { slot: 1, id: 'mastcam', name: 'MCAM', icon: '\u25A3' },
  { slot: 2, id: 'chemcam', name: 'CHEM', icon: '\u2316' },
  { slot: 3, id: 'drill',   name: 'DRIL', icon: '\u25CE' },
  { slot: 4, id: 'apxs',    name: 'APXS', icon: '\u2295' },
  { slot: 5, id: 'dan',     name: 'DAN',  icon: '\u2261' },
  { slot: 6, id: 'sam',     name: 'SAM',  icon: '\u2394' },
  { slot: 7, id: 'rtg',     name: 'RTG',  icon: '\u26A1' },
  { slot: 8, id: 'rems',    name: 'REMS', icon: '\u2602' },
  { slot: 9, id: 'rad',     name: 'RAD',  icon: '\u2622' },
]

// Only REMS and RAD appear in the instrument toolbar and are always available.
// Wheels and Heater are handled outside the toolbar (always active).
// LGA/UHF are in the CommToolbar, not here.
// RAD is always available (passive dosimeter, no gating).
// REMS is unlocked by m01 completion.
const ALWAYS_AVAILABLE: string[] = []

const visibleInstruments = computed(() => {
  if (props.sandbox) return instruments
  return instruments.filter(
    (inst) =>
      ALWAYS_AVAILABLE.includes(inst.id) ||
      props.unlockedInstruments.includes(inst.id)
  )
})

function handleClick(slot: number) {
  if (props.activeSlot === slot) {
    emit('deselect')
  } else {
    emit('select', slot)
  }
}
</script>

<style scoped>
.instrument-toolbar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 6px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.15);
  border-radius: 6px;
  z-index: 40;
}

.instrument-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 52px;
  padding: 6px 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.instrument-slot:hover {
  background: rgba(196, 117, 58, 0.1);
  border-color: rgba(196, 117, 58, 0.3);
}

.instrument-slot.active {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.6);
  box-shadow: 0 0 8px rgba(196, 117, 58, 0.2);
}

.instrument-slot.newly-unlocked {
  border-color: rgba(102, 255, 238, 0.6);
  box-shadow: 0 0 10px rgba(102, 255, 238, 0.3);
  animation: tool-unlock-pulse 1.5s ease-in-out infinite;
}

@keyframes tool-unlock-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(102, 255, 238, 0.2); }
  50% { box-shadow: 0 0 14px rgba(102, 255, 238, 0.5); }
}

.slot-key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  color: rgba(196, 149, 106, 0.4);
  letter-spacing: 0;
}

.instrument-slot.active .slot-key {
  color: rgba(196, 117, 58, 0.8);
}

.slot-icon {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1;
  margin-top: 2px;
}

.instrument-slot.active .slot-icon {
  color: rgba(196, 117, 58, 0.9);
}

.slot-name {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.25);
  text-transform: uppercase;
}

.instrument-slot.active .slot-name {
  color: rgba(196, 149, 106, 0.7);
}

.badge-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  background: #66ffee;
  color: #0a0502;
  border-radius: 7px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: bold;
  line-height: 14px;
  text-align: center;
  box-shadow: 0 0 6px rgba(102, 255, 238, 0.5);
}

.toolbar-divider {
  width: 1px;
  align-self: stretch;
  margin: 4px 2px;
  background: rgba(196, 117, 58, 0.15);
}

.badge-dan {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  color: #44aaff;
  font-size: 16px;
  line-height: 10px;
  text-align: center;
  text-shadow: 0 0 6px rgba(68, 170, 255, 0.8);
  animation: dan-badge-pulse 1.5s ease-in-out infinite;
}

@keyframes dan-badge-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1.0; }
}
</style>
