<template>
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useIntroMusic } from '@/composables/useIntroMusic'
import { useActiveSite } from '@/composables/useActiveSite'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { setSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'

useIntroMusic()

/**
 * Returning players with a saved landing site should not replay the sky-crane intro.
 */
onMounted(() => {
  const { activeSite } = useActiveSite()
  const { profile } = usePlayerProfile()
  if (activeSite.value?.siteId && profile.patron) {
    setSiteIntroSequenceSkipped(true)
  }
})
</script>
