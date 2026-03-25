<script setup lang="ts">
/**
 * Sky-crane descent message and rover deploy sequence (steps + progress bar) above the bottom toolbar.
 */
defineProps<{
  descending: boolean
  deploying: boolean
  /** 0–1 deploy progress while deploying */
  deployProgress: number
}>()
</script>

<template>
  <Transition name="deploy-fade">
    <div v-if="descending" class="deploy-overlay" key="descent">
      <div class="deploy-content">
        <div class="deploy-label descent-label">SKY CRANE DESCENT</div>
        <div class="deploy-altitude">TOUCHDOWN IMMINENT</div>
      </div>
    </div>
  </Transition>
  <Transition name="deploy-fade">
    <div v-if="deploying" class="deploy-overlay" key="deploy">
      <div class="deploy-content">
        <div class="deploy-label">DEPLOYING ROVER SYSTEMS</div>
        <div class="deploy-steps">
          <div class="deploy-step" :class="{ active: deployProgress > 0.0 }">SUSPENSION</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.10 }">ARM</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.20 }">MAST</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.30 }">ANTENNA</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.40 }">COVERS</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.48 }">WHEELS</div>
          <div class="deploy-step" :class="{ active: deployProgress > 0.72 }">STEERING TEST</div>
        </div>
        <div class="deploy-bar-track">
          <div class="deploy-bar-fill" :style="{ width: deployProgress * 100 + '%' }" />
        </div>
        <div class="deploy-pct font-instrument">{{ Math.round(deployProgress * 100) }}%</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.deploy-overlay {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 50;
}

.deploy-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(228, 147, 62, 0.2);
  border-radius: 6px;
  min-width: 280px;
}

.deploy-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.2em;
  color: rgba(228, 147, 62, 0.9);
  animation: deploy-pulse 1.5s ease-in-out infinite;
}

.deploy-steps {
  display: flex;
  gap: 12px;
}

.deploy-step {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.15);
  transition: color 0.4s ease;
}

.deploy-step.active {
  color: rgba(228, 147, 62, 0.8);
}

.deploy-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}

.deploy-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(228, 147, 62, 0.6), rgba(228, 147, 62, 0.9));
  border-radius: 2px;
  transition: width 0.1s linear;
}

.deploy-pct {
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.3);
}

.descent-label {
  color: rgba(255, 120, 60, 0.95);
}

.deploy-altitude {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.15em;
  color: rgba(255, 255, 255, 0.4);
  animation: deploy-pulse 1s ease-in-out infinite;
}

@keyframes deploy-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
