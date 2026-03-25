<template>
  <div class="step">
    <p class="prompt">What is your desired position within the Mars Exploration Consortium?</p>
    <div class="options">
      <CreateOptionCard
        v-for="p in positions"
        :key="p.id"
        :name="p.name"
        :description="p.description"
        :selected="modelValue === p.id"
        @select="$emit('update:modelValue', p.id)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import CreateOptionCard from './CreateOptionCard.vue'

export type PositionId = 'ceo' | 'personality' | 'operator'

interface PositionDef {
  id: PositionId
  name: string
  description: string
}

const positions: PositionDef[] = [
  {
    id: 'ceo',
    name: 'CEO of a Multiplanetary Startup',
    description: 'You have a pitch deck. You have a vision. You have absolutely no relevant experience.',
  },
  {
    id: 'personality',
    name: 'Personality Hire',
    description: "You're a people person. You have great energy. You were told that counts for something.",
  },
  {
    id: 'operator',
    name: 'Remote Rover Operator',
    description: 'You read the job listing. You meet the qualifications. You applied for the actual job.',
  },
]

defineProps<{ modelValue: PositionId | null }>()
defineEmits<{ 'update:modelValue': [value: PositionId] }>()
</script>

<style scoped>
.step { display: flex; flex-direction: column; gap: 24px; }
.prompt { font-size: 14px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; }
.options { display: flex; flex-direction: column; gap: 4px; }
</style>
