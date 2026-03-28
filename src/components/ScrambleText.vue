<template>
  <span class="scramble-text">{{ displayText }}</span>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'

const props = withDefaults(defineProps<{
  text: string
  play?: boolean
  chars?: string
  speed?: number // ms between frame updates
  scrambleFrames?: number // how many frames a character scrambles before locking in
  stagger?: number // frames to wait before the next character starts appearing
  playSound?: boolean // whether to play typing sound
  delay?: number // ms to wait before starting the animation
}>(), {
  play: true,
  chars: '!<>-_\\/[]{}—=+*^?#________',
  speed: 30,
  scrambleFrames: 8,
  stagger: 2,
  playSound: false,
  delay: 0,
})

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const audio = useAudio()
const displayText = ref('')
let frame = 0
let animationFrameId: number | null = null
let timeoutId: number | null = null
let lastTime = 0

function randomChar() {
  return props.chars[Math.floor(Math.random() * props.chars.length)]
}

function update(time: number) {
  if (!lastTime) lastTime = time
  const delta = time - lastTime

  if (delta >= props.speed) {
    // Keep the remainder to ensure consistent timing regardless of framerate
    lastTime = time - (delta % props.speed)
    frame++

    let output = ''
    let allLocked = true
    let newlyLocked = false

    for (let i = 0; i < props.text.length; i++) {
      const char = props.text[i]
      
      // Preserve spaces and newlines immediately
      if (char === ' ' || char === '\n') {
        // Only append if we've reached this character's start frame
        if (frame >= i * props.stagger) {
          output += char
        } else {
          allLocked = false
        }
        continue
      }

      const startFrame = i * props.stagger
      const lockFrame = startFrame + props.scrambleFrames

      if (frame >= lockFrame) {
        // Character is locked in
        output += char
        if (frame === lockFrame) newlyLocked = true
      } else if (frame >= startFrame) {
        // Character is currently scrambling
        output += randomChar()
        allLocked = false
      } else {
        // Character hasn't started typing yet
        allLocked = false
      }
    }

    displayText.value = output

    // Play sound when a new character starts or locks
    if (props.playSound && !allLocked && frame % Math.max(1, props.stagger) === 0) {
      audio.play('ui.type' as AudioSoundId)
    }

    if (allLocked && frame > 0) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      emit('complete')
      return
    }
  }

  animationFrameId = requestAnimationFrame(update)
}

function start() {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId)
  if (timeoutId !== null) clearTimeout(timeoutId)
  
  frame = 0
  lastTime = 0
  displayText.value = ''
  
  if (props.delay > 0) {
    timeoutId = window.setTimeout(() => {
      animationFrameId = requestAnimationFrame(update)
    }, props.delay)
  } else {
    animationFrameId = requestAnimationFrame(update)
  }
}

watch(() => props.play, (newVal) => {
  if (newVal) {
    start()
  } else {
    displayText.value = props.text
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
})

watch(() => props.text, () => {
  if (props.play) {
    start()
  } else {
    displayText.value = props.text
  }
})

onMounted(() => {
  if (props.play) {
    start()
  } else {
    displayText.value = props.text
  }
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
  }
})
</script>

<style scoped>
.scramble-text {
  display: inline;
  white-space: pre-wrap;
}
</style>
