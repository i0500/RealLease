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
  browserSessionPersistence
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
 * Set authentication persistence
 * @param keepSignedIn - true: localStorage (persist), false: sessionStorage (session only)
 */
export async function setAuthPersistence(keepSignedIn: boolean): Promise<void> {
  const persistence = keepSignedIn ? browserLocalPersistence : browserSessionPersistence

  try {
    await setPersistence(auth, persistence)
  } catch (error) {
    console.error('❌ [Firebase] Failed to set persistence:', error)
    throw error
  }
}

export { app, auth, googleProvider }
export default { app, auth, googleProvider, setAuthPersistence }
