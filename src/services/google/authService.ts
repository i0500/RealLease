/**
 * Firebase Authentication Service
 *
 * Google Sign-In과 인증 상태 관리를 Firebase Auth를 사용하여 처리합니다.
 * 로그인 상태 유지 옵션에 따라 localStorage 또는 sessionStorage를 사용합니다.
 */

import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth, googleProvider, setAuthPersistence } from '@/config/firebase'
import { isIOSPWA, isPopupBlocked } from '@/utils/pwaUtils'

// 토큰 갱신 버퍼 시간 (5분 전에 갱신 시도)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export class AuthService {
  private currentUser: FirebaseUser | null = null
  private authStateListener: (() => void) | null = null
  private googleAccessToken: string | null = null
  private tokenExpiryTime: number | null = null // 토큰 만료 시간 (Unix timestamp)
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private authReady: Promise<void>
  private authReadyResolve!: () => void
  private redirectCheckComplete: boolean = false // redirect 결과 확인 완료 여부
  private keepSignedInPreference: boolean = true // 로그인 상태 유지 설정
  private redirectLoginProcessed: boolean = false // redirect 로그인 처리 완료 여부
  private onRedirectLoginSuccess: ((user: FirebaseUser) => void) | null = null // redirect 로그인 성공 콜백
  private redirectResultPending: boolean = false // redirect 결과가 대기 중인지 여부
  private pendingRedirectResult: any = null // 대기 중인 redirect 결과
  private tokenRefreshNeeded: boolean = false // 토큰 갱신 필요 플래그 (팝업 대신 API 실패 시 처리)

  constructor() {
    // Firebase Auth 초기화 완료를 기다릴 Promise 생성
    // 🔧 FIX: authReady = redirect 결과 처리 + onAuthStateChanged 첫 콜백 모두 완료
    this.authReady = new Promise((resolve) => {
      this.authReadyResolve = resolve
    })

    // 초기화 순서 중요: auth listener 먼저 설정 후 redirect 결과 확인
    this.initializeAuth()
  }

  /**
   * 비동기 초기화 - auth listener 먼저 설정 후 redirect 결과 확인
   * authReady는 redirect 결과 확인 + onAuthStateChanged 첫 콜백 모두 완료 후 resolve
   */
  private async initializeAuth(): Promise<void> {
    this.loadGoogleAccessToken()
    this.initializeAuthListener()
    await this.checkRedirectResult()
    this.redirectCheckComplete = true
    this.tryResolveAuthReady()
  }

  /**
   * authReady promise resolve 시도
   * redirect 결과 확인 + onAuthStateChanged 첫 콜백 모두 완료되어야 resolve
   */
  private authStateFirstCallbackDone: boolean = false

  private tryResolveAuthReady(): void {
    if (this.redirectCheckComplete && this.authStateFirstCallbackDone) {
      this.authReadyResolve()
    }
  }

  /**
   * Redirect 로그인 성공 시 호출될 콜백 등록
   * 콜백 등록 시 대기 중인 redirect 결과가 있으면 즉시 처리
   */
  setOnRedirectLoginSuccess(callback: (user: FirebaseUser) => void): void {
    this.onRedirectLoginSuccess = callback

    // 대기 중인 redirect 결과가 있으면 즉시 처리
    if (this.redirectResultPending && this.pendingRedirectResult) {
      this.processPendingRedirectResult()
    }
  }

  /**
   * 대기 중인 redirect 결과 처리
   */
  private async processPendingRedirectResult(): Promise<void> {
    if (!this.pendingRedirectResult || !this.onRedirectLoginSuccess) {
      return
    }

    const result = this.pendingRedirectResult
    this.pendingRedirectResult = null
    this.redirectResultPending = false

    try {
      this.onRedirectLoginSuccess(result.user)
    } catch (error) {
      console.error('❌ [AuthService] Error processing pending redirect:', error)
    }
  }

  /**
   * Redirect 로그인 결과 확인 (iOS PWA용)
   * 앱 시작 시 호출되어 redirect 방식 로그인 결과를 처리
   * 콜백이 등록되지 않은 경우 결과를 저장해두고 나중에 처리
   * @returns true if redirect login was successful
   */
  private async checkRedirectResult(): Promise<boolean> {
    try {
      const result = await getRedirectResult(auth)

      if (result) {
        this.currentUser = result.user
        this.redirectLoginProcessed = true

        const credential = GoogleAuthProvider.credentialFromResult(result)
        if (credential && credential.accessToken) {
          this.googleAccessToken = credential.accessToken

          const keepSignedIn = localStorage.getItem('pending_keep_signed_in') !== 'false'
          localStorage.removeItem('pending_keep_signed_in')

          const tokenInfo = await this.getTokenInfo(credential.accessToken)
          const expiresIn = tokenInfo?.expires_in || 3600

          this.saveGoogleAccessToken(credential.accessToken, keepSignedIn, expiresIn)

          const userInfo = {
            email: result.user.email || 'user@example.com',
            name: result.user.displayName || result.user.email?.split('@')[0] || 'User'
          }
          const storage = keepSignedIn ? localStorage : sessionStorage
          storage.setItem('reallease_user', JSON.stringify(userInfo))

          if (this.onRedirectLoginSuccess) {
            this.onRedirectLoginSuccess(result.user)
          } else {
            this.redirectResultPending = true
            this.pendingRedirectResult = result
          }
        }

        return true
      }
      return false
    } catch (error: any) {
      console.error('❌ [AuthService] Redirect result error:', error)
      return false
    }
  }

  /**
   * Redirect 로그인이 처리되었는지 확인
   */
  wasRedirectLoginProcessed(): boolean {
    return this.redirectLoginProcessed
  }

  /**
   * Firebase Auth 초기화 완료 대기
   * 앱 시작 시 이 메서드를 await하여 인증 상태가 복원될 때까지 기다려야 합니다
   */
  async waitForAuth(): Promise<void> {
    await this.authReady
  }

  /**
   * 인증 상태 변경 리스너 초기화
   * Firebase가 자동으로 토큰을 갱신하고 세션을 유지합니다
   *
   * 🔧 FIX: 첫 콜백에서 authStateFirstCallbackDone 설정 후 tryResolveAuthReady 호출
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
        this.authStateFirstCallbackDone = true
        this.tryResolveAuthReady()
      }
    })
  }

  /**
   * 저장된 Google Access Token 로드 및 검증
   * readonly 권한만 있는 오래된 토큰은 자동 삭제
   * 만료 시간 확인 및 갱신 타이머 설정
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

      this.verifyAndCleanupToken(localToken, 'localStorage')
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

      this.verifyAndCleanupToken(sessionToken, 'sessionStorage')
      return
    }
  }

  /**
   * Google Access Token 저장 (만료 시간 포함)
   * @param token - Google OAuth Access Token
   * @param keepSignedIn - localStorage vs sessionStorage 선택
   * @param expiresIn - 토큰 만료 시간 (초)
   */
  private saveGoogleAccessToken(token: string, keepSignedIn: boolean, expiresIn?: number): void {
    const storage = keepSignedIn ? localStorage : sessionStorage
    storage.setItem('google_access_token', token)

    // 로그인 상태 유지 설정 저장
    this.keepSignedInPreference = keepSignedIn
    storage.setItem('keep_signed_in', String(keepSignedIn))

    // 반대쪽 storage에서 제거 (중복 방지)
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
   * Google Access Token 및 관련 데이터 제거
   */
  private clearGoogleAccessToken(): void {
    // 토큰 갱신 타이머 취소
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }

    // localStorage 정리
    localStorage.removeItem('google_access_token')
    localStorage.removeItem('token_expiry_time')
    localStorage.removeItem('keep_signed_in')

    // sessionStorage 정리
    sessionStorage.removeItem('google_access_token')
    sessionStorage.removeItem('token_expiry_time')
    sessionStorage.removeItem('keep_signed_in')

    this.googleAccessToken = null
    this.tokenExpiryTime = null
  }

  /**
   * 토큰 갱신 타이머 설정
   * 만료 5분 전에 갱신 필요 플래그 설정 (자동 팝업 대신)
   * 실제 갱신은 API 호출 실패 시 또는 사용자 액션 시 수행
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
   * Access Token 자동 갱신
   * Firebase 재인증을 통해 새로운 OAuth Access Token 획득
   * @param silent - true면 팝업 없이 시도 (실패 시 false 반환), false면 팝업 사용
   */
  async refreshAccessToken(silent: boolean = false): Promise<boolean> {
    if (!this.currentUser) {
      return false
    }

    if (isPopupBlocked()) {
      silent = true
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
   * 수동 재인증 요청 (사용자 액션 시 호출)
   * API 호출 실패 후 또는 설정 화면에서 호출
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
   * 토큰이 만료되었거나 곧 만료되는지 확인
   */
  isTokenExpiringSoon(): boolean {
    if (!this.tokenExpiryTime) return true
    const remainingMs = this.tokenExpiryTime - Date.now()
    return remainingMs < TOKEN_REFRESH_BUFFER_MS
  }

  /**
   * 토큰이 이미 만료되었는지 확인
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiryTime) return true
    return this.tokenExpiryTime <= Date.now()
  }

  /**
   * Google 로그인 (환경에 따라 팝업/리디렉트 방식 자동 선택)
   * @param keepSignedIn - true: localStorage (영구 보관), false: sessionStorage (세션만)
   * @returns Promise<void> - 팝업 방식일 때만 즉시 완료, 리디렉트 방식은 페이지 이동
   */
  async signIn(keepSignedIn: boolean = true): Promise<void> {
    try {
      await setAuthPersistence(keepSignedIn)

      if (isPopupBlocked()) {
        localStorage.setItem('pending_keep_signed_in', String(keepSignedIn))
        await signInWithRedirect(auth, googleProvider)
        return
      }

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
        localStorage.setItem('pending_keep_signed_in', String(keepSignedIn))
        await signInWithRedirect(auth, googleProvider)
        return
      }

      if (error.code === 'auth/network-request-failed') {
        throw new Error('네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.')
      }

      throw new Error('로그인에 실패했습니다. 다시 시도해주세요.')
    }
  }

  /**
   * iOS PWA 환경인지 확인
   */
  isIOSPWA(): boolean {
    return isIOSPWA()
  }

  /**
   * 팝업이 차단되는 환경인지 확인
   */
  isPopupBlocked(): boolean {
    return isPopupBlocked()
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
   * 토큰이 만료되었거나 곧 만료될 경우 silent 갱신 시도 (팝업 없음)
   * Google OAuth Access Token을 반환합니다 (Firebase ID Token이 아님!)
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
   * 🛡️ 저장된 토큰 검증 및 정리
   *
   * 🔧 FIX: 토큰 만료/검증 실패시 로그아웃하지 않음!
   * Firebase Auth 세션은 유지하고, OAuth 토큰만 삭제
   * 실제 API 호출 시점에 재인증 요청
   */
  private async verifyAndCleanupToken(accessToken: string, _storageType: 'localStorage' | 'sessionStorage'): Promise<void> {
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
   * 리스너 정리 (앱 종료 시)
   */
  destroy(): void {
    // 인증 상태 리스너 정리
    if (this.authStateListener) {
      this.authStateListener()
      this.authStateListener = null
    }

    // 토큰 갱신 타이머 정리
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
  }

  /**
   * 레거시 호환: initialize 메서드 (Firebase는 자동 초기화되므로 아무것도 하지 않음)
   */
  async initialize(_clientId: string): Promise<void> {
    return Promise.resolve()
  }

  /**
   * 레거시 호환: loadGoogleIdentityServices (Firebase는 스크립트 로딩 불필요)
   */
  loadGoogleIdentityServices(): Promise<void> {
    return Promise.resolve()
  }
}

export const authService = new AuthService()
