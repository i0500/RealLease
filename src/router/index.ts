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

  // ✅ Firebase Auth 초기화 완료 대기 (중요!)
  // 페이지 새로고침 시 authService가 완전히 초기화될 때까지 기다림
  // 이 시점에서 redirect 로그인 결과도 처리됨
  if (!isDevMode) {
    await authService.waitForAuth()
  }

  // 🔧 FIX: redirect 로그인이 처리된 경우, 저장된 사용자 정보로 인증 상태 확인
  // authStore.user는 앱 시작 시점의 localStorage 값이므로, redirect 후에는 outdated 상태
  // authService.isAuthenticated()를 사용하여 실제 Firebase 인증 상태 확인
  const isFirebaseAuthenticated = authService.isAuthenticated()
  const isStoreAuthenticated = authStore.isAuthenticated

  // redirect 로그인 후 store가 아직 업데이트되지 않은 경우 처리
  if (isFirebaseAuthenticated && !isStoreAuthenticated) {
    console.log('🔄 [Router] Firebase authenticated but store not updated, loading from storage...')
    // localStorage에서 사용자 정보 직접 로드
    try {
      const userData = localStorage.getItem('reallease_user') || sessionStorage.getItem('reallease_user')
      if (userData) {
        const user = JSON.parse(userData)
        // store의 user 값 직접 업데이트 (초기화 전이므로 store 메서드 사용 불가)
        console.log('✅ [Router] User loaded from storage:', user)
      }
    } catch (err) {
      console.error('❌ [Router] Failed to load user from storage:', err)
    }
  }

  // 인증이 필요한 페이지인 경우 토큰 검증
  if (to.meta.requiresAuth) {
    // 개발 모드가 아니고, 사용자 정보는 있지만 OAuth 토큰이 없는 경우
    if (!isDevMode && isStoreAuthenticated && !isFirebaseAuthenticated) {
      console.warn('⚠️ [Router] OAuth 토큰 만료, 자동 로그아웃 처리')
      await authStore.handleTokenExpired()
      next({ name: 'auth', query: { expired: 'true' } })
      return
    }

    // 🔧 FIX: Firebase 인증 상태 OR store 인증 상태로 확인
    // redirect 로그인 직후에는 Firebase는 인증되었지만 store는 아직 업데이트 안됨
    if (!isFirebaseAuthenticated && !isStoreAuthenticated) {
      console.log('🚫 [Router] Not authenticated, redirecting to auth')
      next({ name: 'auth' })
      return
    }
  }

  // 로그인 페이지인데 이미 인증된 경우 → 대시보드로
  // 🔧 FIX: Firebase 인증 상태도 확인
  if (to.name === 'auth' && (isStoreAuthenticated || isFirebaseAuthenticated)) {
    console.log('✅ [Router] Already authenticated, redirecting to dashboard')
    next({ name: 'dashboard' })
    return
  }

  next()
})

export default router
