<template>
  <div class="step">
    <p class="prompt">What are your professional foundations?</p>
    <div class="options">
      <CreateOptionCard
        v-for="f in foundations"
        :key="f.id"
        :name="f.name"
        :description="f.description"
        :selected="modelValue === f.id"
        @select="$emit('update:modelValue', f.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import { FOUNDATIONS, type FoundationId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: FoundationId | null }>()
defineEmits<{ 'update:modelValue': [value: FoundationId] }>()

const foundations = Object.values(FOUNDATIONS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
