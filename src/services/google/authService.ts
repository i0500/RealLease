/**
 * Firebase Authentication Service
 *
 * Google Sign-In과 인증 상태 관리를 Firebase Auth를 사용하여 처리합니다.
 * 로그인 상태 유지 옵션에 따라 localStorage 또는 sessionStorage를 사용합니다.
 */

import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser
} from 'firebase/auth'
import { auth, googleProvider, setAuthPersistence } from '@/config/firebase'

export class AuthService {
  private currentUser: FirebaseUser | null = null
  private authStateListener: (() => void) | null = null

  constructor() {
    this.initializeAuthListener()
  }

  /**
   * 인증 상태 변경 리스너 초기화
   * Firebase가 자동으로 토큰을 갱신하고 세션을 유지합니다
   */
  private initializeAuthListener(): void {
    console.log('🔐 [AuthService] Initializing auth state listener...')

    this.authStateListener = onAuthStateChanged(auth, (user) => {
      this.currentUser = user

      if (user) {
        console.log('✅ [AuthService] User signed in:', {
          email: user.email,
          uid: user.uid,
          displayName: user.displayName
        })
      } else {
        console.log('🚪 [AuthService] User signed out')
      }
    })
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

      // Google Sign-In 팝업
      const result = await signInWithPopup(auth, googleProvider)
      this.currentUser = result.user

      console.log('✅ [AuthService] Sign-in successful:', {
        email: this.currentUser.email,
        uid: this.currentUser.uid,
        displayName: this.currentUser.displayName
      })
    } catch (error: any) {
      console.error('❌ [AuthService] Sign-in failed:', error)

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
   * Firebase는 자동으로 토큰을 갱신하므로 항상 유효한 토큰을 반환합니다
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.currentUser) {
      console.log('ℹ️ [AuthService] No user signed in, cannot get access token')
      return null
    }

    try {
      // Firebase ID 토큰 가져오기 (자동 갱신됨)
      const idToken = await this.currentUser.getIdToken()
      console.log('🔑 [AuthService] Access token retrieved')
      return idToken
    } catch (error) {
      console.error('❌ [AuthService] Failed to get access token:', error)
      return null
    }
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
