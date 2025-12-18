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

// 임대차 통계
const rentalStats = computed(() => ({
  total: contractsStore.contracts.length,
  active: contractsStore.activeContracts.length,
  expired: contractsStore.expiredContracts.length
}))

// 매도현황 통계
const saleStats = computed(() => ({
  total: contractsStore.saleContracts.length,
  active: contractsStore.activeSaleContracts.length,
  completed: contractsStore.completedSaleContracts.length
}))

// 전체 통계
const stats = computed(() => ({
  rentalTotal: rentalStats.value.total,
  rentalActive: rentalStats.value.active,
  rentalExpired: rentalStats.value.expired,
  saleTotal: saleStats.value.total,
  saleActive: saleStats.value.active,
  saleCompleted: saleStats.value.completed,
  notifications: notificationsStore.unreadCount
}))

// 데이터 로드 함수
async function loadData() {
  if (sheetsStore.currentSheet) {
    try {
      await contractsStore.loadContracts(sheetsStore.currentSheet.id)
      await notificationsStore.checkNotifications()
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }
  }
}

// 마운트 시 데이터 로드
onMounted(() => {
  loadData()
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
function navigateToContracts(status?: 'active' | 'expired') {
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

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('active')">
            <n-statistic label="진행중" :value="stats.rentalActive" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('expired')">
            <n-statistic label="만료됨" :value="stats.rentalExpired" />
          </n-card>

          <n-card hoverable class="cursor-pointer text-center" @click="navigateToNotifications()">
            <n-statistic label="미확인 알림" :value="stats.notifications" />
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

      <!-- 최근 계약 -->
      <n-card title="최근 계약">
        <div v-if="contractsStore.activeContracts.length > 0" class="space-y-3">
          <div
            v-for="contract in contractsStore.activeContracts.slice(0, 5)"
            :key="contract.id"
            class="border border-gray-200 rounded-lg p-3 sm:p-4 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all"
            @click="handleContractClick(contract)"
          >
            <!-- Header: 주소 & 상태 -->
            <div class="flex items-start justify-between mb-2">
              <h4 class="font-semibold text-blue-600 hover:underline text-sm sm:text-base">
                {{ contract.property.address }}
              </h4>
              <n-tag
                :type="contract.contract.status === 'active' ? 'success' : 'default'"
                size="small"
                class="ml-2 flex-shrink-0"
              >
                {{ contract.contract.status === 'active' ? '진행중' : '만료' }}
              </n-tag>
            </div>

            <!-- Tenant & Type -->
            <div class="flex flex-wrap items-center gap-2 mb-2 text-xs sm:text-sm text-gray-600">
              <span class="font-medium">{{ contract.tenant.name }}</span>
              <span class="text-gray-400">·</span>
              <n-tag
                :type="contract.contract.contractType === 'new' ? 'info' : 'warning'"
                size="small"
              >
                {{ contract.contract.contractType === 'new' ? '최초' : contract.contract.contractType === 'renewal' ? '갱신' : '변경' }}
              </n-tag>
              <span class="text-gray-400">·</span>
              <span class="font-medium">
                <span v-if="contract.contract.type === 'jeonse'">
                  전세 {{ contract.contract.deposit.toLocaleString() }}만원
                </span>
                <span v-else>
                  월세 {{ contract.contract.deposit.toLocaleString() }}/{{ contract.contract.monthlyRent?.toLocaleString() }}만원
                </span>
              </span>
            </div>

            <!-- Dates -->
            <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-500">
              <span>시작: {{ formatDate(contract.contract.startDate, 'yyyy.MM.dd') }}</span>
              <span class="hidden sm:inline text-gray-400">→</span>
              <span>종료: {{ formatDate(contract.contract.endDate, 'yyyy.MM.dd') }}</span>
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
            <!-- 모바일 레이아웃 (md 미만) -->
            <div class="md:hidden">
              <!-- 첫 줄: 동-호, 계약자, 계약일 -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-semibold text-green-600">
                    {{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호
                  </span>
                  <span class="text-gray-400">·</span>
                  <span class="font-medium">{{ sale.buyer }}</span>
                  <span v-if="sale.contractDate" class="text-gray-500 text-xs">
                    {{ formatDate(sale.contractDate, 'MM.dd') }}
                  </span>
                </div>
              </div>

              <!-- 둘째 줄: 계약금, 잔금, 합계, 상태 -->
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 text-gray-600">
                  <span v-if="sale.downPayment > 0">계약금 {{ sale.downPayment.toLocaleString() }}</span>
                  <span v-if="sale.finalPayment > 0">잔금 {{ sale.finalPayment.toLocaleString() }}</span>
                  <span class="font-medium text-green-600">합계 {{ sale.totalAmount.toLocaleString() }}</span>
                </div>
                <n-tag
                  :type="sale.status === 'completed' ? 'success' : 'info'"
                  size="small"
                >
                  {{ sale.status === 'completed' ? '종결' : '진행중' }}
                </n-tag>
              </div>
            </div>

            <!-- PC 레이아웃 (md 이상) -->
            <div class="hidden md:block">
              <!-- 첫 줄: 동-호, 계약자, 계약형식, 합계 + 상태 -->
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3 text-sm">
                  <span class="font-semibold text-green-600 hover:underline">
                    {{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호
                  </span>
                  <span class="text-gray-400">|</span>
                  <span class="font-medium">{{ sale.buyer }}</span>
                  <span class="text-gray-400">|</span>
                  <n-tag type="warning" size="small">
                    {{ sale.contractFormat || '매도' }}
                  </n-tag>
                  <span class="text-gray-400">|</span>
                  <span class="font-medium text-green-600">
                    합계 {{ sale.totalAmount.toLocaleString() }}
                  </span>
                </div>
                <n-tag
                  :type="sale.status === 'completed' ? 'success' : 'info'"
                  size="small"
                >
                  {{ sale.status === 'completed' ? '종결' : '진행중' }}
                </n-tag>
              </div>

              <!-- 둘째 줄: 계약금, 중도금, 잔금(날짜), 비고 -->
              <div class="flex items-center gap-3 text-xs text-gray-600">
                <span v-if="sale.downPayment > 0">계약금 {{ sale.downPayment.toLocaleString() }}</span>
                <span v-if="sale.interimPayment > 0">중도금 {{ sale.interimPayment.toLocaleString() }}</span>
                <span v-if="sale.finalPayment > 0">
                  잔금 {{ sale.finalPayment.toLocaleString() }}
                  <span v-if="sale.finalPaymentDate" class="text-gray-500">
                    ({{ formatDate(sale.finalPaymentDate, 'yyyy.MM.dd') }})
                  </span>
                </span>
                <span v-if="sale.notes" class="text-gray-500">
                  <span class="text-gray-400">비고:</span> {{ sale.notes }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </n-card>
    </div>
  </div>
</template>
