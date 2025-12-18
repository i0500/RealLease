import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/google/authService'
import type { User } from '@/types'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  // 🔧 FIX: 페이지 새로고침 시 즉시 localStorage에서 사용자 정보 복원
  const savedUser = (() => {
    try {
      const userData = localStorage.getItem('reallease_user')
      return userData ? JSON.parse(userData) : null
    } catch (err) {
      console.error('Failed to load user from storage on init:', err)
      return null
    }
  })()

  const user = ref<User | null>(savedUser)
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isAuthenticated = computed(() => !!user.value)

  async function initialize(clientId: string) {
    try {
      isLoading.value = true
      error.value = null

      // 개발 모드 체크
      const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

      if (isDevMode) {
        // 개발 모드에서 저장된 사용자 정보 복원
        const savedUser = loadUserFromStorage()
        if (savedUser) {
          user.value = savedUser
          console.log('🔐 개발 모드: 저장된 사용자 정보 복원', savedUser)
        }
        isInitialized.value = true
        return
      }

      // Google Identity Services 로드
      await authService.loadGoogleIdentityServices()

      // Auth 서비스 초기화
      await authService.initialize(clientId)

      // 기존 토큰 및 사용자 정보 확인
      if (authService.isAuthenticated()) {
        const savedUser = loadUserFromStorage()
        if (savedUser) {
          user.value = savedUser
          console.log('🔐 저장된 사용자 정보 복원:', savedUser)
        } else {
          // 토큰은 있지만 사용자 정보가 없는 경우 (이전 버전 호환성)
          user.value = {
            email: 'user@example.com',
            name: 'User'
          }
          saveUserToStorage(user.value)
        }
      }

      isInitialized.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize auth'
      console.error('Auth initialization error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function signIn() {
    try {
      isLoading.value = true
      error.value = null

      // 개발 모드 체크
      const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

      if (isDevMode) {
        // 개발 모드에서는 더미 사용자 생성
        user.value = {
          email: 'test@reallease.dev',
          name: '테스트 사용자'
        }
        saveUserToStorage(user.value)
        console.log('🔐 개발 모드 로그인:', user.value)
        return
      }

      await authService.signIn()

      // 실제 Google 사용자 정보 가져오기
      const userInfo = await authService.getUserInfo()
      if (userInfo) {
        user.value = userInfo
        saveUserToStorage(user.value)
        console.log('🔐 로그인 성공:', user.value)
      } else {
        // fallback: 사용자 정보를 가져오지 못한 경우
        user.value = {
          email: 'user@example.com',
          name: 'User'
        }
        saveUserToStorage(user.value)
        console.warn('⚠️ 사용자 정보를 가져오지 못했습니다. 기본값 사용')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign in'
      console.error('Sign in error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function signOut() {
    try {
      isLoading.value = true
      error.value = null

      await authService.signOut()
      user.value = null
      clearUserFromStorage()
      console.log('🔐 로그아웃 완료')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sign out'
      console.error('Sign out error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  // 사용자 정보 localStorage 저장/복원
  function saveUserToStorage(userData: User) {
    try {
      localStorage.setItem('reallease_user', JSON.stringify(userData))
    } catch (err) {
      console.error('Failed to save user to storage:', err)
    }
  }

  function loadUserFromStorage(): User | null {
    try {
      const userData = localStorage.getItem('reallease_user')
      return userData ? JSON.parse(userData) : null
    } catch (err) {
      console.error('Failed to load user from storage:', err)
      return null
    }
  }

  function clearUserFromStorage() {
    try {
      localStorage.removeItem('reallease_user')
    } catch (err) {
      console.error('Failed to clear user from storage:', err)
    }
  }

  /**
   * 토큰 만료 처리
   * OAuth 토큰이 만료되었을 때 자동으로 로그아웃하고 로그인 페이지로 리디렉션
   */
  async function handleTokenExpired() {
    console.warn('⚠️ [AuthStore] 토큰 만료 감지, 자동 로그아웃 처리')

    try {
      // 로그아웃 처리
      await authService.signOut()
      user.value = null
      clearUserFromStorage()

      // 로그인 페이지로 리디렉션
      if (router.currentRoute.value.name !== 'auth') {
        console.log('🔄 [AuthStore] 로그인 페이지로 리디렉션')
        await router.push({ name: 'auth', query: { expired: 'true' } })
      }
    } catch (err) {
      console.error('❌ [AuthStore] 토큰 만료 처리 중 오류:', err)
    }
  }

  return {
    user,
    isInitialized,
    isLoading,
    error,
    isAuthenticated,
    initialize,
    signIn,
    signOut,
    clearError,
    handleTokenExpired
  }
})
