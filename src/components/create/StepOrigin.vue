<template>
  <div class="step">
    <p class="prompt">Where did you grow up?</p>
    <div class="options">
      <CreateOptionCard
        v-for="o in origins"
        :key="o.id"
        :name="o.name"
        :description="o.description"
        :selected="modelValue === o.id"
        @select="$emit('update:modelValue', o.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { ORIGINS, type OriginId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: OriginId | null }>()
defineEmits<{ 'update:modelValue': [value: OriginId] }>()

const origins = Object.values(ORIGINS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
