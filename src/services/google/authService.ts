import { GOOGLE_SCOPES } from '@/utils/constants'

declare global {
  interface Window {
    google: any
  }
}

export class AuthService {
  private tokenClient: any = null
  private accessToken: string | null = null

  async initialize(clientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.google) {
        reject(new Error('Google Identity Services not loaded'))
        return
      }

      try {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GOOGLE_SCOPES.join(' '),
          callback: (response: any) => {
            if (response.error) {
              console.error('Auth error:', response.error)
              return
            }
            this.accessToken = response.access_token
            this.saveToken(response.access_token)
          }
        })
        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  async signIn(): Promise<void> {
    if (!this.tokenClient) {
      throw new Error('Auth service not initialized')
    }

    return new Promise((resolve, reject) => {
      try {
        // 기존 토큰 확인
        const existingToken = this.getToken()
        if (existingToken) {
          this.accessToken = existingToken
          resolve()
          return
        }

        // 새로운 토큰 요청
        this.tokenClient.callback = (response: any) => {
          if (response.error) {
            reject(new Error(response.error))
            return
          }
          this.accessToken = response.access_token
          this.saveToken(response.access_token)
          resolve()
        }

        this.tokenClient.requestAccessToken()
      } catch (error) {
        reject(error)
      }
    })
  }

  async signOut(): Promise<void> {
    const token = this.getToken()
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token, () => {
        console.log('Token revoked')
      })
    }
    this.clearToken()
    this.accessToken = null
  }

  getAccessToken(): string | null {
    return this.accessToken || this.getToken()
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken()
  }

  private saveToken(token: string): void {
    localStorage.setItem('google_access_token', token)
    localStorage.setItem('token_timestamp', Date.now().toString())
  }

  private getToken(): string | null {
    const token = localStorage.getItem('google_access_token')
    const timestamp = localStorage.getItem('token_timestamp')

    // 토큰이 1시간 이상 경과했으면 무효화
    if (token && timestamp) {
      const elapsed = Date.now() - parseInt(timestamp)
      const oneHour = 60 * 60 * 1000
      if (elapsed > oneHour) {
        this.clearToken()
        return null
      }
    }

    return token
  }

  private clearToken(): void {
    localStorage.removeItem('google_access_token')
    localStorage.removeItem('token_timestamp')
  }

  loadGoogleIdentityServices(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google) {
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
      document.head.appendChild(script)
    })
  }
}

export const authService = new AuthService()
