export interface Notification {
  id: string
  contractId: string
  type: 'contract_expiring' | 'hug_expiring'
  priority: 'high' | 'medium' | 'low'
  daysLeft: number
  title: string
  message: string
  read: boolean
  createdAt: Date
}

export type NotificationType = Notification['type']
export type NotificationPriority = Notification['priority']
