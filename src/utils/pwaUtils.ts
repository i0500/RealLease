/**
 * PWA 유틸리티 함수
 * iOS PWA 및 standalone 모드 감지
 */

/**
 * iOS 기기인지 확인
 */
export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
}

/**
 * iOS PWA (standalone 모드)인지 확인
 * 홈 화면에 추가된 웹앱에서 실행 중인지 감지
 */
export function isIOSPWA(): boolean {
  // iOS Safari의 standalone 모드 체크
  const isStandalone = (window.navigator as any).standalone === true
  return isIOS() && isStandalone
}

/**
 * Android PWA (standalone 모드)인지 확인
 */
export function isAndroidPWA(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches && !isIOS()
}

/**
 * PWA (standalone 모드)인지 확인 (iOS, Android 모두)
 */
export function isPWA(): boolean {
  // display-mode: standalone 체크 (Android, Desktop)
  const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari standalone 체크
  const isIOSStandalone = (window.navigator as any).standalone === true

  return isStandaloneMode || isIOSStandalone
}

/**
 * Safari 브라우저인지 확인
 */
export function isSafari(): boolean {
  const ua = navigator.userAgent
  // Safari는 Chrome이 아니면서 Safari를 포함하는 경우
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua)
}

/**
 * iOS Safari (일반 브라우저)인지 확인
 */
export function isIOSSafari(): boolean {
  return isIOS() && isSafari() && !isIOSPWA()
}

/**
 * 팝업이 차단되는 환경인지 확인
 * iOS PWA에서는 팝업이 차단됨
 */
export function isPopupBlocked(): boolean {
  return isIOSPWA()
}

/**
 * 현재 URL을 Safari 브라우저로 열기
 * iOS PWA에서 인증이 필요할 때 사용
 */
export function openInSafari(url?: string): void {
  const targetUrl = url || window.location.href
  // iOS에서 외부 브라우저로 열기
  window.location.href = targetUrl
}

/**
 * PWA 환경 정보 반환
 */
export function getPWAEnvironment(): {
  isIOS: boolean
  isIOSPWA: boolean
  isAndroidPWA: boolean
  isPWA: boolean
  isSafari: boolean
  isPopupBlocked: boolean
} {
  return {
    isIOS: isIOS(),
    isIOSPWA: isIOSPWA(),
    isAndroidPWA: isAndroidPWA(),
    isPWA: isPWA(),
    isSafari: isSafari(),
    isPopupBlocked: isPopupBlocked()
  }
}
