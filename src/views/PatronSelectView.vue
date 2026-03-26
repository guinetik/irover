<template>
  <div class="patron-placeholder">
    <p>PATRON SELECTION — COMING SOON</p>
    <button @click="skipToGlobe">[ SKIP TO GLOBE ]</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'

const router = useRouter()
const { setProfile, profile } = usePlayerProfile()

function skipToGlobe(): void {
  // Set a default patron so the route guard allows globe access
  setProfile(profile.archetype!, profile.foundation!, 'trc')
  router.push('/globe')
}
</script>

<style scoped>
.patron-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  gap: 24px;
}

button {
  background: none;
  border: 1px solid rgba(196, 149, 106, 0.3);
  color: rgba(196, 149, 106, 0.7);
  font-family: var(--font-mono);
  padding: 8px 24px;
  cursor: pointer;
}

button:hover {
  border-color: rgba(196, 149, 106, 0.6);
  color: rgba(196, 149, 106, 1);
}
</style>
