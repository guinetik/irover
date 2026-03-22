<template>
  <Transition name="fade">
    <div v-if="isLoading" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="text-center">
        <p class="text-white/60 text-sm tracking-widest uppercase">Loading Mars surface...</p>
        <p v-if="total > 0" class="text-white/40 text-xs mt-2">{{ loaded }} / {{ total }}</p>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  isLoading: boolean
  loaded: number
  total: number
}>()
</script>

<style scoped>
.fade-leave-active { transition: opacity 0.6s ease; }
.fade-leave-to { opacity: 0; }
</style>
