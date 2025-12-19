export interface SheetConfig {
  id: string
  name: string
  sheetUrl: string
  spreadsheetId: string
  tabName?: string
  gid?: string  // Google Sheets 탭 ID (URL의 gid 파라미터)
  sheetType?: 'rental' | 'sale' // 시트 타입: 임대차현황 or 매도현황
  createdAt: Date
  lastSynced?: Date
}

export interface SheetColumn {
  key: string
  header: string
  type: 'string' | 'number' | 'date' | 'boolean'
}
