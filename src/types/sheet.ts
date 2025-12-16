export interface SheetConfig {
  id: string
  name: string
  sheetUrl: string
  spreadsheetId: string
  tabName?: string
  createdAt: Date
  lastSynced?: Date
}

export interface SheetColumn {
  key: string
  header: string
  type: 'string' | 'number' | 'date' | 'boolean'
}
