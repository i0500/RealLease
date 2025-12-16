export * from './sheet'
export * from './contract'
export * from './notification'

export interface User {
  email: string
  name?: string
  picture?: string
}

export interface AppConfig {
  googleClientId: string
  appName: string
  version: string
}
