<script setup lang="ts">
import { onMounted, h, ref } from 'vue'
import { useRouter } from 'vue-router'
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
const isMobile = ref(false)
const sidebarCollapsed = ref(false)

onMounted(() => {
  // 모바일 화면 감지 (768px 이하)
  const checkMobile = () => {
    const mobile = window.innerWidth < 768
    isMobile.value = mobile
    // 모바일에서는 기본적으로 사이드바 숨김
    if (mobile) {
      sidebarCollapsed.value = true
    }
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

function handleCollapse(collapsed: boolean) {
  sidebarCollapsed.value = collapsed
}

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
  <n-layout has-sider style="min-height: 100vh; height: 100vh; background-color: #f5f7fa;">
    <n-layout-sider
      bordered
      show-trigger
      collapse-mode="width"
      :collapsed-width="0"
      :width="240"
      :native-scrollbar="false"
      :collapsed="sidebarCollapsed"
      :default-collapsed="isMobile"
      breakpoint="md"
      @update:collapsed="handleCollapse"
      style="background-color: #2c3e50; height: 100vh;"
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

    <n-layout style="height: 100vh; display: flex; flex-direction: column;">
      <n-layout-header
        bordered
        class="px-4 py-3 md:px-6 md:py-4"
        style="background-color: #ffffff; border-bottom: 1px solid #e1e8ed; flex-shrink: 0;"
      >
        <div class="flex items-center justify-between">
          <h2 class="text-base md:text-lg font-semibold" style="color: #2c3e50;">
            임대차 관리 시스템
          </h2>
          <div class="flex items-center gap-1 md:gap-2">
            <n-button
              text
              @click="router.push({ name: 'notifications' })"
              style="color: #5a6c7d;"
              size="small"
            >
              <template #icon>
                <n-icon><NotificationIcon /></n-icon>
              </template>
              <span class="hidden sm:inline">알림</span>
            </n-button>
            <n-button
              text
              @click="router.push({ name: 'settings' })"
              style="color: #5a6c7d;"
              size="small"
            >
              <template #icon>
                <n-icon><SettingsIcon /></n-icon>
              </template>
              <span class="hidden sm:inline">설정</span>
            </n-button>
          </div>
        </div>
      </n-layout-header>

      <n-layout-content class="p-4 md:p-6" style="flex: 1; overflow-y: auto; background-color: #f5f7fa;">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
