<template>
  <div class="credits-page">
    <header class="credits-header">
      <router-link class="back" to="/">← Home</router-link>
      <h1 class="title">Credits</h1>

      <section class="creator" aria-label="Creator">
        <p class="creator-line">
          Created by
          <a class="creator-name" href="https://guinetik.com" target="_blank" rel="noopener noreferrer"
            >guinetik</a
          >
        </p>
        <p class="creator-links">
          <a
            class="creator-link"
            href="https://guinetik.com"
            target="_blank"
            rel="noopener noreferrer"
            >guinetik.com</a
          >
          <span class="creator-sep" aria-hidden="true">·</span>
          <a
            class="creator-link"
            href="https://github.com/guinetik/irover"
            target="_blank"
            rel="noopener noreferrer"
            >github.com/guinetik/irover</a
          >
        </p>
        <p class="personal-note">I am not an artist. I can't model, I can't texture, and my concept art looks like engineering diagrams. This game exists because incredible artists share their work openly under licenses that let people like me build things we could never build alone. Every 3D model, every texture, every piece of reference material listed below was made by someone far more talented than me. Thank you.</p>
      </section>

      <section class="team" aria-label="Team">
        <h2 class="group-label">Team</h2>
        <ul class="list">
          <li class="item">
            <div class="item-head">
              <span class="item-title">guinetik</span>
              <span class="asset">Game Design, Code, UI</span>
            </div>
          </li>
          <li class="item">
            <div class="item-head">
              <span class="item-title">Claude</span>
              <span class="asset">Systems Engineer</span>
            </div>
            <p class="author">Anthropic</p>
          </li>
        </ul>
      </section>

      <p v-if="data?.intro" class="intro">{{ data.intro }}</p>
    </header>

    <div v-if="error" class="error" role="alert">{{ error }}</div>

    <section v-for="group in data?.groups" :key="group.id" class="group">
      <h2 class="group-label">{{ group.label }}</h2>
      <ul class="list">
        <li v-for="(item, i) in group.items" :key="`${group.id}-${i}`" class="item">
          <div class="item-head">
            <span class="item-title">{{ item.title }}</span>
            <span v-if="item.asset" class="asset">{{ item.asset }}</span>
          </div>
          <p class="author">{{ item.author }}</p>
          <p v-if="item.license" class="license">{{ item.license }}</p>
          <a
            v-if="item.url && item.url.length > 0"
            class="link"
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ linkLabel(item.url) }}
          </a>
          <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CreditsRoot } from '@/types/credits'

const data = ref<CreditsRoot | null>(null)
const error = ref<string | null>(null)

/**
 * Short label for external links (host + path tail).
 */
function linkLabel(url: string): string {
  try {
    const u = new URL(url)
    const tail = u.pathname.length > 32 ? `${u.pathname.slice(0, 28)}…` : u.pathname
    return `${u.hostname}${tail === '/' ? '' : tail}`
  } catch {
    return url
  }
}

onMounted(async () => {
  try {
    const res = await fetch('/data/credits.json')
    if (!res.ok) {
      error.value = 'Could not load credits.'
      return
    }
    data.value = (await res.json()) as CreditsRoot
  } catch {
    error.value = 'Could not load credits.'
  }
})
</script>

<style scoped>
/**
 * App shell (`#app`) uses `overflow: hidden` for full-screen 3D views — this route is the scroll container.
 */
.credits-page {
  height: 100%;
  min-height: 0;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 24px 80px;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: radial-gradient(ellipse at top, #1a0e08 0%, #000 55%);
  color: rgba(255, 255, 255, 0.88);
}

.credits-header {
  margin-bottom: 40px;
}

.back {
  display: inline-block;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  text-decoration: none;
  margin-bottom: 24px;
  transition: color 0.2s ease;
}

.back:hover {
  color: rgba(255, 255, 255, 0.65);
}

.title {
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 200;
  letter-spacing: 0.35em;
  text-indent: 0.35em;
  margin: 0 0 16px;
  color: rgba(255, 255, 255, 0.9);
}

.creator {
  margin: 8px 0 32px;
  padding-bottom: 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.creator-line {
  font-size: 14px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.72);
  margin: 0 0 10px;
  font-weight: 400;
}

.creator-name {
  color: rgba(255, 255, 255, 0.95);
  text-decoration: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  transition: border-color 0.2s ease, color 0.2s ease;
}

.creator-name:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.45);
}

.creator-links {
  font-size: 12px;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.creator-link {
  color: rgba(180, 200, 255, 0.88);
  text-decoration: none;
  border-bottom: 1px solid rgba(180, 200, 255, 0.22);
  transition: color 0.2s ease, border-color 0.2s ease;
}

.creator-link:hover {
  color: rgba(220, 230, 255, 1);
  border-color: rgba(220, 230, 255, 0.45);
}

.creator-sep {
  color: rgba(255, 255, 255, 0.25);
  user-select: none;
}

.personal-note {
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.5);
  margin: 16px 0 0;
  font-weight: 300;
  font-style: italic;
}

.team {
  margin-bottom: 32px;
}

.intro {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.45);
  margin: 0 0 8px;
  font-weight: 300;
}

.error {
  color: #c98;
  font-size: 13px;
  margin-bottom: 24px;
}

.group {
  margin-bottom: 40px;
}

.group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  margin: 0 0 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin-bottom: 6px;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
}

.asset {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.02em;
}

.author {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0 0 4px;
  line-height: 1.45;
}

.license {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin: 0 0 8px;
}

.link {
  font-size: 12px;
  color: rgba(180, 200, 255, 0.85);
  text-decoration: none;
  word-break: break-all;
  border-bottom: 1px solid rgba(180, 200, 255, 0.25);
  transition: color 0.2s ease, border-color 0.2s ease;
}

.link:hover {
  color: rgba(220, 230, 255, 1);
  border-color: rgba(220, 230, 255, 0.45);
}

.notes {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
  margin: 10px 0 0;
  line-height: 1.5;
  font-style: italic;
}
</style>
