import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { authService } from '@/services/google/authService'

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
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

  // 인증이 필요한 페이지인 경우 토큰 검증
  if (to.meta.requiresAuth) {
    // 개발 모드가 아니고, 사용자 정보는 있지만 OAuth 토큰이 없는 경우
    if (!isDevMode && authStore.isAuthenticated && !authService.isAuthenticated()) {
      console.warn('⚠️ OAuth 토큰 없음, 자동 로그아웃 처리')
      await authStore.handleTokenExpired()
      next({ name: 'auth', query: { expired: 'true' } })
      return
    }

    // 사용자 정보가 없는 경우
    if (!authStore.isAuthenticated) {
      console.log('🔒 인증 필요 → 로그인 페이지로 이동')
      next({ name: 'auth' })
      return
    }
  }

  // 로그인 페이지인데 이미 인증된 경우 → 대시보드로
  if (to.name === 'auth' && authStore.isAuthenticated) {
    console.log('✅ 이미 로그인됨 → 대시보드로 이동')
    next({ name: 'dashboard' })
    return
  }

  next()
})

export default router
