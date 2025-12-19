<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { NCard, NButton, NAlert, NIcon, NDivider, NCheckbox } from 'naive-ui'
import { LogoGoogle, LockClosedOutline, ShieldCheckmarkOutline } from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const isSigningIn = ref(false)
const error = ref<string | null>(null)
const keepSignedIn = ref(true) // 기본값: 로그인 상태 유지

// 토큰 만료로 인한 자동 로그아웃 메시지
const expiredMessage = computed(() => {
  return route.query.expired === 'true' ? '로그인 세션이 만료되었습니다. 다시 로그인해주세요.' : null
})

onMounted(() => {
  // 만료 메시지가 있으면 에러로 표시
  if (expiredMessage.value) {
    error.value = expiredMessage.value
  }
})

async function handleSignIn() {
  try {
    isSigningIn.value = true
    error.value = null

    await authStore.signIn(keepSignedIn.value)

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
    <!-- Left Panel - Branding -->
    <div class="auth-branding">
      <div class="branding-content">
        <div class="logo-section">
          <h1 class="logo-text">RealLease</h1>
          <p class="logo-subtitle">임대차 관리 시스템</p>
        </div>

        <div class="features-section">
          <div class="feature-item">
            <n-icon size="24" class="feature-icon">
              <ShieldCheckmarkOutline />
            </n-icon>
            <div class="feature-text">
              <h3>안전한 데이터 관리</h3>
              <p>Google Sheets 기반 클라우드 저장</p>
            </div>
          </div>

          <div class="feature-item">
            <n-icon size="24" class="feature-icon">
              <LockClosedOutline />
            </n-icon>
            <div class="feature-text">
              <h3>보안 인증</h3>
              <p>Google 계정 기반 안전한 로그인</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel - Login Form -->
    <div class="auth-form-panel">
      <div class="auth-content">
        <n-card class="auth-card" :bordered="false">
          <div class="form-header">
            <h2 class="form-title">로그인</h2>
            <p class="form-description">
              Google 계정으로 시작하세요
            </p>
          </div>

          <n-alert
            v-if="error"
            type="error"
            class="mb-6"
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
            class="login-button"
          >
            <template #icon>
              <n-icon><LogoGoogle /></n-icon>
            </template>
            Google 계정으로 로그인
          </n-button>

          <div class="mt-4">
            <n-checkbox v-model:checked="keepSignedIn">
              <span class="text-sm text-gray-600">로그인 상태 유지</span>
            </n-checkbox>
          </div>

          <n-divider class="my-6">
            <span class="text-xs text-gray-400">안내</span>
          </n-divider>

          <div class="info-section">
            <p class="info-text">
              로그인 시 Google Sheets 접근 권한이 요청됩니다
            </p>
            <p class="info-text mt-2">
              계약 정보는 연결된 Google Sheets에 안전하게 저장됩니다
            </p>
          </div>
        </n-card>

        <div class="auth-footer">
          <p class="footer-text">
            © 2025 RealLease. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  min-height: 100vh;
  display: flex;
  background-color: #f5f7fa;
}

/* Left Panel - Branding */
.auth-branding {
  flex: 1;
  background: linear-gradient(135deg, #2c3e50 0%, #1a252f 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  position: relative;
  overflow: hidden;
}

.auth-branding::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  opacity: 0.1;
}

.branding-content {
  position: relative;
  z-index: 1;
  max-width: 480px;
  color: white;
}

.logo-section {
  margin-bottom: 4rem;
}

.logo-text {
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin-bottom: 0.5rem;
  color: #ffffff;
}

.logo-subtitle {
  font-size: 1.125rem;
  color: #95a5a6;
  letter-spacing: 0.5px;
}

.features-section {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.feature-item {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.feature-icon {
  color: #3498db;
  flex-shrink: 0;
}

.feature-text h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #ecf0f1;
}

.feature-text p {
  font-size: 0.875rem;
  color: #95a5a6;
  line-height: 1.5;
}

/* Right Panel - Login Form */
.auth-form-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background-color: #ffffff;
}

.auth-content {
  width: 100%;
  max-width: 420px;
}

.auth-card {
  background: #ffffff;
  padding: 2.5rem;
  border-radius: 8px;
}

.form-header {
  margin-bottom: 2rem;
}

.form-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.form-description {
  font-size: 0.9375rem;
  color: #7f8c8d;
}

.login-button {
  height: 48px;
  font-size: 1rem;
  font-weight: 500;
}

.info-section {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 6px;
  border-left: 3px solid #3498db;
}

.info-text {
  font-size: 0.8125rem;
  color: #5a6c7d;
  line-height: 1.6;
}

.auth-footer {
  margin-top: 2rem;
  text-align: center;
}

.footer-text {
  font-size: 0.8125rem;
  color: #95a5a6;
}

/* Responsive Design */
@media (max-width: 768px) {
  .auth-container {
    flex-direction: column;
  }

  .auth-branding {
    min-height: 40vh;
    padding: 2rem 1.5rem;
  }

  .logo-text {
    font-size: 2rem;
  }

  .features-section {
    display: none;
  }

  .auth-form-panel {
    flex: 1;
    padding: 1.5rem 1rem;
  }

  .auth-card {
    padding: 1.5rem;
  }

  .form-title {
    font-size: 1.5rem;
  }
}

/* Galaxy Fold Support */
@media (max-width: 374px) {
  .auth-branding {
    min-height: 30vh;
    padding: 1.5rem 1rem;
  }

  .logo-text {
    font-size: 1.75rem;
  }

  .auth-card {
    padding: 1.25rem;
  }
}
</style>
