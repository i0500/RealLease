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
  // 계약 찾기를 위한 추가 정보 (contractId가 변경되어도 찾을 수 있도록)
  building?: string
  unit?: string
  sheetId?: string
  tenantName?: string
}

export type NotificationType = Notification['type']
export type NotificationPriority = Notification['priority']

export interface NotificationSettings {
  contractExpiryNoticeDays: number // 계약 만료 알림 일수 (기본 90일 = 3개월)
  hugExpiryNoticeDays: number // HUG 보험 만료 알림 일수 (기본 90일)
  pushNotificationTime: string // 푸시 알림 시간 (HH:mm 형식, 기본 "10:00")
  enablePushNotifications: boolean // 푸시 알림 활성화 여부
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  contractExpiryNoticeDays: 90, // 3개월
  hugExpiryNoticeDays: 90, // 3개월
  pushNotificationTime: '10:00', // 오전 10시
  enablePushNotifications: true
}
