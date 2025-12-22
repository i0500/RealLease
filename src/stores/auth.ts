import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/google/authService'
import type { User } from '@/types'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  // 페이지 새로고침 시 즉시 localStorage에서 사용자 정보 복원
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
  const isReauthenticating = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  // keepSignedIn 설정 저장
  function setKeepSignedIn(value: boolean) {
    try {
      localStorage.setItem('reallease_keep_signed_in', String(value))
    } catch (err) {
      console.error('Failed to save keepSignedIn preference:', err)
    }
  }

  async function initialize(_clientId: string) {
    try {
      isLoading.value = true
      error.value = null

      // 개발 모드 체크
      const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

      if (isDevMode) {
        const savedUser = loadUserFromStorage()
        if (savedUser) {
          user.value = savedUser
        }
        isInitialized.value = true
        return
      }

      // Firebase Auth 초기화 완료 대기
      await authService.waitForAuth()

      // 기존 사용자 정보 확인 및 복원
      if (authService.isAuthenticated()) {
        const userInfo = await authService.getUserInfo()
        if (userInfo) {
          user.value = userInfo
          saveUserToStorage(user.value)
        }
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

      setKeepSignedIn(keepSignedIn)

      // 개발 모드 체크
      const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

      if (isDevMode) {
        user.value = {
          email: 'test@reallease.dev',
          name: '테스트 사용자'
        }
        saveUserToStorage(user.value, keepSignedIn)
        return
      }

      await authService.signIn(keepSignedIn)

      // 실제 Google 사용자 정보 가져오기
      const userInfo = await authService.getUserInfo()
      if (userInfo) {
        user.value = userInfo
        saveUserToStorage(user.value, keepSignedIn)
      } else {
        user.value = {
          email: 'user@example.com',
          name: 'User'
        }
        saveUserToStorage(user.value, keepSignedIn)
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

  // 사용자 정보 저장/복원
  function saveUserToStorage(userData: User, persistent: boolean = true) {
    try {
      const storage = persistent ? localStorage : sessionStorage
      storage.setItem('reallease_user', JSON.stringify(userData))

      const otherStorage = persistent ? sessionStorage : localStorage
      otherStorage.removeItem('reallease_user')
    } catch (err) {
      console.error('Failed to save user to storage:', err)
    }
  }

  function loadUserFromStorage(): User | null {
    try {
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
   */
  async function handleTokenExpired() {
    if (isReauthenticating.value) {
      return
    }

    isReauthenticating.value = true

    try {
      await authService.signOut()
      user.value = null
      clearUserFromStorage()

      if (router.currentRoute.value.name !== 'auth') {
        await router.push({
          name: 'auth',
          query: {
            expired: 'true',
            message: '세션이 만료되었습니다. 다시 로그인해주세요.'
          }
        })
      }
    } catch (err) {
      console.error('❌ [AuthStore] 토큰 만료 처리 중 오류:', err)
    } finally {
      isReauthenticating.value = false
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
