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
import InvoicesView from '@/views/InvoicesView.vue'
import ReportsView from '@/views/ReportsView.vue'
import CashView from '@/views/CashView.vue'
import GrowthView from '@/views/GrowthView.vue'
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
        { path: '', name: 'dashboard', component: DashboardView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'calendar', name: 'calendar', component: CalendarView },
        { path: 'services', name: 'services', component: ManagementView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'workers', name: 'workers', component: ManagementView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'clients', name: 'clients', component: ManagementView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'clients/:id', name: 'client-detail', component: ManagementView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'invoices', name: 'invoices', component: InvoicesView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'reports', name: 'reports', component: ReportsView, meta: { roles: ['ADMIN', 'SUPER_ADMIN'] } },
        { path: 'cash', name: 'cash', component: CashView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'growth', name: 'growth', component: GrowthView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
        { path: 'settings', name: 'settings', component: SettingsView, meta: { roles: ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST'] } },
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
    // Trabajador: solo calendario
    if (auth.isWorker) {
      const allowed = to.name === 'calendar'
      if (!allowed) return { name: 'calendar' }
    } else if (!auth.hasSubscription) {
      // Sin suscripción: forzar Ajustes → Planes (siempre con query)
      const onPlans =
        to.name === 'settings' && String(to.query.tab || '') === 'planes'
      if (!onPlans) {
        return { name: 'settings', query: { tab: 'planes' } }
      }
    } else {
      const roles = to.meta.roles as string[] | undefined
      if (roles?.length && auth.user?.role && !roles.includes(auth.user.role)) {
        if (auth.isReceptionist && to.name === 'reports') {
          return { name: 'dashboard' }
        }
        return { name: auth.homeRoute() }
      }
    }
  }

  if (to.meta.guest && auth.isAuthenticated) {
    if (!auth.user) await auth.fetchMe()
    if (auth.user) {
      if (!auth.hasSubscription && !auth.isWorker) {
        return { name: 'settings', query: { tab: 'planes' } }
      }
      return { name: auth.homeRoute() }
    }
  }

  return true
})

export default router
