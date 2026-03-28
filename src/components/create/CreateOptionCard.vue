<template>
  <button
    class="option"
    :class="{ selected }"
    @mouseenter="playHover"
    @click="handleClick"
  >
    <span class="radio">{{ selected ? '\u25CF' : '\u25CB' }}</span>
    <span class="label">
      <span class="name">
        <ScrambleText :text="name" :delay="delay" />
      </span>
      <span class="desc">
        "<ScrambleText :text="description" :delay="delay" :speed="5" :scramble-frames="2" :stagger="1" />"
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'
import ScrambleText from '@/components/ScrambleText.vue'

withDefaults(defineProps<{
  name: string
  description: string
  selected: boolean
  delay?: number
}>(), {
  delay: 0
})

const emit = defineEmits<{
  select: []
}>()

const audio = useAudio()

function playHover(): void {
  audio.play('ui.switch' as AudioSoundId)
}

function handleClick(): void {
  audio.play('ui.instrument' as AudioSoundId)
  emit('select')
}
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
