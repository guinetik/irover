<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useIntroMusic } from '@/composables/useIntroMusic'

useIntroMusic()
</script>
