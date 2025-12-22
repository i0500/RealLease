/**
 * PWA 유틸리티 함수
 * 단순화된 버전 - 플랫폼 구분 없이 동작
 */

/**
 * PWA (standalone 모드)인지 확인
 */
export function isPWA(): boolean {
  // display-mode: standalone 체크
  const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
  // iOS Safari standalone 체크
  const isIOSStandalone = (window.navigator as any).standalone === true

  return isStandaloneMode || isIOSStandalone
}

/**
 * 팝업이 차단되는 환경인지 확인
 * 현재는 모든 환경에서 팝업 방식 사용
 */
export function isPopupBlocked(): boolean {
  return false
}

/**
 * PWA 환경 정보 반환
 */
export function getPWAEnvironment(): {
  isPWA: boolean
  isPopupBlocked: boolean
} {
  return {
    isPWA: isPWA(),
    isPopupBlocked: isPopupBlocked()
  }
}
