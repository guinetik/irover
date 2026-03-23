<template>
  <Teleport to="body">
    <Transition name="prof-slide">
      <div v-if="open" class="profile-panel">
        <div class="prof-header">
          <span class="prof-title">ROVER PROFILE</span>
        </div>

        <!-- Choices -->
        <div class="prof-choices">
          <div class="prof-choice">
            <div class="prof-choice-label">ARCHETYPE</div>
            <div class="prof-choice-value">{{ archetypeName }}</div>
          </div>
          <div class="prof-choice">
            <div class="prof-choice-label">FOUNDATION</div>
            <div class="prof-choice-value">{{ foundationName }}</div>
          </div>
          <div class="prof-choice">
            <div class="prof-choice-label">PATRON</div>
            <div class="prof-choice-value">{{ patronName }}</div>
          </div>
        </div>

        <div class="prof-divider" />

        <!-- Modifiers -->
        <div class="prof-mods">
          <div
            v-for="m in modifierRows"
            :key="m.key"
            class="prof-mod-row"
          >
            <span class="prof-mod-label">{{ m.label }}</span>
            <span class="prof-mod-value" :class="m.cls">{{ m.display }}</span>
          </div>
        </div>

        <div class="prof-footer">[0] CLOSE</div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  usePlayerProfile,
  ARCHETYPES,
  FOUNDATIONS,
  PATRONS,
  type ProfileModifiers,
} from '@/composables/usePlayerProfile'

defineProps<{ open: boolean }>()

const { profile } = usePlayerProfile()

const archetypeName = computed(() =>
  profile.archetype ? ARCHETYPES[profile.archetype].name : 'NONE',
)
const foundationName = computed(() =>
  profile.foundation ? FOUNDATIONS[profile.foundation].name : 'NONE',
)
const patronName = computed(() =>
  profile.patron ? PATRONS[profile.patron].fullName ?? PATRONS[profile.patron].name : 'NONE',
)

const MOD_LABELS: Record<keyof ProfileModifiers, string> = {
  movementSpeed: 'MOVE SPD',
  analysisSpeed: 'ANALYSIS SPD',
  powerConsumption: 'PWR DRAW',
  heaterDraw: 'HEATER DRAW',
  spYield: 'SP YIELD',
  inventorySpace: 'CARGO',
  instrumentAccuracy: 'ACCURACY',
  repairCost: 'REPAIR COST',
  upgradeCost: 'UPGRADE COST',
  weatherWarning: 'WX WARNING',
  batteryCapacity: 'BATTERY CAP',
  danScanRadius: 'DAN RADIUS',
  buildSpeed: 'BUILD SPD',
  structureDurability: 'STRUCT HP',
}

// For "cost" and "draw" modifiers, lower is better (invert the color logic)
const INVERTED_KEYS = new Set<string>([
  'powerConsumption', 'heaterDraw', 'repairCost', 'upgradeCost',
])

const modifierRows = computed(() => {
  const mods = profile.modifiers
  return (Object.keys(MOD_LABELS) as (keyof ProfileModifiers)[]).map(key => {
    const val = mods[key]
    const pct = Math.round((val - 1) * 100)
    const inverted = INVERTED_KEYS.has(key)
    let cls = 'neutral'
    if (pct > 0) cls = inverted ? 'nerf' : 'buff'
    else if (pct < 0) cls = inverted ? 'buff' : 'nerf'
    const sign = pct > 0 ? '+' : ''
    return {
      key,
      label: MOD_LABELS[key],
      display: pct === 0 ? '—' : `${sign}${pct}%`,
      cls,
    }
  })
})
</script>

<style scoped>
.profile-panel {
  position: fixed;
  left: 80px;
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  background: rgba(10, 5, 2, 0.88);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(196, 117, 58, 0.3);
  border-radius: 8px;
  padding: 12px;
  z-index: 45;
  font-family: var(--font-ui);
}

.prof-header {
  margin-bottom: 10px;
}

.prof-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: #e8a060;
}

.prof-choices {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.prof-choice {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.prof-choice-label {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.4);
  letter-spacing: 0.12em;
}

.prof-choice-value {
  font-size: 11px;
  color: #c4956a;
  font-weight: bold;
  letter-spacing: 0.08em;
}

.prof-divider {
  height: 1px;
  background: rgba(196, 117, 58, 0.15);
  margin: 6px 0;
}

.prof-mods {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
}

.prof-mod-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 4px;
  border-radius: 3px;
}

.prof-mod-label {
  font-size: 10px;
  color: rgba(196, 117, 58, 0.5);
  letter-spacing: 0.08em;
}

.prof-mod-value {
  font-family: var(--font-instrument);
  font-size: 11px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.prof-mod-value.neutral {
  color: rgba(196, 117, 58, 0.25);
}

.prof-mod-value.buff {
  color: #5dc9a5;
}

.prof-mod-value.nerf {
  color: #e05030;
}

.prof-footer {
  text-align: center;
  margin-top: 8px;
  font-size: 11px;
  color: rgba(196, 117, 58, 0.3);
  letter-spacing: 0.15em;
}

.prof-slide-enter-active,
.prof-slide-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.prof-slide-enter-from,
.prof-slide-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}
</style>
