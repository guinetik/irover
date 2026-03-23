<template>
  <div class="ssr-root">
    <!-- Two-column body -->
    <div class="ssr-body">

      <!-- Left: inventory list -->
      <div class="ssr-col-left">
        <div class="ssr-col-title">SELECT SAMPLE</div>
        <div class="ssr-item-list">
          <div
            v-for="stack in analyzableStacks"
            :key="stack.itemId"
            class="ssr-item-row"
            :class="{ selected: selectedSampleId === stack.itemId }"
            @click="selectSample(stack.itemId)"
          >
            <div class="ssr-item-thumb-wrap">
              <img
                class="ssr-item-thumb"
                :src="thumbSrc(stack.itemId)"
                :alt="labelFor(stack.itemId)"
              />
            </div>
            <div class="ssr-item-info">
              <div class="ssr-item-label">{{ labelFor(stack.itemId) }}</div>
              <div class="ssr-item-qty font-instrument">
                <template v-if="isRock(stack.itemId)">
                  {{ stack.quantity }}x &nbsp;·&nbsp; {{ stack.totalWeightKg.toFixed(2) }} kg
                </template>
                <template v-else>
                  {{ stack.quantity }} units
                </template>
              </div>
            </div>
            <div class="ssr-item-affinity">
              <span
                v-if="affinityFor(stack.itemId)"
                class="ssr-affinity-badge"
                :class="'affinity-' + affinityFor(stack.itemId)"
              >
                {{ affinityFor(stack.itemId)!.toUpperCase() }}
              </span>
              <span v-else class="ssr-affinity-badge affinity-unknown">UNKNOWN</span>
            </div>
          </div>

          <div v-if="analyzableStacks.length === 0" class="ssr-empty">
            No samples in inventory
          </div>
        </div>
      </div>

      <!-- Right: selection detail + outcomes -->
      <div class="ssr-col-right">

        <!-- Selected sample display -->
        <div class="ssr-selected-wrap">
          <template v-if="selectedStack">
            <div class="ssr-selected-card">
              <div class="ssr-selected-thumb-wrap">
                <img
                  class="ssr-selected-thumb"
                  :src="thumbSrc(selectedStack.itemId)"
                  :alt="labelFor(selectedStack.itemId)"
                />
              </div>
              <div class="ssr-selected-info">
                <div class="ssr-selected-name">{{ labelFor(selectedStack.itemId) }}</div>
                <div class="ssr-selected-consumption font-instrument">
                  <span class="ssr-consume-icon">&#x2212;</span>
                  <template v-if="isRock(selectedStack.itemId)">
                    {{ props.sampleConsumptionKg.toFixed(3) }} kg will be consumed
                  </template>
                  <template v-else>
                    1 unit will be consumed
                  </template>
                </div>
              </div>
            </div>

            <!-- Ingredient requirements -->
            <div v-if="props.mode.ingredients.length > 0" class="ssr-ingredients">
              <div class="ssr-ingredients-title">ALSO REQUIRES</div>
              <div
                v-for="ing in props.mode.ingredients"
                :key="ing.itemId"
                class="ssr-ingredient-row"
                :class="{ missing: !ingredientMet(ing.itemId, ing.quantity) }"
              >
                <span class="ssr-ingredient-qty font-instrument">{{ ing.quantity }}x</span>
                <span class="ssr-ingredient-label">{{ labelFor(ing.itemId) }}</span>
                <span class="ssr-ingredient-status">
                  <template v-if="ingredientMet(ing.itemId, ing.quantity)">
                    <span class="ssr-ing-ok">&#x2713; AVAILABLE</span>
                  </template>
                  <template v-else>
                    <span class="ssr-ing-missing">&#x2717; MISSING</span>
                  </template>
                </span>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="ssr-no-selection">
              <div class="ssr-no-sel-icon">&#x25A1;</div>
              <div class="ssr-no-sel-text">No sample selected</div>
            </div>
          </template>
        </div>

        <!-- Expected outcomes -->
        <div class="ssr-outcomes-wrap">
          <div class="ssr-outcomes-title">EXPECTED OUTCOMES</div>

          <template v-if="selectedSampleId && groupedDiscoveries.length > 0">
            <div
              v-for="group in groupedDiscoveries"
              :key="group.rarity"
              class="ssr-rarity-group"
            >
              <div class="ssr-rarity-header">
                <span class="ssr-rarity-dot" :class="'rarity-' + group.rarity" />
                <span class="ssr-rarity-label" :class="'rarity-' + group.rarity">
                  {{ group.rarity.toUpperCase() }}
                </span>
              </div>
              <div
                v-for="disc in group.items"
                :key="disc.id"
                class="ssr-discovery-row"
              >
                <span class="ssr-discovery-name">{{ disc.name }}</span>
                <span v-if="disc.sp > 0" class="ssr-discovery-sp font-instrument">
                  +{{ disc.sp }} SP
                </span>
              </div>
            </div>
          </template>

          <template v-else-if="selectedSampleId">
            <div class="ssr-outcomes-empty">No known discoveries for this sample + mode combination.</div>
          </template>

          <template v-else>
            <div class="ssr-outcomes-empty">Select a sample to see possible discoveries.</div>
          </template>
        </div>

      </div>
    </div>

    <!-- Footer -->
    <div class="ssr-footer">
      <button class="ssr-btn ssr-btn-back" @click="$emit('back')">
        &#x2190; BACK
      </button>
      <button
        class="ssr-btn ssr-btn-next"
        :disabled="!canProceed"
        @click="onConfirm"
      >
        NEXT &#x2192;
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SAMAnalysisMode, SAMDiscovery } from '@/types/samExperiments'
import type { InventoryStack } from '@/types/inventory'
import { INVENTORY_CATALOG } from '@/types/inventory'

const props = defineProps<{
  mode: SAMAnalysisMode
  stacks: InventoryStack[]
  sampleConsumptionKg: number
  possibleDiscoveries: SAMDiscovery[]
}>()

const emit = defineEmits<{
  confirm: [sampleId: string]
  back: []
  sampleSelected: [sampleId: string]
}>()

// ─── Internal state ───────────────────────────────────────────────────────────

const selectedSampleId = ref<string | null>(null)

// ─── Derived ─────────────────────────────────────────────────────────────────

/** Filter to items that are potentially analyzable (quantity > 0, not components) */
const analyzableStacks = computed(() =>
  props.stacks.filter((s) => {
    if (s.quantity <= 0) return false
    const def = INVENTORY_CATALOG[s.itemId]
    if (!def) return false
    // Skip pure engineering/component items; rocks, traces, refined are valid samples
    return def.category === 'rock' || def.category === 'trace' || def.category === 'refined'
  }),
)

const selectedStack = computed<InventoryStack | undefined>(() =>
  selectedSampleId.value
    ? props.stacks.find((s) => s.itemId === selectedSampleId.value)
    : undefined,
)

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'] as const

/** Group possibleDiscoveries by rarity, ordered common → legendary */
const groupedDiscoveries = computed(() => {
  const map = new Map<string, SAMDiscovery[]>()
  for (const d of props.possibleDiscoveries) {
    if (!map.has(d.rarity)) map.set(d.rarity, [])
    map.get(d.rarity)!.push(d)
  }
  return RARITY_ORDER
    .filter((r) => map.has(r))
    .map((r) => ({ rarity: r, items: map.get(r)! }))
})

/** Whether every required ingredient is present in the stacks */
const allIngredientsMet = computed(() =>
  props.mode.ingredients.every((ing) => ingredientMet(ing.itemId, ing.quantity)),
)

const canProceed = computed(() => selectedSampleId.value !== null && allIngredientsMet.value)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelFor(itemId: string): string {
  return INVENTORY_CATALOG[itemId]?.label ?? itemId
}

function thumbSrc(itemId: string): string {
  return INVENTORY_CATALOG[itemId]?.image ?? '/basalt.jpg'
}

function isRock(itemId: string): boolean {
  return INVENTORY_CATALOG[itemId]?.category === 'rock'
}

function affinityFor(itemId: string): string | null {
  return props.mode.affinities[itemId] ?? null
}

function ingredientMet(itemId: string, required: number): boolean {
  const stack = props.stacks.find((s) => s.itemId === itemId)
  return stack !== undefined && stack.quantity >= required
}

// ─── Actions ──────────────────────────────────────────────────────────────────

function selectSample(itemId: string): void {
  selectedSampleId.value = itemId
  emit('sampleSelected', itemId)
}

function onConfirm(): void {
  if (selectedSampleId.value && canProceed.value) {
    emit('confirm', selectedSampleId.value)
  }
}
</script>

<style scoped>
/* ── Root layout ────────────────────────────────────────────────────────────── */
.ssr-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-ui);
  color: rgba(196, 149, 106, 0.85);
}

.ssr-body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

/* ── Columns ────────────────────────────────────────────────────────────────── */
.ssr-col-left {
  width: 45%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(196, 117, 58, 0.12);
  min-height: 0;
}

.ssr-col-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ssr-col-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #e8a060;
  padding: 12px 16px 8px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.1);
  flex-shrink: 0;
}

/* ── Item list ──────────────────────────────────────────────────────────────── */
.ssr-item-list {
  overflow-y: auto;
  flex: 1;
  padding: 6px 8px;
}

.ssr-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  margin-bottom: 4px;
}

.ssr-item-row:hover {
  background: rgba(196, 117, 58, 0.07);
  border-color: rgba(196, 117, 58, 0.2);
}

.ssr-item-row.selected {
  background: rgba(196, 117, 58, 0.13);
  border-color: rgba(232, 160, 96, 0.5);
  box-shadow: 0 0 0 1px rgba(232, 160, 96, 0.15);
}

.ssr-item-thumb-wrap {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(196, 117, 58, 0.2);
  background: rgba(0, 0, 0, 0.4);
}

.ssr-item-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ssr-item-info {
  flex: 1;
  min-width: 0;
}

.ssr-item-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(232, 160, 96, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.04em;
}

.ssr-item-qty {
  font-size: 10px;
  color: rgba(196, 149, 106, 0.5);
  margin-top: 2px;
  letter-spacing: 0.06em;
}

/* ── Affinity badge ─────────────────────────────────────────────────────────── */
.ssr-affinity-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 2px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}

.affinity-excellent {
  background: rgba(34, 197, 94, 0.18);
  color: #4ade80;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.affinity-good {
  background: rgba(20, 184, 166, 0.18);
  color: #2dd4bf;
  border: 1px solid rgba(20, 184, 166, 0.3);
}

.affinity-moderate {
  background: rgba(232, 160, 96, 0.18);
  color: #e8a060;
  border: 1px solid rgba(232, 160, 96, 0.3);
}

.affinity-poor {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.affinity-unknown {
  background: rgba(120, 120, 120, 0.12);
  color: rgba(180, 180, 180, 0.55);
  border: 1px solid rgba(120, 120, 120, 0.2);
}

.ssr-empty {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.35);
  letter-spacing: 0.1em;
  padding: 20px 8px;
  text-align: center;
}

/* ── Right column: selected card ────────────────────────────────────────────── */
.ssr-selected-wrap {
  flex-shrink: 0;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(196, 117, 58, 0.1);
  min-height: 96px;
}

.ssr-selected-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.ssr-selected-thumb-wrap {
  width: 52px;
  height: 52px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid rgba(232, 160, 96, 0.35);
  background: rgba(0, 0, 0, 0.5);
}

.ssr-selected-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ssr-selected-name {
  font-size: 13px;
  font-weight: 700;
  color: #e8a060;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

.ssr-selected-consumption {
  font-size: 10px;
  color: rgba(196, 149, 106, 0.6);
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ssr-consume-icon {
  color: #c4753a;
  font-size: 12px;
}

.ssr-no-selection {
  text-align: center;
  padding: 16px 0;
}

.ssr-no-sel-icon {
  font-size: 28px;
  color: rgba(196, 117, 58, 0.15);
  margin-bottom: 6px;
}

.ssr-no-sel-text {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.1em;
}

/* ── Ingredients ────────────────────────────────────────────────────────────── */
.ssr-ingredients {
  margin-top: 4px;
}

.ssr-ingredients-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(196, 117, 58, 0.45);
  margin-bottom: 5px;
}

.ssr-ingredient-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 3px 0;
}

.ssr-ingredient-row.missing .ssr-ingredient-label {
  color: rgba(248, 113, 113, 0.7);
}

.ssr-ingredient-qty {
  color: rgba(196, 149, 106, 0.6);
  min-width: 22px;
}

.ssr-ingredient-label {
  flex: 1;
  color: rgba(196, 149, 106, 0.8);
}

.ssr-ingredient-status {
  font-size: 10px;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.ssr-ing-ok {
  color: #4ade80;
}

.ssr-ing-missing {
  color: #f87171;
}

/* ── Expected outcomes ──────────────────────────────────────────────────────── */
.ssr-outcomes-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 0;
}

.ssr-outcomes-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #e8a060;
  margin-bottom: 10px;
}

.ssr-rarity-group {
  margin-bottom: 10px;
}

.ssr-rarity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.ssr-rarity-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ssr-rarity-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
}

.rarity-common .ssr-rarity-dot,
.rarity-common {
  background: #888;
  color: #888;
}

.ssr-rarity-dot.rarity-common {
  background: #888;
}

.ssr-rarity-dot.rarity-uncommon {
  background: #5dc9a5;
}

.ssr-rarity-dot.rarity-rare {
  background: #ef9f27;
}

.ssr-rarity-dot.rarity-legendary {
  background: #cc44ff;
}

.ssr-rarity-label.rarity-common   { color: #888; }
.ssr-rarity-label.rarity-uncommon { color: #5dc9a5; }
.ssr-rarity-label.rarity-rare     { color: #ef9f27; }
.ssr-rarity-label.rarity-legendary { color: #cc44ff; }

.ssr-discovery-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0 3px 13px;
  font-size: 11px;
  border-left: 1px solid rgba(196, 117, 58, 0.12);
  margin-bottom: 2px;
}

.ssr-discovery-name {
  color: rgba(196, 149, 106, 0.75);
  letter-spacing: 0.04em;
}

.ssr-discovery-sp {
  font-size: 10px;
  color: rgba(93, 201, 165, 0.7);
  margin-left: 8px;
  flex-shrink: 0;
}

.ssr-outcomes-empty {
  font-size: 11px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.08em;
  padding: 8px 0;
}

/* ── Footer ─────────────────────────────────────────────────────────────────── */
.ssr-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  border-top: 1px solid rgba(196, 117, 58, 0.12);
  flex-shrink: 0;
}

.ssr-btn {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  padding: 7px 18px;
  border-radius: 4px;
  border: 1px solid;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}

.ssr-btn-back {
  background: transparent;
  border-color: rgba(196, 117, 58, 0.3);
  color: rgba(196, 117, 58, 0.6);
}

.ssr-btn-back:hover {
  background: rgba(196, 117, 58, 0.08);
  color: rgba(232, 160, 96, 0.85);
  border-color: rgba(196, 117, 58, 0.5);
}

.ssr-btn-next {
  background: rgba(196, 117, 58, 0.18);
  border-color: rgba(232, 160, 96, 0.45);
  color: #e8a060;
}

.ssr-btn-next:hover:not(:disabled) {
  background: rgba(196, 117, 58, 0.32);
  border-color: rgba(232, 160, 96, 0.7);
  color: #f0b878;
}

.ssr-btn-next:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
