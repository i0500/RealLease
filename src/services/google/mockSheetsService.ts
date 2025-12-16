// Mock Sheets Service for Development Mode
// 개발 모드에서 Google Sheets API 대신 사용되는 목(mock) 서비스

export interface SheetRange {
  range: string
  majorDimension?: 'ROWS' | 'COLUMNS'
  values?: any[][]
}

// 로컬 스토리지에 데이터 저장
const STORAGE_KEY = 'mock_sheets_data'

interface MockSheet {
  id: string
  name: string
  properties: {
    title: string
    sheetId: number
    index: number
  }
  data: any[][]
}

interface MockSpreadsheet {
  spreadsheetId: string
  properties: {
    title: string
  }
  sheets: MockSheet[]
}

class MockSheetsStorage {
  private spreadsheets: Map<string, MockSpreadsheet> = new Map()

  constructor() {
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data)
        this.spreadsheets = new Map(Object.entries(parsed))
      }
    } catch (error) {
      console.error('Failed to load mock sheets data:', error)
    }
  }

  private saveToStorage() {
    try {
      const data = Object.fromEntries(this.spreadsheets)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save mock sheets data:', error)
    }
  }

  getSpreadsheet(spreadsheetId: string): MockSpreadsheet | undefined {
    return this.spreadsheets.get(spreadsheetId)
  }

  createSpreadsheet(spreadsheetId: string, title: string): MockSpreadsheet {
    const spreadsheet: MockSpreadsheet = {
      spreadsheetId,
      properties: { title },
      sheets: [
        {
          id: 'sheet1',
          name: '임대차현황',
          properties: {
            title: '임대차현황',
            sheetId: 0,
            index: 0
          },
          data: this.getDefaultSheetData()
        }
      ]
    }
    this.spreadsheets.set(spreadsheetId, spreadsheet)
    this.saveToStorage()
    return spreadsheet
  }

  private getDefaultSheetData(): any[][] {
    return [
      // 헤더 행
      [
        'ID', '임차인명', '전화번호', '이메일', '주민등록번호',
        '주소', '물건유형', '호수',
        '계약유형', '보증금', '월세',
        '계약시작일', '계약종료일', '계약상태', '계약구분',
        'HUG보증', 'HUG시작일', 'HUG종료일', 'HUG보증금액', 'HUG보험번호',
        '중개사명', '중개사전화', '중개사주소', '중개수수료',
        '생성일', '수정일', '삭제일'
      ],
      // 샘플 데이터 1
      [
        'contract-001',
        '홍길동',
        '010-1234-5678',
        'hong@example.com',
        '900101-1******',
        '서울시 강남구 테헤란로 123',
        '아파트',
        '101동 1501호',
        '월세',
        '10000',
        '50',
        '2024-01-01',
        '2026-01-01',
        'active',
        'new',
        'Y',
        '2024-01-01',
        '2026-01-01',
        '10000',
        'HUG-2024-001',
        '행복공인중개사',
        '02-1234-5678',
        '서울시 강남구 역삼동',
        '500',
        '2024-01-01',
        '2024-01-01',
        ''
      ],
      // 샘플 데이터 2
      [
        'contract-002',
        '김철수',
        '010-9876-5432',
        'kim@example.com',
        '850505-1******',
        '서울시 서초구 반포대로 456',
        '오피스텔',
        '302호',
        '전세',
        '30000',
        '',
        '2024-03-01',
        '2026-03-01',
        'active',
        'new',
        'N',
        '',
        '',
        '',
        '',
        '믿음공인중개사',
        '02-9876-5432',
        '서울시 서초구 서초동',
        '800',
        '2024-03-01',
        '2024-03-01',
        ''
      ]
    ]
  }

  updateSpreadsheet(spreadsheetId: string, spreadsheet: MockSpreadsheet) {
    this.spreadsheets.set(spreadsheetId, spreadsheet)
    this.saveToStorage()
  }

  deleteSpreadsheet(spreadsheetId: string) {
    this.spreadsheets.delete(spreadsheetId)
    this.saveToStorage()
  }
}

export class MockSheetsService {
  private storage = new MockSheetsStorage()

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    await this.delay(300) // 네트워크 지연 시뮬레이션

    let spreadsheet = this.storage.getSpreadsheet(spreadsheetId)

    if (!spreadsheet) {
      // 스프레드시트가 없으면 자동 생성
      const title = `Mock Spreadsheet ${spreadsheetId.slice(0, 8)}`
      spreadsheet = this.storage.createSpreadsheet(spreadsheetId, title)
    }

    return {
      spreadsheetId: spreadsheet.spreadsheetId,
      properties: spreadsheet.properties,
      sheets: spreadsheet.sheets.map(sheet => ({
        properties: sheet.properties
      }))
    }
  }

  async readRange(spreadsheetId: string, range: string): Promise<any[][]> {
    await this.delay(200)

    const spreadsheet = this.storage.getSpreadsheet(spreadsheetId)
    if (!spreadsheet) {
      return []
    }

    // range에서 시트 이름 추출 (예: "임대차현황!A1:Z1000" -> "임대차현황")
    const sheetName = range.includes('!') ? range.split('!')[0] : spreadsheet.sheets[0]?.name

    const sheet = spreadsheet.sheets.find(s => s.name === sheetName) || spreadsheet.sheets[0]
    if (!sheet) {
      return []
    }

    return sheet.data || []
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][],
    _valueInputOption?: 'RAW' | 'USER_ENTERED'
  ): Promise<any> {
    await this.delay(250)

    const spreadsheet = this.storage.getSpreadsheet(spreadsheetId)
    if (!spreadsheet) {
      throw new Error('Spreadsheet not found')
    }

    const sheetName = range.includes('!') ? range.split('!')[0] : spreadsheet.sheets[0]?.name
    const sheet = spreadsheet.sheets.find(s => s.name === sheetName)

    if (sheet) {
      // 범위 파싱 (간단히 전체 데이터로 대체)
      sheet.data = values
      this.storage.updateSpreadsheet(spreadsheetId, spreadsheet)
    }

    return {
      spreadsheetId,
      updatedRange: range,
      updatedRows: values.length,
      updatedColumns: values[0]?.length || 0,
      updatedCells: values.length * (values[0]?.length || 0)
    }
  }

  async appendRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    await this.delay(250)

    const spreadsheet = this.storage.getSpreadsheet(spreadsheetId)
    if (!spreadsheet) {
      throw new Error('Spreadsheet not found')
    }

    const sheetName = range.includes('!') ? range.split('!')[0] : spreadsheet.sheets[0]?.name
    const sheet = spreadsheet.sheets.find(s => s.name === sheetName)

    if (sheet) {
      sheet.data.push(values)
      this.storage.updateSpreadsheet(spreadsheetId, spreadsheet)
    }

    return {
      spreadsheetId,
      tableRange: range,
      updates: {
        spreadsheetId,
        updatedRange: `${sheetName}!A${sheet!.data.length}`,
        updatedRows: 1,
        updatedColumns: values.length,
        updatedCells: values.length
      }
    }
  }

  async updateRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    return this.writeRange(spreadsheetId, range, [values], valueInputOption)
  }

  async batchUpdate(spreadsheetId: string, requests: any[]): Promise<any> {
    await this.delay(300)

    console.log('Mock batch update:', requests)

    return {
      spreadsheetId,
      replies: requests.map(() => ({}))
    }
  }

  async getSheetNames(spreadsheetId: string): Promise<string[]> {
    const metadata = await this.getSpreadsheetMetadata(spreadsheetId)
    return metadata.sheets?.map((sheet: any) => sheet.properties.title) || []
  }

  async clearRange(spreadsheetId: string, range: string): Promise<any> {
    await this.delay(200)

    const spreadsheet = this.storage.getSpreadsheet(spreadsheetId)
    if (!spreadsheet) {
      throw new Error('Spreadsheet not found')
    }

    const sheetName = range.includes('!') ? range.split('!')[0] : spreadsheet.sheets[0]?.name
    const sheet = spreadsheet.sheets.find(s => s.name === sheetName)

    if (sheet) {
      // 헤더는 유지하고 나머지만 삭제
      sheet.data = sheet.data.slice(0, 1)
      this.storage.updateSpreadsheet(spreadsheetId, spreadsheet)
    }

    return {
      spreadsheetId,
      clearedRange: range
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const mockSheetsService = new MockSheetsService()
