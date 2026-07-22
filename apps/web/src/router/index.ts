import { createRouter, createWebHistory } from 'vue-router'
import LandingView from '@/views/LandingView.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import DashboardLayout from '@/layouts/DashboardLayout.vue'
import PublicLayout from '@/layouts/PublicLayout.vue'
import AuthView from '@/views/AuthView.vue'
import DashboardView from '@/views/DashboardView.vue'
import CalendarView from '@/views/CalendarView.vue'
import ManagementView from '@/views/ManagementView.vue'
import SettingsView from '@/views/SettingsView.vue'
import BookingView from '@/views/BookingView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', component: PublicLayout, children: [{ path: '', name: 'landing', component: LandingView }] },
    {
      path: '/',
      component: AuthLayout,
      children: [
        { path: 'login', name: 'login', component: AuthView, meta: { guest: true } },
        { path: 'register', name: 'register', component: AuthView, meta: { guest: true } },
      ],
    },
    {
      path: '/app',
      component: DashboardLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'dashboard', component: DashboardView },
        { path: 'calendar', name: 'calendar', component: CalendarView },
        { path: 'services', name: 'services', component: ManagementView },
        { path: 'workers', name: 'workers', component: ManagementView },
        { path: 'clients', name: 'clients', component: ManagementView },
        { path: 'clients/:id', name: 'client-detail', component: ManagementView },
        { path: 'settings', name: 'settings', component: SettingsView },
      ],
    },
    { path: '/:tenantSlug', component: PublicLayout, children: [{ path: '', name: 'booking', component: BookingView }] },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth) {
    if (!auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
    if (!auth.user) {
      const me = await auth.fetchMe()
      if (!me) return { name: 'login' }
    }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    if (!auth.user) await auth.fetchMe()
    if (auth.user) return { name: 'dashboard' }
  }

  return true
})

export default router
