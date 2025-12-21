import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useContractsStore } from './contracts'
import { useNotificationSettingsStore } from './notificationSettings'
import { notificationService } from '@/services/notificationService'
import { storageService } from '@/services/storageService'
import { pushNotificationService } from '@/services/pushNotificationService'
import type { Notification } from '@/types'

const STORAGE_KEY = 'notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  const notifications = ref<Notification[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const contractsStore = useContractsStore()
  const settingsStore = useNotificationSettingsStore()

  const unreadNotifications = computed(() =>
    notifications.value.filter(n => !n.read)
  )

  const unreadCount = computed(() => unreadNotifications.value.length)

  const sortedNotifications = computed(() =>
    notificationService.sortNotifications(notifications.value)
  )

  const highPriorityNotifications = computed(() =>
    notifications.value.filter(n => n.priority === 'high' && !n.read)
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
      }
    } catch (err) {
      console.error('Load notifications error:', err)
    }
  }

  // Initialize store by loading all persisted data
  async function initialize() {
    await loadNotifications()
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

      // 🎯 심플한 중복 체크: 기존 알림(읽음+미읽음 모두)에서 ID로 찾기
      const existingMap = new Map(
        notifications.value.map(n => [n.id, n])
      )

      const newlyAddedNotifications: Notification[] = []

      newNotifications.forEach(newN => {
        const existing = existingMap.get(newN.id)

        if (existing) {
          // ✅ 기존 알림이 있으면 daysLeft만 업데이트 (read 상태 유지)
          existing.daysLeft = newN.daysLeft
          existing.message = newN.message
          existing.priority = newN.priority
          existing.createdAt = newN.createdAt
        } else {
          // ✅ 기존 알림 없으면 새로 추가 (read = false로 시작)
          existingMap.set(newN.id, newN)
          newlyAddedNotifications.push(newN)
        }
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

      // 자동으로 오래된 읽은 알림 정리
      await cleanupOldReadNotifications()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to check notifications'
      console.error('Check notifications error:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function markAsRead(notificationId: string) {
    // 읽음으로 표시 (삭제하지 않음)
    const notification = notifications.value.find(n => n.id === notificationId)
    if (notification) {
      notification.read = true
    }

    // 저장
    const serialized = serializeNotificationsForStorage(notifications.value)
    await storageService.set(STORAGE_KEY, serialized)
  }

  async function markAllAsRead() {
    // 모든 알림을 읽음으로 표시
    notifications.value.forEach(n => {
      n.read = true
    })

    // 저장
    const serialized = serializeNotificationsForStorage(notifications.value)
    await storageService.set(STORAGE_KEY, serialized)
  }

  async function clearNotification(notificationId: string) {
    notifications.value = notifications.value.filter(n => n.id !== notificationId)

    // 저장 가능한 형태로 직렬화
    const serialized = serializeNotificationsForStorage(notifications.value)
    await storageService.set(STORAGE_KEY, serialized)
  }

  async function clearAllNotifications() {
    notifications.value = []
    await storageService.set(STORAGE_KEY, [])
  }

  /**
   * 설정한 알림 개월수를 초과한 읽은 알림 자동 정리
   */
  async function cleanupOldReadNotifications() {
    const { contractExpiryNoticeDays, hugExpiryNoticeDays } = settingsStore.settings
    const maxNoticeDays = Math.max(contractExpiryNoticeDays, hugExpiryNoticeDays)
    const today = new Date()
    const cutoffDate = new Date(today.getTime() - maxNoticeDays * 24 * 60 * 60 * 1000)

    const beforeCount = notifications.value.length

    // 읽은 알림 중에서 createdAt이 cutoffDate보다 오래된 것 제거
    notifications.value = notifications.value.filter(n => {
      // 미읽음 알림은 유지
      if (!n.read) return true

      // 읽은 알림은 생성일 기준으로 필터링
      return n.createdAt >= cutoffDate
    })

    const afterCount = notifications.value.length
    const removedCount = beforeCount - afterCount

    if (removedCount > 0) {
      // 저장 가능한 형태로 직렬화
      const serialized = serializeNotificationsForStorage(notifications.value)
      await storageService.set(STORAGE_KEY, serialized)
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    notifications,
    unreadNotifications,
    unreadCount,
    sortedNotifications,
    highPriorityNotifications,
    isLoading,
    error,
    initialize,
    loadNotifications,
    checkNotifications,
    markAsRead,
    markAllAsRead,
    clearNotification,
    clearAllNotifications,
    cleanupOldReadNotifications,
    clearError,
    pushNotificationService
  }
})
