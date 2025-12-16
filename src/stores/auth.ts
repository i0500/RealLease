import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/google/authService'
import type { User } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
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
        isInitialized.value = true
        return
      }

      // Google Identity Services 로드
      await authService.loadGoogleIdentityServices()

      // Auth 서비스 초기화
      await authService.initialize(clientId)

      // 기존 토큰 확인
      if (authService.isAuthenticated()) {
        // TODO: 사용자 정보 가져오기 (Google People API 또는 토큰에서 추출)
        user.value = {
          email: 'user@example.com', // 임시
          name: 'User'
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
        return
      }

      await authService.signIn()

      // TODO: 사용자 정보 가져오기
      user.value = {
        email: 'user@example.com', // 임시
        name: 'User'
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

  return {
    user,
    isInitialized,
    isLoading,
    error,
    isAuthenticated,
    initialize,
    signIn,
    signOut,
    clearError
  }
})
