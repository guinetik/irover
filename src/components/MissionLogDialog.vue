<template>
  <Teleport to="body">
    <Transition name="science-fade">
      <div v-if="open" class="ml-overlay" @click.self="$emit('close')">
        <div class="ml-dialog" role="dialog" aria-modal="true">
          <div class="ml-head">
            <h2 class="ml-title">MISSION LOG</h2>
            <button class="ml-close" @click="$emit('close')">&times;</button>
          </div>
          <div class="ml-body">
            <section v-if="activeMissions.length > 0" class="ml-section">
              <h3 class="ml-section-title">ACTIVE</h3>
              <div
                v-for="state in activeMissions"
                :key="state.missionId"
                class="ml-mission"
                :class="{ tracked: state.missionId === trackedMissionId }"
              >
                <div class="ml-mission-head">
                  <span class="ml-mission-name">{{ getDef(state.missionId)?.name }}</span>
                  <button class="ml-track-btn" @click="$emit('track', state.missionId)">
                    {{ state.missionId === trackedMissionId ? 'TRACKING' : 'TRACK' }}
                  </button>
                </div>
                <ul class="ml-obj-list">
                  <li
                    v-for="obj in state.objectives"
                    :key="obj.id"
                    class="ml-obj"
                    :class="{ done: obj.done }"
                  >
                    <span>{{ obj.done ? '\u2611' : '\u2610' }}</span>
                    <span>{{ getObjLabel(state.missionId, obj.id) }}</span>
                  </li>
                </ul>
              </div>
            </section>

            <section v-if="completedMissions.length > 0" class="ml-section">
              <h3 class="ml-section-title">COMPLETED</h3>
              <div
                v-for="state in completedMissions"
                :key="state.missionId"
                class="ml-mission completed"
              >
                <div class="ml-mission-head">
                  <span class="ml-mission-name">{{ getDef(state.missionId)?.name }}</span>
                  <span class="ml-completed-sol">Sol {{ state.completedAtSol }}</span>
                </div>
              </div>
            </section>

            <div v-if="activeMissions.length === 0 && completedMissions.length === 0" class="ml-empty">
              No missions yet. Check LGA mailbox for incoming transmissions.
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { MissionState, MissionDef } from '@/types/missions'

defineProps<{
  open: boolean
  activeMissions: MissionState[]
  completedMissions: MissionState[]
  trackedMissionId: string | null
  getDef: (missionId: string) => MissionDef | undefined
  getObjLabel: (missionId: string, objectiveId: string) => string
}>()

defineEmits<{
  close: []
  track: [missionId: string]
}>()
</script>

<style scoped>
.ml-overlay {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ml-dialog {
  width: 75vw;
  max-width: 700px;
  height: 75vh;
  max-height: 600px;
  background: rgba(10, 5, 2, 0.92);
  border: 1px solid rgba(196, 149, 106, 0.25);
  border-radius: 12px;
  backdrop-filter: blur(16px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ml-head {
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(196, 149, 106, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ml-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: rgba(196, 149, 106, 0.9);
  margin: 0;
}

.ml-close {
  background: none;
  border: none;
  color: rgba(200, 200, 220, 0.5);
  font-size: 22px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.ml-close:hover { color: rgba(200, 200, 220, 0.9); }

.ml-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.ml-section { margin-bottom: 20px; }

.ml-section-title {
  font-size: 10px;
  letter-spacing: 0.15em;
  color: rgba(196, 149, 106, 0.5);
  margin: 0 0 10px;
  text-transform: uppercase;
}

.ml-mission {
  background: rgba(196, 149, 106, 0.05);
  border: 1px solid rgba(196, 149, 106, 0.12);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 8px;
}

.ml-mission.tracked {
  border-color: rgba(102, 255, 238, 0.3);
}

.ml-mission.completed {
  opacity: 0.6;
}

.ml-mission-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ml-mission-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(220, 210, 200, 0.9);
}

.ml-track-btn {
  font-size: 10px;
  letter-spacing: 0.08em;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid rgba(102, 255, 238, 0.3);
  background: rgba(102, 255, 238, 0.08);
  color: rgba(102, 255, 238, 0.8);
  cursor: pointer;
  text-transform: uppercase;
}
.ml-track-btn:hover { background: rgba(102, 255, 238, 0.18); }

.ml-completed-sol {
  font-size: 11px;
  color: rgba(200, 200, 220, 0.45);
}

.ml-obj-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ml-obj {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: rgba(200, 200, 220, 0.65);
  padding: 1px 0;
}

.ml-obj.done { color: rgba(102, 255, 238, 0.55); }

.ml-empty {
  text-align: center;
  padding: 40px 20px;
  color: rgba(200, 200, 220, 0.35);
  font-size: 13px;
}

.science-fade-enter-active,
.science-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.science-fade-enter-from,
.science-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
