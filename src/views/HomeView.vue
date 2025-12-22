<script setup lang="ts">
import { onMounted, h, ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSheetsStore } from '@/stores/sheets'
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

// PC 사이드바 메뉴 기본 펼침 키 (시트 그룹들)
const defaultExpandedKeys = computed<string[]>(() => {
  if (sheetsStore.sheets.length === 0) return []

  // 시트 그룹별로 첫 번째 시트의 ID를 키로 사용
  const groups = new Map<string, string>()
  sheetsStore.sheets.forEach(sheet => {
    if (!groups.has(sheet.name)) {
      groups.set(sheet.name, `sheet-${sheet.id}`)
    }
  })

  return Array.from(groups.values())
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

        // 현재 그룹의 rental/sale 시트 ID 찾기
        const groupSheets = sheetsStore.sheets.filter(s => s.name === sheet.name)
        const groupRentalSheet = groupSheets.find(s => s.sheetType === 'rental')
        const groupSaleSheet = groupSheets.find(s => s.sheetType === 'sale')

        // 현재 페이지가 임대차현황 또는 매도현황이면 해당 페이지 유지하며 시트 변경
        const currentRouteName = route.name as string
        if (currentRouteName === 'rental-contracts' && groupRentalSheet) {
          router.push({
            name: 'rental-contracts',
            params: { sheetId: groupRentalSheet.id }
          })
        } else if ((currentRouteName === 'sales' || currentRouteName === 'sale-detail') && groupSaleSheet) {
          router.push({
            name: 'sales',
            params: { sheetId: groupSaleSheet.id }
          })
        } else {
          // 그 외의 경우 대시보드로 이동
          router.push({ name: 'dashboard' })
        }

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
        'div',
        { style: 'display: flex; align-items: center; gap: 16px;' },
        [
          '알림',
          notificationsStore.unreadCount > 0
            ? h(
                NTag,
                {
                  type: 'error',
                  size: 'small',
                  round: true
                },
                { default: () => notificationsStore.unreadCount }
              )
            : null
        ]
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
      const currentRouteName = route.name as string
      const currentSheetId = route.params.sheetId as string

      // ✅ 임대 관리 메뉴 (sheetType === 'rental' 인 시트)
      const rentalSheet = sheets.find(s => s.sheetType === 'rental')
      if (rentalSheet) {
        const isRentalActive = currentRouteName === 'rental-contracts' && currentSheetId === rentalSheet.id
        children.push({
          label: () => h(
            'span',
            {
              class: isRentalActive ? 'submenu-active' : '',
              style: isRentalActive
                ? 'color: #4ade80; font-weight: 600; display: flex; align-items: center; gap: 6px;'
                : 'display: flex; align-items: center; gap: 6px;'
            },
            [
              '임대 관리',
              isRentalActive ? h('span', { style: 'font-size: 10px;' }, '●') : null
            ]
          ),
          key: `sheet-${rentalSheet.id}-rental-contracts`,
          icon: renderIcon(DocumentTextOutline)
        })
      }

      // ✅ 매도 관리 메뉴 (sheetType === 'sale' 인 시트)
      const saleSheet = sheets.find(s => s.sheetType === 'sale')
      if (saleSheet) {
        const isSaleActive = (currentRouteName === 'sales' || currentRouteName === 'sale-detail') && currentSheetId === saleSheet.id
        children.push({
          label: () => h(
            'span',
            {
              class: isSaleActive ? 'submenu-active' : '',
              style: isSaleActive
                ? 'color: #4ade80; font-weight: 600; display: flex; align-items: center; gap: 6px;'
                : 'display: flex; align-items: center; gap: 6px;'
            },
            [
              '매도 관리',
              isSaleActive ? h('span', { style: 'font-size: 10px;' }, '●') : null
            ]
          ),
          key: `sheet-${saleSheet.id}-sales`,
          icon: renderIcon(DocumentTextOutline)
        })
      }

      // 그룹 메뉴 추가 (첫 번째 시트의 ID를 대표로 사용)
      const firstSheet = sheets[0]
      if (firstSheet) {
        const sheetId = firstSheet.id
        const isSelected = sheets.some(s => s.id === sheetsStore.currentSheetId)
        const groupRentalSheet = sheets.find(s => s.sheetType === 'rental')
        const groupSaleSheet = sheets.find(s => s.sheetType === 'sale')

        options.push({
          label: () => h(
            'span',
            {
              style: `cursor: pointer; display: flex; align-items: center; width: 100%; gap: 8px; ${isSelected ? 'color: #4ade80; font-weight: 600;' : ''}`,
              onClick: (e: Event) => {
                e.stopPropagation()
                sheetsStore.setCurrentSheet(sheetId)
                const sheet = sheetsStore.sheets.find(s => s.id === sheetId)
                if (sheet) {
                  message.success(`"${sheet.name}" 파일을 선택했습니다`)
                  const currentRouteName = route.name as string
                  if (currentRouteName === 'rental-contracts' && groupRentalSheet) {
                    router.push({ name: 'rental-contracts', params: { sheetId: groupRentalSheet.id } })
                  } else if ((currentRouteName === 'sales' || currentRouteName === 'sale-detail') && groupSaleSheet) {
                    router.push({ name: 'sales', params: { sheetId: groupSaleSheet.id } })
                  } else {
                    router.push({ name: 'dashboard' })
                  }
                }
              }
            },
            [
              h('span', { style: 'flex: 1;' }, groupName),
              isSelected ? h('span', {
                style: 'background: #22c55e; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 500;'
              }, '선택됨') : null
            ]
          ),
          key: `sheet-${firstSheet.id}`,
          icon: () => h(NIcon, {
            style: isSelected ? 'color: #4ade80;' : undefined
          }, { default: () => h(SheetIcon) }),
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
      <div class="sidebar-brand" :class="{ 'collapsed': sidebarCollapsed }">
        <div class="brand-logo">
          <span class="logo-full" v-if="!sidebarCollapsed">RealLease</span>
          <span class="logo-collapsed" v-else>R</span>
        </div>
      </div>
      <n-menu
        :options="menuOptions"
        :value="(route.name as string)"
        @update:value="handleMenuSelect"
        :inverted="true"
        :default-expanded-keys="defaultExpandedKeys"
        style="background-color: #2c3e50;"
      />
    </n-layout-sider>

    <n-layout style="height: 100vh; display: flex; flex-direction: column;">
      <!-- 모바일 헤더 (PC에서는 사이드바에 정보가 있으므로 숨김) -->
      <n-layout-header
        v-if="isMobile"
        bordered
        class="px-4 py-3"
        style="background-color: #ffffff; border-bottom: 1px solid #e1e8ed; flex-shrink: 0;"
      >
        <div class="flex items-center justify-between gap-3">
          <!-- 모바일 메뉴 버튼 (알림 배지 포함) -->
          <n-badge
            v-if="isMobile"
            :value="notificationsStore.unreadCount"
            :max="99"
            :show="notificationsStore.unreadCount > 0"
            dot
          >
            <n-button
              text
              @click="toggleMobileMenu"
              style="color: #2c3e50;"
              size="large"
            >
              <template #icon>
                <n-icon :size="24"><MenuIcon /></n-icon>
              </template>
            </n-button>
          </n-badge>

          <!-- 제목 및 연결 상태 -->
          <div class="flex-1 min-w-0">
            <h2 class="text-base md:text-lg font-semibold truncate" style="color: #2c3e50;">
              RealLease
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
            <div style="display: flex; align-items: center; gap: 16px; width: 100%;">
              <span>알림</span>
              <n-badge
                v-if="notificationsStore.unreadCount > 0"
                :value="notificationsStore.unreadCount"
                :max="99"
                :offset="[0, 0]"
              />
            </div>
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
              <!-- ✅ 임대 관리 (sheetType === 'rental' 인 시트만) -->
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
                  임대 관리
                </n-button>
              </template>

              <!-- ✅ 매도 관리 (sheetType === 'sale' 인 시트만) -->
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
                  매도 관리
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

<style scoped>
/* Sidebar Brand Styles */
.sidebar-brand {
  padding: 1.5rem 1rem;
  background-color: #1a252f;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.sidebar-brand.collapsed {
  padding: 1.5rem 0.5rem;
}

.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-full {
  font-size: 1.25rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.logo-collapsed {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
