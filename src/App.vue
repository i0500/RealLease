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

    // 인증되어 있으면 데이터 로드
    if (authStore.isAuthenticated) {
      await sheetsStore.loadSheets()
      await notificationsStore.loadReadNotifications()
    }
  } catch (error) {
    console.error('App initialization error:', error)
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
