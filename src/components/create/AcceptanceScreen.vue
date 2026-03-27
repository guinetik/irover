<template>
  <div class="acceptance">
    <p class="line dim">> Application #MEC-2187-{{ appNumber }} APPROVED.</p>
    <p class="line">&nbsp;</p>
    <p class="line bright">Congratulations, Operator.</p>
    <p class="line">&nbsp;</p>
    <p class="line">You have been assigned to ROVER UNIT {{ roverId }}.</p>
    <p class="line dim">Vehicle: MSL-class Curiosity (refurbished)</p>
    <p class="line">&nbsp;</p>
    <p class="line dim">Please report to your local Spaceport</p>
    <p class="line dim">on Monday at 0600 for credential processing</p>
    <p class="line dim">and neural uplink calibration.</p>
    <p class="line">&nbsp;</p>
    <p class="line dim">Pack light. Mars provides the rest.</p>

    <button class="btn" @click="handleAccept">[ ACCEPT APPLICATION ]</button>
  </div>
</template>

<script setup lang="ts">
import { useAudio } from '@/audio/useAudio'
import type { AudioSoundId } from '@/audio/audioManifest'

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
  color: rgba(196, 149, 106, 0.9);
}

.line.dim {
  color: rgba(196, 149, 106, 0.5);
}

.line.bright {
  color: #c4956a;
  font-weight: 600;
}

.btn {
  margin-top: 40px;
  align-self: flex-start;
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.4);
  color: #c4956a;
  font-family: var(--font-mono);
  font-size: 13px;
  padding: 10px 32px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: border-color 0.2s, color 0.2s;
}

.btn:hover {
  border-color: rgba(196, 149, 106, 0.8);
  color: rgba(196, 149, 106, 1);
}
</style>
