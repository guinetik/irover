import { createRouter, createWebHistory } from 'vue-router'
import { usePlayerProfile } from '@/composables/usePlayerProfile'
import { useActiveSite } from '@/composables/useActiveSite'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/create',
      name: 'create',
      component: () => import('@/views/CharacterCreateView.vue'),
    },
    {
      path: '/patron',
      name: 'patron',
      component: () => import('@/views/PatronSelectView.vue'),
    },
    {
      path: '/globe',
      name: 'globe',
      component: () => import('@/views/GlobeView.vue'),
    },
    {
      path: '/site/:siteId',
      name: 'site',
      component: () => import('@/views/MartianSiteView.vue'),
    },
  ],
})

router.beforeEach((to) => {
  const { profile, clearProfile } = usePlayerProfile()
  const { clear: clearSite } = useActiveSite()

  // Entering /create resets profile + active site (fresh start)
  if (to.name === 'create') {
    clearProfile()
    clearSite()
    return true
  }

  // /patron requires creation done (archetype + foundation + origin set)
  if (to.name === 'patron') {
    if (!profile.archetype || !profile.foundation || !profile.origin) {
      return { name: 'home' }
    }
    return true
  }

  // /globe requires patron set
  if (to.name === 'globe') {
    if (!profile.patron) {
      return { name: 'home' }
    }
    return true
  }

  // /site requires full profile
  if (to.name === 'site') {
    if (!profile.archetype || !profile.foundation || !profile.patron) {
      return { name: 'home' }
    }
    return true
  }

  return true
})
