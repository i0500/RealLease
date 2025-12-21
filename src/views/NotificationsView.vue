<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import type { Notification } from '@/types/notification'
import {
  NCard,
  NIcon,
  NButton,
  NSpace,
  NSelect,
  NList,
  NListItem,
  NThing,
  NTag,
  NBadge,
  NSpin,
  NEmpty,
  useMessage,
  useDialog
} from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'

const router = useRouter()
const notificationsStore = useNotificationsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()
const dialog = useDialog()

// Filter state
const filterType = ref<'all' | 'contract_expiring' | 'hug_expiring'>('all')
const filterPriority = ref<'all' | 'high' | 'medium' | 'low'>('all')
const showRead = ref(false)

// Load notifications on mount
onMounted(async () => {
  // 🔧 FIX: 알림 중복 생성 방지
  // checkNotifications()는 DashboardView에서만 호출하고,
  // 여기서는 이미 로드된 알림만 표시
  console.log('✅ [NotificationsView] 알림 페이지 로드 - 기존 알림 표시')
})

// Filter options
const typeOptions = [
  { label: '전체', value: 'all' },
  { label: '계약 만료', value: 'contract_expiring' },
  { label: 'HUG 만료', value: 'hug_expiring' }
]

const priorityOptions = [
  { label: '전체', value: 'all' },
  { label: '높음', value: 'high' },
  { label: '중간', value: 'medium' },
  { label: '낮음', value: 'low' }
]

// Filtered notifications
const filteredNotifications = computed(() => {
  let result = notificationsStore.notifications

  // Type filter
  if (filterType.value !== 'all') {
    result = result.filter((n) => n.type === filterType.value)
  }

  // Priority filter
  if (filterPriority.value !== 'all') {
    result = result.filter((n) => n.priority === filterPriority.value)
  }

  // Read/unread filter
  if (!showRead.value) {
    result = result.filter((n) => !n.read)
  }

  return result
})

// Grouped by priority
const highPriorityNotifications = computed(() =>
  filteredNotifications.value.filter((n) => n.priority === 'high')
)

const mediumPriorityNotifications = computed(() =>
  filteredNotifications.value.filter((n) => n.priority === 'medium')
)

const lowPriorityNotifications = computed(() =>
  filteredNotifications.value.filter((n) => n.priority === 'low')
)

// Actions
function handleMarkAsRead(notification: Notification) {
  notificationsStore.markAsRead(notification.id)
}

function handleMarkAllAsRead() {
  dialog.info({
    title: '모든 알림 읽음 처리',
    content: '모든 알림을 읽음 처리 하시겠습니까?',
    positiveText: '확인',
    negativeText: '취소',
    onPositiveClick: () => {
      notificationsStore.markAllAsRead()
      message.success('모든 알림을 읽음 처리했습니다')
    }
  })
}

function handleViewContract(notification: Notification) {
  // 알림을 읽음 처리
  handleMarkAsRead(notification)

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

function getTypeText(type: 'contract_expiring' | 'hug_expiring') {
  return {
    contract_expiring: '계약 만료',
    hug_expiring: 'HUG 만료'
  }[type]
}

function getDaysLeftColor(daysLeft: number) {
  if (daysLeft <= 30) return 'error'
  if (daysLeft <= 60) return 'warning'
  return 'info'
}

function isRead(notificationId: string) {
  return notificationsStore.notifications.find(n => n.id === notificationId)?.read || false
}
</script>

<template>
  <div class="notifications-view">
    <div class="header mb-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold" style="color: #2c3e50;">알림 센터</h1>
        <n-space>
          <n-badge :value="notificationsStore.unreadCount" :max="99">
            <n-button type="primary" @click="handleMarkAllAsRead">
              전체 읽음 처리
            </n-button>
          </n-badge>
          <n-button @click="router.push('/')" secondary>
            <template #icon>
              <n-icon><HomeIcon /></n-icon>
            </template>
            메인 화면
          </n-button>
        </n-space>
      </div>

      <!-- Filters -->
      <n-space align="center">
        <n-select
          v-model:value="filterType"
          :options="typeOptions"
          style="width: 150px"
        />

        <n-select
          v-model:value="filterPriority"
          :options="priorityOptions"
          style="width: 120px"
        />

        <n-button
          :type="showRead ? 'primary' : 'default'"
          @click="showRead = !showRead"
        >
          {{ showRead ? '읽은 알림 숨기기' : '읽은 알림 보기' }}
        </n-button>
      </n-space>
    </div>

    <!-- Loading State -->
    <div v-if="notificationsStore.isLoading" class="text-center py-10">
      <n-spin size="large" />
      <p class="mt-4 text-gray-600">알림을 불러오는 중...</p>
    </div>

    <!-- Empty State -->
    <n-empty
      v-else-if="filteredNotifications.length === 0"
      description="알림이 없습니다"
    >
      <template #extra>
        <n-button type="primary" @click="router.push({ name: 'dashboard' })">
          대시보드로 이동
        </n-button>
      </template>
    </n-empty>

    <!-- Notifications List -->
    <div v-else class="space-y-4">
      <!-- High Priority -->
      <n-card v-if="highPriorityNotifications.length > 0" title="🚨 높은 우선순위" class="border-l-4 border-red-500">
        <n-list hoverable clickable>
          <n-list-item
            v-for="notification in highPriorityNotifications"
            :key="notification.id"
            @click="handleViewContract(notification)"
          >
            <n-thing :title="notification.title" :description="notification.message">
              <template #header-extra>
                <n-space align="center">
                  <n-tag :type="getDaysLeftColor(notification.daysLeft)" size="small">
                    D-{{ notification.daysLeft }}
                  </n-tag>
                  <n-tag type="error" size="small">
                    {{ getTypeText(notification.type) }}
                  </n-tag>
                  <n-button
                    v-if="!isRead(notification.id)"
                    size="small"
                    @click.stop="handleMarkAsRead(notification)"
                  >
                    읽음
                  </n-button>
                  <n-tag v-else type="success" size="small">읽음</n-tag>
                </n-space>
              </template>
              <template #footer>
                <span class="text-sm text-gray-500">
                  {{ formatDate(notification.createdAt) }}
                </span>
              </template>
            </n-thing>
          </n-list-item>
        </n-list>
      </n-card>

      <!-- Medium Priority -->
      <n-card v-if="mediumPriorityNotifications.length > 0" title="⚠️ 중간 우선순위" class="border-l-4 border-yellow-500">
        <n-list hoverable clickable>
          <n-list-item
            v-for="notification in mediumPriorityNotifications"
            :key="notification.id"
            @click="handleViewContract(notification)"
          >
            <n-thing :title="notification.title" :description="notification.message">
              <template #header-extra>
                <n-space align="center">
                  <n-tag :type="getDaysLeftColor(notification.daysLeft)" size="small">
                    D-{{ notification.daysLeft }}
                  </n-tag>
                  <n-tag type="warning" size="small">
                    {{ getTypeText(notification.type) }}
                  </n-tag>
                  <n-button
                    v-if="!isRead(notification.id)"
                    size="small"
                    @click.stop="handleMarkAsRead(notification)"
                  >
                    읽음
                  </n-button>
                  <n-tag v-else type="success" size="small">읽음</n-tag>
                </n-space>
              </template>
              <template #footer>
                <span class="text-sm text-gray-500">
                  {{ formatDate(notification.createdAt) }}
                </span>
              </template>
            </n-thing>
          </n-list-item>
        </n-list>
      </n-card>

      <!-- Low Priority -->
      <n-card v-if="lowPriorityNotifications.length > 0" title="ℹ️ 낮은 우선순위" class="border-l-4 border-blue-500">
        <n-list hoverable clickable>
          <n-list-item
            v-for="notification in lowPriorityNotifications"
            :key="notification.id"
            @click="handleViewContract(notification)"
          >
            <n-thing :title="notification.title" :description="notification.message">
              <template #header-extra>
                <n-space align="center">
                  <n-tag :type="getDaysLeftColor(notification.daysLeft)" size="small">
                    D-{{ notification.daysLeft }}
                  </n-tag>
                  <n-tag type="info" size="small">
                    {{ getTypeText(notification.type) }}
                  </n-tag>
                  <n-button
                    v-if="!isRead(notification.id)"
                    size="small"
                    @click.stop="handleMarkAsRead(notification)"
                  >
                    읽음
                  </n-button>
                  <n-tag v-else type="success" size="small">읽음</n-tag>
                </n-space>
              </template>
              <template #footer>
                <span class="text-sm text-gray-500">
                  {{ formatDate(notification.createdAt) }}
                </span>
              </template>
            </n-thing>
          </n-list-item>
        </n-list>
      </n-card>
    </div>

    <!-- Summary Footer -->
    <n-card v-if="filteredNotifications.length > 0" class="mt-6">
      <n-space justify="space-between">
        <div>
          <span class="text-gray-600">전체 알림:</span>
          <strong class="ml-2">{{ filteredNotifications.length }}개</strong>
        </div>
        <div>
          <span class="text-gray-600">읽지 않은 알림:</span>
          <strong class="ml-2 text-red-500">{{ notificationsStore.unreadCount }}개</strong>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<style scoped>
.notifications-view {
  padding: 1rem;
}

.border-l-4 {
  border-left-width: 4px;
}

.border-red-500 {
  border-left-color: #ef4444;
}

.border-yellow-500 {
  border-left-color: #f59e0b;
}

.border-blue-500 {
  border-left-color: #3b82f6;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}
</style>
