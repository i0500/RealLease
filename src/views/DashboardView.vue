<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useNotificationSettingsStore } from '@/stores/notificationSettings'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import { formatCurrency } from '@/utils/formatUtils'
import { NCard, NStatistic, NSpin, NAlert, NEmpty, NButton, NTag, NModal, NDescriptions, NDescriptionsItem, NSpace, useMessage } from 'naive-ui'
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
  const total = currentSheetContracts.value.filter(c => c.tenantName && c.tenantName.trim() !== '').length
  const vacant = currentSheetContracts.value.filter(c => !c.tenantName || c.tenantName.trim() === '').length

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

  return { total, vacant, expiring, hugExpiring }
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
  rentalExpiring: rentalStats.value.expiring,
  hugExpiring: rentalStats.value.hugExpiring, // 보증보험 만료예정
  saleTotal: saleStats.value.total,
  saleActive: saleStats.value.active,
  saleCompleted: saleStats.value.completed,
  notifications: notificationsStore.unreadCount
}))

// ✅ 데이터 로드 함수 - 현재 선택된 파일(그룹)의 시트들만 로드
async function loadData() {
  if (sheetsStore.sheets.length === 0) {
    console.log('📋 [DashboardView.loadData] 등록된 시트가 없습니다')
    return
  }

  if (!sheetsStore.currentSheet) {
    console.log('📋 [DashboardView.loadData] 선택된 시트가 없습니다')
    return
  }

  try {
    const currentSheetName = sheetsStore.currentSheet.name
    console.log('🔄 [DashboardView.loadData] 선택된 파일 데이터 로딩 시작:', currentSheetName)

    // ✅ 같은 name(그룹)을 가진 시트들만 로드
    const groupSheets = sheetsStore.sheets.filter(s => s.name === currentSheetName)
    console.log(`📋 [DashboardView.loadData] "${currentSheetName}" 그룹의 시트 ${groupSheets.length}개 발견`)

    for (const sheet of groupSheets) {
      // ✅ sheetType 사용 (이미 저장되어 있음)
      await contractsStore.loadContracts(sheet.id, sheet.sheetType)
    }

    // 알림 확인
    await notificationsStore.checkNotifications()

    console.log(`✅ [DashboardView.loadData] "${currentSheetName}" 파일 데이터 로딩 완료`)
  } catch (error) {
    console.error('❌ [DashboardView.loadData] 데이터 로딩 실패:', error)
  }
}

// 마운트 시 데이터 로드
onMounted(async () => {
  // 알림 설정 로드
  await notificationSettingsStore.initialize()

  // 🔧 FIX: 새로고침 시 sheets가 로드되지 않은 경우를 대비해 먼저 로드
  if (sheetsStore.sheets.length === 0) {
    console.log('📦 [DashboardView] Sheets 데이터 로딩 중...')
    await sheetsStore.loadSheets()
  }
  await loadData()
})

// 시트 변경 감지하여 데이터 재로드 (새로고침 문제 해결)
watch(
  () => sheetsStore.currentSheet?.id,
  (newSheetId, oldSheetId) => {
    if (newSheetId && newSheetId !== oldSheetId) {
      console.log('🔄 [DashboardView] 시트 변경 감지, 데이터 재로드:', newSheetId)
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
  if (!sheetsStore.currentSheet) {
    message.warning('시트를 선택해주세요')
    return
  }

  // 알림을 읽음 처리
  notificationsStore.markAsRead(notification.id)

  console.log('🔔 [DashboardView] 알림 클릭:', {
    notificationId: notification.id,
    contractId: notification.contractId,
    building: notification.building,
    unit: notification.unit,
    totalContracts: contractsStore.contracts.length
  })

  // contractId로 계약 찾기
  let contract = contractsStore.contracts.find(c => c.id === notification.contractId)

  // contractId로 못 찾으면 building, unit, sheetId로 검색 (기존 알림 대응)
  if (!contract && notification.building && notification.unit) {
    console.log('🔍 [DashboardView] contractId로 못 찾음, building/unit으로 검색')

    // 같은 building, unit을 가진 계약 찾기
    const candidates = contractsStore.contracts.filter(c =>
      c.building === notification.building &&
      c.unit === notification.unit &&
      !c.metadata.deletedAt
    )

    console.log(`✅ [DashboardView] ${candidates.length}개 후보 발견`)

    if (candidates.length === 1) {
      // 유일한 매칭이면 사용
      contract = candidates[0]
    } else if (candidates.length > 1) {
      // 여러 개면 sheetId와 tenantName으로 추가 필터링
      if (notification.sheetId) {
        const sheetFiltered = candidates.filter(c => c.sheetId === notification.sheetId)
        if (sheetFiltered.length === 1) {
          contract = sheetFiltered[0]
        } else if (sheetFiltered.length > 1 && notification.tenantName) {
          // tenantName으로 추가 필터링
          contract = sheetFiltered.find(c => c.tenantName === notification.tenantName)
        }
      } else if (notification.tenantName) {
        // sheetId 없으면 tenantName으로만 필터링
        contract = candidates.find(c => c.tenantName === notification.tenantName)
      }

      // 여전히 못 찾으면 첫 번째 것 사용
      if (!contract && candidates.length > 0) {
        console.log('⚠️ [DashboardView] 정확한 매칭 실패, 첫 번째 후보 사용')
        contract = candidates[0]
      }
    }
  }

  if (!contract) {
    console.error('❌ [DashboardView] 계약을 찾을 수 없음:', {
      notificationId: notification.id,
      contractId: notification.contractId,
      building: notification.building,
      unit: notification.unit
    })
    message.error('계약을 찾을 수 없습니다')
    return
  }

  console.log('✅ [DashboardView] 계약 찾음, 모달 열기:', contract.id)

  // 계약 상세 모달 열기
  viewingContract.value = contract
  showDetailModal.value = true
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

</script>

<template>
  <div>
    <div class="mb-4 md:mb-6">
      <h1 class="text-xl md:text-2xl font-bold" style="color: #2c3e50;">대시보드</h1>
    </div>

    <!-- No sheets message -->
    <div v-if="!sheetsStore.currentSheet" class="flex items-center justify-center" style="min-height: 400px;">
      <div class="text-center max-w-md px-4">
        <h2 class="text-xl md:text-2xl font-semibold mb-2 md:mb-3" style="color: #2c3e50;">
          시트 연결이 필요합니다
        </h2>
        <p class="text-xs md:text-sm mb-4 md:mb-6" style="color: #7f8c8d; line-height: 1.6;">
          구글 스프레드시트를 연결하여<br />
          임대차 계약 관리를 시작하세요
        </p>
        <n-button
          type="primary"
          size="medium"
          @click="router.push({ name: 'settings' })"
          class="w-full sm:w-auto"
          style="min-width: 140px;"
        >
          시트 연결하기
        </n-button>
      </div>
    </div>

    <div v-else-if="contractsStore.isLoading" class="text-center py-10">
      <n-spin size="large" />
      <p class="mt-4 text-gray-600">데이터를 불러오는 중...</p>
    </div>

    <div v-else>
      <n-alert
        v-if="contractsStore.error"
        type="error"
        class="mb-4"
        closable
        @close="contractsStore.clearError"
      >
        {{ contractsStore.error }}
      </n-alert>

      <!-- 통계 카드 -->
      <div class="mb-4 md:mb-6">
        <h2 class="text-base md:text-lg font-semibold mb-2 md:mb-3" style="color: #2c3e50;">임대차 현황</h2>
        <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts()">
            <n-statistic label="전체 계약" :value="stats.rentalTotal" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('vacant')">
            <n-statistic label="공실" :value="stats.rentalVacant" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('expiring')">
            <n-statistic label="계약만료 도래" :value="stats.rentalExpiring" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('hugExpiring')">
            <n-statistic label="보험만료 도래" :value="stats.hugExpiring" />
          </n-card>
        </div>
      </div>

      <!-- 매도현황 통계 카드 -->
      <div v-if="stats.saleTotal > 0" class="mb-4 md:mb-6">
        <h2 class="text-base md:text-lg font-semibold mb-2 md:mb-3" style="color: #2c3e50;">매도현황</h2>
        <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
          <n-card hoverable class="cursor-pointer text-center" @click="navigateToSales()">
            <n-statistic label="전체 매도" :value="stats.saleTotal" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToSales('active')">
            <n-statistic label="진행중" :value="stats.saleActive" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToSales('completed')">
            <n-statistic label="종결" :value="stats.saleCompleted" />
          </n-card>
        </div>
      </div>

      <!-- 최근 알림 -->
      <n-card title="최근 알림" class="mb-4 md:mb-6">
        <div v-if="notificationsStore.unreadNotifications.length > 0" class="space-y-2">
          <div
            v-for="notification in notificationsStore.sortedNotifications.filter(n => !n.read).slice(0, 5)"
            :key="notification.id"
            class="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all"
            @click="handleNotificationClick(notification)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-blue-600 hover:underline text-sm sm:text-base truncate">
                  {{ notification.title }}
                </h4>
                <p class="text-xs sm:text-sm text-gray-600 mt-1 line-clamp-2">
                  {{ notification.message }}
                </p>
              </div>
              <n-tag
                :type="notification.priority === 'high' ? 'error' : notification.priority === 'medium' ? 'warning' : 'default'"
                size="small"
                class="flex-shrink-0"
              >
                D-{{ notification.daysLeft }}
              </n-tag>
            </div>
          </div>
        </div>
        <n-empty v-else description="새로운 알림이 없습니다" />
      </n-card>

      <!-- 최근 계약 (시작일 기준 최근 5개) -->
      <n-card title="최근 계약">
        <div v-if="recentContracts.length > 0" class="space-y-3">
          <div
            v-for="contract in recentContracts"
            :key="contract.id"
            class="border border-gray-200 rounded-lg p-3 sm:p-4 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all"
            @click="handleContractClick(contract)"
          >
            <!-- Header: 동-호 & 계약자 -->
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold text-blue-600 hover:underline text-sm sm:text-base">
                {{ contract.building }}동 {{ contract.unit }}호
              </h4>
              <n-tag
                :type="contract.tenantName ? 'success' : 'default'"
                size="small"
                class="ml-2 flex-shrink-0"
              >
                {{ contract.tenantName ? '계약중' : '공실' }}
              </n-tag>
            </div>

            <!-- Tenant & Type -->
            <div class="flex flex-wrap items-center gap-2 mb-2 text-xs sm:text-sm text-gray-600">
              <span class="font-medium">{{ contract.tenantName || '공실' }}</span>
              <span v-if="contract.contractType" class="text-gray-400">·</span>
              <span v-if="contract.contractType" class="font-medium">{{ contract.contractType }}</span>
              <span v-if="contract.deposit > 0" class="text-gray-400">·</span>
              <span v-if="contract.deposit > 0" class="font-medium">
                보증금 {{ formatCurrency(contract.deposit) }}
                <span v-if="contract.monthlyRent > 0"> / 월세 {{ (contract.monthlyRent / 1000).toLocaleString() }}천</span>
              </span>
            </div>

            <!-- Dates -->
            <div v-if="contract.startDate || contract.endDate" class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-500">
              <span v-if="contract.startDate">시작: {{ formatDate(contract.startDate, 'yyyy.MM.dd') }}</span>
              <span v-if="contract.startDate && contract.endDate" class="hidden sm:inline text-gray-400">→</span>
              <span v-if="contract.endDate">종료: {{ formatDate(contract.endDate, 'yyyy.MM.dd') }}</span>
            </div>
          </div>
        </div>
        <n-empty v-else description="계약이 없습니다" />
      </n-card>

      <!-- 최근 매도 (현재 선택된 파일 그룹의 시트만) -->
      <n-card v-if="saleStats.total > 0" title="최근 매도" class="mt-4 md:mt-6">
        <div class="space-y-3">
          <div
            v-for="sale in currentGroupSaleContracts.slice(0, 5)"
            :key="sale.id"
            class="border border-gray-200 rounded-lg p-3 sm:p-4 cursor-pointer hover:bg-green-50 hover:border-green-300 transition-all"
            @click="handleSaleClick(sale.id)"
          >
            <!-- Header: 동-호 & 상태 -->
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold text-green-600 hover:underline text-sm sm:text-base">
                {{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호
              </h4>
              <n-tag
                :type="sale.status === 'completed' ? 'success' : 'info'"
                size="small"
                class="ml-2 flex-shrink-0"
              >
                {{ sale.status === 'completed' ? '종결' : '진행중' }}
              </n-tag>
            </div>

            <!-- Buyer & Contract Format -->
            <div class="flex flex-wrap items-center gap-2 mb-2 text-xs sm:text-sm text-gray-600">
              <span class="font-medium">{{ sale.buyer }}</span>
              <span v-if="sale.contractFormat" class="text-gray-400">·</span>
              <n-tag v-if="sale.contractFormat" type="warning" size="small">
                {{ sale.contractFormat }}
              </n-tag>
            </div>

            <!-- Payment Info (억원 단위) -->
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span v-if="sale.downPayment > 0">계약금 {{ formatCurrency(sale.downPayment) }}</span>
              <span v-if="sale.downPayment2 > 0">계약금2차 {{ formatCurrency(sale.downPayment2) }}</span>
              <span v-if="sale.interimPayment1 > 0">중도1 {{ formatCurrency(sale.interimPayment1) }}</span>
              <span v-if="sale.interimPayment2 > 0">중도2 {{ formatCurrency(sale.interimPayment2) }}</span>
              <span v-if="sale.interimPayment3 > 0">중도3 {{ formatCurrency(sale.interimPayment3) }}</span>
              <span v-if="sale.finalPayment > 0">잔금 {{ formatCurrency(sale.finalPayment) }}</span>
              <span class="text-gray-400">·</span>
              <span class="font-medium text-green-600">합계 {{ formatCurrency(sale.totalAmount) }}</span>
            </div>
          </div>
        </div>
      </n-card>
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
