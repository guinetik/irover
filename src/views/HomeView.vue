<template>
  <div class="home">
    <div class="hero">
      <h1 class="title">I, ROVER</h1>
      <p class="subtitle">Explore the Red Planet</p>
      <div class="actions">
        <button v-if="continueTarget" class="cta" @click="handleContinue">
          CONTINUE
        </button>
        <button class="cta" :class="{ secondary: continueTarget }" @click="startNew">
          {{ continueTarget ? 'NEW MISSION' : 'BEGIN MISSION' }}
        </button>
      </div>
      <nav class="home-footer" aria-label="Secondary">
        <router-link class="footer-link" to="/credits">Credits</router-link>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useActiveSite } from '@/composables/useActiveSite'
import { startIntroMusic } from '@/composables/useIntroMusic'

const router = useRouter()
const { profile, clearProfile } = usePlayerProfile()
const { activeSite, clear: clearSite } = useActiveSite()

const continueTarget = computed<string | null>(() => {
  // No profile at all — no continue
  if (!profile.archetype) return null

  // Creation done but no patron
  if (!profile.patron) return '/patron'

  // Profile complete + active site
  if (activeSite.value) return `/site/${activeSite.value.siteId}`

  // Profile complete, no site
  return '/globe'
})

function handleContinue(): void {
  if (continueTarget.value) {
    startIntroMusic()
    router.push(continueTarget.value)
  }
}

function startNew(): void {
  startIntroMusic()
  clearProfile()
  clearSite()
  router.push('/create')
}
</script>

<style scoped>
.home {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #1a0e08 0%, #000 70%);
}

.hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.title {
  font-size: clamp(4rem, 12vw, 8rem);
  font-weight: 200;
  letter-spacing: 0.5em;
  text-indent: 0.5em;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
  animation: fadeUp 1s ease-out both;
}

.subtitle {
  font-size: clamp(0.7rem, 1.2vw, 0.9rem);
  font-weight: 300;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  margin: 12px 0 0;
  animation: fadeUp 1s ease-out 0.3s both;
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  margin-top: 48px;
  animation: fadeUp 0.8s ease-out 0.6s both;
}

.home-footer {
  margin-top: 56px;
  animation: fadeUp 0.8s ease-out 0.75s both;
}

.footer-link {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.28);
  text-decoration: none;
  transition: color 0.25s ease;
}

.footer-link:hover {
  color: rgba(255, 255, 255, 0.55);
}

.cta {
  padding: 12px 56px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0;
  cursor: pointer;
  transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease;
}

.cta:hover {
  border-color: rgba(255, 255, 255, 0.45);
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.04);
}

.cta.secondary {
  border-color: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.35);
  font-size: 10px;
  padding: 8px 40px;
}

.cta.secondary:hover {
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.6);
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
