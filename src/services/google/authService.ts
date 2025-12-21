/**
 * Firebase Authentication Service
 *
 * Google Sign-In과 인증 상태 관리를 Firebase Auth를 사용하여 처리합니다.
 * 로그인 상태 유지 옵션에 따라 localStorage 또는 sessionStorage를 사용합니다.
 */

import {
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth, googleProvider, setAuthPersistence } from '@/config/firebase'

export class AuthService {
  private currentUser: FirebaseUser | null = null
  private authStateListener: (() => void) | null = null
  private googleAccessToken: string | null = null
  private authReady: Promise<void>
  private authReadyResolve!: () => void

  constructor() {
    // Firebase Auth 초기화 완료를 기다릴 Promise 생성
    this.authReady = new Promise((resolve) => {
      this.authReadyResolve = resolve
    })

    this.initializeAuthListener()
    this.loadGoogleAccessToken()

    // iOS PWA 리디렉트 결과 처리
    this.handleRedirectResult()
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

      // 첫 콜백에서 초기화 완료 신호
      if (isFirstCall) {
        isFirstCall = false
        this.authReadyResolve()
        console.log('✅ [AuthService] Auth initialization complete')
      }
    })
  }

  /**
   * 저장된 Google Access Token 로드 및 검증
   * readonly 권한만 있는 오래된 토큰은 자동 삭제
   */
  private loadGoogleAccessToken(): void {
    // localStorage 우선, 없으면 sessionStorage 체크
    const localToken = localStorage.getItem('google_access_token')
    if (localToken) {
      this.googleAccessToken = localToken
      console.log('🔑 [AuthService] Google Access Token loaded from localStorage')

      // 🔍 토큰 권한 검증 (readonly면 삭제)
      this.verifyAndCleanupToken(localToken, 'localStorage')
      return
    }

    const sessionToken = sessionStorage.getItem('google_access_token')
    if (sessionToken) {
      this.googleAccessToken = sessionToken
      console.log('🔑 [AuthService] Google Access Token loaded from sessionStorage')

      // 🔍 토큰 권한 검증 (readonly면 삭제)
      this.verifyAndCleanupToken(sessionToken, 'sessionStorage')
      return
    }
  }

  /**
   * Google Access Token 저장
   * @param token - Google OAuth Access Token
   * @param keepSignedIn - localStorage vs sessionStorage 선택
   */
  private saveGoogleAccessToken(token: string, keepSignedIn: boolean): void {
    const storage = keepSignedIn ? localStorage : sessionStorage
    storage.setItem('google_access_token', token)

    // 반대쪽 storage에서 제거 (중복 방지)
    const otherStorage = keepSignedIn ? sessionStorage : localStorage
    otherStorage.removeItem('google_access_token')

    console.log(`💾 [AuthService] Google Access Token saved to ${keepSignedIn ? 'localStorage' : 'sessionStorage'}`)
  }

  /**
   * Google Access Token 제거
   */
  private clearGoogleAccessToken(): void {
    localStorage.removeItem('google_access_token')
    sessionStorage.removeItem('google_access_token')
    this.googleAccessToken = null
    console.log('🗑️ [AuthService] Google Access Token cleared')
  }

  /**
   * iOS PWA 리디렉트 결과 처리
   * signInWithRedirect 후 앱이 다시 로드되면 이 메서드가 결과를 처리
   */
  private async handleRedirectResult(): Promise<void> {
    try {
      console.log('🔄 [AuthService] Checking for redirect result...')
      const result = await getRedirectResult(auth)

      if (result) {
        console.log('✅ [AuthService] Redirect sign-in successful')
        this.currentUser = result.user

        // Google OAuth Credentials에서 Access Token 추출
        const credential = GoogleAuthProvider.credentialFromResult(result)

        // keepSignedIn 설정 복원
        const keepSignedInStr = localStorage.getItem('pending_signin_keep_signed_in')
        const keepSignedIn = keepSignedInStr === 'true'

        if (credential && credential.accessToken) {
          this.googleAccessToken = credential.accessToken
          this.saveGoogleAccessToken(credential.accessToken, keepSignedIn)
          console.log('✅ [AuthService] Google OAuth Access Token obtained from redirect')

          // 🔍 DEBUG: 토큰이 어떤 권한을 가지고 있는지 확인
          this.debugTokenScopes(credential.accessToken)
        } else {
          console.warn('⚠️ [AuthService] No Google Access Token in redirect result')
        }

        // keepSignedIn 설정 제거
        localStorage.removeItem('pending_signin_keep_signed_in')

        console.log('✅ [AuthService] Redirect result processed:', {
          email: this.currentUser.email,
          uid: this.currentUser.uid,
          displayName: this.currentUser.displayName
        })
      } else {
        console.log('ℹ️ [AuthService] No redirect result found (normal app start)')
      }
    } catch (error: any) {
      console.error('❌ [AuthService] Redirect result error:', error)

      // keepSignedIn 설정 제거
      localStorage.removeItem('pending_signin_keep_signed_in')

      // 리디렉트 오류는 조용히 처리 (정상 앱 시작과 구분하기 어려움)
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('ℹ️ [AuthService] Redirect cancelled by user')
      }
    }
  }

  /**
   * Google 로그인
   * @param keepSignedIn - true: localStorage (영구 보관), false: sessionStorage (세션만)
   */
  async signIn(keepSignedIn: boolean = true): Promise<void> {
    try {
      console.log(`🔑 [AuthService] Starting Google sign-in (keepSignedIn: ${keepSignedIn})...`)

      // 로그인 상태 유지 설정
      await setAuthPersistence(keepSignedIn)

      // keepSignedIn 설정 저장 (리디렉트 후에도 유지)
      localStorage.setItem('pending_signin_keep_signed_in', String(keepSignedIn))

      // 🔧 FIX: 모든 환경에서 리다이렉트 방식 사용 (COOP 경고 방지)
      // 팝업 방식은 Cross-Origin-Opener-Policy 충돌로 콘솔 경고 발생
      console.log('🔄 [AuthService] Using signInWithRedirect (COOP-safe)')
      await signInWithRedirect(auth, googleProvider)
      // 리디렉트되므로 여기서 함수 종료 (결과는 handleRedirectResult에서 처리)
      return

      // ⚠️ 팝업 방식 코드는 handleRedirectResult()에서 처리됨
    } catch (error: any) {
      console.error('❌ [AuthService] Sign-in failed:', error)

      // keepSignedIn 설정 제거 (실패 시)
      localStorage.removeItem('pending_signin_keep_signed_in')

      // 사용자가 팝업을 닫은 경우
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('로그인이 취소되었습니다')
      }

      // 네트워크 오류
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
   * Google OAuth Access Token을 반환합니다 (Firebase ID Token이 아님!)
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.googleAccessToken) {
      console.log('ℹ️ [AuthService] No Google Access Token available')
      return null
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
   * readonly 권한만 있는 오래된 토큰은 자동 삭제하고 로그아웃
   */
  private async verifyAndCleanupToken(accessToken: string, storageType: 'localStorage' | 'sessionStorage'): Promise<void> {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`)
      if (!response.ok) {
        console.warn(`⚠️ [AuthService] ${storageType} 토큰 검증 실패, 삭제 처리`)
        this.clearGoogleAccessToken()
        await this.signOut()
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
        console.warn(`⚠️ [AuthService] ${storageType}에 readonly 토큰 발견! 자동 삭제 및 로그아웃`)
        this.clearGoogleAccessToken()
        await this.signOut()
        // 사용자에게 재로그인 필요 알림
        alert('Google Sheets 권한이 업데이트되었습니다.\n다시 로그인하여 새로운 권한을 부여해주세요.')
      } else if (hasFullSpreadsheets) {
        console.log(`✅ [AuthService] ${storageType} 토큰에 write 권한 확인됨!`)
      } else {
        console.warn(`⚠️ [AuthService] ${storageType} 토큰에 spreadsheets 권한 없음!`)
        this.clearGoogleAccessToken()
        await this.signOut()
      }
    } catch (error) {
      console.error(`❌ [AuthService] ${storageType} 토큰 검증 중 오류:`, error)
      // 검증 실패 시 안전을 위해 토큰 삭제
      this.clearGoogleAccessToken()
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
    if (this.authStateListener) {
      this.authStateListener()
      this.authStateListener = null
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
