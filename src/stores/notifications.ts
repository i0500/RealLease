import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useContractsStore } from './contracts'
import { useNotificationSettingsStore } from './notificationSettings'
import { notificationService } from '@/services/notificationService'
import { storageService } from '@/services/storageService'
import { pushNotificationService } from '@/services/pushNotificationService'
import type { Notification } from '@/types'

const STORAGE_KEY = 'notifications'
const READ_NOTIFICATIONS_KEY = 'read_notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const readNotificationIds = ref<Set<string>>(new Set())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const contractsStore = useContractsStore()
  const settingsStore = useNotificationSettingsStore()

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

  async function loadNotifications() {
    try {
      const stored = await storageService.get<any[]>(STORAGE_KEY)
      if (stored && Array.isArray(stored)) {
        // Deserialize: Convert ISO strings back to Date objects
        notifications.value = stored.map(n => ({
          ...n,
          createdAt: new Date(n.createdAt)
        }))
        console.log(`✅ [NotificationsStore] Loaded ${notifications.value.length} notifications from storage`)
      }
    } catch (err) {
      console.error('Load notifications error:', err)
    }
  }

  async function loadReadNotifications() {
    try {
      const stored = await storageService.get<string[]>(READ_NOTIFICATIONS_KEY)
      if (stored) {
        readNotificationIds.value = new Set(stored)
        console.log(`✅ [NotificationsStore] Loaded ${readNotificationIds.value.size} read notification IDs`)
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

  // Initialize store by loading all persisted data
  async function initialize() {
    await loadNotifications()
    await loadReadNotifications()
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

      // 설정값 가져오기
      const { contractExpiryNoticeDays, hugExpiryNoticeDays } = settingsStore.settings

      // 활성 계약에 대한 알림 체크 (설정값 사용)
      const newNotifications = notificationService.checkExpirations(
        contractsStore.activeContracts,
        contractExpiryNoticeDays,
        hugExpiryNoticeDays
      )

      // Deterministic ID로 중복 제거 (contractId-type 기준)
      const existingMap = new Map(
        notifications.value.map(n => [n.id, n])
      )

      const newlyAddedNotifications: Notification[] = []

      newNotifications.forEach(newN => {
        const existing = existingMap.get(newN.id)
        const isAlreadyRead = readNotificationIds.value.has(newN.id)

        if (existing) {
          // 기존 알림이 있으면 daysLeft만 업데이트
          existing.daysLeft = newN.daysLeft
          existing.message = newN.message
          existing.priority = newN.priority
          existing.createdAt = newN.createdAt
        } else if (!isAlreadyRead) {
          // 읽지 않은 새 알림만 추가
          existingMap.set(newN.id, newN)
          newlyAddedNotifications.push(newN)
        }
        // 이미 읽은 알림은 추가하지 않음
      })

      // 새로 추가된 알림에 대해 푸시 알림 표시 (권한이 있을 때만)
      if (pushNotificationService.hasPermission() && newlyAddedNotifications.length > 0) {
        newlyAddedNotifications.forEach(notification => {
          if (notification.type === 'contract_expiring') {
            // 계약 만료 알림
            const address = notification.message.split(' - ')[0] || ''
            const tenantName = notification.message.match(/- (.+)님의/)?.[1] || ''
            pushNotificationService.showContractExpiringNotification({
              address,
              tenantName,
              daysLeft: notification.daysLeft
            })
          } else if (notification.type === 'hug_expiring') {
            // HUG 보증 만료 알림
            const address = notification.message.split('의 HUG')[0] || ''
            pushNotificationService.showHugExpiringNotification({
              address,
              daysLeft: notification.daysLeft
            })
          }
        })
      }

      notifications.value = Array.from(existingMap.values())

      // 저장 가능한 형태로 직렬화
      const serialized = serializeNotificationsForStorage(notifications.value)
      await storageService.set(STORAGE_KEY, serialized)

      console.log(`✅ [NotificationsStore] Updated notifications: ${notifications.value.length} total`)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check notifications'
      console.error('Check notifications error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function markAsRead(notificationId: string) {
    // 읽은 알림은 목록에서 완전히 제거
    notifications.value = notifications.value.filter(n => n.id !== notificationId)
    readNotificationIds.value.add(notificationId)

    // 저장
    const serialized = serializeNotificationsForStorage(notifications.value)
    await storageService.set(STORAGE_KEY, serialized)
    await saveReadNotifications()
  }

  async function markAllAsRead() {
    // 모든 알림을 읽은 목록에 추가
    notifications.value.forEach(n => {
      readNotificationIds.value.add(n.id)
    })

    // 모든 알림을 목록에서 제거
    notifications.value = []

    // 저장
    await storageService.set(STORAGE_KEY, [])
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
    initialize,
    loadNotifications,
    loadReadNotifications,
    checkNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    clearError,
    pushNotificationService
  }
})
