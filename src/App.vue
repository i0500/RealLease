<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSheetsStore } from '@/stores/sheets'
import { useNotificationsStore } from '@/stores/notifications'

const authStore = useAuthStore()
const sheetsStore = useSheetsStore()
const notificationsStore = useNotificationsStore()

onMounted(async () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

  if (!clientId && !isDevMode) {
    console.error('Google Client ID not configured. Set VITE_DEV_MODE=true for testing.')
    return
  }

  try {
    // Auth 초기화 (개발 모드에서는 clientId 없어도 가능)
    await authStore.initialize(clientId || '')

    // 시트 및 알림 데이터는 항상 로드 (localStorage에서)
    // 공개 시트 접근을 위해 인증 여부와 무관하게 로드
    console.log('📦 앱 초기화: 저장된 데이터 로딩')
    await sheetsStore.loadSheets()
    await notificationsStore.loadReadNotifications()

    console.log('✅ 앱 초기화 완료:', {
      authenticated: authStore.isAuthenticated,
      sheetCount: sheetsStore.sheetCount,
      currentSheet: sheetsStore.currentSheet?.name
    })
  } catch (error) {
    console.error('❌ 앱 초기화 실패:', error)
  }
})
</script>

<template>
  <n-config-provider>
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <router-view />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<style>
#app {
  min-height: 100vh;
}
</style>
