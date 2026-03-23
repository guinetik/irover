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

        <div class="inv-slots-wrap">
          <div class="inv-grid">
            <div
              v-for="(cell, idx) in cells"
              :key="'slot-' + idx"
              class="inv-slot"
              :class="{ empty: cell === null, hover: hoverIdx === idx && cell !== null }"
              @mouseenter="onSlotEnter($event, idx, cell)"
              @mousemove="onSlotMove($event, cell)"
              @mouseleave="onLeave"
            >
              <template v-if="cell">
                <img
                  class="inv-thumb"
                  :src="thumbSrc(cell.itemId)"
                  :alt="labelFor(cell.itemId)"
                />
                <span class="inv-count" :title="countTitle(cell)">×{{ cell.quantity }}</span>
                <button
                  type="button"
                  class="inv-dump-btn"
                  title="Dump stack"
                  @click.stop="$emit('dump', cell.itemId)"
                >
                  ×
                </button>
              </template>
              <template v-else>
                <span class="inv-slot-empty">—</span>
              </template>
            </div>
          </div>
        </div>

        <div class="inv-footer">[I] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <div
      v-show="open && tooltipVisible"
      class="inv-tooltip inv-tooltip--cursor"
      :style="tooltipStyle"
    >
      <div class="inv-tip-title">{{ tooltipTitle }}</div>
      <div class="inv-tip-desc">{{ tooltipDesc }}</div>
      <div class="inv-tip-weight">{{ tooltipWeight }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { InventoryStack } from '@/types/inventory'
import { getInventoryItemDef } from '@/types/inventory'

/** Offset from cursor; tooltip size guess for viewport clamping. */
const TOOLTIP_OFFSET = 14
const TOOLTIP_MAX_W = 288
const TOOLTIP_MAX_H = 140

const MIN_DISPLAY_SLOTS = 12

const props = defineProps<{
  open: boolean
  stacks: InventoryStack[]
  currentWeightKg: number
  capacityKg: number
  isFull: boolean
}>()

defineEmits<{
  dump: [itemId: string]
}>()

const hoverIdx = ref(-1)
const tooltipStack = ref<InventoryStack | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

const tooltipStyle = computed(() => {
  let x = tooltipX.value + TOOLTIP_OFFSET
  let y = tooltipY.value + TOOLTIP_OFFSET
  if (typeof window !== 'undefined') {
    const m = 8
    x = Math.min(x, window.innerWidth - TOOLTIP_MAX_W - m)
    y = Math.min(y, window.innerHeight - TOOLTIP_MAX_H - m)
    x = Math.max(m, x)
    y = Math.max(m, y)
  }
  return {
    left: `${x}px`,
    top: `${y}px`,
  }
})

const currentWeight = computed(() => props.currentWeightKg.toFixed(1))
const fillPct = computed(() => (props.currentWeightKg / props.capacityKg) * 100)

const cells = computed(() => {
  const sorted = [...props.stacks].sort((a, b) => {
    const la = getInventoryItemDef(a.itemId)?.label ?? a.itemId
    const lb = getInventoryItemDef(b.itemId)?.label ?? b.itemId
    return la.localeCompare(lb)
  })
  const n = Math.max(MIN_DISPLAY_SLOTS, sorted.length)
  const out: (InventoryStack | null)[] = sorted.map((s) => s)
  while (out.length < n) out.push(null)
  return out
})

const tooltipVisible = computed(() => tooltipStack.value !== null)

const tooltipTitle = computed(() => {
  const s = tooltipStack.value
  if (!s) return ''
  return getInventoryItemDef(s.itemId)?.label ?? s.itemId
})

const tooltipDesc = computed(() => {
  const s = tooltipStack.value
  if (!s) return ''
  return getInventoryItemDef(s.itemId)?.description ?? ''
})

const tooltipWeight = computed(() => {
  const s = tooltipStack.value
  if (!s) return ''
  const def = getInventoryItemDef(s.itemId)
  if (def?.category === 'component' && def.weightPerUnit != null) {
    const unit = def.weightPerUnit.toFixed(2)
    return `${s.totalWeightKg.toFixed(2)} kg total · ${unit} kg × ${s.quantity}`
  }
  return `${s.totalWeightKg.toFixed(2)} kg total · ${s.quantity} sample(s)`
})

function thumbSrc(itemId: string): string {
  return getInventoryItemDef(itemId)?.image ?? '/basalt.jpg'
}

function labelFor(itemId: string): string {
  return getInventoryItemDef(itemId)?.label ?? itemId
}

/**
 * Native tooltip on the count badge: samples for rocks, units for components.
 */
function countTitle(cell: InventoryStack): string {
  const def = getInventoryItemDef(cell.itemId)
  const n = cell.quantity
  if (def?.category === 'component') {
    return n === 1 ? '1 unit' : `${n} units`
  }
  return n === 1 ? '1 sample' : `${n} samples`
}

function updateTooltipPos(e: MouseEvent): void {
  tooltipX.value = e.clientX
  tooltipY.value = e.clientY
}

function onSlotEnter(e: MouseEvent, idx: number, cell: InventoryStack | null): void {
  hoverIdx.value = idx
  tooltipStack.value = cell
  if (cell) updateTooltipPos(e)
}

function onSlotMove(e: MouseEvent, cell: InventoryStack | null): void {
  if (cell) updateTooltipPos(e)
}

function onLeave(): void {
  hoverIdx.value = -1
  tooltipStack.value = null
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) onLeave()
  },
)
</script>

<style scoped>
.inventory-panel {
  position: fixed;
  bottom: 80px;
  left: 16px;
  width: 300px;
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

.inv-slots-wrap {
  position: relative;
}

.inv-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
}

.inv-slot {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  border: 1px solid rgba(196, 117, 58, 0.25);
  background: rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.inv-slot.empty {
  border-style: dashed;
  border-color: rgba(196, 117, 58, 0.15);
  background: rgba(0, 0, 0, 0.15);
}

.inv-slot.hover {
  border-color: rgba(93, 201, 165, 0.45);
  box-shadow: 0 0 0 1px rgba(93, 201, 165, 0.2);
}

.inv-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.inv-slot-empty {
  font-size: 14px;
  color: rgba(196, 117, 58, 0.2);
}

.inv-count {
  position: absolute;
  bottom: 2px;
  right: 2px;
  min-width: 18px;
  padding: 0 3px 0 2px;
  font-size: 8px;
  font-weight: bold;
  color: #1a0d08;
  background: rgba(232, 160, 96, 0.95);
  border-radius: 3px;
  text-align: center;
  line-height: 14px;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.inv-dump-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  color: rgba(224, 80, 48, 0.85);
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(224, 80, 48, 0.35);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
}

.inv-dump-btn:hover {
  color: #fff;
  background: rgba(224, 80, 48, 0.7);
}

.inv-tooltip {
  padding: 8px 10px;
  background: rgba(6, 4, 2, 0.95);
  border: 1px solid rgba(196, 117, 58, 0.35);
  border-radius: 6px;
  pointer-events: none;
}

.inv-tooltip--cursor {
  position: fixed;
  z-index: 55;
  max-width: 280px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}

.inv-tip-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 0.08em;
  color: #e8a060;
  margin-bottom: 4px;
}

.inv-tip-desc {
  font-size: 9px;
  line-height: 1.35;
  color: rgba(196, 149, 106, 0.75);
  margin-bottom: 6px;
}

.inv-tip-weight {
  font-size: 9px;
  color: rgba(93, 201, 165, 0.85);
  font-variant-numeric: tabular-nums;
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
