<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSheetsStore } from '@/stores/sheets'
import { NCard, NStatistic, NSpin, NAlert, NEmpty, NButton, NIcon } from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'
import type { RentalContract } from '@/types/contract'

const router = useRouter()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
const sheetsStore = useSheetsStore()

const stats = computed(() => ({
  total: contractsStore.contracts.length,
  active: contractsStore.activeContracts.length,
  expired: contractsStore.expiredContracts.length,
  notifications: notificationsStore.unreadCount
}))

onMounted(async () => {
  if (sheetsStore.currentSheet) {
    try {
      await contractsStore.loadContracts(sheetsStore.currentSheet.id)
      await notificationsStore.checkNotifications()
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }
  }
})

// Navigation handlers
function navigateToContracts(status?: 'active' | 'expired') {
  if (status) {
    router.push({ name: 'contracts', query: { status } })
  } else {
    router.push({ name: 'contracts' })
  }
}

function navigateToNotifications() {
  router.push({ name: 'notifications' })
}

function handleNotificationClick() {
  // Navigate to notifications page
  router.push({ name: 'notifications' })
}

function handleContractClick(contract: RentalContract) {
  // Navigate to contracts page with contract ID to open detail modal
  router.push({ name: 'contracts', query: { id: contract.id } })
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
      <div class="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-6">
        <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts()">
          <n-statistic label="전체 계약" :value="stats.total" />
        </n-card>

        <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('active')">
          <n-statistic label="진행중 계약" :value="stats.active" />
        </n-card>

        <n-card hoverable class="cursor-pointer text-center" @click="navigateToContracts('expired')">
          <n-statistic label="만료된 계약" :value="stats.expired" />
        </n-card>

        <n-card hoverable class="cursor-pointer text-center" @click="navigateToNotifications()">
          <n-statistic label="미확인 알림" :value="stats.notifications" />
        </n-card>
      </div>

      <!-- 최근 알림 -->
      <n-card title="최근 알림" class="mb-6">
        <div v-if="notificationsStore.highPriorityNotifications.length > 0">
          <div
            v-for="notification in notificationsStore.highPriorityNotifications.slice(0, 5)"
            :key="notification.id"
            class="border-b last:border-0 py-3 cursor-pointer hover:bg-gray-50 rounded transition-colors"
            @click="handleNotificationClick()"
          >
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-semibold text-blue-600 hover:underline">{{ notification.title }}</h4>
                <p class="text-sm text-gray-600">{{ notification.message }}</p>
              </div>
              <span class="text-sm text-red-500">
                D-{{ notification.daysLeft }}
              </span>
            </div>
          </div>
        </div>
        <n-empty v-else description="새로운 알림이 없습니다" />
      </n-card>

      <!-- 최근 계약 -->
      <n-card title="최근 계약">
        <div v-if="contractsStore.activeContracts.length > 0">
          <div
            v-for="contract in contractsStore.activeContracts.slice(0, 5)"
            :key="contract.id"
            class="border-b last:border-0 py-3 cursor-pointer hover:bg-gray-50 rounded transition-colors"
            @click="handleContractClick(contract)"
          >
            <div class="flex items-center justify-between">
              <div class="flex-1">
                <h4 class="font-semibold text-blue-600 hover:underline">
                  {{ contract.property.address }}
                </h4>
                <p class="text-sm text-gray-600">
                  {{ contract.tenant.name }} ·
                  <span v-if="contract.contract.type === 'jeonse'">
                    전세 {{ contract.contract.deposit.toLocaleString() }}만원
                  </span>
                  <span v-else>
                    월세 {{ contract.contract.deposit.toLocaleString() }}/{{ contract.contract.monthlyRent?.toLocaleString() }}만원
                  </span>
                </p>
              </div>
              <span class="text-sm text-gray-500 ml-2">
                {{ contract.contract.status === 'active' ? '진행중' : '만료' }}
              </span>
            </div>
          </div>
        </div>
        <n-empty v-else description="계약이 없습니다" />
      </n-card>
    </div>
  </div>
</template>
