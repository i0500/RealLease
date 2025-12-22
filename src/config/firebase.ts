/**
 * Firebase Configuration
 *
 * Firebase 초기화 및 Auth 설정
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  type Auth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence
} from 'firebase/auth'

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

// Initialize Firebase
let app: FirebaseApp
let auth: Auth
let googleProvider: GoogleAuthProvider

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  googleProvider = new GoogleAuthProvider()

  googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets')
  googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email')
  googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile')

  googleProvider.setCustomParameters({
    prompt: 'select_account'
  })
} catch (error) {
  console.error('❌ [Firebase] Failed to initialize Firebase:', error)
  throw error
}

/**
 * iOS PWA 환경 감지
 */
function isIOSPWA(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
  const isStandalone = (window.navigator as any).standalone === true
  return isIOS && isStandalone
}

/**
 * Set authentication persistence
 * @param keepSignedIn - true: localStorage (persist), false: sessionStorage (session only)
 *
 * iOS PWA에서는 indexedDBLocalPersistence 사용 권장 (더 안정적)
 */
export async function setAuthPersistence(keepSignedIn: boolean): Promise<void> {
  // iOS PWA에서는 indexedDB가 더 안정적
  let persistence
  if (keepSignedIn) {
    persistence = isIOSPWA() ? indexedDBLocalPersistence : browserLocalPersistence
  } else {
    persistence = browserSessionPersistence
  }

  try {
    await setPersistence(auth, persistence)
  } catch (error) {
    console.error('❌ [Firebase] Failed to set persistence:', error)
    if (isIOSPWA()) {
      try {
        await setPersistence(auth, browserLocalPersistence)
      } catch (fallbackError) {
        console.error('❌ [Firebase] Fallback persistence also failed:', fallbackError)
        throw fallbackError
      }
    } else {
      throw error
    }
  }
}

export { app, auth, googleProvider }
export default { app, auth, googleProvider, setAuthPersistence }
