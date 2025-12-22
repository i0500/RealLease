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

    // 초기화 순서 중요: redirect 결과를 먼저 확인한 후 auth listener 설정
    this.initializeAuth()
  }

  /**
   * 비동기 초기화 - redirect 결과 확인 후 auth listener 설정
   * iOS PWA: redirect 결과는 저장해두고 콜백 등록 후 처리
   *
   * 🔧 FIX: authReady는 redirect 결과 확인 + onAuthStateChanged 첫 콜백 모두 완료 후 resolve
   */
  private async initializeAuth(): Promise<void> {
    // 1. 저장된 토큰 먼저 로드
    this.loadGoogleAccessToken()

    // 2. iOS PWA redirect 결과 확인 (결과만 저장, 콜백은 나중에 처리)
    await this.checkRedirectResult()

    // ✅ redirect 결과 확인 완료 표시
    this.redirectCheckComplete = true
    console.log('✅ [AuthService] Redirect check complete')

    // 두 조건 모두 완료되었는지 확인하고 authReady resolve
    this.tryResolveAuthReady()

    // 3. Auth state listener 설정
    this.initializeAuthListener()
  }

  /**
   * authReady promise resolve 시도
   * redirect 결과 확인 + onAuthStateChanged 첫 콜백 모두 완료되어야 resolve
   */
  private authStateFirstCallbackDone: boolean = false

  private tryResolveAuthReady(): void {
    if (this.redirectCheckComplete && this.authStateFirstCallbackDone) {
      console.log('✅ [AuthService] Both conditions met, resolving authReady')
      this.authReadyResolve()
    } else {
      console.log(`⏳ [AuthService] Waiting for auth ready: redirect=${this.redirectCheckComplete}, authState=${this.authStateFirstCallbackDone}`)
    }
  }

  /**
   * Redirect 로그인 성공 시 호출될 콜백 등록
   * 콜백 등록 시 대기 중인 redirect 결과가 있으면 즉시 처리
   */
  setOnRedirectLoginSuccess(callback: (user: FirebaseUser) => void): void {
    this.onRedirectLoginSuccess = callback
    console.log('🔄 [AuthService] Redirect callback registered')

    // 대기 중인 redirect 결과가 있으면 즉시 처리
    if (this.redirectResultPending && this.pendingRedirectResult) {
      console.log('🔄 [AuthService] Processing pending redirect result...')
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
      // 콜백 호출 (auth store에 알림)
      this.onRedirectLoginSuccess(result.user)
      console.log('✅ [AuthService] Pending redirect result processed, callback invoked')
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
      console.log('🔄 [AuthService] Checking redirect result...')
      const result = await getRedirectResult(auth)

      if (result) {
        console.log('✅ [AuthService] Redirect sign-in successful:', {
          email: result.user.email,
          uid: result.user.uid
        })

        this.currentUser = result.user
        this.redirectLoginProcessed = true

        // Google OAuth Credentials에서 Access Token 추출
        const credential = GoogleAuthProvider.credentialFromResult(result)
        if (credential && credential.accessToken) {
          this.googleAccessToken = credential.accessToken

          // 저장된 keepSignedIn 설정 복원
          const keepSignedIn = localStorage.getItem('pending_keep_signed_in') !== 'false'
          localStorage.removeItem('pending_keep_signed_in')

          // tokeninfo API로 만료 시간 확인
          const tokenInfo = await this.getTokenInfo(credential.accessToken)
          const expiresIn = tokenInfo?.expires_in || 3600

          this.saveGoogleAccessToken(credential.accessToken, keepSignedIn, expiresIn)
          console.log('✅ [AuthService] Redirect login token saved')

          // 사용자 정보를 localStorage에 저장 (auth store가 읽을 수 있도록)
          const userInfo = {
            email: result.user.email || 'user@example.com',
            name: result.user.displayName || result.user.email?.split('@')[0] || 'User'
          }
          const storage = keepSignedIn ? localStorage : sessionStorage
          storage.setItem('reallease_user', JSON.stringify(userInfo))
          console.log('✅ [AuthService] User info saved to storage:', userInfo)

          // 🔍 DEBUG: 토큰 권한 확인
          this.debugTokenScopes(credential.accessToken)

          // 콜백 호출 (auth store에 알림) - 콜백이 없으면 대기
          if (this.onRedirectLoginSuccess) {
            console.log('🔄 [AuthService] Invoking redirect callback immediately')
            this.onRedirectLoginSuccess(result.user)
          } else {
            // 콜백이 아직 등록되지 않음 - 결과를 저장해두고 나중에 처리
            console.log('⏳ [AuthService] Callback not registered yet, saving result for later')
            this.redirectResultPending = true
            this.pendingRedirectResult = result
          }
        }

        return true
      } else {
        console.log('ℹ️ [AuthService] No redirect result (normal browser load)')
        return false
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Redirect result error:', error)
      // redirect 결과 오류는 무시 (일반적인 앱 로드에서는 결과가 없음)
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
    console.log('🔐 [AuthService] Initializing auth state listener...')

    let isFirstCall = true

    this.authStateListener = onAuthStateChanged(auth, (user) => {
      this.currentUser = user

      if (user) {
        console.log('✅ [AuthService] User signed in:', {
          email: user.email,
          uid: user.uid,
          displayName: user.displayName
        })

        // 로그인 상태 복원 시 저장된 Access Token 로드
        this.loadGoogleAccessToken()
      } else {
        console.log('🚪 [AuthService] User signed out')
        this.googleAccessToken = null
      }

      // 🔧 FIX: 첫 콜백에서 authStateFirstCallbackDone 표시 + tryResolveAuthReady 호출
      if (isFirstCall) {
        isFirstCall = false
        this.authStateFirstCallbackDone = true
        console.log('✅ [AuthService] Auth state first callback done')

        // 두 조건 모두 완료되었는지 확인하고 authReady resolve
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
    // localStorage 우선, 없으면 sessionStorage 체크
    const localToken = localStorage.getItem('google_access_token')
    const localExpiry = localStorage.getItem('token_expiry_time')
    const localKeepSignedIn = localStorage.getItem('keep_signed_in')

    if (localToken) {
      this.googleAccessToken = localToken
      this.keepSignedInPreference = localKeepSignedIn !== 'false'
      console.log('🔑 [AuthService] Google Access Token loaded from localStorage')

      // 만료 시간 복원 및 갱신 타이머 설정
      if (localExpiry) {
        this.tokenExpiryTime = parseInt(localExpiry, 10)
        const remainingMs = this.tokenExpiryTime - Date.now()

        if (remainingMs > 0) {
          console.log(`⏰ [AuthService] Token expires in ${Math.round(remainingMs / 1000 / 60)} minutes`)
          this.scheduleTokenRefresh(remainingMs)
        } else {
          console.warn('⚠️ [AuthService] Token already expired, will refresh on next API call')
        }
      }

      // 🔍 토큰 권한 검증 (readonly면 삭제)
      this.verifyAndCleanupToken(localToken, 'localStorage')
      return
    }

    const sessionToken = sessionStorage.getItem('google_access_token')
    const sessionExpiry = sessionStorage.getItem('token_expiry_time')
    const sessionKeepSignedIn = sessionStorage.getItem('keep_signed_in')

    if (sessionToken) {
      this.googleAccessToken = sessionToken
      this.keepSignedInPreference = sessionKeepSignedIn !== 'false'
      console.log('🔑 [AuthService] Google Access Token loaded from sessionStorage')

      // 만료 시간 복원 및 갱신 타이머 설정
      if (sessionExpiry) {
        this.tokenExpiryTime = parseInt(sessionExpiry, 10)
        const remainingMs = this.tokenExpiryTime - Date.now()

        if (remainingMs > 0) {
          console.log(`⏰ [AuthService] Token expires in ${Math.round(remainingMs / 1000 / 60)} minutes`)
          this.scheduleTokenRefresh(remainingMs)
        } else {
          console.warn('⚠️ [AuthService] Token already expired, will refresh on next API call')
        }
      }

      // 🔍 토큰 권한 검증 (readonly면 삭제)
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

    // 만료 시간 저장 및 갱신 타이머 설정
    if (expiresIn) {
      const expiryTime = Date.now() + (expiresIn * 1000)
      this.tokenExpiryTime = expiryTime
      storage.setItem('token_expiry_time', String(expiryTime))
      console.log(`⏰ [AuthService] Token expires at: ${new Date(expiryTime).toLocaleString()}`)

      // 토큰 갱신 타이머 설정
      this.scheduleTokenRefresh(expiresIn * 1000)
    }

    console.log(`💾 [AuthService] Google Access Token saved to ${keepSignedIn ? 'localStorage' : 'sessionStorage'}`)
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

    // 메모리 정리
    this.googleAccessToken = null
    this.tokenExpiryTime = null
    console.log('🗑️ [AuthService] Google Access Token cleared')
  }

  /**
   * 토큰 갱신 타이머 설정
   * 만료 5분 전에 갱신 필요 플래그 설정 (자동 팝업 대신)
   * 실제 갱신은 API 호출 실패 시 또는 사용자 액션 시 수행
   */
  private scheduleTokenRefresh(remainingMs: number): void {
    // 기존 타이머 취소
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
    }

    // 갱신 시점 계산 (만료 5분 전, 최소 10초 후)
    const refreshInMs = Math.max(remainingMs - TOKEN_REFRESH_BUFFER_MS, 10000)

    console.log(`🔄 [AuthService] Token will need refresh in ${Math.round(refreshInMs / 1000 / 60)} minutes (no auto-popup)`)

    this.tokenRefreshTimer = setTimeout(() => {
      console.log('⏰ [AuthService] Token refresh needed - will refresh on next API call or user action')
      // 🔧 FIX: 자동 팝업 대신 플래그만 설정
      // 실제 갱신은 getAccessToken() 호출 시 또는 API 호출 실패 시 수행
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
      console.warn('⚠️ [AuthService] Cannot refresh token: no user signed in')
      return false
    }

    // 팝업이 차단되는 환경에서는 silent 모드로 강제
    if (isPopupBlocked()) {
      silent = true
      console.log('ℹ️ [AuthService] Popup blocked environment, forcing silent mode')
    }

    // Silent 모드에서는 팝업 없이 기존 토큰 사용 시도
    if (silent) {
      console.log('🔄 [AuthService] Silent token refresh - checking current token validity...')

      // 현재 토큰이 아직 유효한지 확인
      if (this.googleAccessToken && !this.isTokenExpired()) {
        console.log('✅ [AuthService] Current token still valid')
        this.tokenRefreshNeeded = false
        return true
      }

      // 토큰이 만료된 경우 - 재로그인 필요 플래그 설정
      console.log('⚠️ [AuthService] Token expired, re-login required')
      this.tokenRefreshNeeded = true
      return false
    }

    try {
      console.log('🔄 [AuthService] Refreshing Google Access Token with popup...')

      // Firebase 재인증으로 새 OAuth 토큰 획득
      const result = await reauthenticateWithPopup(this.currentUser, googleProvider)

      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential && credential.accessToken) {
        this.googleAccessToken = credential.accessToken
        this.tokenRefreshNeeded = false

        // tokeninfo API로 만료 시간 확인
        const tokenInfo = await this.getTokenInfo(credential.accessToken)
        const expiresIn = tokenInfo?.expires_in || 3600 // 기본 1시간

        this.saveGoogleAccessToken(credential.accessToken, this.keepSignedInPreference, expiresIn)
        console.log('✅ [AuthService] Token refreshed successfully')
        return true
      } else {
        console.warn('⚠️ [AuthService] No access token in refresh result')
        return false
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Token refresh failed:', error)

      // 사용자가 팝업을 닫은 경우 - 조용히 실패, 나중에 재시도 플래그
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('ℹ️ [AuthService] User closed refresh popup')
        this.tokenRefreshNeeded = true
        return false
      }

      // 팝업 차단된 경우
      if (error.code === 'auth/popup-blocked') {
        console.log('⚠️ [AuthService] Popup blocked, marking refresh needed')
        this.tokenRefreshNeeded = true
        return false
      }

      // 인증 오류 - 재로그인 필요
      if (error.code === 'auth/user-mismatch' || error.code === 'auth/requires-recent-login') {
        console.warn('⚠️ [AuthService] Reauthentication required, signing out')
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
    console.log('🔐 [AuthService] Manual reauthentication requested')
    return this.refreshAccessToken(false) // 팝업 사용
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
      console.log(`🔑 [AuthService] Starting Google sign-in (keepSignedIn: ${keepSignedIn})...`)
      console.log(`📱 [AuthService] Environment: iOS PWA=${isIOSPWA()}, Popup blocked=${isPopupBlocked()}`)

      // 로그인 상태 유지 설정
      await setAuthPersistence(keepSignedIn)

      // iOS PWA에서는 redirect 방식 사용 (팝업이 차단됨)
      if (isPopupBlocked()) {
        console.log('🔄 [AuthService] Using signInWithRedirect (iOS PWA detected)...')

        // keepSignedIn 설정을 localStorage에 임시 저장 (redirect 후 복원용)
        localStorage.setItem('pending_keep_signed_in', String(keepSignedIn))

        // redirect 방식으로 로그인 (페이지가 이동됨)
        await signInWithRedirect(auth, googleProvider)
        // 이 이후 코드는 실행되지 않음 (페이지 이동)
        return
      }

      // 일반 브라우저에서는 팝업 방식 사용
      console.log('🔄 [AuthService] Using signInWithPopup...')
      const result = await signInWithPopup(auth, googleProvider)

      this.currentUser = result.user
      console.log('✅ [AuthService] Popup sign-in successful:', {
        email: result.user.email,
        uid: result.user.uid,
        displayName: result.user.displayName
      })

      // Google OAuth Credentials에서 Access Token 추출
      const credential = GoogleAuthProvider.credentialFromResult(result)
      if (credential && credential.accessToken) {
        this.googleAccessToken = credential.accessToken

        // tokeninfo API로 만료 시간 확인
        const tokenInfo = await this.getTokenInfo(credential.accessToken)
        const expiresIn = tokenInfo?.expires_in || 3600 // 기본 1시간

        this.saveGoogleAccessToken(credential.accessToken, keepSignedIn, expiresIn)
        console.log('✅ [AuthService] Google OAuth Access Token obtained')

        // 🔍 DEBUG: 토큰이 어떤 권한을 가지고 있는지 확인
        this.debugTokenScopes(credential.accessToken)
      } else {
        console.warn('⚠️ [AuthService] No Google Access Token in result')
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Sign-in failed:', error)

      // 사용자가 팝업을 닫은 경우
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('로그인이 취소되었습니다')
      }

      // 팝업이 차단된 경우 - redirect 방식으로 재시도
      if (error.code === 'auth/popup-blocked') {
        console.log('⚠️ [AuthService] Popup blocked, trying redirect...')
        localStorage.setItem('pending_keep_signed_in', String(keepSignedIn))
        await signInWithRedirect(auth, googleProvider)
        return
      }

      // 네트워크 오류
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
      console.log('🚪 [AuthService] Signing out...')
      await firebaseSignOut(auth)
      this.currentUser = null
      this.clearGoogleAccessToken()
      console.log('✅ [AuthService] Sign-out successful')
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
      console.log('ℹ️ [AuthService] No user signed in')
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
      console.log('ℹ️ [AuthService] No Google Access Token available')
      return null
    }

    // 토큰이 만료된 경우 - silent 갱신 시도 (팝업 없음)
    if (this.isTokenExpired()) {
      console.log('⚠️ [AuthService] Token expired, attempting silent refresh...')
      const refreshed = await this.refreshAccessToken(true) // silent mode
      if (!refreshed) {
        console.warn('⚠️ [AuthService] Silent refresh failed, token may need re-login')
        // 갱신 실패 시 null 반환하여 API 호출 시 재로그인 유도
        return null
      }
    } else if (this.isTokenExpiringSoon()) {
      // 만료 임박 시 플래그만 설정 (팝업 없음)
      console.log('ℹ️ [AuthService] Token expiring soon, marking refresh needed')
      this.tokenRefreshNeeded = true
    }

    console.log('🔑 [AuthService] Returning Google OAuth Access Token')
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
  private async verifyAndCleanupToken(accessToken: string, storageType: 'localStorage' | 'sessionStorage'): Promise<void> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
      if (!response.ok) {
        console.warn(`⚠️ [AuthService] ${storageType} 토큰 만료/검증 실패 - 토큰만 삭제 (로그인 유지)`)
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true // API 호출 시 재인증 필요 표시
        // 🔧 FIX: signOut() 호출 제거 - Firebase 세션은 유지!
        return
      }

      const tokenInfo = await response.json()
      const scope = tokenInfo.scope || ''

      // scope는 공백으로 구분된 문자열: "https://www.googleapis.com/auth/spreadsheets https://..."
      const hasFullSpreadsheets = scope.includes('auth/spreadsheets ') || scope.endsWith('auth/spreadsheets')
      const hasReadonly = scope.includes('spreadsheets.readonly')

      console.log(`🔍 [AuthService] ${storageType} 토큰 검증:`, {
        hasFullSpreadsheets,
        hasReadonly,
        scope: scope.substring(0, 200) + '...'
      })

      // readonly 권한만 있고 write 권한이 없는 경우
      if (hasReadonly && !hasFullSpreadsheets) {
        console.warn(`⚠️ [AuthService] ${storageType}에 readonly 토큰 발견 - 토큰 삭제 (로그인 유지)`)
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true
        // 🔧 FIX: signOut() 및 alert 제거 - API 호출 시 재인증 유도
      } else if (hasFullSpreadsheets) {
        console.log(`✅ [AuthService] ${storageType} 토큰에 write 권한 확인됨!`)
      } else {
        console.warn(`⚠️ [AuthService] ${storageType} 토큰에 spreadsheets 권한 없음 - 토큰 삭제 (로그인 유지)`)
        this.clearGoogleAccessToken()
        this.tokenRefreshNeeded = true
        // 🔧 FIX: signOut() 제거
      }
    } catch (error) {
      console.error(`❌ [AuthService] ${storageType} 토큰 검증 중 오류:`, error)
      // 🔧 FIX: 검증 실패해도 로그아웃하지 않음 - 토큰만 삭제
      this.clearGoogleAccessToken()
      this.tokenRefreshNeeded = true
    }
  }

  /**
   * 🔍 DEBUG: OAuth 토큰이 어떤 scope를 가지고 있는지 확인
   * Google TokenInfo API를 호출하여 실제 부여된 권한 확인
   */
  private async debugTokenScopes(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
      const tokenInfo = await response.json()

      console.log('🔍 [AuthService DEBUG] 토큰 정보:', {
        scope: tokenInfo.scope,
        expires_in: tokenInfo.expires_in,
        audience: tokenInfo.audience
      })

      // scope가 spreadsheets.readonly만 있는지 확인
      if (tokenInfo.scope && tokenInfo.scope.includes('spreadsheets.readonly')) {
        console.warn('⚠️ [AuthService DEBUG] 토큰이 readonly 권한만 보유!')
      }
      if (tokenInfo.scope && tokenInfo.scope.includes('spreadsheets') && !tokenInfo.scope.includes('.readonly')) {
        console.log('✅ [AuthService DEBUG] 토큰이 write 권한 보유!')
      }
    } catch (error) {
      console.error('❌ [AuthService DEBUG] 토큰 정보 조회 실패:', error)
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
    console.log('ℹ️ [AuthService] initialize() called (Firebase auto-initializes, no action needed)')
    return Promise.resolve()
  }

  /**
   * 레거시 호환: loadGoogleIdentityServices (Firebase는 스크립트 로딩 불필요)
   */
  loadGoogleIdentityServices(): Promise<void> {
    console.log('ℹ️ [AuthService] loadGoogleIdentityServices() called (not needed with Firebase)')
    return Promise.resolve()
  }
}

export const authService = new AuthService()
