<template>
  <button
    class="option"
    :class="{ selected }"
    @click="$emit('select')"
  >
    <span class="radio">{{ selected ? '\u25CF' : '\u25CB' }}</span>
    <span class="label">
      <span class="name">{{ name }}</span>
      <span class="desc">"{{ description }}"</span>
    </span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  description: string
  selected: boolean
}>()

defineEmits<{
  select: []
}>()
</script>

<style scoped>
.option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.75);
  transition: color 0.15s ease;
}

.option:hover {
  color: rgba(255, 255, 255, 0.95);
}

.option.selected {
  color: rgba(255, 220, 170, 1);
}

.radio {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.6;
}

.label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.desc {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  opacity: 0.7;
  padding-left: 2px;
}
</style>
