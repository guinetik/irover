<!-- src/components/InstrumentHelpDialog.vue -->
<template>
  <Teleport to="body">
    <Transition name="help-fade">
      <div v-if="open && help" class="help-overlay" @click.self="$emit('close')">
        <div class="help-dialog" role="dialog" aria-modal="true">

          <div class="help-header">
            <div class="help-title">
              <span class="help-instrument-name">{{ instrumentName }}</span>
              <span class="help-separator"> · </span>
              <span class="help-label">FIELD REFERENCE</span>
            </div>
            <button type="button" class="help-close" aria-label="Close" @click="$emit('close')">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="help-body">
            <p class="help-summary">{{ help.summary }}</p>

            <div v-for="section in help.sections" :key="section.heading" class="help-section">
              <div class="help-section-heading">── {{ section.heading }} ─────────────────────</div>
              <p class="help-section-body">{{ section.body }}</p>
            </div>

            <div v-if="help.images && help.images.length > 0" class="help-images">
              <figure
                v-for="img in help.images"
                :key="img.src"
                class="help-figure"
              >
                <img
                  :src="img.src"
                  :alt="img.alt"
                  class="help-img"
                  @error="onImgError"
                />
                <figcaption class="help-caption">{{ img.alt }}</figcaption>
              </figure>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { InstrumentHelp } from '@/types/instruments'

defineProps<{
  help: InstrumentHelp | null
  instrumentName: string
  open: boolean
}>()

defineEmits<{ close: [] }>()

function onImgError(e: Event): void {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  const caption = img.nextElementSibling as HTMLElement | null
  if (caption) caption.textContent = `[ screenshot pending: ${img.alt} ]`
}
</script>

<style scoped>
.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.help-dialog {
  width: 480px;
  max-width: 100%;
  max-height: 80vh;
  background: rgba(10, 8, 6, 0.97);
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-instrument, 'Courier New', monospace);
}

.help-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.15);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.help-title {
  font-size: 11px;
  letter-spacing: 0.1em;
}

.help-instrument-name {
  color: rgba(220, 210, 200, 0.9);
  font-weight: 600;
}

.help-separator {
  color: rgba(196, 149, 106, 0.5);
  margin: 0 4px;
}

.help-label {
  color: rgba(196, 149, 106, 0.8);
}

.help-close {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: rgba(200, 200, 220, 0.5);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.help-close:hover {
  background: rgba(196, 149, 106, 0.12);
  border-color: rgba(196, 149, 106, 0.35);
  color: rgba(220, 210, 200, 0.9);
}

.help-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
}

.help-body::-webkit-scrollbar { width: 4px; }
.help-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
.help-body::-webkit-scrollbar-thumb { background: rgba(196,149,106,0.25); border-radius: 2px; }

.help-summary {
  color: rgba(200, 200, 220, 0.5);
  font-style: italic;
  margin: 0 0 16px;
  font-size: 11px;
}

.help-section {
  margin-bottom: 16px;
}

.help-section-heading {
  color: rgba(196, 149, 106, 0.7);
  font-size: 10px;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
}

.help-section-body {
  color: rgba(220, 210, 200, 0.8);
  margin: 0;
  font-size: 12px;
}

.help-images {
  margin-top: 16px;
}

.help-figure {
  margin: 0 0 12px;
}

.help-img {
  width: 100%;
  border: 1px solid rgba(196, 149, 106, 0.2);
  border-radius: 4px;
  display: block;
}

.help-caption {
  margin-top: 4px;
  font-size: 10px;
  color: rgba(200, 200, 220, 0.35);
  font-style: italic;
}

.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.help-fade-enter-from,
.help-fade-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(6px);
}
</style>
