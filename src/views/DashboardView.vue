<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import { NCard, NStatistic, NSpin, NAlert, NEmpty, NButton, NIcon, NTag } from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'
import type { RentalContract } from '@/types/contract'

const router = useRouter()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
const sheetsStore = useSheetsStore()

// 현재 선택된 시트의 임대차 계약만 필터링
const currentSheetContracts = computed(() => {
  if (!sheetsStore.currentSheet) return []
  return contractsStore.contracts.filter(c =>
    c.sheetId === sheetsStore.currentSheet!.id && !c.metadata.deletedAt
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

// 보증보험 만료 예정 (3개월 이내)
const hugExpiringContracts = computed(() => {
  const today = new Date()
  const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())

  return currentSheetContracts.value.filter(c => {
    if (!c.hugEndDate) return false
    return c.hugEndDate >= today && c.hugEndDate <= threeMonthsLater
  })
})

// 임대차 통계 (현재 선택된 시트만)
const rentalStats = computed(() => {
  const total = currentSheetContracts.value.filter(c => c.tenantName && c.tenantName.trim() !== '').length
  const vacant = currentSheetContracts.value.filter(c => !c.tenantName || c.tenantName.trim() === '').length

  // 계약 만료예정 (3개월 이내)
  const today = new Date()
  const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
  const expiring = currentSheetContracts.value.filter(c => {
    if (!c.endDate) return false
    return c.endDate >= today && c.endDate <= threeMonthsLater
  }).length

  // 보증보험 만료예정
  const hugExpiring = hugExpiringContracts.value.length

  return { total, vacant, expiring, hugExpiring }
})

// 매도현황 통계
const saleStats = computed(() => ({
  total: contractsStore.saleContracts.length,
  active: contractsStore.activeSaleContracts.length,
  completed: contractsStore.completedSaleContracts.length
}))

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

// 데이터 로드 함수
async function loadData() {
  if (sheetsStore.currentSheet) {
    try {
      // 임대차현황 데이터만 로드 (명시적으로 'rental' 타입 전달)
      await contractsStore.loadContracts(sheetsStore.currentSheet.id, 'rental')
      await notificationsStore.checkNotifications()
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }
  }
}

// 마운트 시 데이터 로드
onMounted(async () => {
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
  },
  { immediate: true }
)

// Navigation handlers
function navigateToContracts(status?: 'vacant' | 'expiring') {
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

function navigateToSales() {
  if (!sheetsStore.currentSheet) {
    console.warn('No current sheet selected')
    return
  }

  router.push({
    name: 'sales',
    params: { sheetId: sheetsStore.currentSheet.id }
  })
}

function navigateToNotifications() {
  router.push({ name: 'notifications' })
}

function handleNotificationClick() {
  // Navigate to notifications page
  router.push({ name: 'notifications' })
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

  // Navigate to sale detail page
  router.push({
    name: 'sale-detail',
    params: {
      sheetId: sheetsStore.currentSheet.id,
      id: saleId
    }
  })
}

// Convert thousands to millions (천원 → 백만원)
function toMillions(thousands: number): string {
  if (thousands === 0) return '0'
  return (thousands / 1000).toFixed(0)
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-4 md:mb-6">
      <h1 class="text-xl md:text-2xl font-bold" style="color: #2c3e50;">대시보드</h1>
      <n-button @click="router.push({ name: 'settings' })" secondary size="small">
        <template #icon>
          <n-icon><HomeIcon /></n-icon>
        </template>
        <span class="hidden sm:inline ml-1">설정</span>
      </n-button>
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
            <n-statistic label="만료예정" :value="stats.rentalExpiring" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToNotifications()">
            <n-statistic label="보증만료 예정" :value="stats.hugExpiring" />
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

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToSales()">
            <n-statistic label="진행중" :value="stats.saleActive" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToSales()">
            <n-statistic label="종결" :value="stats.saleCompleted" />
          </n-card>
        </div>
      </div>

      <!-- 최근 알림 -->
      <n-card title="최근 알림" class="mb-4 md:mb-6">
        <div v-if="notificationsStore.highPriorityNotifications.length > 0" class="space-y-2">
          <div
            v-for="notification in notificationsStore.highPriorityNotifications.slice(0, 5)"
            :key="notification.id"
            class="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-red-50 hover:border-red-300 transition-all"
            @click="handleNotificationClick()"
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
              <n-tag type="error" size="small" class="flex-shrink-0">
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
                보증금 {{ (contract.deposit / 10000).toFixed(0) }}억
                <span v-if="contract.monthlyRent > 0"> / 월세 {{ (contract.monthlyRent / 10000).toFixed(0) }}만</span>
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

      <!-- 최근 매도 -->
      <n-card v-if="contractsStore.saleContracts.length > 0" title="최근 매도" class="mt-4 md:mt-6">
        <div class="space-y-3">
          <div
            v-for="sale in contractsStore.saleContracts.slice(0, 5)"
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

            <!-- Payment Info (백만원 단위) -->
            <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span v-if="sale.downPayment2 > 0">계약금2차 {{ toMillions(sale.downPayment2) }}</span>
              <span v-if="sale.interimPayment1 > 0">중도1 {{ toMillions(sale.interimPayment1) }}</span>
              <span v-if="sale.interimPayment2 > 0">중도2 {{ toMillions(sale.interimPayment2) }}</span>
              <span v-if="sale.interimPayment3 > 0">중도3 {{ toMillions(sale.interimPayment3) }}</span>
              <span v-if="sale.finalPayment > 0">잔금 {{ toMillions(sale.finalPayment) }}</span>
              <span class="text-gray-400">·</span>
              <span class="font-medium text-green-600">합계 {{ toMillions(sale.totalAmount) }}</span>
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>
