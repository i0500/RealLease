import { authService } from './authService'
import { mockSheetsService } from './mockSheetsService'
import { TokenExpiredError } from '@/errors/TokenExpiredError'

export interface SheetRange {
  range: string
  majorDimension?: 'ROWS' | 'COLUMNS'
  values?: any[][]
}

export class SheetsService {
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'

  private isDevMode(): boolean {
    // Mock 데이터 사용 안함 - 항상 실제 Google Sheets 사용
    return false
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = authService.getAccessToken()
    if (!token) {
      console.warn('⚠️ [SheetsService] OAuth 토큰 없음, 자동 로그아웃 처리')
      await authService.signOut()
      throw new TokenExpiredError()
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
      const error = await response.json().catch(() => ({}))

      // 401 Unauthorized - 토큰 만료
      if (response.status === 401) {
        console.warn('⚠️ [SheetsService] 401 Unauthorized, 자동 로그아웃 처리')
        await authService.signOut()
        throw new TokenExpiredError()
      }

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

  async readRange(spreadsheetId: string, range: string, gid?: string): Promise<any[][]> {
    console.log('📖 [SheetsService.readRange] 시작', {
      spreadsheetId,
      range,
      gid: gid || 'auto-detect',
      devMode: this.isDevMode(),
      timestamp: new Date().toISOString()
    })

    if (this.isDevMode()) {
      console.log('🔧 [SheetsService.readRange] 개발 모드: Mock Service 사용')
      return mockSheetsService.readRange(spreadsheetId, range)
    }

    console.log('🌐 [SheetsService.readRange] 실제 Google Sheets 접근 시도')

    try {
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}`
      console.log('🔐 [SheetsService.readRange] OAuth 인증 시도:', url)

      const response = await this.fetchWithAuth(url)
      const data = await response.json()

      console.log('✅ [SheetsService.readRange] OAuth 성공:', {
        rowCount: data.values?.length || 0,
        columnCount: data.values?.[0]?.length || 0
      })

      return data.values || []
    } catch (error) {
      console.warn('⚠️ [SheetsService.readRange] OAuth 인증 실패, 공개 시트 접근 시도:', error)

      // gid가 지정되지 않았으면 자동 탐색
      if (!gid) {
        console.log('🔍 [SheetsService.readRange] gid 미지정 - 자동 탭 탐색 시작')
        return this.autoDetectAndReadSheet(spreadsheetId, range)
      }

      // OAuth 실패 시 공개 시트로 접근 시도
      return this.readPublicSheet(spreadsheetId, range, gid)
    }
  }

  private async autoDetectAndReadSheet(spreadsheetId: string, range: string): Promise<any[][]> {
    console.log('🔎 [SheetsService.autoDetectAndReadSheet] 자동 탭 탐색 시작')

    // gid 0부터 10까지 시도
    for (let gid = 0; gid <= 10; gid++) {
      try {
        console.log(`🔍 [SheetsService.autoDetectAndReadSheet] gid=${gid} 시도 중...`)
        const data = await this.readPublicSheet(spreadsheetId, range, gid.toString())

        // 데이터가 있으면 성공
        if (data && data.length > 0) {
          console.log(`✅ [SheetsService.autoDetectAndReadSheet] gid=${gid}에서 데이터 발견!`, {
            rows: data.length,
            columns: data[0]?.length || 0
          })
          return data
        }
      } catch (error) {
        console.log(`⏭️ [SheetsService.autoDetectAndReadSheet] gid=${gid} 실패, 다음 시도...`)
        continue
      }
    }

    console.error('❌ [SheetsService.autoDetectAndReadSheet] 모든 gid 시도 실패')
    throw new Error('시트 데이터를 찾을 수 없습니다. 시트가 "링크가 있는 모든 사용자" 권한으로 공유되어 있는지 확인해주세요.')
  }

  private async readPublicSheet(spreadsheetId: string, _range: string, gid?: string): Promise<any[][]> {
    const targetGid = gid || '0'

    console.log('🌍 [SheetsService.readPublicSheet] 공개 시트 접근 시작', {
      spreadsheetId,
      gid: targetGid,
      timestamp: new Date().toISOString()
    })

    try {
      // Google Sheets CSV export URL 사용 (공개 시트만 가능)
      // gid 파라미터로 특정 탭 지정
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${targetGid}`

      console.log('🔗 [SheetsService.readPublicSheet] CSV Export URL:', csvUrl)

      const response = await fetch(csvUrl)

      console.log('📡 [SheetsService.readPublicSheet] HTTP 응답:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type')
      })

      if (!response.ok) {
        console.error('❌ [SheetsService.readPublicSheet] 시트 응답 오류:', {
          status: response.status,
          statusText: response.statusText
        })
        throw new Error('시트 접근 불가 - 시트가 공개 상태인지 확인해주세요')
      }

      const csvText = await response.text()
      console.log('📄 [SheetsService.readPublicSheet] CSV 데이터 수신 완료:', {
        length: csvText.length,
        preview: csvText.substring(0, 200),
        lines: csvText.split('\n').length
      })

      if (!csvText || csvText.trim().length === 0) {
        console.warn('⚠️ [SheetsService.readPublicSheet] 빈 CSV 데이터')
        return []
      }

      // CSV를 2차원 배열로 변환 (RFC 4180 준수)
      console.log('🔄 [SheetsService.readPublicSheet] CSV 파싱 시작...')
      const rows = this.parseCSV(csvText)

      console.log('✅ [SheetsService.readPublicSheet] CSV 파싱 완료:', {
        totalRows: rows.length,
        headerRow: rows[0],
        sampleRows: rows.slice(1, 3),
        columnsCount: rows[0]?.length || 0
      })

      return rows
    } catch (error) {
      console.error('❌ [SheetsService.readPublicSheet] 공개 시트 접근 실패:', error)
      throw new Error('시트 데이터를 불러올 수 없습니다. 시트가 "링크가 있는 모든 사용자" 권한으로 공유되어 있는지 확인해주세요.')
    }
  }

  private parseCSV(csvText: string): any[][] {
    const rows: any[][] = []
    const lines = csvText.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue // 빈 줄 건너뛰기

      const row: string[] = []
      let cell = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // 이스케이프된 따옴표 ("")
            cell += '"'
            i++ // 다음 따옴표 건너뛰기
          } else {
            // 따옴표 토글
            inQuotes = !inQuotes
          }
        } else if (char === ',' && !inQuotes) {
          // 셀 구분자
          row.push(cell.trim())
          cell = ''
        } else {
          cell += char
        }
      }

      // 마지막 셀 추가
      row.push(cell.trim())
      rows.push(row)
    }

    return rows
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
