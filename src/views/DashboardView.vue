<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSheetsStore } from '@/stores/sheets'
import { NCard, NStatistic, NSpin, NAlert, NEmpty } from 'naive-ui'

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
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">대시보드</h1>
      <n-button @click="router.push('/')">
        <template #icon>🏠</template>
        메인 화면
      </n-button>
    </div>

    <div v-if="contractsStore.isLoading" class="text-center py-10">
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
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <n-card>
          <n-statistic label="전체 계약">
            <template #prefix>📊</template>
            {{ stats.total }}
          </n-statistic>
        </n-card>

        <n-card>
          <n-statistic label="진행중 계약">
            <template #prefix>✅</template>
            {{ stats.active }}
          </n-statistic>
        </n-card>

        <n-card>
          <n-statistic label="만료된 계약">
            <template #prefix>⏰</template>
            {{ stats.expired }}
          </n-statistic>
        </n-card>

        <n-card>
          <n-statistic label="미확인 알림">
            <template #prefix>🔔</template>
            {{ stats.notifications }}
          </n-statistic>
        </n-card>
      </div>

      <!-- 최근 알림 -->
      <n-card title="최근 알림" class="mb-6">
        <div v-if="notificationsStore.highPriorityNotifications.length > 0">
          <div
            v-for="notification in notificationsStore.highPriorityNotifications.slice(0, 5)"
            :key="notification.id"
            class="border-b last:border-0 py-3"
          >
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-semibold">{{ notification.title }}</h4>
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
            class="border-b last:border-0 py-3"
          >
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-semibold">
                  {{ contract.property.address }} {{ contract.property.unit }}
                </h4>
                <p class="text-sm text-gray-600">
                  {{ contract.tenant.name }} · {{ contract.contract.type === 'jeonse' ? '전세' : '월세' }}
                </p>
              </div>
              <span class="text-sm text-gray-500">
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
