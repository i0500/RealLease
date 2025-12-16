<script setup lang="ts">
import { computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useSheetsStore } from '@/stores/sheets'
import {
  NLayout,
  NLayoutHeader,
  NLayoutSider,
  NLayoutContent,
  NMenu,
  NButton,
  NIcon
} from 'naive-ui'
import {
  GridOutline as DashboardIcon,
  DocumentTextOutline as ContractIcon,
  NotificationsOutline as NotificationIcon,
  SettingsOutline as SettingsIcon
} from '@vicons/ionicons5'
import type { MenuOption } from 'naive-ui'

const router = useRouter()
const sheetsStore = useSheetsStore()

const hasSheets = computed(() => sheetsStore.sheetCount > 0)

onMounted(() => {
  // 시트가 있으면 대시보드로, 없으면 시트 추가 안내
  if (hasSheets.value) {
    router.replace({ name: 'dashboard' })
  }
})

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions: MenuOption[] = [
  {
    label: '대시보드',
    key: 'dashboard',
    icon: renderIcon(DashboardIcon)
  },
  {
    label: '계약 관리',
    key: 'contracts',
    icon: renderIcon(ContractIcon)
  },
  {
    label: '알림',
    key: 'notifications',
    icon: renderIcon(NotificationIcon)
  },
  {
    label: '설정',
    key: 'settings',
    icon: renderIcon(SettingsIcon)
  }
]

function handleMenuSelect(key: string) {
  router.push({ name: key })
}
</script>

<template>
  <n-layout has-sider class="min-h-screen" style="background-color: #f5f7fa;">
    <n-layout-sider
      bordered
      show-trigger
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :native-scrollbar="false"
      style="background-color: #2c3e50;"
    >
      <div class="px-4 py-6" style="background-color: #1a252f;">
        <h1 class="text-xl font-bold" style="color: #ffffff; letter-spacing: 0.5px;">
          RealLease
        </h1>
        <p class="text-xs mt-1" style="color: #95a5a6;">
          임대차 관리 시스템
        </p>
      </div>
      <n-menu
        :options="menuOptions"
        @update:value="handleMenuSelect"
        :inverted="true"
        style="background-color: #2c3e50;"
      />
    </n-layout-sider>

    <n-layout>
      <n-layout-header
        bordered
        class="px-6 py-4"
        style="background-color: #ffffff; border-bottom: 1px solid #e1e8ed;"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold" style="color: #2c3e50;">
            임대차 관리 시스템
          </h2>
          <div class="flex items-center gap-2">
            <n-button
              text
              @click="router.push({ name: 'notifications' })"
              style="color: #5a6c7d;"
            >
              <template #icon>
                <n-icon><NotificationIcon /></n-icon>
              </template>
              알림
            </n-button>
            <n-button
              text
              @click="router.push({ name: 'settings' })"
              style="color: #5a6c7d;"
            >
              <template #icon>
                <n-icon><SettingsIcon /></n-icon>
              </template>
              설정
            </n-button>
          </div>
        </div>
      </n-layout-header>

      <n-layout-content class="p-6">
        <div v-if="!hasSheets" class="flex items-center justify-center" style="min-height: 400px;">
          <div class="text-center max-w-md">
            <div
              class="w-24 h-24 mx-auto mb-6 flex items-center justify-center rounded-lg"
              style="background-color: #ecf0f1;"
            >
              <n-icon size="48" style="color: #7f8c8d;">
                <DocumentTextOutline />
              </n-icon>
            </div>
            <h2 class="text-2xl font-semibold mb-3" style="color: #2c3e50;">
              시트 연결이 필요합니다
            </h2>
            <p class="text-sm mb-6" style="color: #7f8c8d; line-height: 1.6;">
              구글 스프레드시트를 연결하여<br />
              임대차 계약 관리를 시작하세요
            </p>
            <n-button
              type="primary"
              size="large"
              @click="router.push({ name: 'settings' })"
              style="min-width: 160px;"
            >
              시트 연결하기
            </n-button>
          </div>
        </div>
        <router-view v-else />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
