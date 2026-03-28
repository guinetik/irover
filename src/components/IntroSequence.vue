<template>
  <template v-if="!skipIntro">
    <IntroVideoOverlay
      v-if="showVideo"
      :site-id="siteId"
      :latitude="latitude"
      :longitude="longitude"
      :archetype-name="archetypeName"
      :scene-ready="!siteLoading"
      @complete="onVideoComplete"
    />
    <RoverDeployOverlays
      v-if="!showVideo"
      :descending="descending"
      :deploying="deploying"
      :deploy-progress="deployProgress"
    />
  </template>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import IntroVideoOverlay from '@/components/IntroVideoOverlay.vue'
import RoverDeployOverlays from '@/components/RoverDeployOverlays.vue'

const props = defineProps<{
  skipIntro: boolean
  siteLoading: boolean
  descending: boolean
  deploying: boolean
  deployProgress: number
  siteId: string
  latitude: number
  longitude: number
  archetypeName: string
}>()

const emit = defineEmits<{
  (e: 'intro-complete'): void
}>()

const showVideo = ref(!props.skipIntro)

function onVideoComplete() {
  showVideo.value = false
}

// Emit intro-complete when rover is fully deployed (not descending, not deploying, and video done)
watch(
  () => !props.descending && !props.deploying && !props.siteLoading && !showVideo.value,
  (allDone) => {
    if (allDone && !props.skipIntro) {
      emit('intro-complete')
    }
  },
)

// For skip-intro path: emit immediately once loading finishes
watch(
  () => !props.siteLoading && props.skipIntro,
  (ready) => {
    if (ready) emit('intro-complete')
  },
  { immediate: true },
)
</script>
