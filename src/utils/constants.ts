export const APP_NAME = 'RealLease'
export const APP_VERSION = '1.0.0'

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly'
]

export const NOTIFICATION_THRESHOLD_DAYS = 90

export const CONTRACT_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  TERMINATED: 'terminated'
} as const

export const CONTRACT_TYPE = {
  JEONSE: 'jeonse',
  WOLSE: 'wolse'
} as const

export const CONTRACT_CATEGORY = {
  NEW: 'new',
  RENEWAL: 'renewal',
  CHANGE: 'change'
} as const

export const NOTIFICATION_TYPE = {
  CONTRACT_EXPIRING: 'contract_expiring',
  HUG_EXPIRING: 'hug_expiring'
} as const

export const NOTIFICATION_PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
} as const
