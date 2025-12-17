import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useContractsStore } from './contracts'
import { notificationService } from '@/services/notificationService'
import { storageService } from '@/services/storageService'
import type { Notification } from '@/types'

const STORAGE_KEY = 'notifications'
const READ_NOTIFICATIONS_KEY = 'read_notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const readNotificationIds = ref<Set<string>>(new Set())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const contractsStore = useContractsStore()

  const unreadNotifications = computed(() =>
    notifications.value.filter(n => !readNotificationIds.value.has(n.id))
  )

  const unreadCount = computed(() => unreadNotifications.value.length)

  const sortedNotifications = computed(() =>
    notificationService.sortNotifications(notifications.value)
  )

  const highPriorityNotifications = computed(() =>
    notifications.value.filter(n => n.priority === 'high' && !readNotificationIds.value.has(n.id))
  )

  async function loadReadNotifications() {
    try {
      const stored = await storageService.get<string[]>(READ_NOTIFICATIONS_KEY)
      if (stored) {
        readNotificationIds.value = new Set(stored)
      }
    } catch (err) {
      console.error('Load read notifications error:', err)
    }
  }

  async function saveReadNotifications() {
    try {
      await storageService.set(READ_NOTIFICATIONS_KEY, Array.from(readNotificationIds.value))
    } catch (err) {
      console.error('Save read notifications error:', err)
    }
  }

  // Helper: Date 객체를 ISO 문자열로 변환하여 저장 가능한 형태로 만들기
  function serializeNotificationsForStorage(notifications: Notification[]) {
    return notifications.map(notification => ({
      ...notification,
      createdAt: notification.createdAt.toISOString()
    }))
  }

  async function checkNotifications() {
    try {
      isLoading.value = true
      error.value = null

      // 활성 계약에 대한 알림 체크
      const newNotifications = notificationService.checkExpirations(
        contractsStore.activeContracts
      )

      // 기존 알림과 중복 제거
      const existingIds = new Set(notifications.value.map(n =>
        `${n.contractId}-${n.type}-${n.daysLeft}`
      ))

      const uniqueNotifications = newNotifications.filter(n => {
        const key = `${n.contractId}-${n.type}-${n.daysLeft}`
        return !existingIds.has(key)
      })

      notifications.value = [
        ...notifications.value,
        ...uniqueNotifications
      ]

      // 저장 가능한 형태로 직렬화
      const serialized = serializeNotificationsForStorage(notifications.value)
      await storageService.set(STORAGE_KEY, serialized)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check notifications'
      console.error('Check notifications error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function markAsRead(notificationId: string) {
    readNotificationIds.value.add(notificationId)
    await saveReadNotifications()
  }

  async function markAllAsRead() {
    notifications.value.forEach(n => {
      readNotificationIds.value.add(n.id)
    })
    await saveReadNotifications()
  }

  async function clearNotification(notificationId: string) {
    notifications.value = notifications.value.filter(n => n.id !== notificationId)
    readNotificationIds.value.delete(notificationId)

    // 저장 가능한 형태로 직렬화
    const serialized = serializeNotificationsForStorage(notifications.value)
    await storageService.set(STORAGE_KEY, serialized)
    await saveReadNotifications()
  }

  async function clearAllNotifications() {
    notifications.value = []
    readNotificationIds.value.clear()
    await storageService.set(STORAGE_KEY, [])
    await saveReadNotifications()
  }

  function clearError() {
    error.value = null
  }

  return {
    notifications,
    readNotificationIds,
    unreadNotifications,
    unreadCount,
    sortedNotifications,
    highPriorityNotifications,
    isLoading,
    error,
    loadReadNotifications,
    checkNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    clearError
  }
})
