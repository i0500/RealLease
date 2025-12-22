<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useNotificationSettingsStore } from '@/stores/notificationSettings'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import { formatCurrency } from '@/utils/formatUtils'
import { NCard, NSpin, NAlert, NEmpty, NButton, NTag, NModal, NDescriptions, NDescriptionsItem, NSpace, NIcon, useMessage } from 'naive-ui'
import {
  HomeOutline as HomeIcon,
  WarningOutline as WarningIcon,
  CheckmarkCircleOutline as CheckIcon,
  TimeOutline as TimeIcon,
  DocumentTextOutline as DocumentIcon,
  NotificationsOutline as NotificationIcon,
  TrendingUpOutline as TrendingIcon,
  BusinessOutline as BuildingIcon
} from '@vicons/ionicons5'
import type { RentalContract } from '@/types/contract'
import type { Notification } from '@/types/notification'

const router = useRouter()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
const notificationSettingsStore = useNotificationSettingsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()

// 계약 상세 모달
const showDetailModal = ref(false)
const viewingContract = ref<RentalContract | null>(null)

// 현재 선택된 파일(그룹)의 모든 시트에서 임대차 계약 필터링
const currentSheetContracts = computed(() => {
  if (!sheetsStore.currentSheet) return []

  // 같은 name(그룹)을 가진 모든 시트 ID 찾기
  const currentGroupName = sheetsStore.currentSheet.name
  const groupSheetIds = sheetsStore.sheets
    .filter(s => s.name === currentGroupName)
    .map(s => s.id)

  // 그룹에 속한 모든 시트의 계약 필터링
  return contractsStore.contracts.filter(c =>
    groupSheetIds.includes(c.sheetId) && !c.metadata.deletedAt
  )
})

// 현재 시트의 최근 계약 (시작일 기준 최근 5개)
const recentContracts = computed(() => {
  return [...currentSheetContracts.value]
    .filter(c => c.startDate)
    .sort((a, b) => {
      const dateA = a.startDate?.getTime() || 0
      const dateB = b.startDate?.getTime() || 0
      return dateB - dateA // 최신순
    })
    .slice(0, 5)
})

// 보증보험 만료 예정 (설정값 기반)
const hugExpiringContracts = computed(() => {
  const today = new Date()
  const expiryDays = notificationSettingsStore.settings.hugExpiryNoticeDays || 90
  const expiryDate = new Date(today)
  expiryDate.setDate(expiryDate.getDate() + expiryDays)

  return currentSheetContracts.value.filter(c => {
    if (!c.hugEndDate) return false
    return c.hugEndDate >= today && c.hugEndDate <= expiryDate
  })
})

// 임대차 통계 (현재 선택된 시트만)
const rentalStats = computed(() => {
  // 전체계약: 동/호가 있는 모든 계약 (공실 포함)
  const total = currentSheetContracts.value.length
  const vacant = currentSheetContracts.value.filter(c => !c.tenantName || c.tenantName.trim() === '').length
  const occupied = total - vacant

  // 계약 만료예정 (설정값 기반)
  const today = new Date()
  const contractExpiryDays = notificationSettingsStore.settings.contractExpiryNoticeDays || 90
  const contractExpiryDate = new Date(today)
  contractExpiryDate.setDate(contractExpiryDate.getDate() + contractExpiryDays)

  const expiring = currentSheetContracts.value.filter(c => {
    if (!c.endDate) return false
    return c.endDate >= today && c.endDate <= contractExpiryDate
  }).length

  // 보증보험 만료예정
  const hugExpiring = hugExpiringContracts.value.length

  // 입주율 계산
  const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0

  return { total, vacant, occupied, expiring, hugExpiring, occupancyRate }
})

// 현재 그룹의 매도 계약만 필터링
const currentGroupSaleContracts = computed(() => {
  if (!sheetsStore.currentSheet) return []

  const currentGroupName = sheetsStore.currentSheet.name
  const groupSheetIds = sheetsStore.sheets
    .filter(s => s.name === currentGroupName)
    .map(s => s.id)

  return contractsStore.saleContracts.filter(c =>
    groupSheetIds.includes(c.sheetId)
  )
})

// 매도현황 통계 (현재 선택된 파일 그룹의 시트만)
const saleStats = computed(() => {
  if (!sheetsStore.currentSheet) {
    return { total: 0, active: 0, completed: 0 }
  }

  // 같은 name(그룹)을 가진 모든 시트 ID 찾기
  const currentGroupName = sheetsStore.currentSheet.name
  const groupSheetIds = sheetsStore.sheets
    .filter(s => s.name === currentGroupName)
    .map(s => s.id)

  // 그룹에 속한 시트의 매도 계약만 필터링
  const groupSaleContracts = contractsStore.saleContracts.filter(c =>
    groupSheetIds.includes(c.sheetId)
  )

  return {
    total: groupSaleContracts.length,
    active: groupSaleContracts.filter(c => c.status === 'active').length,
    completed: groupSaleContracts.filter(c => c.status === 'completed').length
  }
})

// 전체 통계
const stats = computed(() => ({
  rentalTotal: rentalStats.value.total,
  rentalVacant: rentalStats.value.vacant,
  rentalOccupied: rentalStats.value.occupied,
  rentalExpiring: rentalStats.value.expiring,
  hugExpiring: rentalStats.value.hugExpiring,
  occupancyRate: rentalStats.value.occupancyRate,
  saleTotal: saleStats.value.total,
  saleActive: saleStats.value.active,
  saleCompleted: saleStats.value.completed,
  notifications: notificationsStore.unreadCount
}))

// 현재 시트 그룹에 해당하는 알림만 필터링
const currentGroupNotifications = computed(() => {
  if (!sheetsStore.currentSheet) return []

  // 현재 그룹에 속한 모든 시트 ID
  const currentGroupName = sheetsStore.currentSheet.name
  const groupSheetIds = sheetsStore.sheets
    .filter(s => s.name === currentGroupName)
    .map(s => s.id)

  // 해당 그룹의 알림만 필터링 (미읽음)
  return notificationsStore.sortedNotifications.filter(n =>
    !n.read && n.sheetId && groupSheetIds.includes(n.sheetId)
  )
})

// 현재 그룹의 미읽음 알림 개수
const currentGroupUnreadCount = computed(() => currentGroupNotifications.value.length)

// 데이터 로드 함수 - 현재 선택된 파일(그룹)의 시트들만 로드
async function loadData() {
  if (sheetsStore.sheets.length === 0) {
    console.log('[DashboardView.loadData] 등록된 시트가 없습니다')
    return
  }

  if (!sheetsStore.currentSheet) {
    console.log('[DashboardView.loadData] 선택된 시트가 없습니다')
    return
  }

  try {
    const currentSheetName = sheetsStore.currentSheet.name
    console.log('[DashboardView.loadData] 선택된 파일 데이터 로딩 시작:', currentSheetName)

    // 같은 name(그룹)을 가진 시트들만 로드
    const groupSheets = sheetsStore.sheets.filter(s => s.name === currentSheetName)
    console.log(`[DashboardView.loadData] "${currentSheetName}" 그룹의 시트 ${groupSheets.length}개 발견`)

    for (const sheet of groupSheets) {
      // sheetType 사용 (이미 저장되어 있음)
      await contractsStore.loadContracts(sheet.id, sheet.sheetType)
    }

    // 알림 확인
    await notificationsStore.checkNotifications()

    console.log(`[DashboardView.loadData] "${currentSheetName}" 파일 데이터 로딩 완료`)
  } catch (error) {
    console.error('[DashboardView.loadData] 데이터 로딩 실패:', error)
  }
}

// 마운트 시 데이터 로드
onMounted(async () => {
  // 알림 설정 로드
  await notificationSettingsStore.initialize()

  // 새로고침 시 sheets가 로드되지 않은 경우를 대비해 먼저 로드
  if (sheetsStore.sheets.length === 0) {
    console.log('[DashboardView] Sheets 데이터 로딩 중...')
    await sheetsStore.loadSheets()
  }
  await loadData()
})

// 시트 변경 감지하여 데이터 재로드 (새로고침 문제 해결)
watch(
  () => sheetsStore.currentSheet?.id,
  (newSheetId, oldSheetId) => {
    if (newSheetId && newSheetId !== oldSheetId) {
      console.log('[DashboardView] 시트 변경 감지, 데이터 재로드:', newSheetId)
      loadData()
    }
  }
  // immediate 제거: onMounted에서 이미 loadData() 호출하므로 중복 호출 방지
)

// Navigation handlers
function navigateToContracts(status?: 'vacant' | 'expiring' | 'hugExpiring') {
  if (!sheetsStore.currentSheet) {
    console.warn('No current sheet selected')
    return
  }

  if (status) {
    router.push({
      name: 'rental-contracts',
      params: { sheetId: sheetsStore.currentSheet.id },
      query: { status }
    })
  } else {
    router.push({
      name: 'rental-contracts',
      params: { sheetId: sheetsStore.currentSheet.id }
    })
  }
}

function navigateToSales(status?: 'active' | 'completed') {
  if (!sheetsStore.currentSheet) {
    console.warn('No current sheet selected')
    return
  }

  if (status) {
    router.push({
      name: 'sales',
      params: { sheetId: sheetsStore.currentSheet.id },
      query: { status }
    })
  } else {
    router.push({
      name: 'sales',
      params: { sheetId: sheetsStore.currentSheet.id }
    })
  }
}

function handleNotificationClick(notification: Notification) {
  // 알림을 읽음 처리
  notificationsStore.markAsRead(notification.id)

  // 알림 타입에 따른 필터 결정
  const statusFilter = notification.type === 'contract_expiring' ? 'expiring' : 'hugExpiring'

  // sheetId 결정: 알림에 저장된 sheetId 또는 현재 rental 시트
  let targetSheetId = notification.sheetId

  if (!targetSheetId) {
    // sheetId가 없으면 현재 선택된 rental 시트 사용
    if (sheetsStore.currentRentalSheet) {
      targetSheetId = sheetsStore.currentRentalSheet.id
    } else if (sheetsStore.currentSheet) {
      // rental 시트가 없으면 현재 시트 사용
      targetSheetId = sheetsStore.currentSheet.id
    }
  }

  if (!targetSheetId) {
    message.warning('시트를 선택해주세요')
    return
  }

  // 임대차 현황 페이지로 이동 (필터 적용)
  router.push({
    name: 'rental-contracts',
    params: { sheetId: targetSheetId },
    query: { status: statusFilter }
  })
}

function handleContractClick(contract: RentalContract) {
  if (!sheetsStore.currentSheet) {
    console.warn('No current sheet selected')
    return
  }

  // Navigate to rental contracts page with contract ID to open detail modal
  router.push({
    name: 'rental-contracts',
    params: { sheetId: sheetsStore.currentSheet.id },
    query: { id: contract.id }
  })
}

function handleSaleClick(saleId: string) {
  if (!sheetsStore.currentSheet) {
    console.warn('No current sheet selected')
    return
  }

  // Navigate to sales page with sale ID to open detail modal
  router.push({
    name: 'sales',
    params: { sheetId: sheetsStore.currentSheet.id },
    query: { id: saleId }
  })
}

function navigateToNotifications() {
  router.push({ name: 'notifications' })
}

// 우선순위별 색상 반환
function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high': return '#ef4444'
    case 'medium': return '#f59e0b'
    case 'low': return '#3b82f6'
    default: return '#6b7280'
  }
}
</script>

<template>
  <div class="dashboard-container">
    <!-- Header Section - 네이비 배너 (입주율 표시) -->
    <header class="dashboard-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-icon">
            <n-icon size="28" color="#fff">
              <BuildingIcon />
            </n-icon>
          </div>
          <div class="header-text">
            <h1 class="header-title">
              {{ sheetsStore.currentSheet?.name || 'RealLease' }}
            </h1>
          </div>
        </div>
        <div class="header-right" v-if="sheetsStore.currentSheet">
          <div class="header-stat">
            <span class="stat-label">입주율</span>
            <span class="stat-value" :class="{ 'text-success': stats.occupancyRate >= 90, 'text-warning': stats.occupancyRate >= 70 && stats.occupancyRate < 90, 'text-danger': stats.occupancyRate < 70 }">
              {{ stats.occupancyRate }}%
            </span>
          </div>
        </div>
      </div>
    </header>

    <!-- No sheets message -->
    <div v-if="!sheetsStore.currentSheet" class="empty-state">
      <div class="empty-state-content">
        <div class="empty-icon">
          <n-icon size="64" color="#94a3b8">
            <DocumentIcon />
          </n-icon>
        </div>
        <h2 class="empty-title">시트 연결이 필요합니다</h2>
        <p class="empty-description">
          구글 스프레드시트를 연결하여<br />
          임대차 계약 관리를 시작하세요
        </p>
        <n-button
          type="primary"
          size="large"
          @click="router.push({ name: 'settings' })"
          class="empty-button"
        >
          시트 연결하기
        </n-button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-else-if="contractsStore.isLoading" class="loading-state">
      <n-spin size="large" />
      <p class="loading-text">데이터를 불러오는 중...</p>
    </div>

    <!-- Main Content -->
    <div v-else class="dashboard-content">
      <!-- Error Alert -->
      <n-alert
        v-if="contractsStore.error"
        type="error"
        class="mb-4"
        closable
        @close="contractsStore.clearError"
      >
        {{ contractsStore.error }}
      </n-alert>

      <!-- Rental Status Section -->
      <section class="dashboard-section">
        <div class="section-header">
          <div class="section-title-group">
            <n-icon size="20" color="#3b82f6">
              <HomeIcon />
            </n-icon>
            <h2 class="section-title">임대 관리</h2>
          </div>
          <n-button text type="primary" @click="navigateToContracts()">
            전체보기 &rarr;
          </n-button>
        </div>

        <div class="kpi-grid">
          <!-- 전체 계약 -->
          <div class="kpi-card kpi-primary" @click="navigateToContracts()">
            <div class="kpi-icon-wrap primary">
              <n-icon size="24" color="#3b82f6">
                <DocumentIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.rentalTotal }}</span>
              <span class="kpi-label">전체 계약</span>
            </div>
          </div>

          <!-- 공실 -->
          <div class="kpi-card kpi-neutral" @click="navigateToContracts('vacant')">
            <div class="kpi-icon-wrap neutral">
              <n-icon size="24" color="#6b7280">
                <HomeIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.rentalVacant }}</span>
              <span class="kpi-label">공실</span>
            </div>
          </div>

          <!-- 계약만료 도래 -->
          <div class="kpi-card kpi-warning" @click="navigateToContracts('expiring')">
            <div class="kpi-icon-wrap warning">
              <n-icon size="24" color="#f59e0b">
                <TimeIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.rentalExpiring }}</span>
              <span class="kpi-label">계약만료 도래</span>
            </div>
            <div v-if="stats.rentalExpiring > 0" class="kpi-badge warning">주의</div>
          </div>

          <!-- 보험만료 도래 -->
          <div class="kpi-card kpi-danger" @click="navigateToContracts('hugExpiring')">
            <div class="kpi-icon-wrap danger">
              <n-icon size="24" color="#ef4444">
                <WarningIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.hugExpiring }}</span>
              <span class="kpi-label">보험만료 도래</span>
            </div>
            <div v-if="stats.hugExpiring > 0" class="kpi-badge danger">긴급</div>
          </div>
        </div>
      </section>

      <!-- Sale Status Section -->
      <section v-if="stats.saleTotal > 0" class="dashboard-section">
        <div class="section-header">
          <div class="section-title-group">
            <n-icon size="20" color="#10b981">
              <TrendingIcon />
            </n-icon>
            <h2 class="section-title">매도 관리</h2>
          </div>
          <n-button text type="primary" @click="navigateToSales()">
            전체보기 &rarr;
          </n-button>
        </div>

        <div class="kpi-grid kpi-grid-3">
          <!-- 전체 매도 -->
          <div class="kpi-card kpi-success" @click="navigateToSales()">
            <div class="kpi-icon-wrap success">
              <n-icon size="24" color="#10b981">
                <TrendingIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.saleTotal }}</span>
              <span class="kpi-label">전체 매도</span>
            </div>
          </div>

          <!-- 진행중 -->
          <div class="kpi-card kpi-info" @click="navigateToSales('active')">
            <div class="kpi-icon-wrap info">
              <n-icon size="24" color="#0ea5e9">
                <TimeIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.saleActive }}</span>
              <span class="kpi-label">진행중</span>
            </div>
          </div>

          <!-- 종결 -->
          <div class="kpi-card kpi-complete" @click="navigateToSales('completed')">
            <div class="kpi-icon-wrap complete">
              <n-icon size="24" color="#22c55e">
                <CheckIcon />
              </n-icon>
            </div>
            <div class="kpi-content">
              <span class="kpi-value">{{ stats.saleCompleted }}</span>
              <span class="kpi-label">종결</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Notifications Section (현재 시트 그룹의 알림만 표시) -->
      <section class="dashboard-section">
        <div class="section-header">
          <div class="section-title-group">
            <n-icon size="20" color="#f59e0b">
              <NotificationIcon />
            </n-icon>
            <h2 class="section-title">최근 알림</h2>
            <span v-if="currentGroupUnreadCount > 0" class="notification-badge">
              {{ currentGroupUnreadCount }}
            </span>
          </div>
          <n-button text type="primary" @click="navigateToNotifications()">
            전체보기 &rarr;
          </n-button>
        </div>

        <div class="notifications-card">
          <div v-if="currentGroupNotifications.length > 0" class="notification-list">
            <div
              v-for="notification in currentGroupNotifications.slice(0, 5)"
              :key="notification.id"
              class="notification-item"
              @click="handleNotificationClick(notification)"
            >
              <div class="notification-priority" :style="{ backgroundColor: getPriorityColor(notification.priority) }"></div>
              <div class="notification-content">
                <div class="notification-header">
                  <span class="notification-type">
                    {{ notification.type === 'contract_expiring' ? '계약만료' : 'HUG만료' }}
                  </span>
                </div>
                <h4 class="notification-title">{{ notification.title }}</h4>
                <p class="notification-message">{{ notification.message }}</p>
              </div>
              <div class="notification-dday">
                <span class="dday-value" :class="{
                  'dday-high': notification.priority === 'high',
                  'dday-medium': notification.priority === 'medium',
                  'dday-low': notification.priority === 'low'
                }">
                  D-{{ notification.daysLeft }}
                </span>
              </div>
            </div>
          </div>
          <n-empty v-else description="이 시트 그룹의 알림이 없습니다" class="py-8" />
        </div>
      </section>

      <!-- Recent Contracts Section -->
      <section class="dashboard-section">
        <div class="section-header">
          <div class="section-title-group">
            <n-icon size="20" color="#8b5cf6">
              <DocumentIcon />
            </n-icon>
            <h2 class="section-title">최근 계약</h2>
          </div>
          <n-button text type="primary" @click="navigateToContracts()">
            전체보기 &rarr;
          </n-button>
        </div>

        <div class="contracts-card">
          <div v-if="recentContracts.length > 0" class="contract-list">
            <div
              v-for="contract in recentContracts"
              :key="contract.id"
              class="contract-item"
              @click="handleContractClick(contract)"
            >
              <div class="contract-main">
                <div class="contract-location">
                  <span class="location-text">{{ contract.building }}동 {{ contract.unit }}호</span>
                  <n-tag
                    :type="contract.tenantName ? 'success' : 'default'"
                    size="small"
                  >
                    {{ contract.tenantName ? '계약중' : '공실' }}
                  </n-tag>
                </div>
                <div class="contract-details">
                  <span class="tenant-name">{{ contract.tenantName || '공실' }}</span>
                  <span v-if="contract.contractType" class="contract-type">{{ contract.contractType }}</span>
                  <span v-if="contract.deposit > 0" class="contract-amount">
                    {{ formatCurrency(contract.deposit) }}
                    <span v-if="contract.monthlyRent > 0"> / {{ (contract.monthlyRent / 1000).toLocaleString() }}천</span>
                  </span>
                </div>
              </div>
              <div v-if="contract.startDate || contract.endDate" class="contract-dates">
                <span v-if="contract.startDate">{{ formatDate(contract.startDate, 'yyyy.MM.dd') }}</span>
                <span v-if="contract.startDate && contract.endDate" class="date-separator">~</span>
                <span v-if="contract.endDate">{{ formatDate(contract.endDate, 'yyyy.MM.dd') }}</span>
              </div>
            </div>
          </div>
          <n-empty v-else description="계약이 없습니다" class="py-8" />
        </div>
      </section>

      <!-- Recent Sales Section -->
      <section v-if="saleStats.total > 0" class="dashboard-section">
        <div class="section-header">
          <div class="section-title-group">
            <n-icon size="20" color="#10b981">
              <TrendingIcon />
            </n-icon>
            <h2 class="section-title">최근 매도</h2>
          </div>
          <n-button text type="primary" @click="navigateToSales()">
            전체보기 &rarr;
          </n-button>
        </div>

        <div class="contracts-card">
          <div class="contract-list">
            <div
              v-for="sale in currentGroupSaleContracts.slice(0, 5)"
              :key="sale.id"
              class="contract-item sale-item"
              @click="handleSaleClick(sale.id)"
            >
              <div class="contract-main">
                <div class="contract-location">
                  <span class="location-text">{{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호</span>
                  <n-tag
                    :type="sale.status === 'completed' ? 'success' : 'info'"
                    size="small"
                  >
                    {{ sale.status === 'completed' ? '종결' : '진행중' }}
                  </n-tag>
                </div>
                <div class="contract-details">
                  <span class="tenant-name">{{ sale.buyer }}</span>
                  <n-tag v-if="sale.contractFormat" type="warning" size="small">
                    {{ sale.contractFormat }}
                  </n-tag>
                </div>
              </div>
              <div class="sale-amount">
                <span class="amount-label">합계</span>
                <span class="amount-value">{{ formatCurrency(sale.totalAmount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 계약 상세보기 모달 -->
    <n-modal
      v-model:show="showDetailModal"
      preset="card"
      style="width: 90%; max-width: 900px; max-height: 90vh; overflow-y: auto"
      :segmented="{ content: true }"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold" style="color: #2c3e50;">
              {{ viewingContract?.building }}동 {{ viewingContract?.unit }}호
            </h2>
            <p class="text-sm text-gray-600 mt-1">임대차 계약 상세 정보</p>
          </div>
          <n-tag
            v-if="viewingContract"
            :type="
              viewingContract.tenantName && viewingContract.tenantName.trim() !== ''
                ? 'success'
                : 'default'
            "
            size="large"
          >
            {{ viewingContract.tenantName ? '계약중' : '공실' }}
          </n-tag>
        </div>
      </template>

      <div v-if="viewingContract">
        <!-- 기본 정보 -->
        <n-card title="기본 정보" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item label="동-호">
              {{ viewingContract.building }}동 {{ viewingContract.unit }}호
            </n-descriptions-item>
            <n-descriptions-item label="계약자명">
              {{ viewingContract.tenantName || '공실' }}
            </n-descriptions-item>
            <n-descriptions-item label="연락처">
              {{ viewingContract.phone || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="연락처2">
              {{ viewingContract.phone2OrContractType || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="계약유형">
              {{ viewingContract.contractType || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="주민번호">
              {{ viewingContract.idNumber || '-' }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.exclusiveArea" label="전용면적">
              {{ viewingContract.exclusiveArea }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.supplyArea" label="공급면적">
              {{ viewingContract.supplyArea }}
            </n-descriptions-item>
            <n-descriptions-item label="상태" :span="2">
              <n-tag :type="viewingContract.tenantName && viewingContract.tenantName.trim() !== '' ? 'success' : 'default'">
                {{ viewingContract.tenantName ? '계약중' : '공실' }}
              </n-tag>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 계약 금액 정보 -->
        <n-card title="계약 금액" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item label="임대보증금">
              <span class="font-bold text-xl" style="color: #2080f0;">
                {{ formatCurrency(viewingContract.deposit) }}
              </span>
            </n-descriptions-item>
            <n-descriptions-item label="월세">
              <span v-if="viewingContract.monthlyRent" class="font-bold text-xl" style="color: #18a058;">
                {{ (viewingContract.monthlyRent / 1000).toLocaleString() }}천
              </span>
              <span v-else>-</span>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 계약 기간 정보 -->
        <n-card title="계약 기간" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item v-if="viewingContract.contractWrittenDate" label="계약서작성일">
              {{ formatDate(viewingContract.contractWrittenDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.contractPeriod" label="계약기간">
              {{ viewingContract.contractPeriod }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.startDate" label="시작일">
              {{ formatDate(viewingContract.startDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.endDate" label="종료일">
              {{ formatDate(viewingContract.endDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.actualMoveOutDate" label="실제퇴거일" :span="2">
              {{ formatDate(viewingContract.actualMoveOutDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- HUG 보증 정보 -->
        <n-card v-if="viewingContract.hugStartDate || viewingContract.hugEndDate" title="HUG 보증보험 정보" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item v-if="viewingContract.hugStartDate" label="보증시작일">
              {{ formatDate(viewingContract.hugStartDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.hugEndDate" label="보증종료일">
              {{ formatDate(viewingContract.hugEndDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 추가 정보 -->
        <n-card v-if="viewingContract.additionalInfo1 || viewingContract.additionalInfo2 || viewingContract.additionalInfo3 || viewingContract.additionalInfo4" title="추가 정보" class="mb-4">
          <n-descriptions bordered :column="1" label-align="center">
            <n-descriptions-item v-if="viewingContract.additionalInfo1" label="추가정보1">
              {{ viewingContract.additionalInfo1 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo2" label="추가정보2">
              {{ viewingContract.additionalInfo2 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo3" label="추가정보3">
              {{ viewingContract.additionalInfo3 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo4" label="추가정보4">
              {{ viewingContract.additionalInfo4 }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 비고 -->
        <n-card v-if="viewingContract.notes" title="기타사항/비고" class="mb-4">
          <n-descriptions bordered :column="1" label-align="center">
            <n-descriptions-item>
              {{ viewingContract.notes }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showDetailModal = false">닫기</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.dashboard-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

/* Header Styles */
.dashboard-header {
  background: linear-gradient(135deg, #1a252f 0%, #2c3e50 50%, #34495e 100%);
  padding: 1.5rem;
  margin: 0 0 1.5rem 0;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(44, 62, 80, 0.25);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(10px);
}

.header-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: -0.025em;
}

.header-subtitle {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  margin: 0.25rem 0 0 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-stat {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 0.75rem 1.25rem;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
}

.stat-value.text-success { color: #4ade80; }
.stat-value.text-warning { color: #fbbf24; }
.stat-value.text-danger { color: #f87171; }

/* Empty State */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem;
}

.empty-state-content {
  text-align: center;
  max-width: 400px;
}

.empty-icon {
  margin-bottom: 1.5rem;
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.75rem;
}

.empty-description {
  font-size: 0.938rem;
  color: #64748b;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

.empty-button {
  min-width: 160px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  gap: 1rem;
}

.loading-text {
  color: #64748b;
  font-size: 0.938rem;
}

/* Main Content */
.dashboard-content {
  padding: 0 1rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* Section Styles */
.dashboard-section {
  margin-bottom: 2rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.notification-badge {
  background: #ef4444;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  min-width: 20px;
  text-align: center;
}

/* KPI Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

/* PC & Galaxy Fold Unfolded Layout */
@media (min-width: 717px) {
  .kpi-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .kpi-grid-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* KPI Card */
.kpi-card {
  background: #fff;
  border-radius: 16px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.kpi-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon-wrap.primary { background: rgba(59, 130, 246, 0.1); }
.kpi-icon-wrap.neutral { background: rgba(107, 114, 128, 0.1); }
.kpi-icon-wrap.warning { background: rgba(245, 158, 11, 0.1); }
.kpi-icon-wrap.danger { background: rgba(239, 68, 68, 0.1); }
.kpi-icon-wrap.success { background: rgba(16, 185, 129, 0.1); }
.kpi-icon-wrap.info { background: rgba(14, 165, 233, 0.1); }
.kpi-icon-wrap.complete { background: rgba(34, 197, 94, 0.1); }

.kpi-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.kpi-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1e293b;
  line-height: 1.1;
}

.kpi-label {
  font-size: 0.813rem;
  color: #64748b;
  margin-top: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kpi-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  font-size: 0.625rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.kpi-badge.warning {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.kpi-badge.danger {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

/* Notifications Card */
.notifications-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.notification-list {
  display: flex;
  flex-direction: column;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid #f1f5f9;
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-item:hover {
  background: #fef2f2;
}

.notification-priority {
  width: 4px;
  height: 100%;
  min-height: 60px;
  border-radius: 2px;
  margin-right: 1rem;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
  min-width: 0;
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.notification-sheet {
  font-size: 0.75rem;
  font-weight: 600;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.notification-type {
  font-size: 0.75rem;
  color: #64748b;
}

.notification-title {
  font-size: 0.938rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.25rem 0;
}

.notification-message {
  font-size: 0.813rem;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

.notification-dday {
  margin-left: 1rem;
  flex-shrink: 0;
}

.dday-value {
  font-size: 0.875rem;
  font-weight: 700;
  padding: 0.375rem 0.75rem;
  border-radius: 8px;
}

.dday-high {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

.dday-medium {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.dday-low {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

/* Contracts Card */
.contracts-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.contract-list {
  display: flex;
  flex-direction: column;
}

.contract-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid #f1f5f9;
}

.contract-item:last-child {
  border-bottom: none;
}

.contract-item:hover {
  background: #f8fafc;
}

.sale-item:hover {
  background: #f0fdf4;
}

.contract-main {
  flex: 1;
  min-width: 0;
}

.contract-location {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.location-text {
  font-size: 1rem;
  font-weight: 600;
  color: #1e293b;
}

.contract-details {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.813rem;
  color: #64748b;
}

.tenant-name {
  font-weight: 500;
  color: #475569;
}

.contract-type {
  color: #64748b;
}

.contract-type::before {
  content: '|';
  margin-right: 0.5rem;
  color: #cbd5e1;
}

.contract-amount {
  color: #3b82f6;
  font-weight: 500;
}

.contract-dates {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-left: 1rem;
  flex-shrink: 0;
}

.date-separator {
  color: #cbd5e1;
}

.sale-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-left: 1rem;
}

.amount-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.amount-value {
  font-size: 1rem;
  font-weight: 700;
  color: #10b981;
}

/* Mobile Layout (Galaxy Fold folded and smaller) */
@media (max-width: 716px) {
  .dashboard-header {
    padding: 1.25rem;
    margin: 0 0 1rem 0;
    border-radius: 12px;
  }

  .header-title {
    font-size: 1.25rem;
  }

  .header-stat {
    display: none;
  }

  .kpi-card {
    padding: 1rem;
    gap: 0.75rem;
  }

  .kpi-icon-wrap {
    width: 44px;
    height: 44px;
  }

  .kpi-value {
    font-size: 1.5rem;
  }

  .kpi-label {
    font-size: 0.75rem;
  }

  .contract-dates {
    display: none;
  }

  .notification-dday {
    display: none;
  }
}
</style>
