<template>
  <Transition name="whiteout">
    <div v-if="active" class="meteor-whiteout" />
  </Transition>
</template>

<script setup lang="ts">
defineProps<{ active: boolean }>()
</script>

<style scoped>
.meteor-whiteout {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(120, 80, 30, 0.85);
  pointer-events: none;
}

.whiteout-enter-active {
  transition: opacity 0.15s ease;
}
.whiteout-leave-active {
  transition: opacity 1.5s ease;
}
.whiteout-enter-from,
.whiteout-leave-to {
  opacity: 0;
}
</style>
