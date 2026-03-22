import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
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
