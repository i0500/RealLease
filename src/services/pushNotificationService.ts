/**
 * PWA 푸시 알림 서비스
 * - 브라우저 알림 권한 요청
 * - 로컬 알림 표시 (백엔드 서버 없이)
 * - 알림 클릭 시 앱으로 이동
 * - 푸시 알림 스케줄링
 */

const LAST_PUSH_CHECK_KEY = 'last_push_check_date'

export class PushNotificationService {
  private permission: NotificationPermission = 'default'

  constructor() {
    if ('Notification' in window) {
      this.permission = Notification.permission
    }
  }

  /**
   * 알림 권한이 있는지 확인
   */
  hasPermission(): boolean {
    return this.permission === 'granted'
  }

  /**
   * 알림 권한 상태 확인
   */
  getPermission(): NotificationPermission {
    return this.permission
  }

  /**
   * 알림 권한 요청
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      console.warn('이 브라우저는 알림을 지원하지 않습니다')
      return 'denied'
    }

    if (this.permission === 'granted') {
      return 'granted'
    }

    try {
      this.permission = await Notification.requestPermission()
      console.log('✅ 알림 권한:', this.permission)
      return this.permission
    } catch (error) {
      console.error('알림 권한 요청 실패:', error)
      return 'denied'
    }
  }

  /**
   * 로컬 알림 표시
   */
  async showNotification(options: {
    title: string
    body: string
    icon?: string
    badge?: string
    tag?: string
    data?: any
  }): Promise<void> {
    if (!this.hasPermission()) {
      console.warn('알림 권한이 없습니다')
      return
    }

    try {
      // Service Worker가 등록되어 있으면 SW에서 알림 표시
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const registration = await navigator.serviceWorker.ready
        await registration.showNotification(options.title, {
          body: options.body,
          icon: options.icon || '/icons/icon-192x192.png',
          badge: options.badge || '/icons/icon-72x72.png',
          tag: options.tag,
          data: options.data,
          requireInteraction: false
        })
      } else {
        // SW가 없으면 일반 Notification 사용
        new Notification(options.title, {
          body: options.body,
          icon: options.icon || '/icons/icon-192x192.png',
          tag: options.tag,
          data: options.data
        })
      }

      console.log('✅ 알림 표시:', options.title)
    } catch (error) {
      console.error('알림 표시 실패:', error)
    }
  }

  /**
   * 계약 만료 알림 표시
   */
  async showContractExpiringNotification(data: {
    address: string
    tenantName: string
    daysLeft: number
  }): Promise<void> {
    await this.showNotification({
      title: '🏠 계약 만료 예정',
      body: `${data.address} - ${data.tenantName}님의 계약이 ${data.daysLeft}일 후 만료됩니다.`,
      tag: `contract-expiring-${data.address}`,
      data: {
        type: 'contract_expiring',
        ...data
      }
    })
  }

  /**
   * HUG 보증 만료 알림 표시
   */
  async showHugExpiringNotification(data: {
    address: string
    daysLeft: number
  }): Promise<void> {
    await this.showNotification({
      title: '🛡️ HUG 보증 만료 예정',
      body: `${data.address}의 HUG 보증이 ${data.daysLeft}일 후 만료됩니다.`,
      tag: `hug-expiring-${data.address}`,
      data: {
        type: 'hug_expiring',
        ...data
      }
    })
  }

  /**
   * 푸시 알림을 보내야 하는지 확인
   * @param pushTime 설정된 푸시 시간 (HH:mm 형식)
   * @returns 푸시 알림을 보내야 하면 true
   */
  shouldShowPush(pushTime: string): boolean {
    const now = new Date()
    const today = now.toISOString().split('T')[0] // YYYY-MM-DD

    // 마지막 푸시 체크 날짜 가져오기
    const lastPushCheckDate = localStorage.getItem(LAST_PUSH_CHECK_KEY)

    // 오늘 이미 푸시했으면 false
    if (lastPushCheckDate === today) {
      return false
    }

    // 현재 시간이 설정 시간보다 늦으면 true
    const timeParts = pushTime.split(':').map(Number)
    const targetHour = timeParts[0] ?? 10
    const targetMinute = timeParts[1] ?? 0
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()

    if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
      return true
    }

    return false
  }

  /**
   * 푸시 알림 체크 날짜 업데이트
   */
  updatePushCheckDate(): void {
    const today: string = new Date().toISOString().split('T')[0] || ''
    localStorage.setItem(LAST_PUSH_CHECK_KEY, today)
  }

  /**
   * 마지막 푸시 체크 날짜 초기화 (테스트용)
   */
  resetPushCheckDate(): void {
    localStorage.removeItem(LAST_PUSH_CHECK_KEY)
  }
}

export const pushNotificationService = new PushNotificationService()
