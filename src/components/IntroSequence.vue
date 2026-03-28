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
import { ref, watch, onUnmounted } from 'vue'
import IntroVideoOverlay from '@/components/IntroVideoOverlay.vue'
import RoverDeployOverlays from '@/components/RoverDeployOverlays.vue'

/** Pause after deploy finishes before HUD / mission systems unlock (DSN message, theme, etc.). */
const POST_INTRO_SYSTEMS_DELAY_MS = 3000

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
  /** True while cinematics cover the scene; used to mute sky-crane SFX under the intro clip. */
  (e: 'video-overlay-visible', visible: boolean): void
}>()

const showVideo = ref(!props.skipIntro)

function onVideoComplete() {
  showVideo.value = false
}

watch(
  showVideo,
  (visible) => {
    emit('video-overlay-visible', props.skipIntro ? false : visible)
  },
  { immediate: true },
)

let systemsUnlockTimer: number | null = null

// Emit intro-complete when rover is fully deployed (not descending, not deploying, and video done)
watch(
  () => !props.descending && !props.deploying && !props.siteLoading && !showVideo.value,
  (allDone) => {
    if (props.skipIntro) return
    if (!allDone) {
      if (systemsUnlockTimer !== null) {
        clearTimeout(systemsUnlockTimer)
        systemsUnlockTimer = null
      }
      return
    }
    if (systemsUnlockTimer !== null) return
    systemsUnlockTimer = window.setTimeout(() => {
      systemsUnlockTimer = null
      emit('intro-complete')
    }, POST_INTRO_SYSTEMS_DELAY_MS)
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

onUnmounted(() => {
  if (systemsUnlockTimer !== null) {
    clearTimeout(systemsUnlockTimer)
    systemsUnlockTimer = null
  }
})
</script>
