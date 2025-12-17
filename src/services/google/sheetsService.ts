import { authService } from './authService'
import { mockSheetsService } from './mockSheetsService'

export interface SheetRange {
  range: string
  majorDimension?: 'ROWS' | 'COLUMNS'
  values?: any[][]
}

export class SheetsService {
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'

  private isDevMode(): boolean {
    return import.meta.env.VITE_DEV_MODE === 'true'
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = authService.getAccessToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Sheets API error')
    }

    return response
  }

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.getSpreadsheetMetadata(spreadsheetId)
    }

    try {
      const url = `${this.baseUrl}/${spreadsheetId}`
      const response = await this.fetchWithAuth(url)
      return response.json()
    } catch (error) {
      console.warn('OAuth 인증 실패, 공개 시트 메타데이터 접근 시도:', error)
      // OAuth 실패 시 기본 메타데이터 반환 (공개 시트는 metadata API 사용 불가)
      return {
        spreadsheetId,
        properties: {
          title: 'Public Sheet'
        },
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: 'Sheet1',
              index: 0
            }
          }
        ]
      }
    }
  }

  async readRange(spreadsheetId: string, range: string): Promise<any[][]> {
    if (this.isDevMode()) {
      return mockSheetsService.readRange(spreadsheetId, range)
    }

    try {
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`
      const response = await this.fetchWithAuth(url)
      const data = await response.json()
      return data.values || []
    } catch (error) {
      console.warn('OAuth 인증 실패, 공개 시트 접근 시도:', error)
      // OAuth 실패 시 공개 시트로 접근 시도
      return this.readPublicSheet(spreadsheetId, range)
    }
  }

  private async readPublicSheet(spreadsheetId: string, _range: string): Promise<any[][]> {
    try {
      // Google Sheets CSV export URL 사용 (공개 시트만 가능)
      // 기본적으로 첫 번째 시트(gid=0)를 사용
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=0`

      const response = await fetch(csvUrl)
      if (!response.ok) {
        throw new Error('시트 접근 불가 - 시트가 공개 상태인지 확인해주세요')
      }

      const csvText = await response.text()
      // CSV를 2차원 배열로 변환
      const rows = csvText.trim().split('\n').map(row => {
        // CSV 파싱 (간단한 구현)
        return row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
      })

      return rows
    } catch (error) {
      console.error('공개 시트 접근 실패:', error)
      throw new Error('시트 데이터를 불러올 수 없습니다. 시트가 "링크가 있는 모든 사용자" 권한으로 공유되어 있는지 확인해주세요.')
    }
  }

  async writeRange(
    spreadsheetId: string,
    range: string,
    values: any[][],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.writeRange(spreadsheetId, range, values, valueInputOption)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`
    const response = await this.fetchWithAuth(url, {
      method: 'PUT',
      body: JSON.stringify({ values })
    })
    return response.json()
  }

  async appendRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.appendRow(spreadsheetId, range, values, valueInputOption)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ values: [values] })
    })
    return response.json()
  }

  async updateRow(
    spreadsheetId: string,
    range: string,
    values: any[],
    valueInputOption: 'RAW' | 'USER_ENTERED' = 'USER_ENTERED'
  ): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.updateRow(spreadsheetId, range, values, valueInputOption)
    }

    return this.writeRange(spreadsheetId, range, [values], valueInputOption)
  }

  async batchUpdate(spreadsheetId: string, requests: any[]): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.batchUpdate(spreadsheetId, requests)
    }

    const url = `${this.baseUrl}/${spreadsheetId}:batchUpdate`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify({ requests })
    })
    return response.json()
  }

  async getSheetNames(spreadsheetId: string): Promise<string[]> {
    if (this.isDevMode()) {
      return mockSheetsService.getSheetNames(spreadsheetId)
    }

    const metadata = await this.getSpreadsheetMetadata(spreadsheetId)
    return metadata.sheets?.map((sheet: any) => sheet.properties.title) || []
  }

  async clearRange(spreadsheetId: string, range: string): Promise<any> {
    if (this.isDevMode()) {
      return mockSheetsService.clearRange(spreadsheetId, range)
    }

    const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`
    const response = await this.fetchWithAuth(url, {
      method: 'POST'
    })
    return response.json()
  }
}

export const sheetsService = new SheetsService()
