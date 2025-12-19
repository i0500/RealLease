<script setup lang="ts">
import { onMounted, h, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSheetsStore } from '@/stores/sheets'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import type { SheetConfig } from '@/types'
import {
  NLayout,
  NLayoutHeader,
  NLayoutSider,
  NLayoutContent,
  NMenu,
  NButton,
  NIcon,
  NDrawer,
  NDrawerContent,
  NTag,
  NDivider,
  NBadge,
  useMessage
} from 'naive-ui'
import {
  GridOutline as DashboardIcon,
  DocumentTextOutline,
  NotificationsOutline as NotificationIcon,
  SettingsOutline as SettingsIcon,
  MenuOutline as MenuIcon,
  CheckmarkCircleOutline as ConnectedIcon,
  DocumentOutline as SheetIcon
} from '@vicons/ionicons5'
import type { MenuOption } from 'naive-ui'

const router = useRouter()
const route = useRoute()
const sheetsStore = useSheetsStore()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
const message = useMessage()

const isMobile = ref(false)
const sidebarCollapsed = ref(false)
const mobileMenuOpen = ref(false)

const connectionStatus = computed(() => {
  if (!sheetsStore.currentSheet) {
    return { text: '시트 미연결', type: 'warning' as const }
  }
  return { text: sheetsStore.currentSheet.name, type: 'success' as const }
})

// ✅ 모바일 메뉴용 시트 그룹 (같은 name끼리 그룹화)
const sheetGroupsForMobile = computed<Map<string, SheetConfig[]>>(() => {
  const groups = new Map<string, SheetConfig[]>()
  sheetsStore.sheets.forEach(sheet => {
    const existing = groups.get(sheet.name)
    if (!existing) {
      groups.set(sheet.name, [sheet])
    } else {
      existing.push(sheet)
    }
  })
  return groups
})

onMounted(() => {
  // 모바일 화면 감지 (768px 이하)
  const checkMobile = () => {
    const mobile = window.innerWidth < 768
    isMobile.value = mobile
    // 모바일에서는 기본적으로 사이드바 숨김
    if (mobile) {
      sidebarCollapsed.value = true
      mobileMenuOpen.value = false
    }
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

function handleCollapse(collapsed: boolean) {
  sidebarCollapsed.value = collapsed
}

function toggleMobileMenu() {
  mobileMenuOpen.value = !mobileMenuOpen.value
}

async function handleMobileMenuSelect(key: string) {
  // 시트의 하위 메뉴 (임대차 현황, 매도현황) 처리
  if (key.includes('-rental-contracts') || key.includes('-sales')) {
    const sheetId = key.replace('-rental-contracts', '').replace('-sales', '').replace('sheet-', '')
    const isRentalContracts = key.includes('-rental-contracts')

    try {
      // 시트 선택
      sheetsStore.setCurrentSheet(sheetId)

      // 해당 페이지로 라우팅
      router.push({
        name: isRentalContracts ? 'rental-contracts' : 'sales',
        params: { sheetId }
      })
    } catch (error) {
      console.error('Failed to navigate:', error)
      message.error('페이지 이동에 실패했습니다')
    }
  }
  // 시트 parent 선택
  else if (key.startsWith('sheet-')) {
    const sheetId = key.replace('sheet-', '')
    try {
      sheetsStore.setCurrentSheet(sheetId)
      const sheet = sheetsStore.sheets.find(s => s.id === sheetId)
      if (sheet) {
        message.success(`"${sheet.name}" 시트를 선택했습니다`)
        // 선택한 시트의 데이터 로드
        await contractsStore.loadContracts(sheetId)
        await notificationsStore.checkNotifications()
      }
    } catch (error) {
      console.error('Failed to switch sheet:', error)
      message.error('시트 전환에 실패했습니다')
    }
  }
  // 일반 라우트
  else {
    router.push({ name: key })
  }
  mobileMenuOpen.value = false
}

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

// 동적 메뉴 옵션 (시트 기반 계층 구조)
const menuOptions = computed<MenuOption[]>(() => {
  const options: MenuOption[] = [
    {
      label: '대시보드',
      key: 'dashboard',
      icon: renderIcon(DashboardIcon)
    },
    {
      label: () => h(
        NBadge,
        {
          value: notificationsStore.unreadCount,
          show: notificationsStore.unreadCount > 0,
          dot: false,
          max: 99
        },
        { default: () => '알림' }
      ),
      key: 'notifications',
      icon: renderIcon(NotificationIcon)
    }
  ]

  // 시트가 있으면 구분선과 시트 목록 추가
  if (sheetsStore.sheets.length > 0) {
    options.push({
      type: 'divider',
      key: 'divider-1'
    })

    // ✅ 같은 name을 가진 시트들을 그룹화
    const sheetGroups = new Map<string, SheetConfig[]>()
    sheetsStore.sheets.forEach(sheet => {
      const existing = sheetGroups.get(sheet.name)
      if (!existing) {
        sheetGroups.set(sheet.name, [sheet])
      } else {
        existing.push(sheet)
      }
    })

    // 각 그룹을 parent로, sheetType에 따라 children 생성
    sheetGroups.forEach((sheets: SheetConfig[], groupName: string) => {
      const children: MenuOption[] = []

      // ✅ 임대차 현황 메뉴 (sheetType === 'rental' 인 시트)
      const rentalSheet = sheets.find(s => s.sheetType === 'rental')
      if (rentalSheet) {
        children.push({
          label: '임대차 현황',
          key: `sheet-${rentalSheet.id}-rental-contracts`,
          icon: renderIcon(DocumentTextOutline)
        })
      }

      // ✅ 매도현황 메뉴 (sheetType === 'sale' 인 시트)
      const saleSheet = sheets.find(s => s.sheetType === 'sale')
      if (saleSheet) {
        children.push({
          label: '매도현황',
          key: `sheet-${saleSheet.id}-sales`,
          icon: renderIcon(DocumentTextOutline)
        })
      }

      // 그룹 메뉴 추가 (첫 번째 시트의 ID를 대표로 사용)
      const firstSheet = sheets[0]
      if (firstSheet) {
        options.push({
          label: groupName,
          key: `sheet-${firstSheet.id}`,
          icon: renderIcon(SheetIcon),
          extra: sheets.some(s => s.id === sheetsStore.currentSheetId) ? '✓' : undefined,
          children: children.length > 0 ? children : undefined
        })
      }
    })
  }

  // 하단 메뉴
  options.push(
    {
      type: 'divider',
      key: 'divider-2'
    },
    {
      label: '설정',
      key: 'settings',
      icon: renderIcon(SettingsIcon)
    }
  )

  return options
})

async function handleMenuSelect(key: string) {
  // 시트의 하위 메뉴 (임대차 현황, 매도현황) 처리
  if (key.includes('-rental-contracts') || key.includes('-sales')) {
    const sheetId = key.replace('-rental-contracts', '').replace('-sales', '').replace('sheet-', '')
    const isRentalContracts = key.includes('-rental-contracts')

    try {
      // 시트 선택
      sheetsStore.setCurrentSheet(sheetId)

      // 해당 페이지로 라우팅
      router.push({
        name: isRentalContracts ? 'rental-contracts' : 'sales',
        params: { sheetId }
      })
    } catch (error) {
      console.error('Failed to navigate:', error)
      message.error('페이지 이동에 실패했습니다')
    }
  }
  // ✅ 시트 parent 선택 → 대시보드로 이동 (PC/모바일 동일)
  else if (key.startsWith('sheet-')) {
    const sheetId = key.replace('sheet-', '')
    try {
      sheetsStore.setCurrentSheet(sheetId)
      const sheet = sheetsStore.sheets.find(s => s.id === sheetId)
      if (sheet) {
        message.success(`"${sheet.name}" 파일을 선택했습니다`)
        // 대시보드로 이동 (선택된 파일의 정보만 표시)
        router.push({ name: 'dashboard' })
      }
    } catch (error) {
      console.error('Failed to switch sheet:', error)
      message.error('파일 전환에 실패했습니다')
    }
  }
  // 일반 라우트
  else {
    router.push({ name: key })
  }
}
</script>

<template>
  <n-layout has-sider style="min-height: 100vh; height: 100vh; background-color: #f5f7fa;">
    <!-- 데스크톱 사이드바 (768px 이상) -->
    <n-layout-sider
      v-if="!isMobile"
      bordered
      show-trigger
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :native-scrollbar="false"
      :collapsed="sidebarCollapsed"
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
        :value="(route.name as string)"
        @update:value="handleMenuSelect"
        :inverted="true"
        style="background-color: #2c3e50;"
      />
    </n-layout-sider>

    <n-layout style="height: 100vh; display: flex; flex-direction: column;">
      <!-- 모바일/데스크톱 헤더 -->
      <n-layout-header
        bordered
        class="px-4 py-3"
        style="background-color: #ffffff; border-bottom: 1px solid #e1e8ed; flex-shrink: 0;"
      >
        <div class="flex items-center justify-between gap-3">
          <!-- 모바일 메뉴 버튼 -->
          <n-button
            v-if="isMobile"
            text
            @click="toggleMobileMenu"
            style="color: #2c3e50;"
            size="large"
          >
            <template #icon>
              <n-icon :size="24"><MenuIcon /></n-icon>
            </template>
          </n-button>

          <!-- 제목 및 연결 상태 -->
          <div class="flex-1 min-w-0">
            <h2 class="text-base md:text-lg font-semibold truncate" style="color: #2c3e50;">
              임대차 관리 시스템
            </h2>
            <div class="flex items-center gap-2 mt-1">
              <n-icon :size="14" :style="{ color: connectionStatus.type === 'success' ? '#18a058' : '#f0a020' }">
                <ConnectedIcon />
              </n-icon>
              <span class="text-xs truncate" :style="{ color: connectionStatus.type === 'success' ? '#18a058' : '#f0a020' }">
                {{ connectionStatus.text }}
              </span>
            </div>
          </div>

        </div>
      </n-layout-header>

      <!-- 콘텐츠 영역 -->
      <n-layout-content class="p-4 md:p-6" style="flex: 1; overflow-y: auto; background-color: #f5f7fa;">
        <router-view />
      </n-layout-content>
    </n-layout>

    <!-- 모바일 네비게이션 드로어 -->
    <n-drawer v-model:show="mobileMenuOpen" :width="280" placement="left">
      <n-drawer-content title="메뉴" :native-scrollbar="false">
        <div class="mb-4 p-4 rounded" style="background-color: #f5f7fa;">
          <div class="flex items-center gap-2 mb-2">
            <n-icon :size="16" :style="{ color: connectionStatus.type === 'success' ? '#18a058' : '#f0a020' }">
              <ConnectedIcon />
            </n-icon>
            <span class="text-sm font-medium">연결 상태</span>
          </div>
          <n-tag :type="connectionStatus.type" size="small">
            {{ connectionStatus.text }}
          </n-tag>
        </div>

        <div class="space-y-2">
          <n-button
            block
            text
            :type="route.name === 'dashboard' ? 'primary' : 'default'"
            @click="handleMobileMenuSelect('dashboard')"
            class="justify-start"
            size="large"
          >
            <template #icon>
              <n-icon><DashboardIcon /></n-icon>
            </template>
            대시보드
          </n-button>

          <n-button
            block
            text
            :type="route.name === 'notifications' ? 'primary' : 'default'"
            @click="handleMobileMenuSelect('notifications')"
            class="justify-start"
            size="large"
          >
            <template #icon>
              <n-icon><NotificationIcon /></n-icon>
            </template>
            <n-badge
              :value="notificationsStore.unreadCount"
              :show="notificationsStore.unreadCount > 0"
              :max="99"
            >
              알림
            </n-badge>
          </n-button>
        </div>

        <!-- 시트 목록 섹션 (계층 구조) -->
        <n-divider v-if="sheetsStore.sheets.length > 0">시트 목록</n-divider>
        <div v-if="sheetsStore.sheets.length > 0" class="space-y-3">
          <div v-for="[groupName, sheets] in Array.from(sheetGroupsForMobile.entries())" :key="groupName" class="space-y-1">
            <!-- 시트 그룹 parent -->
            <n-button
              v-if="sheets.length > 0"
              block
              text
              :type="sheets.some(s => s.id === sheetsStore.currentSheetId) ? 'primary' : 'default'"
              @click="handleMobileMenuSelect(`sheet-${sheets[0]!.id}`)"
              class="justify-start"
              size="large"
            >
              <template #icon>
                <n-icon><SheetIcon /></n-icon>
              </template>
              {{ groupName }}
              <span v-if="sheets.some(s => s.id === sheetsStore.currentSheetId)" class="ml-auto">✓</span>
            </n-button>

            <!-- 시트 그룹의 하위 메뉴 (sheetType에 따라) -->
            <div class="pl-6 space-y-1">
              <!-- ✅ 임대차 현황 (sheetType === 'rental' 인 시트만) -->
              <template v-if="sheets.find(s => s.sheetType === 'rental')">
                <n-button
                  block
                  text
                  :type="route.name === 'rental-contracts' && sheets.find(s => s.sheetType === 'rental' && route.params.sheetId === s.id) ? 'primary' : 'default'"
                  @click="handleMobileMenuSelect(`sheet-${sheets.find(s => s.sheetType === 'rental')!.id}-rental-contracts`)"
                  class="justify-start"
                  size="medium"
                >
                  <template #icon>
                    <n-icon><DocumentTextOutline /></n-icon>
                  </template>
                  임대차 현황
                </n-button>
              </template>

              <!-- ✅ 매도현황 (sheetType === 'sale' 인 시트만) -->
              <template v-if="sheets.find(s => s.sheetType === 'sale')">
                <n-button
                  block
                  text
                  :type="(route.name === 'sales' || route.name === 'sale-detail') && sheets.find(s => s.sheetType === 'sale' && route.params.sheetId === s.id) ? 'primary' : 'default'"
                  @click="handleMobileMenuSelect(`sheet-${sheets.find(s => s.sheetType === 'sale')!.id}-sales`)"
                  class="justify-start"
                  size="medium"
                >
                  <template #icon>
                    <n-icon><DocumentTextOutline /></n-icon>
                  </template>
                  매도현황
                </n-button>
              </template>
            </div>
          </div>
        </div>

        <n-divider>관리</n-divider>
        <div class="space-y-2">
          <n-button
            block
            text
            :type="route.name === 'settings' ? 'primary' : 'default'"
            @click="handleMobileMenuSelect('settings')"
            class="justify-start"
            size="large"
          >
            <template #icon>
              <n-icon><SettingsIcon /></n-icon>
            </template>
            설정
          </n-button>
        </div>

        <template #footer>
          <div class="text-center text-xs" style="color: #95a5a6;">
            RealLease v1.0.0
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </n-layout>
</template>
