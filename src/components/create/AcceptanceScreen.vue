<template>
  <div class="acceptance">
    <p class="line dim">
      <ScrambleText :text="`> Application #MEC-2187-${appNumber} APPROVED.`" :play-sound="true" :delay="0" />
    </p>
    <p class="line">&nbsp;</p>
    <p class="line bright">
      <ScrambleText text="Congratulations, Operator." :play-sound="true" :delay="600" />
    </p>
    <p class="line">&nbsp;</p>
    <p class="line">
      <ScrambleText :text="`You have been assigned to ROVER UNIT ${roverId}.`" :play-sound="true" :delay="1200" />
    </p>
    <p class="line dim">
      <ScrambleText text="Vehicle: MSL-class Curiosity (refurbished)" :play-sound="true" :delay="1800" />
    </p>
    <p class="line">&nbsp;</p>
    <p class="line dim">
      <ScrambleText text="Please report to your local Spaceport" :play-sound="true" :delay="2400" />
    </p>
    <p class="line dim">
      <ScrambleText text="on Monday at 0600 for credential processing" :play-sound="true" :delay="2800" />
    </p>
    <p class="line dim">
      <ScrambleText text="and neural uplink calibration." :play-sound="true" :delay="3200" />
    </p>
    <p class="line">&nbsp;</p>
    <p class="line dim">
      <ScrambleText text="Pack light. Mars provides the rest." :play-sound="true" :delay="4000" />
    </p>

    <button class="btn" @click="handleAccept">
      <ScrambleText text="[ ACCEPT APPLICATION ]" :play-sound="true" :delay="4800" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'
import ScrambleText from '@/components/ScrambleText.vue'

const emit = defineEmits<{ accept: [] }>()

const audio = useAudio()
function handleAccept(): void {
  audio.play('ui.confirm' as AudioSoundId)
  emit('accept')
}

const appNumber = String(Math.floor(Math.random() * 90000) + 10000)
const roverId = `MSL-2187-${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 900) + 100}`
</script>

<style scoped>
.acceptance {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.line {
  font-size: 13px;
  line-height: 1.8;
  margin: 0;
  color: rgba(255, 215, 165, 0.95);
}

.line.dim {
  color: rgba(255, 200, 145, 0.72);
}

.line.bright {
  color: rgba(255, 205, 140, 1);
  font-weight: 600;
}

.btn {
  margin-top: 40px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(255, 190, 120, 0.5);
  color: rgba(255, 200, 130, 1);
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 10px 32px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(255, 210, 150, 0.9);
  color: rgba(255, 220, 170, 1);
}
</style>
