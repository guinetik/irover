<template>
  <div class="w-full h-full">
    <MarsCanvas
      @ready="onReady"
      @hover="onHover"
      @select="onSelect"
      @progress="onProgress"
    />
    <LandmarkTooltip
      v-if="!isMobile"
      :landmark="hoveredLandmark"
      :x="tooltipX"
      :y="tooltipY"
    />
    <LandmarkInfoCard
      :landmark="selectedLandmark"
      @close="selectedLandmark = null"
    />
    <LoadingOverlay
      :is-loading="isLoading"
      :loaded="tilesLoaded"
      :total="tilesTotal"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import MarsCanvas from '@/components/MarsCanvas.vue'
import LandmarkTooltip from '@/components/LandmarkTooltip.vue'
import LandmarkInfoCard from '@/components/LandmarkInfoCard.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import type { Landmark, LandmarkHoverEvent } from '@/types/landmark'

const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const isLoading = ref(true)
const tilesLoaded = ref(0)
const tilesTotal = ref(0)
const hoveredLandmark = ref<Landmark | null>(null)
const selectedLandmark = ref<Landmark | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

function onReady() {
  isLoading.value = false
}

function onHover(event: LandmarkHoverEvent | null) {
  if (event) {
    hoveredLandmark.value = event.landmark
    tooltipX.value = event.screenX
    tooltipY.value = event.screenY
  } else {
    hoveredLandmark.value = null
  }
}

function onSelect(landmark: Landmark) {
  selectedLandmark.value = landmark
}

function onProgress(loaded: number, total: number) {
  tilesLoaded.value = loaded
  tilesTotal.value = total
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') selectedLandmark.value = null
}

window.addEventListener('keydown', onKeyDown)
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>
