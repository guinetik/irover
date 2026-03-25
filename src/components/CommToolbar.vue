<template>
  <div class="comm-toolbar">
    <button
      v-for="comm in comms"
      :key="comm.slot"
      class="comm-slot"
      :class="{ active: activeSlot === comm.slot, disabled: comm.slot === 12 && !uhfUnlocked, 'lga-alert': comm.slot === 11 && lgaAlert }"
      @click="!(comm.slot === 12 && !uhfUnlocked) && handleClick(comm.slot)"
    >
      <span class="comm-key">{{ comm.key }}</span>
      <span class="comm-icon">{{ comm.icon }}</span>
      <span class="comm-name">{{ comm.name }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    activeSlot: number | null
    uhfUnlocked?: boolean
    lgaAlert?: boolean
  }>(),
  { uhfUnlocked: true, lgaAlert: false },
)

const emit = defineEmits<{
  select: [slot: number]
  deselect: []
}>()

const comms = [
  { slot: 11, key: 'R', id: 'antenna-lg',  name: 'LGA',  icon: '\uD83D\uDCE1' },
  { slot: 12, key: 'T', id: 'antenna-uhf', name: 'UHF',  icon: '\uD83D\uDCF6' },
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
.comm-toolbar {
  position: fixed;
  top: 58px;
  left: 10px;
  box-sizing: border-box;
  width: max-content;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  background: rgba(10, 5, 2, 0.65);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(196, 117, 58, 0.15);
  border-radius: 8px;
  z-index: 42;
}

.comm-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
  /* Same footprint as InstrumentToolbar .instrument-slot */
  width: 52px;
  box-sizing: border-box;
  padding: 6px 4px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.comm-slot.lga-alert {
  border-color: rgba(230, 160, 60, 0.7);
  animation: lga-blink 1s ease-in-out infinite;
}

@keyframes lga-blink {
  0%, 100% { box-shadow: 0 0 4px rgba(230, 160, 60, 0.2); }
  50% { box-shadow: 0 0 12px rgba(230, 160, 60, 0.6); background: rgba(230, 160, 60, 0.12); }
}

.comm-slot.disabled {
  opacity: 0.3;
  pointer-events: none;
}

.comm-slot:hover {
  background: rgba(196, 117, 58, 0.1);
  border-color: rgba(196, 117, 58, 0.3);
}

.comm-slot.active {
  background: rgba(196, 117, 58, 0.15);
  border-color: rgba(196, 117, 58, 0.6);
  box-shadow: 0 0 6px rgba(196, 117, 58, 0.2);
}

.comm-key {
  position: absolute;
  top: 1px;
  left: 3px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  color: rgba(196, 149, 106, 0.4);
}

.comm-slot.active .comm-key {
  color: rgba(196, 117, 58, 0.8);
}

.comm-icon {
  font-size: 12px;
  line-height: 1;
  margin-top: 1px;
}

.comm-name {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.25);
  text-transform: uppercase;
}

.comm-slot.active .comm-name {
  color: rgba(196, 149, 106, 0.7);
}
</style>
