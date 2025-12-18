import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/views/HomeView.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'home',
          redirect: { name: 'dashboard' }
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { requiresAuth: true }
        },
        {
          path: 'sheets/:sheetId/rental-contracts',
          name: 'rental-contracts',
          component: () => import('@/views/RentalContractsView.vue'),
          meta: { requiresAuth: true }
        },
        {
          path: 'sheets/:sheetId/sales',
          name: 'sales',
          component: () => import('@/views/SalesView.vue'),
          meta: { requiresAuth: true }
        },
        {
          path: 'sheets/:sheetId/sales/:id',
          name: 'sale-detail',
          component: () => import('@/views/SaleDetailView.vue'),
          meta: { requiresAuth: true }
        },
        {
          path: 'notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
          meta: { requiresAuth: true }
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
          meta: { requiresAuth: true }
        }
      ]
    },
    {
      path: '/auth',
      name: 'auth',
      component: () => import('@/views/AuthView.vue'),
      meta: { requiresAuth: false }
    }
  ]
})

// 네비게이션 가드
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  // 🔧 FIX: localStorage에서 즉시 복원되므로 isAuthenticated를 바로 사용 가능
  // 인증이 필요한 페이지인데 인증되지 않은 경우
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    console.log('🔒 인증 필요 → 로그인 페이지로 이동')
    next({ name: 'auth' })
  }
  // 로그인 페이지인데 이미 인증된 경우 → 대시보드로
  else if (to.name === 'auth' && authStore.isAuthenticated) {
    console.log('✅ 이미 로그인됨 → 대시보드로 이동')
    next({ name: 'dashboard' })
  }
  else {
    next()
  }
})

export default router
