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
    const token = await authService.getAccessToken()
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

      // 403 Forbidden - 토큰 만료 또는 권한 부족
      if (response.status === 403) {
        const errorMessage = error.error?.message || ''
        if (errorMessage.includes('insufficient authentication scopes') ||
            errorMessage.includes('Request had insufficient')) {
          console.warn('⚠️ [SheetsService] 403 토큰 만료/권한 부족, 자동 로그아웃 처리')
          console.warn('   Error:', errorMessage)
          await authService.signOut()
          throw new TokenExpiredError()
        }
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

      // gid가 지정되지 않았으면 range에서 tabName 추출 시도
      if (!gid) {
        console.log('🔍 [SheetsService.readRange] gid 미지정 - range에서 tabName 추출 시도')

        // range에서 tabName 추출 (예: "현재현황!A1:Z1000" → "현재현황")
        const tabNameMatch = range.match(/^([^!]+)!/)
        if (tabNameMatch) {
          const tabName = tabNameMatch[1]
          console.log('📋 [SheetsService.readRange] range에서 tabName 추출:', tabName)

          try {
            // metadata에서 tabName에 해당하는 gid 찾기
            const metadata = await this.getSpreadsheetMetadata(spreadsheetId)
            if (metadata.sheets && metadata.sheets.length > 0) {
              const matchedSheet = metadata.sheets.find(
                (s: any) => s.properties?.title?.includes(tabName)
              )

              if (matchedSheet) {
                const foundGid = matchedSheet.properties?.sheetId?.toString()
                console.log('✅ [SheetsService.readRange] tabName 일치하는 시트 발견:', {
                  tabName,
                  title: matchedSheet.properties?.title,
                  gid: foundGid
                })

                // 찾은 gid로 공개 시트 읽기
                return this.readPublicSheet(spreadsheetId, range, foundGid)
              } else {
                console.warn('⚠️ [SheetsService.readRange] tabName과 일치하는 시트를 찾을 수 없음:', tabName)
                console.log('📋 [SheetsService.readRange] 사용 가능한 시트 목록:',
                  metadata.sheets.map((s: any) => ({
                    title: s.properties?.title,
                    gid: s.properties?.sheetId
                  }))
                )
              }
            }
          } catch (metadataError) {
            console.warn('⚠️ [SheetsService.readRange] metadata 조회 실패:', metadataError)
          }
        }

        // tabName을 찾지 못했으면 자동 탐색 (fallback)
        console.log('🔍 [SheetsService.readRange] tabName을 찾지 못함 - 자동 탭 탐색 시작')
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

  /**
   * 시트에서 특정 행 삭제
   * @param spreadsheetId - 스프레드시트 ID
   * @param gid - 시트 GID
   * @param rowIndex - 삭제할 행 번호 (1-based, 헤더=1)
   */
  async deleteRow(spreadsheetId: string, gid: string, rowIndex: number): Promise<any> {
    console.log(`🗑️ [SheetsService.deleteRow] 행 삭제: {spreadsheetId: ${spreadsheetId}, gid: ${gid}, rowIndex: ${rowIndex}}`)

    if (this.isDevMode()) {
      console.log('📝 [SheetsService.deleteRow] Dev mode - 삭제 시뮬레이션')
      return Promise.resolve({})
    }

    // Google Sheets API는 0-based index 사용
    // rowIndex가 1이면 첫 번째 행 (헤더)
    // 실제 데이터 행을 삭제하려면 rowIndex - 1을 startIndex로 사용
    const requests = [
      {
        deleteDimension: {
          range: {
            sheetId: parseInt(gid),
            dimension: 'ROWS',
            startIndex: rowIndex - 1, // 0-based index
            endIndex: rowIndex // exclusive (삭제할 행의 다음 행)
          }
        }
      }
    ]

    return this.batchUpdate(spreadsheetId, requests)
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

  /**
   * 새로운 스프레드시트 생성
   * @param title - 스프레드시트 제목 (현장명)
   * @param createRental - 임대차 현황 탭 생성 여부
   * @param createSale - 매도 현황 탭 생성 여부
   * @returns 생성된 스프레드시트 정보
   */
  async createSpreadsheet(
    title: string,
    createRental: boolean = true,
    createSale: boolean = false
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string; sheets: Array<{ title: string; gid: string }> }> {
    console.log('📝 [SheetsService.createSpreadsheet] 새 스프레드시트 생성 시작:', { title, createRental, createSale })

    // 생성할 시트 목록
    const sheetsToCreate: any[] = []
    let sheetIndex = 0

    if (createRental) {
      sheetsToCreate.push({
        properties: {
          sheetId: sheetIndex,
          title: '임대차현황',
          index: sheetIndex,
          gridProperties: {
            rowCount: 1000,
            columnCount: 26,
            frozenRowCount: 1
          }
        }
      })
      sheetIndex++
    }

    if (createSale) {
      sheetsToCreate.push({
        properties: {
          sheetId: sheetIndex,
          title: '매도현황',
          index: sheetIndex,
          gridProperties: {
            rowCount: 500,
            columnCount: 22,
            frozenRowCount: 1
          }
        }
      })
      sheetIndex++
    }

    // 스프레드시트 생성 요청
    const createRequest = {
      properties: {
        title: `[RealLease] ${title}`,
        locale: 'ko_KR',
        timeZone: 'Asia/Seoul'
      },
      sheets: sheetsToCreate
    }

    const response = await this.fetchWithAuth(this.baseUrl, {
      method: 'POST',
      body: JSON.stringify(createRequest)
    })

    const result = await response.json()
    const spreadsheetId = result.spreadsheetId
    const spreadsheetUrl = result.spreadsheetUrl

    console.log('✅ [SheetsService.createSpreadsheet] 스프레드시트 생성 완료:', { spreadsheetId, spreadsheetUrl })

    // 각 시트에 헤더 및 스타일 적용
    const createdSheets: Array<{ title: string; gid: string }> = []

    for (const sheet of result.sheets) {
      const sheetTitle = sheet.properties.title
      const sheetId = sheet.properties.sheetId.toString()
      createdSheets.push({ title: sheetTitle, gid: sheetId })

      if (sheetTitle === '임대차현황') {
        await this.setupRentalSheetTemplate(spreadsheetId, parseInt(sheetId))
      } else if (sheetTitle === '매도현황') {
        await this.setupSaleSheetTemplate(spreadsheetId, parseInt(sheetId))
      }
    }

    console.log('✅ [SheetsService.createSpreadsheet] 템플릿 적용 완료')

    return { spreadsheetId, spreadsheetUrl, sheets: createdSheets }
  }

  /**
   * 임대차 현황 시트 템플릿 설정
   */
  private async setupRentalSheetTemplate(spreadsheetId: string, sheetId: number): Promise<void> {
    console.log('🏠 [SheetsService] 임대차 현황 템플릿 적용 중...')

    // 헤더 데이터 (A열은 공란, B열부터 시작)
    const headers = [
      ['', '번호', '동', '호수', '계약자', '연락처', '연락처2', '계약유형', '주민번호',
       '전용면적', '공급면적', '임대보증금', '월세', '계약서작성일', '시작일', '종료일',
       '실제퇴거일', '계약기간', '보증보험시작', '보증보험종료', '비고1', '비고2', '비고3', '비고4', '기타사항']
    ]

    // 헤더 쓰기
    await this.writeRange(spreadsheetId, '임대차현황!A1:Y1', headers)

    // 스타일 적용 (batchUpdate)
    const styleRequests = [
      // 헤더 행 배경색 (연한 파랑)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 25 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.8, green: 0.9, blue: 1.0 },
              textFormat: { bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                bottom: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                left: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                right: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      },
      // 열 너비 설정
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },  // A열 (공란)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 50 }, fields: 'pixelSize' } },  // B열 (번호)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } },  // C열 (동)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } },  // D열 (호수)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // E열 (계약자)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // F열 (연락처)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // G열 (연락처2)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // H열 (계약유형)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // I열 (주민번호)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } }, // J열 (전용면적)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },// K열 (공급면적)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },// L열 (임대보증금)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 12, endIndex: 13 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // M열 (월세)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 13, endIndex: 14 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },// N열 (계약서작성일)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }, // O열 (시작일)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 15, endIndex: 16 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }, // P열 (종료일)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 16, endIndex: 17 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }, // Q열 (실제퇴거일)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 17, endIndex: 18 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } }, // R열 (계약기간)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 18, endIndex: 19 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },// S열 (보증보험시작)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 19, endIndex: 20 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } },// T열 (보증보험종료)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 20, endIndex: 25 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } } // U-Y열 (비고)
    ]

    await this.batchUpdate(spreadsheetId, styleRequests)
    console.log('✅ [SheetsService] 임대차 현황 템플릿 적용 완료')
  }

  /**
   * 매도 현황 시트 템플릿 설정
   */
  private async setupSaleSheetTemplate(spreadsheetId: string, sheetId: number): Promise<void> {
    console.log('🏢 [SheetsService] 매도 현황 템플릿 적용 중...')

    // 헤더 데이터
    const headers = [
      ['구분', '동', '동-호', '계약자', '연락처', '주민번호', '계약일',
       '계약금', '계약금2차일', '계약금2차', '중도금1차일', '중도금1차',
       '중도금2차일', '중도금2차', '중도금3차일', '중도금3차',
       '잔금일', '잔금', '합계', '계약형식', '채권양도', '비고']
    ]

    // 헤더 쓰기
    await this.writeRange(spreadsheetId, '매도현황!A1:V1', headers)

    // 스타일 적용
    const styleRequests = [
      // 헤더 행 배경색 (연한 녹색)
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 22 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.85, green: 0.95, blue: 0.85 },
              textFormat: { bold: true, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              borders: {
                top: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                bottom: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                left: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } },
                right: { style: 'SOLID', color: { red: 0.6, green: 0.6, blue: 0.6 } }
              }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,borders)'
        }
      },
      // 열 너비 설정
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 70 }, fields: 'pixelSize' } },  // A열 (구분)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } },  // B열 (동)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // C열 (동-호)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // D열 (계약자)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } }, // E열 (연락처)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } }, // F열 (주민번호)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },  // G열 (계약일)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },  // H열 (계약금)
      { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 22 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } }  // I-V열
    ]

    await this.batchUpdate(spreadsheetId, styleRequests)
    console.log('✅ [SheetsService] 매도 현황 템플릿 적용 완료')
  }
}

export const sheetsService = new SheetsService()
