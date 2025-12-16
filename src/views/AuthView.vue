<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { NCard, NButton, NAlert } from 'naive-ui'

const router = useRouter()
const authStore = useAuthStore()

const isSigningIn = ref(false)
const error = ref<string | null>(null)

async function handleSignIn() {
  try {
    isSigningIn.value = true
    error.value = null

    await authStore.signIn()

    // 로그인 성공 시 홈으로 이동
    router.push({ name: 'home' })
  } catch (err) {
    error.value = err instanceof Error ? err.message : '로그인에 실패했습니다'
    console.error('Sign in error:', err)
  } finally {
    isSigningIn.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-content">
      <div class="auth-logo">
        <h1 class="text-4xl font-bold text-primary mb-2">🏠 RealLease</h1>
        <p class="text-gray-600 mb-8">부동산 임대차 관리 시스템</p>
      </div>

      <n-card class="auth-card">
        <div class="text-center">
          <h2 class="text-2xl font-semibold mb-4">환영합니다!</h2>
          <p class="text-gray-600 mb-6">
            구글 계정으로 간편하게 시작하세요
          </p>

          <n-alert
            v-if="error"
            type="error"
            class="mb-4"
            closable
            @close="error = null"
          >
            {{ error }}
          </n-alert>

          <n-button
            type="primary"
            size="large"
            block
            :loading="isSigningIn"
            @click="handleSignIn"
          >
            <template #icon>
              <span>🔐</span>
            </template>
            구글로 시작하기
          </n-button>

          <div class="mt-6 text-sm text-gray-500">
            <p>💡 구글 계정만 있으면 바로 사용 가능합니다</p>
            <p class="mt-2">
              로그인하시면 Google Sheets 접근 권한을 요청합니다
            </p>
          </div>
        </div>
      </n-card>

      <div class="auth-footer">
        <p class="text-sm text-gray-500">
          © 2025 RealLease. All rights reserved.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
}

.auth-content {
  width: 100%;
  max-width: 28rem;
}

.auth-logo {
  text-align: center;
  color: white;
  margin-bottom: 2rem;
}

.auth-card {
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}

.auth-footer {
  text-align: center;
  margin-top: 2rem;
  color: white;
}
</style>
