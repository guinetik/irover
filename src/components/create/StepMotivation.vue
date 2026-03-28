<template>
  <div class="step">
    <p class="prompt">
      <ScrambleText text="What drives your interest in Mars exploration?" :play-sound="true" />
    </p>
    <div class="options">
      <CreateOptionCard
        v-for="(m, index) in motivations"
        :key="m.id"
        :name="m.name"
        :description="m.description"
        :selected="modelValue === m.id"
        :delay="300 + index * 150"
        @select="$emit('update:modelValue', m.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'
import ScrambleText from '@/components/ScrambleText.vue'
import { MOTIVATIONS, type MotivationId } from '@/composables/usePlayerProfile'

defineProps<{ modelValue: MotivationId | null }>()
defineEmits<{ 'update:modelValue': [value: MotivationId] }>()

const motivations = Object.values(MOTIVATIONS)
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 18px; color: rgba(255, 255, 255, 0.95); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
