import type { Notification, RentalContract } from '@/types'
import { getDaysLeft, isExpiringSoon } from '@/utils/dateUtils'
import { generateId } from '@/utils/formatUtils'
import { NOTIFICATION_THRESHOLD_DAYS } from '@/utils/constants'

export class NotificationService {
  checkExpirations(contracts: RentalContract[]): Notification[] {
    const notifications: Notification[] = []
    const today = new Date()

    contracts.forEach(contract => {
      // 계약 만료 알림
      if (contract.contract.status === 'active') {
        const daysLeft = getDaysLeft(contract.contract.endDate)

        if (isExpiringSoon(contract.contract.endDate, NOTIFICATION_THRESHOLD_DAYS)) {
          notifications.push({
            id: generateId(),
            contractId: contract.id,
            type: 'contract_expiring',
            priority: this.getPriority(daysLeft),
            daysLeft,
            title: '계약 만료 예정',
            message: `${contract.property.address} ${contract.property.unit || ''} - ${contract.tenant.name}님의 계약이 ${daysLeft}일 후 만료됩니다.`,
            read: false,
            createdAt: today
          })
        }
      }

      // HUG 보증 만료 알림
      if (contract.hug && contract.hug.guaranteed) {
        const hugDaysLeft = getDaysLeft(contract.hug.endDate)

        if (isExpiringSoon(contract.hug.endDate, NOTIFICATION_THRESHOLD_DAYS)) {
          notifications.push({
            id: generateId(),
            contractId: contract.id,
            type: 'hug_expiring',
            priority: this.getPriority(hugDaysLeft),
            daysLeft: hugDaysLeft,
            title: 'HUG 보증 만료 예정',
            message: `${contract.property.address} ${contract.property.unit || ''}의 HUG 보증이 ${hugDaysLeft}일 후 만료됩니다.`,
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
