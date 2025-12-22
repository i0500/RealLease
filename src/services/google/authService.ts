/**
 * Firebase Authentication Service
 *
 * Google Sign-In과 인증 상태 관리를 Firebase Auth를 사용하여 처리합니다.
 * 팝업 방식으로 로그인을 처리합니다.
 */

import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth, googleProvider, setAuthPersistence } from '@/config/firebase'

// 토큰 갱신 버퍼 시간 (5분 전에 갱신 시도)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export class AuthService {
  private currentUser: FirebaseUser | null = null
  private authStateListener: (() => void) | null = null
  private googleAccessToken: string | null = null
  private tokenExpiryTime: number | null = null
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private authReady: Promise<void>
  private authReadyResolve!: () => void
  private keepSignedInPreference: boolean = true
  private tokenRefreshNeeded: boolean = false

  constructor() {
    this.authReady = new Promise((resolve) => {
      this.authReadyResolve = resolve
    })
    this.initializeAuth()
  }

  private initializeAuth(): void {
    this.loadGoogleAccessToken()
    this.initializeAuthListener()
  }

  /**
   * Firebase Auth 초기화 완료 대기
   */
  async waitForAuth(): Promise<void> {
    await this.authReady
  }

  /**
   * 인증 상태 변경 리스너 초기화
   */
  private initializeAuthListener(): void {
    let isFirstCall = true

    this.authStateListener = onAuthStateChanged(auth, (user) => {
      this.currentUser = user

      if (user) {
        this.loadGoogleAccessToken()
      } else {
        this.googleAccessToken = null
      }

      if (isFirstCall) {
        isFirstCall = false
        this.authReadyResolve()
      }
    })
  }

  /**
   * 저장된 Google Access Token 로드
   */
  private loadGoogleAccessToken(): void {
    const localToken = localStorage.getItem('google_access_token')
    const localExpiry = localStorage.getItem('token_expiry_time')
    const localKeepSignedIn = localStorage.getItem('keep_signed_in')

    if (localToken) {
      this.googleAccessToken = localToken
      this.keepSignedInPreference = localKeepSignedIn !== 'false'

      if (localExpiry) {
        this.tokenExpiryTime = parseInt(localExpiry, 10)
        const remainingMs = this.tokenExpiryTime - Date.now()

        if (remainingMs > 0) {
          this.scheduleTokenRefresh(remainingMs)
        }
      }

      this.verifyAndCleanupToken(localToken)
      return
    }

    const sessionToken = sessionStorage.getItem('google_access_token')
    const sessionExpiry = sessionStorage.getItem('token_expiry_time')
    const sessionKeepSignedIn = sessionStorage.getItem('keep_signed_in')

    if (sessionToken) {
      this.googleAccessToken = sessionToken
      this.keepSignedInPreference = sessionKeepSignedIn !== 'false'

      if (sessionExpiry) {
        this.tokenExpiryTime = parseInt(sessionExpiry, 10)
        const remainingMs = this.tokenExpiryTime - Date.now()

        if (remainingMs > 0) {
          this.scheduleTokenRefresh(remainingMs)
        }
      }

      this.verifyAndCleanupToken(sessionToken)
      return
    }
  }

  /**
   * Google Access Token 저장
   */
  private saveGoogleAccessToken(token: string, keepSignedIn: boolean, expiresIn?: number): void {
    const storage = keepSignedIn ? localStorage : sessionStorage
    storage.setItem('google_access_token', token)
    this.keepSignedInPreference = keepSignedIn
    storage.setItem('keep_signed_in', String(keepSignedIn))

    const otherStorage = keepSignedIn ? sessionStorage : localStorage
    otherStorage.removeItem('google_access_token')
    otherStorage.removeItem('token_expiry_time')
    otherStorage.removeItem('keep_signed_in')

    if (expiresIn) {
      const expiryTime = Date.now() + (expiresIn * 1000)
      this.tokenExpiryTime = expiryTime
      storage.setItem('token_expiry_time', String(expiryTime))
      this.scheduleTokenRefresh(expiresIn * 1000)
    }
  }

  /**
   * Google Access Token 제거
   */
  private clearGoogleAccessToken(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }

    localStorage.removeItem('google_access_token')
    localStorage.removeItem('token_expiry_time')
    localStorage.removeItem('keep_signed_in')

    sessionStorage.removeItem('google_access_token')
    sessionStorage.removeItem('token_expiry_time')
    sessionStorage.removeItem('keep_signed_in')

    this.googleAccessToken = null
    this.tokenExpiryTime = null
  }

  /**
   * 토큰 갱신 타이머 설정
   */
  private scheduleTokenRefresh(remainingMs: number): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
    }

    const refreshInMs = Math.max(remainingMs - TOKEN_REFRESH_BUFFER_MS, 10000)

    this.tokenRefreshTimer = setTimeout(() => {
      this.tokenRefreshNeeded = true
    }, refreshInMs)
  }

  /**
   * Access Token 갱신
   */
  async refreshAccessToken(silent: boolean = false): Promise<boolean> {
    if (!this.currentUser) {
      return false
    }

    if (silent) {
      if (this.googleAccessToken && !this.isTokenExpired()) {
        this.tokenRefreshNeeded = false
        return true
      }
      this.tokenRefreshNeeded = true
      return false
    }

    try {
      const result = await reauthenticateWithPopup(this.currentUser, googleProvider)

      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential && credential.accessToken) {
        this.googleAccessToken = credential.accessToken
        this.tokenRefreshNeeded = false

        const tokenInfo = await this.getTokenInfo(credential.accessToken)
        const expiresIn = tokenInfo?.expires_in || 3600

        this.saveGoogleAccessToken(credential.accessToken, this.keepSignedInPreference, expiresIn)
        return true
      }
      return false
    } catch (error: any) {
      console.error('❌ [AuthService] Token refresh failed:', error)

      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/popup-blocked') {
        this.tokenRefreshNeeded = true
        return false
      }

      if (error.code === 'auth/user-mismatch' || error.code === 'auth/requires-recent-login') {
        await this.signOut()
        return false
      }

      return false
    }
  }

  /**
   * 토큰 갱신이 필요한지 확인
   */
  isTokenRefreshNeeded(): boolean {
    return this.tokenRefreshNeeded || this.isTokenExpired()
  }

  /**
   * 수동 재인증 요청
   */
  async requestReauthentication(): Promise<boolean> {
    return this.refreshAccessToken(false)
  }

  /**
   * Google tokeninfo API 호출
   */
  private async getTokenInfo(accessToken: string): Promise<{ expires_in?: number; scope?: string } | null> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
      if (response.ok) {
        return await response.json()
      }
      return null
    } catch (error) {
      console.error('❌ [AuthService] Failed to get token info:', error)
      return null
    }
  }

  /**
   * 토큰이 곧 만료되는지 확인
   */
  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiryTime) return true
    const remainingMs = this.tokenExpiryTime - Date.now()
    return remainingMs < TOKEN_REFRESH_BUFFER_MS
  }

  /**
   * 토큰이 만료되었는지 확인
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiryTime) return true
    return this.tokenExpiryTime <= Date.now()
  }

  /**
   * Google 로그인 (팝업 방식)
   */
  async signIn(keepSignedIn: boolean = true): Promise<void> {
    try {
      // persistence 설정
      await setAuthPersistence(keepSignedIn)

      // 팝업으로 로그인
      const result = await signInWithPopup(auth, googleProvider)
      this.currentUser = result.user

      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential && credential.accessToken) {
        this.googleAccessToken = credential.accessToken

        const tokenInfo = await this.getTokenInfo(credential.accessToken)
        const expiresIn = tokenInfo?.expires_in || 3600

        this.saveGoogleAccessToken(credential.accessToken, keepSignedIn, expiresIn)
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Sign-in failed:', error)

      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('로그인이 취소되었습니다')
      }

      if (error.code === 'auth/popup-blocked') {
        throw new Error('팝업이 차단되었습니다. 팝업 차단을 해제해주세요.')
      }

      if (error.code === 'auth/network-request-failed') {
        throw new Error('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.')
      }

      throw new Error('로그인에 실패했습니다. 다시 시도해주세요.')
    }
  }

  /**
   * 로그아웃
   */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth)
      this.currentUser = null
      this.clearGoogleAccessToken()
    } catch (error) {
      console.error('❌ [AuthService] Sign-out failed:', error)
      throw new Error('로그아웃에 실패했습니다')
    }
  }

  /**
   * 사용자 정보 조회
   */
  async getUserInfo(): Promise<{ email: string; name: string } | null> {
    if (!this.currentUser) {
      return null
    }

    return {
      email: this.currentUser.email || 'user@example.com',
      name: this.currentUser.displayName || this.currentUser.email?.split('@')[0] || 'User'
    }
  }

  /**
   * Google Sheets API용 Access Token 조회
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.googleAccessToken) {
      return null
    }

    if (this.isTokenExpired()) {
      const refreshed = await this.refreshAccessToken(true)
      if (!refreshed) {
        return null
      }
    } else if (this.isTokenExpiringSoon()) {
      this.tokenRefreshNeeded = true
    }

    return this.googleAccessToken
  }

  /**
   * 인증 상태 확인
   */
  isAuthenticated(): boolean {
    return !!this.currentUser
  }

  /**
   * 현재 사용자 조회
   */
  getCurrentUser(): FirebaseUser | null {
    return this.currentUser
  }

  /**
   * 토큰 검증 및 정리
   */
  private async verifyAndCleanupToken(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
      if (!response.ok) {
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true
        return
      }

      const tokenInfo = await response.json()
      const scope = tokenInfo.scope || ''

      const hasFullSpreadsheets = scope.includes('auth/spreadsheets ') || scope.endsWith('auth/spreadsheets')
      const hasReadonly = scope.includes('spreadsheets.readonly')

      if (hasReadonly && !hasFullSpreadsheets) {
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true
      } else if (!hasFullSpreadsheets) {
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true
      }
    } catch (error) {
      console.error('❌ [AuthService] Token verification error:', error)
      this.clearGoogleAccessToken()
      this.tokenRefreshNeeded = true
    }
  }

  /**
   * 리스너 정리
   */
  destroy(): void {
    if (this.authStateListener) {
      this.authStateListener()
      this.authStateListener = null
    }

    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
  }

  /**
   * 레거시 호환
   */
  async initialize(_clientId: string): Promise<void> {
    return Promise.resolve()
  }

  loadGoogleIdentityServices(): Promise<void> {
    return Promise.resolve()
  }

  // 레거시 호환 메서드 (사용하지 않지만 호환성 유지)
  isIOSPWA(): boolean {
    return false
  }

  isPopupBlocked(): boolean {
    return false
  }

  wasRedirectLoginProcessed(): boolean {
    return false
  }

  setOnRedirectLoginSuccess(_callback: (user: FirebaseUser) => void): void {
    // 레거시 호환 - 아무것도 하지 않음
  }
}

export const authService = new AuthService()
