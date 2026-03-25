<template>
  <div class="step">
    <p class="prompt">Which best describes your approach to problem-solving?</p>
    <div class="options">
      <CreateOptionCard
        v-for="a in archetypes"
        :key="a.id"
        :name="a.name"
        :description="a.description"
        :selected="modelValue === a.id"
        @select="$emit('update:modelValue', a.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { ARCHETYPES, type ArchetypeId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: ArchetypeId | null }>()
defineEmits<{ 'update:modelValue': [value: ArchetypeId] }>()

const archetypes = Object.values(ARCHETYPES)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
