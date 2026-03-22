<template>
  <div class="instrument-toolbar">
    <button
      v-for="inst in instruments"
      :key="inst.slot"
      class="instrument-slot"
      :class="{ active: activeSlot === inst.slot }"
      @click="handleClick(inst.slot)"
    >
      <span class="slot-key">{{ inst.slot }}</span>
      <span class="slot-icon">{{ inst.icon }}</span>
      <span class="slot-name">{{ inst.name }}</span>
      <span v-if="inst.slot === 2 && (chemCamUnread ?? 0) > 0" class="badge-dot">{{ chemCamUnread }}</span>
    </button>

    <div class="toolbar-divider" />

    <button
      class="instrument-slot inventory-btn"
      :class="{ active: inventoryOpen }"
      @click="emit('toggleInventory')"
    >
      <span class="slot-key">Tab</span>
      <span class="slot-icon">&#x2261;</span>
      <span class="slot-name">INV</span>
    </button>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  activeSlot: number | null
  inventoryOpen?: boolean
  chemCamUnread?: number
}>()

const emit = defineEmits<{
  select: [slot: number]
  deselect: []
  toggleInventory: []
}>()

const instruments = [
  { slot: 1, id: 'mastcam', name: 'MCAM', icon: '\u25A3' },
  { slot: 2, id: 'chemcam', name: 'CHEM', icon: '\u2316' },
  { slot: 3, id: 'apxs',    name: 'APXS', icon: '\u25CE' },
  { slot: 4, id: 'dan',     name: 'DAN',  icon: '\u2261' },
  { slot: 5, id: 'sam',     name: 'SAM',  icon: '\u2394' },
  { slot: 6, id: 'rtg',     name: 'RTG',  icon: '\u26A1' },
  { slot: 7, id: 'rems',    name: 'REMS', icon: '\u2602' },
  { slot: 8, id: 'rad',     name: 'RAD',  icon: '\u2622' },
  { slot: 9, id: 'heater',  name: 'HTR',  icon: '\u2668' },
]

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

.slot-key {
  position: absolute;
  top: 2px;
  left: 4px;
  font-family: 'Courier New', monospace;
  font-size: 8px;
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
  font-family: 'Courier New', monospace;
  font-size: 7px;
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
  font-family: 'Courier New', monospace;
  font-size: 8px;
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
</style>
