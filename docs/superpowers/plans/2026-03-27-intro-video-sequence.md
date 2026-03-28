# Intro Video Sequence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen video intro with telemetry HUD overlay that plays before the sky crane descent, and extract all intro-related UI from MartianSiteView into a dedicated IntroSequence component.

**Architecture:** New `IntroVideoOverlay.vue` handles video playback + telemetry HUD using the existing `ScrambleText` component. New `IntroSequence.vue` wraps the video overlay and existing `RoverDeployOverlays` into a single intro lifecycle component. MartianSiteView passes descent/deploy state as props and reacts to a single `intro-complete` event.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), existing `ScrambleText` component, HTML5 `<video>`, CSS

---

### Task 1: Create IntroVideoOverlay component

**Files:**
- Create: `src/components/IntroVideoOverlay.vue`

- [ ] **Step 1: Create the component file with video element and telemetry HUD**

```vue
<template>
  <div class="intro-video-overlay">
    <video
      ref="videoRef"
      class="intro-video"
      autoplay
      playsinline
      @ended="onVideoEnded"
    >
      <source src="/intro.mp4" type="video/mp4" />
    </video>

    <div class="telemetry-hud">
      <!-- Top-left: Mission designation + signal -->
      <div class="telemetry-corner tl">
        <ScrambleText
          :text="'MEC-7720 // MARS INSERTION'"
          :play="true"
          :speed="25"
          :scramble-frames="12"
          :stagger="1"
        />
        <div class="telemetry-line">SIGNAL: {{ signalStrength }}%</div>
        <div class="telemetry-line">TRANSMISSION: ACTIVE</div>
      </div>

      <!-- Top-right: Descent telemetry -->
      <div class="telemetry-corner tr">
        <div class="telemetry-line">VELOCITY: {{ velocity }} m/s</div>
        <div class="telemetry-line">ALTITUDE: {{ altitude }} km</div>
        <div class="telemetry-line">TRAJECTORY: NOMINAL</div>
      </div>

      <!-- Bottom-left: Coordinates (generic → real) -->
      <div class="telemetry-corner bl">
        <ScrambleText
          v-if="showRealCoords"
          :key="coordsText"
          :text="coordsText"
          :play="true"
          :speed="20"
          :scramble-frames="10"
          :stagger="1"
        />
        <div v-else class="telemetry-line">TARGET COORDINATES: RESOLVING...</div>
        <ScrambleText
          v-if="showRealCoords"
          :text="'SITE: ' + siteId.toUpperCase()"
          :play="true"
          :speed="25"
          :scramble-frames="10"
          :stagger="1"
          :delay="400"
        />
        <ScrambleText
          v-if="showRealCoords"
          :text="'OPERATOR CLASS: ' + archetypeName.toUpperCase()"
          :play="true"
          :speed="25"
          :scramble-frames="10"
          :stagger="1"
          :delay="800"
        />
      </div>

      <!-- Bottom-right: Mission clock -->
      <div class="telemetry-corner br">
        <div class="telemetry-line mission-clock">T-{{ missionClock }}</div>
      </div>
    </div>

    <!-- ESC skip prompt -->
    <Transition name="deploy-fade">
      <div v-if="canSkip" class="skip-prompt">ESC TO SKIP</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import ScrambleText from '@/components/ScrambleText.vue'

const props = defineProps<{
  siteId: string
  latitude: number
  longitude: number
  archetypeName: string
  sceneReady: boolean
}>()

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const videoEnded = ref(false)
const videoProgress = ref(0)
const elapsed = ref(0)

// Telemetry ticking values
const signalStrength = ref('97.3')
const velocity = ref('5,842')
const altitude = ref('125.4')

// Show real coordinates at ~75% video progress
const showRealCoords = computed(() => videoProgress.value >= 0.75)

const coordsText = computed(() => {
  const latDir = props.latitude >= 0 ? 'N' : 'S'
  const lonDir = props.longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(props.latitude).toFixed(2)}°${latDir}  ${Math.abs(props.longitude).toFixed(2)}°${lonDir}`
})

// Mission clock T-00:00:XX
const missionClock = computed(() => {
  const s = Math.floor(elapsed.value)
  const m = Math.floor(s / 60)
  const sec = s % 60
  const hr = Math.floor(m / 60)
  const min = m % 60
  return `${String(hr).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})

// Can skip only when scene is loaded and video hasn't ended yet
const canSkip = computed(() => props.sceneReady && !videoEnded.value)

let tickInterval: number | null = null

function tickTelemetry() {
  elapsed.value += 0.5

  // Random signal jitter 94–99%
  signalStrength.value = (94 + Math.random() * 5).toFixed(1)

  // Velocity ticks down from ~5842 to ~200 over the video
  const vBase = 5842 * (1 - videoProgress.value * 0.97)
  const vJitter = (Math.random() - 0.5) * 40
  velocity.value = Math.max(50, Math.round(vBase + vJitter)).toLocaleString()

  // Altitude ticks down from ~125 to ~0.3
  const aBase = 125.4 * (1 - videoProgress.value * 0.997)
  const aJitter = (Math.random() - 0.5) * 0.5
  altitude.value = Math.max(0.1, aBase + aJitter).toFixed(1)

  // Update video progress
  const v = videoRef.value
  if (v && v.duration > 0) {
    videoProgress.value = v.currentTime / v.duration
  }
}

function onVideoEnded() {
  videoEnded.value = true
  if (props.sceneReady) {
    emit('complete')
  }
  // If scene not ready, we wait — the watch below handles it
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && canSkip.value) {
    videoEnded.value = true
    emit('complete')
  }
}

// If video ended but scene wasn't ready, complete when scene becomes ready
watch(() => props.sceneReady, (ready) => {
  if (ready && videoEnded.value) {
    emit('complete')
  }
})

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  tickInterval = window.setInterval(tickTelemetry, 500)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (tickInterval !== null) {
    clearInterval(tickInterval)
  }
  // Pause video to stop any lingering playback
  videoRef.value?.pause()
})
</script>

<style scoped>
.intro-video-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: #000;
}

.intro-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.telemetry-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.telemetry-corner {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.12em;
  color: rgba(228, 147, 62, 0.5);
  text-transform: uppercase;
  padding: 24px;
}

.telemetry-corner.tl { top: 0; left: 0; }
.telemetry-corner.tr { top: 0; right: 0; text-align: right; }
.telemetry-corner.bl { bottom: 0; left: 0; }
.telemetry-corner.br { bottom: 0; right: 0; text-align: right; }

.telemetry-line {
  white-space: nowrap;
}

.mission-clock {
  font-size: 13px;
  color: rgba(228, 147, 62, 0.6);
}

.skip-prompt {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-family: monospace;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(228, 147, 62, 0.5);
}

/* Subtle scanline effect */
.telemetry-hud::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
}
</style>
```

- [ ] **Step 2: Verify the component renders in isolation**

No automated test needed — this is a visual/media component. Verify manually by temporarily mounting it in a test harness or MartianSiteView.

- [ ] **Step 3: Commit**

```bash
git add src/components/IntroVideoOverlay.vue
git commit -m "feat: add IntroVideoOverlay with telemetry HUD and ESC skip"
```

---

### Task 2: Create IntroSequence wrapper component

**Files:**
- Create: `src/components/IntroSequence.vue`

- [ ] **Step 1: Create IntroSequence that owns video overlay + deploy overlays**

This component manages the full intro lifecycle: video → descent → deploy → complete. It renders nothing and emits immediately when `skipIntro` is true.

```vue
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
```

- [ ] **Step 2: Commit**

```bash
git add src/components/IntroSequence.vue
git commit -m "feat: add IntroSequence wrapper for video + deploy overlays"
```

---

### Task 3: Integrate IntroSequence into MartianSiteView

**Files:**
- Modify: `src/views/MartianSiteView.vue`

This task replaces the inline `RoverDeployOverlays` usage with `IntroSequence` and introduces an `introComplete` ref to replace the scattered `!deploying && !descending` guards.

- [ ] **Step 1: Add imports and ref**

In the `<script setup>` section, add the import for `IntroSequence` and the `isSiteIntroSequenceSkipped` function, and add the `introComplete` ref. Also need to import `ARCHETYPES` (already destructured from `usePlayerProfile` on line 1121).

Add near the existing imports (around line 601 where `LoadingOverlay` is imported):

```typescript
import IntroSequence from '@/components/IntroSequence.vue'
import { isSiteIntroSequenceSkipped } from '@/lib/siteIntroSequence'
```

Add near the other refs (around line 659):

```typescript
const skipIntro = isSiteIntroSequenceSkipped()
const introComplete = ref(skipIntro)
```

Add the handler function:

```typescript
function onIntroComplete() {
  introComplete.value = true
}
```

- [ ] **Step 2: Replace RoverDeployOverlays with IntroSequence in template**

Remove lines 40–44 (the `RoverDeployOverlays` usage):

```html
    <RoverDeployOverlays
      :descending="descending"
      :deploying="deploying"
      :deploy-progress="deployProgress"
    />
```

Replace with:

```html
    <IntroSequence
      :skip-intro="skipIntro"
      :site-loading="siteLoading"
      :descending="descending"
      :deploying="deploying"
      :deploy-progress="deployProgress"
      :site-id="siteId"
      :latitude="siteLat"
      :longitude="siteLon"
      :archetype-name="playerProfile.archetype ?? 'UNKNOWN'"
      @intro-complete="onIntroComplete"
    />
```

- [ ] **Step 3: Replace `!deploying && !descending` guards with `introComplete`**

Search the template for all occurrences of `!deploying && !descending` and replace with `introComplete`. These are the locations:

Line 16 — MartianSiteNavbar:
```
:show-sol-clock="!deploying && !descending"
```
→
```
:show-sol-clock="introComplete"
```

Line 26 — MartianSiteNavbar:
```
:show-science-button="hasScienceDiscoveries && !deploying && !descending"
```
→
```
:show-science-button="hasScienceDiscoveries && introComplete"
```

Line 93 — InstrumentToolbar:
```
v-if="!deploying && !descending"
```
→
```
v-if="introComplete"
```

Line 215 — InventoryPanel (find the exact line with `v-if="!deploying && !descending"`):
```
v-if="!deploying && !descending"
```
→
```
v-if="introComplete"
```

Line 368 — sleep overlay:
```
v-if="isSleeping && !deploying && !descending"
```
→
```
v-if="isSleeping && introComplete"
```

Line 387 — CommToolbar:
```
v-if="!deploying && !descending"
```
→
```
v-if="introComplete"
```

Line 396 — Comm panels container:
```
v-if="!deploying && !descending && ..."
```
→
```
v-if="introComplete && ..."
```

Line 432 — power-hud-stack:
```
v-if="!deploying && !descending"
```
→
```
v-if="introComplete"
```

- [ ] **Step 4: Update script guards that use deploying/descending for UI text**

In the `centerHintText` computed (around lines 1417–1426), replace the guards:

Line ~1417:
```typescript
if (deploying.value || descending.value || isSleeping.value) return ''
```
→
```typescript
if (!introComplete.value || isSleeping.value) return ''
```

Lines ~1422 and ~1426: replace `!deploying.value && !descending.value` with `introComplete.value`:
```typescript
if (introComplete.value && activeInstrumentSlot.value === null && rtgPhase.value === 'idle' && rtgConservationMode.value !== 'active' && !controlsHintDismissed.value) {
```
```typescript
if (introComplete.value && activeInstrumentSlot.value === null && rtgConservationMode.value === 'active') {
```

- [ ] **Step 5: Remove the RoverDeployOverlays import**

Remove the import of `RoverDeployOverlays` (find it in the imports section and delete the line). The component is now imported inside `IntroSequence.vue`.

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: No TypeScript or template errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/MartianSiteView.vue
git commit -m "refactor: replace inline deploy overlays with IntroSequence component

Extracts RoverDeployOverlays + new IntroVideoOverlay into IntroSequence.
Replaces scattered !deploying && !descending guards with introComplete ref."
```

---

### Task 4: Manual verification and edge cases

**Files:** None (testing only)

- [ ] **Step 1: Test first-time player flow (no localStorage skip)**

Clear localStorage (`localStorage.removeItem('mars.skipSiteIntro')`), navigate to a site.

Expected:
1. Video plays full-screen with telemetry HUD in corners
2. Telemetry values tick (signal jitters, velocity/altitude decrease)
3. At ~75% video progress, bottom-left resolves to real site coordinates + name + archetype
4. When scene finishes loading, "ESC TO SKIP" appears at bottom-center
5. If ESC pressed → hard cut to descent
6. If video plays to end → hard cut to descent
7. Descent → deploy → ready flow works as before
8. All gameplay UI (navbar, toolbar, power HUD, etc.) appears only after deploy completes

- [ ] **Step 2: Test returning player flow (localStorage skip active)**

With `mars.skipSiteIntro` set to `1`, navigate to a site.

Expected:
1. No video plays
2. Black LoadingOverlay shows during terrain load
3. Rover appears already deployed (no descent, no deploy)
4. All gameplay UI appears immediately after load

- [ ] **Step 3: Test slow-load edge case**

Throttle network in DevTools (Slow 3G), navigate to a site.

Expected:
1. Video plays through
2. If video ends before scene loads, screen holds on last video frame (black, since intro.mp4 ends dark)
3. When scene finishes, hard cut to descent

- [ ] **Step 4: Test ESC before scene ready**

Navigate to site, try pressing ESC immediately while terrain is still loading.

Expected: Nothing happens — ESC only works after `sceneReady` is true.

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix: address edge cases from intro sequence testing"
```
