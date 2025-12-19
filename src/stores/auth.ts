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

      // ✅ Firebase Auth 초기화 완료 대기 (중요!)
      console.log('🔄 [AuthStore] Waiting for Firebase Auth initialization...')
      await authService.waitForAuth()
      console.log('✅ [AuthStore] Firebase Auth ready')

      // Google Identity Services 로드 (레거시 호환)
      await authService.loadGoogleIdentityServices()

      // Auth 서비스 초기화 (레거시 호환)
      await authService.initialize(clientId)

      // 기존 사용자 정보 확인 및 복원
      if (authService.isAuthenticated()) {
        const userInfo = await authService.getUserInfo()
        if (userInfo) {
          user.value = userInfo
          saveUserToStorage(user.value)
          console.log('✅ [AuthStore] User session restored:', userInfo)
        }
      } else {
        console.log('ℹ️ [AuthStore] No active session')
      }

      isInitialized.value = true
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to initialize auth'
      console.error('❌ [AuthStore] Auth initialization error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function signIn(keepSignedIn: boolean = true) {
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
        saveUserToStorage(user.value, keepSignedIn)
        console.log('🔐 개발 모드 로그인:', user.value, keepSignedIn ? '(로그인 상태 유지)' : '(세션만)')
        return
      }

      await authService.signIn(keepSignedIn)

      // 실제 Google 사용자 정보 가져오기
      const userInfo = await authService.getUserInfo()
      if (userInfo) {
        user.value = userInfo
        saveUserToStorage(user.value, keepSignedIn)
        console.log('🔐 로그인 성공:', user.value, keepSignedIn ? '(로그인 상태 유지)' : '(세션만)')
      } else {
        // fallback: 사용자 정보를 가져오지 못한 경우
        user.value = {
          email: 'user@example.com',
          name: 'User'
        }
        saveUserToStorage(user.value, keepSignedIn)
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

  // 사용자 정보 저장/복원 (localStorage 또는 sessionStorage)
  function saveUserToStorage(userData: User, persistent: boolean = true) {
    try {
      const storage = persistent ? localStorage : sessionStorage
      storage.setItem('reallease_user', JSON.stringify(userData))

      // 다른 storage에서는 제거 (중복 저장 방지)
      const otherStorage = persistent ? sessionStorage : localStorage
      otherStorage.removeItem('reallease_user')
    } catch (err) {
      console.error('Failed to save user to storage:', err)
    }
  }

  function loadUserFromStorage(): User | null {
    try {
      // localStorage 우선, 없으면 sessionStorage 체크
      const localData = localStorage.getItem('reallease_user')
      if (localData) return JSON.parse(localData)

      const sessionData = sessionStorage.getItem('reallease_user')
      if (sessionData) return JSON.parse(sessionData)

      return null
    } catch (err) {
      console.error('Failed to load user from storage:', err)
      return null
    }
  }

  function clearUserFromStorage() {
    try {
      localStorage.removeItem('reallease_user')
      sessionStorage.removeItem('reallease_user')
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
