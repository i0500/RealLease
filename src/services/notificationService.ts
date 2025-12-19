import type { Notification, RentalContract } from '@/types'
import { getDaysLeft, isExpiringSoon } from '@/utils/dateUtils'

export class NotificationService {
  /**
   * 계약 만료 알림 체크
   * @param contracts 계약 목록
   * @param contractExpiryDays 계약 만료 알림 일수
   * @param hugExpiryDays HUG 보증 만료 알림 일수
   */
  checkExpirations(
    contracts: RentalContract[],
    contractExpiryDays: number = 90,
    hugExpiryDays: number = 90
  ): Notification[] {
    const notifications: Notification[] = []
    const today = new Date()

    contracts.forEach(contract => {
      // 계약 만료 알림 (계약자가 있고 종료일이 있는 경우)
      if (contract.tenantName && contract.tenantName.trim() !== '' && contract.endDate) {
        const daysLeft = getDaysLeft(contract.endDate)

        if (isExpiringSoon(contract.endDate, contractExpiryDays)) {
          const address = `${contract.building}동 ${contract.unit}호`
          // Deterministic ID: sheetId-building-unit-type (재로드해도 동일한 ID 유지)
          const notificationId = `${contract.sheetId}-${contract.building}-${contract.unit}-contract_expiring`
          notifications.push({
            id: notificationId,
            contractId: contract.id,
            type: 'contract_expiring',
            priority: this.getPriority(daysLeft),
            daysLeft,
            title: '계약 만료 예정',
            message: `${address} - ${contract.tenantName}님의 계약이 ${daysLeft}일 후 만료됩니다.`,
            read: false,
            createdAt: today
          })
        }
      }

      // HUG 보증보험 만료 알림 (보증보험 종료일이 있는 경우)
      if (contract.hugEndDate) {
        const hugDaysLeft = getDaysLeft(contract.hugEndDate)

        if (isExpiringSoon(contract.hugEndDate, hugExpiryDays)) {
          const address = `${contract.building}동 ${contract.unit}호`
          // Deterministic ID: sheetId-building-unit-type (재로드해도 동일한 ID 유지)
          const notificationId = `${contract.sheetId}-${contract.building}-${contract.unit}-hug_expiring`
          notifications.push({
            id: notificationId,
            contractId: contract.id,
            type: 'hug_expiring',
            priority: this.getPriority(hugDaysLeft),
            daysLeft: hugDaysLeft,
            title: 'HUG 보증 만료 예정',
            message: `${address}의 HUG 보증이 ${hugDaysLeft}일 후 만료됩니다.`,
            read: false,
            createdAt: today
          })
        }
      }
    })

    return notifications
  }

  private getPriority(daysLeft: number): 'high' | 'medium' | 'low' {
    if (daysLeft <= 30) return 'high'
    if (daysLeft <= 60) return 'medium'
    return 'low'
  }

  sortNotifications(notifications: Notification[]): Notification[] {
    return notifications.sort((a, b) => {
      // 우선순위 순서
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]

      if (priorityDiff !== 0) return priorityDiff

      // 같은 우선순위면 날짜순
      return a.daysLeft - b.daysLeft
    })
  }

  filterUnreadNotifications(notifications: Notification[]): Notification[] {
    return notifications.filter(n => !n.read)
  }

  getNotificationCount(notifications: Notification[]): number {
    return this.filterUnreadNotifications(notifications).length
  }
}

export const notificationService = new NotificationService()
