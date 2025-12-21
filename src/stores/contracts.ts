import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sheetsService } from '@/services/google/sheetsService'
import { useSheetsStore } from './sheets'
import type { RentalContract, SaleContract } from '@/types'
import { generateId } from '@/utils/formatUtils'
import { parseDate } from '@/utils/dateUtils'

// 시트 타입 정의
type SheetType = 'rental' | 'sale' | 'unknown'

export const useContractsStore = defineStore('contracts', () => {
  const contracts = ref<RentalContract[]>([])
  const saleContracts = ref<SaleContract[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const sheetsStore = useSheetsStore()

  // 🔍 헤더 행 자동 탐지 함수
  function findHeaderRowIndex(data: any[][]): number {
    // 첫 10행 이내에서 헤더 행 검색
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i]
      if (!row || row.length === 0) continue

      // 각 셀을 문자열로 변환하여 검사
      const cells = row.map(cell => cell?.toString().toLowerCase().trim() || '')

      // 매도현황 헤더 키워드
      const saleHeaders = ['구분', '동-호', '계약자', '계약금', '중도금', '잔금']
      const saleMatches = saleHeaders.filter(keyword =>
        cells.some(cell => cell === keyword.toLowerCase())
      ).length

      // 임대차 현황 헤더 키워드
      const rentalHeaders = ['번호', '동', '호수', '이름', '연락처', '임대보증금', '월세', '시작일', '종료일']
      const rentalMatches = rentalHeaders.filter(keyword =>
        cells.some(cell => cell === keyword.toLowerCase())
      ).length

      // 3개 이상의 헤더 키워드가 매칭되면 헤더 행으로 판단
      if (saleMatches >= 3 || rentalMatches >= 3) {
        console.log(`✅ [findHeaderRowIndex] 헤더 행 발견: Row ${i}`)
        return i
      }
    }

    console.warn('⚠️ [findHeaderRowIndex] 헤더 행을 찾지 못함, 첫 행 사용')
    return 0 // 못 찾으면 기본값으로 첫 행 반환
  }

  // 임대차 계약 computed
  // 계약자 이름이 있는 계약 (실제 계약 중인 계약)
  const activeContracts = computed(() =>
    contracts.value.filter(c => c.tenantName && c.tenantName.trim() !== '' && !c.metadata.deletedAt)
  )

  // 공실: 계약자 이름이 없는 계약
  const vacantContracts = computed(() =>
    contracts.value.filter(c => (!c.tenantName || c.tenantName.trim() === '') && !c.metadata.deletedAt)
  )

  // 만료예정: 종료일이 3개월 이내인 계약
  const expiringContracts = computed(() => {
    const today = new Date()
    const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())

    return contracts.value.filter(c => {
      if (!c.endDate || c.metadata.deletedAt) return false
      return c.endDate >= today && c.endDate <= threeMonthsLater
    })
  })

  // 최근 계약: 시작일 기준 최근 5개
  const recentContracts = computed(() => {
    return [...contracts.value]
      .filter(c => c.startDate && !c.metadata.deletedAt)
      .sort((a, b) => {
        const dateA = a.startDate?.getTime() || 0
        const dateB = b.startDate?.getTime() || 0
        return dateB - dateA // 최신순
      })
      .slice(0, 5)
  })

  // 기존 호환성을 위한 expiredContracts (deprecated)
  const expiredContracts = computed(() => expiringContracts.value)

  const contractsBySheet = computed(() => {
    const grouped: Record<string, RentalContract[]> = {}
    contracts.value.forEach(contract => {
      if (!grouped[contract.sheetId]) {
        grouped[contract.sheetId] = []
      }
      grouped[contract.sheetId]!.push(contract)
    })
    return grouped
  })

  // 매도현황 계약 computed
  const activeSaleContracts = computed(() =>
    saleContracts.value.filter(c => c.status === 'active' && !c.metadata.deletedAt)
  )

  const completedSaleContracts = computed(() =>
    saleContracts.value.filter(c => c.status === 'completed' && !c.metadata.deletedAt)
  )

  const saleContractsBySheet = computed(() => {
    const grouped: Record<string, SaleContract[]> = {}
    saleContracts.value.forEach(contract => {
      if (!grouped[contract.sheetId]) {
        grouped[contract.sheetId] = []
      }
      grouped[contract.sheetId]!.push(contract)
    })
    return grouped
  })

  async function loadContracts(sheetId: string, explicitSheetType?: 'rental' | 'sale') {
    console.log('🎬 [ContractsStore.loadContracts] 시작', {
      sheetId,
      explicitSheetType: explicitSheetType || 'auto-detect',
      timestamp: new Date().toISOString()
    })

    try {
      isLoading.value = true
      error.value = null

      const sheet = sheetsStore.sheets.find(s => s.id === sheetId)
      if (!sheet) {
        console.error('❌ [ContractsStore.loadContracts] 시트를 찾을 수 없음:', sheetId)
        throw new Error('Sheet not found')
      }

      console.log('📋 [ContractsStore.loadContracts] 시트 정보:', {
        sheetId: sheet.id,
        sheetName: sheet.name,
        spreadsheetId: sheet.spreadsheetId,
        sheetUrl: sheet.sheetUrl,
        tabName: sheet.tabName || '(첫 번째 탭)',
        createdAt: sheet.createdAt,
        lastSynced: sheet.lastSynced
      })

      // 시트 데이터 읽기 (A1:Z1000 범위)
      const range = sheet.tabName ? `${sheet.tabName}!A1:Z1000` : 'A1:Z1000'
      console.log('📖 [ContractsStore.loadContracts] 데이터 읽기 시작:', {
        range,
        gid: sheet.gid || 'auto-detect (모든 탭 자동 탐색)'
      })

      const data = await sheetsService.readRange(sheet.spreadsheetId, range, sheet.gid)

      console.log('📥 [ContractsStore.loadContracts] 시트 데이터 수신 완료:', {
        totalRows: data.length,
        headerRow: data[0],
        dataRows: data.length - 1,
        sampleData: data.slice(0, 5)
      })

      if (data.length === 0) {
        console.warn('⚠️ [ContractsStore.loadContracts] 빈 데이터')
        contracts.value = []
        return
      }

      // 🔍 실제 헤더 행 찾기 (제목 행들을 건너뛰고)
      const headerRowIndex = findHeaderRowIndex(data)
      console.log('🔎 [ContractsStore.loadContracts] 헤더 행 감지:', {
        headerRowIndex,
        headerRow: data[headerRowIndex]
      })

      if (headerRowIndex === -1) {
        console.error('❌ [ContractsStore.loadContracts] 헤더 행을 찾을 수 없음')
        throw new Error('헤더 행을 찾을 수 없습니다. 시트 형식을 확인해주세요.')
      }

      // 헤더 행 추출
      const _headers = data[headerRowIndex]!

      // 🔍 시트 타입 결정 (명시적 타입 → tabName → 자동 감지 순)
      let sheetType: SheetType
      if (explicitSheetType) {
        // 1순위: 뷰에서 명시적으로 전달한 타입 (가장 정확)
        sheetType = explicitSheetType
        console.log('🎯 [ContractsStore.loadContracts] 명시적 타입 사용:', sheetType)
      } else if (sheet.tabName && sheet.tabName.includes('전체현황')) {
        // 2순위: tabName으로 임대차현황 판별
        sheetType = 'rental'
        console.log('🔖 [ContractsStore.loadContracts] tabName으로 임대차현황 시트 인식:', sheet.tabName)
      } else if (sheet.tabName && sheet.tabName.includes('매도현황')) {
        // 2순위: tabName으로 매도현황 판별
        sheetType = 'sale'
        console.log('🔖 [ContractsStore.loadContracts] tabName으로 매도현황 시트 인식:', sheet.tabName)
      } else {
        // 3순위: 헤더 기반 자동 감지 (fallback)
        sheetType = detectSheetType(_headers)
        console.log('🔖 [ContractsStore.loadContracts] 헤더로 시트 타입 자동 감지:', sheetType)
      }

      // 🔧 FIX: 헤더 행 및 빈 행 필터링 (강화)
      const isHeaderRow = (row: any[], type: SheetType) => {
        if (!row || row.length === 0) return true

        const firstCell = row[0]?.toString().trim() || ''
        const secondCell = row[1]?.toString().trim() || ''
        const thirdCell = row[2]?.toString().trim() || ''

        if (type === 'sale') {
          // 매도현황 헤더 체크
          return (
            firstCell === '구분' ||
            secondCell === '동-호' ||
            thirdCell === '계약자'
          )
        } else {
          // 임대차 헤더 체크
          const fourthCell = row[3]?.toString().trim() || ''
          const startDateCell = row[13]?.toString().trim() || ''

          return (
            firstCell === '번호' ||
            secondCell === '동' ||
            thirdCell === '호수' ||
            fourthCell === '이름' ||
            fourthCell === '호수' ||
            startDateCell === '시작일' ||
            startDateCell.includes('임대차계약기간')
          )
        }
      }

      const isEmptyRow = (row: any[]) => {
        return row.every(cell => !cell || cell.toString().trim() === '')
      }

      // 헤더 행 다음부터 데이터 행 추출 (헤더 행과 빈 행 제외)
      const rows = data.slice(headerRowIndex + 1).filter(row => !isHeaderRow(row, sheetType) && !isEmptyRow(row))

      console.log('🔄 [ContractsStore.loadContracts] 데이터 파싱 시작:', {
        sheetType,
        headerRowIndex,
        headerColumns: _headers.length,
        totalRows: data.length,
        dataRowsAfterFilter: rows.length,
        filteredOutRows: data.length - headerRowIndex - 1 - rows.length,
        headerRow: _headers,
        firstDataRow: rows[0]
      })

      // 타입에 따라 다른 파싱 로직 적용
      if (sheetType === 'sale') {
        // 매도현황 파싱
        const parsedSales: SaleContract[] = rows.map((row, index) => {
          const actualRowIndex = headerRowIndex + index + 2 // 헤더 행 위치 + 데이터 행 인덱스 + 2
          const contract = parseRowToSale(row, _headers, sheetId, actualRowIndex)
          return contract
        }).filter(c => c !== null) as SaleContract[]

        console.log('✅ [ContractsStore.loadContracts] 매도 파싱 완료:', {
          parsedCount: parsedSales.length,
          completedCount: parsedSales.filter(c => c.notes?.includes('종결')).length
        })

        // 기존 매도 계약 중 현재 시트 제거 후 새 데이터 추가
        const beforeCount = saleContracts.value.length
        saleContracts.value = [
          ...saleContracts.value.filter(c => c.sheetId !== sheetId),
          ...parsedSales
        ]
        const afterCount = saleContracts.value.length

        console.log('💾 [ContractsStore.loadContracts] 매도 스토어 업데이트:', {
          beforeCount,
          afterCount,
          addedCount: parsedSales.length
        })
      } else {
        // 임대차 현황 파싱
        const parsedContracts: RentalContract[] = rows.map((row, index) => {
          const actualRowIndex = headerRowIndex + index + 2 // 헤더 행 위치 + 데이터 행 인덱스 + 2
          const contract = parseRowToContract(row, _headers, sheetId, actualRowIndex)
          return contract
        }).filter(c => c !== null) as RentalContract[]

        console.log('✅ [ContractsStore.loadContracts] 임대 파싱 완료:', {
          parsedCount: parsedContracts.length,
          activeCount: parsedContracts.filter(c => c.tenantName && c.tenantName.trim() !== '').length,
          vacantCount: parsedContracts.filter(c => !c.tenantName || c.tenantName.trim() === '').length
        })

        // 기존 계약 중 현재 시트의 계약 제거 후 새 데이터 추가
        const beforeCount = contracts.value.length
        contracts.value = [
          ...contracts.value.filter(c => c.sheetId !== sheetId),
          ...parsedContracts
        ]
        const afterCount = contracts.value.length

        console.log('💾 [ContractsStore.loadContracts] 임대 스토어 업데이트:', {
          beforeCount,
          afterCount,
          addedCount: parsedContracts.length
        })
      }

      await sheetsStore.updateLastSynced(sheetId)

      console.log('🎉 [ContractsStore.loadContracts] 완료!')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load contracts'
      console.error('❌ [ContractsStore.loadContracts] 오류:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function addContract(contract: Omit<RentalContract, 'id' | 'metadata'>) {
    try {
      isLoading.value = true
      error.value = null

      const sheet = sheetsStore.sheets.find(s => s.id === contract.sheetId)
      if (!sheet) {
        throw new Error('Sheet not found')
      }

      // 1. 번호(number) 자동 넘버링
      // 기존 계약 중 동과 호가 있는 건수를 세서 다음 번호 부여
      // 예: 기존 10건 → 신규는 11번
      const existingCount = contracts.value.filter(c =>
        c.sheetId === contract.sheetId &&
        (c.building || c.unit) &&
        !c.metadata.deletedAt
      ).length
      const autoNumber = (existingCount + 1).toString()

      const newContract: RentalContract = {
        ...contract,
        number: autoNumber, // 자동 넘버링된 번호
        id: generateId(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      // Note: appendRow adds to bottom of sheet
      // For sequential ordering, manual sorting in sheet required
      const row = contractToRow(newContract)
      const range = sheet.tabName ? `${sheet.tabName}!A:Z` : 'A:Z'
      await sheetsService.appendRow(sheet.spreadsheetId, range, row)

      contracts.value.push(newContract)

      return newContract
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add contract'
      console.error('Add contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateContract(contractId: string, updates: Partial<RentalContract>) {
    try {
      isLoading.value = true
      error.value = null

      const index = contracts.value.findIndex(c => c.id === contractId)
      if (index === -1) {
        throw new Error('Contract not found')
      }

      const contract = contracts.value[index]!
      const sheet = sheetsStore.sheets.find(s => s.id === contract.sheetId)
      if (!sheet) {
        throw new Error('Sheet not found')
      }

      const updatedContract: RentalContract = {
        ...contract,
        ...updates,
        metadata: {
          ...contract.metadata,
          updatedAt: new Date()
        }
      }

      // 시트 업데이트
      const row = contractToRow(updatedContract)
      const range = sheet.tabName
        ? `${sheet.tabName}!A${contract.rowIndex}:Z${contract.rowIndex}`
        : `A${contract.rowIndex}:Z${contract.rowIndex}`
      await sheetsService.updateRow(sheet.spreadsheetId, range, row)

      contracts.value[index] = updatedContract

      return updatedContract
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update contract'
      console.error('Update contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function deleteContract(contractId: string) {
    try {
      isLoading.value = true
      error.value = null

      const contract = contracts.value.find(c => c.id === contractId)
      if (!contract) {
        throw new Error('Contract not found')
      }

      // 소프트 삭제 (deletedAt 설정)
      await updateContract(contractId, {
        metadata: {
          ...contract.metadata,
          deletedAt: new Date()
        }
      })

      // 로컬에서 제거
      contracts.value = contracts.value.filter(c => c.id !== contractId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete contract'
      console.error('Delete contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 🔍 시트 타입 자동 감지 함수
  function detectSheetType(headers: any[]): SheetType {
    const headerStr = headers.map(h => h?.toString().toLowerCase() || '').join(' ')

    console.log('🔍 [detectSheetType] 헤더 분석:', {
      headers: headers.slice(0, 15),
      headerStr: headerStr.substring(0, 200)
    })

    // 매도현황 키워드 체크 (우선순위 높음)
    const saleKeywords = ['구분', '계약자', '계약금', '중도금', '잔금', '합계', '동-호']
    const saleMatches = saleKeywords.filter(keyword =>
      headerStr.includes(keyword.toLowerCase())
    ).length

    // 임대차 현황 키워드 체크
    const rentalKeywords = ['호수', '이름', '연락처', '임대보증금', '월세', '시작일', '종료일']
    const rentalMatches = rentalKeywords.filter(keyword =>
      headerStr.includes(keyword.toLowerCase())
    ).length

    console.log('📊 [detectSheetType] 키워드 매칭 결과:', {
      saleMatches: `${saleMatches}/${saleKeywords.length}`,
      rentalMatches: `${rentalMatches}/${rentalKeywords.length}`
    })

    // 매칭 점수가 높은 쪽으로 판별 (3개 이상 매칭되면 해당 타입으로 인식)
    if (saleMatches >= 3) {
      console.log('✅ [detectSheetType] 매도현황 시트로 판별')
      return 'sale'
    }

    if (rentalMatches >= 4) {
      console.log('✅ [detectSheetType] 임대차 현황 시트로 판별')
      return 'rental'
    }

    console.warn('⚠️ [detectSheetType] 시트 타입을 판별할 수 없음, rental로 기본 설정')
    return 'rental' // 기본값
  }

  // 📋 매도현황 파싱 함수
  function parseRowToSale(
    row: any[],
    _headers: string[],
    sheetId: string,
    rowIndex: number
  ): SaleContract | null {
    try {
      // 📊 매도현황 시트 구조 (올바른 열 매핑):
      // A열 (row[0]): 빈칸 (무시)
      // B열 (row[1]): 구분
      // C열 (row[2]): 동
      // E열 (row[4]): 호
      // F열 (row[5]): 계약자
      // G열 (row[6]): 계약일
      // I열 (row[8]): 계약금 2차 일자
      // J열 (row[9]): 계약금 2차 금액
      // K열 (row[10]): 중도금 1차 일자
      // L열 (row[11]): 중도금 1차 금액
      // M열 (row[12]): 중도금 2차 일자
      // N열 (row[13]): 중도금 2차 금액
      // O열 (row[14]): 중도금 3차 일자
      // P열 (row[15]): 중도금 3차 금액
      // Q열 (row[16]): 잔금 일자
      // R열 (row[17]): 잔금 금액
      // S열 (row[18]): 합계
      // T열 (row[19]): 계약형식
      // U열 (row[20]): 채권양도
      // V열 (row[21]): 비고 (종결 (note text) 형식)

      const category = row[1]?.toString().trim() || ''
      const building = row[2]?.toString().trim() || ''
      const unitNum = row[4]?.toString().trim() || '' // E열: 호
      const buyer = row[5]?.toString().trim() || ''

      // 동-호 조합 (예: "108-407")
      const unit = building && unitNum ? `${building}-${unitNum}` : ''

      // 🔍 합계 행 및 무관한 데이터 필터링
      // 1. 동/호 유효성 검증 (더 엄격한 검증)
      const isValidBuildingOrUnit = (value: string): boolean => {
        if (!value) return false
        const trimmed = value.trim()
        // 빈 문자열, "-"만 있는 경우, 단위만 있는 경우 무효
        if (trimmed === '' || trimmed === '-') return false
        if (trimmed === '동' || trimmed === '호') return false
        // 숫자가 포함되어야 유효 (예: "108", "108동", "307호", "1707")
        return /\d/.test(trimmed)
      }

      if (!isValidBuildingOrUnit(building) || !isValidBuildingOrUnit(unitNum)) {
        return null
      }

      // 2. 합계 행 키워드 체크
      const summaryKeywords = ['계', '합계', 'total', '소계', 'sum', '전체']
      const checkForSummaryKeywords = (text: string): boolean => {
        if (!text) return false
        const lowerText = text.toLowerCase().trim()
        // "계 (55 세대)" 같은 패턴 체크
        return summaryKeywords.some(keyword => {
          return lowerText === keyword || lowerText.startsWith(keyword + ' ') || lowerText.startsWith(keyword + '(')
        })
      }

      // 헤더 행 체크 (구분, 동, 계약자 등의 컬럼명이면 건너뜀)
      if (category === '구분' || buyer === '계약자' || building === '동') {
        return null
      }

      // 합계 행 키워드 체크
      if (checkForSummaryKeywords(buyer) ||
          checkForSummaryKeywords(building) ||
          checkForSummaryKeywords(unitNum) ||
          checkForSummaryKeywords(category)) {
        return null
      }

      // 3. 필수 필드 검증: 계약자가 있어야 유효
      if (!buyer) {
        return null
      }

      // 날짜 파싱 헬퍼 함수 (안전한 날짜 처리)
      const parseDateSafe = (dateStr: string | undefined): Date | undefined => {
        if (!dateStr || dateStr.trim() === '') return undefined
        try {
          const date = parseDate(dateStr)
          // Invalid Date 체크
          if (date && !isNaN(date.getTime())) {
            return date
          }
          return undefined
        } catch (e) {
          console.log(`날짜 파싱 실패: ${dateStr}`, e)
          return undefined
        }
      }

      // 금액 파싱 헬퍼 함수 (단위: 천원 → 원 단위로 변환)
      const parseAmount = (idx: number): number => {
        const amountStr = row[idx]?.toString()
        if (!amountStr || amountStr.trim() === '') return 0
        const amount = parseInt(amountStr.replace(/,/g, '')) || 0
        return amount * 1000 // 천원 단위를 원 단위로 변환
      }

      // 계약일
      const contractDate = parseDateSafe(row[6]?.toString())

      // 계약금 (H열)
      const downPayment = parseAmount(7)

      // 계약금 2차 (I-J열)
      const downPayment2Date = parseDateSafe(row[8]?.toString())
      const downPayment2 = parseAmount(9)

      // 중도금 1차 (K-L열)
      const interimPayment1Date = parseDateSafe(row[10]?.toString())
      const interimPayment1 = parseAmount(11)

      // 중도금 2차 (M-N열)
      const interimPayment2Date = parseDateSafe(row[12]?.toString())
      const interimPayment2 = parseAmount(13)

      // 중도금 3차 (O-P열)
      const interimPayment3Date = parseDateSafe(row[14]?.toString())
      const interimPayment3 = parseAmount(15)

      // 잔금 (Q-R열)
      const finalPaymentDate = parseDateSafe(row[16]?.toString())
      const finalPayment = parseAmount(17)

      // 합계 (S열)
      const totalAmount = parseAmount(18)

      // 계약형식 (T열)
      const contractFormat = row[19]?.toString().trim() || ''

      // 채권양도 (U열)
      const bondTransfer = row[20]?.toString().trim() || ''

      // 비고 (V열) - "종결 (note text)" 형식 파싱
      const notesRaw = row[21]?.toString().trim() || ''

      // 상태 판별: 비고에 "종결" 포함 여부
      const status: 'active' | 'completed' = notesRaw.includes('종결') ? 'completed' : 'active'

      // 비고에서 괄호 안 내용만 추출 (종결 (임차인 매수) → 임차인 매수)
      let notes = notesRaw
      const match = notesRaw.match(/종결\s*\((.*?)\)/)
      if (match && match[1]) {
        notes = match[1].trim()
      } else if (notesRaw.includes('종결')) {
        notes = notesRaw.replace('종결', '').trim()
      }

      return {
        id: `sale-${category}-${unit}`.replace(/\s+/g, '-'),
        sheetId,
        rowIndex,
        category,
        building,
        unit,
        buyer,
        contractDate,
        downPayment,
        downPayment2Date,
        downPayment2,
        interimPayment1Date,
        interimPayment1,
        interimPayment2Date,
        interimPayment2,
        interimPayment3Date,
        interimPayment3,
        finalPaymentDate,
        finalPayment,
        totalAmount,
        contractFormat,
        bondTransfer,
        status,
        notes,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    } catch (err) {
      console.error('❌ [parseRowToSale] 파싱 오류:', err, 'Row data:', row)
      return null
    }
  }

  function parseRowToContract(
    row: any[],
    _headers: string[],
    sheetId: string,
    rowIndex: number
  ): RentalContract | null {
    try {
      // 안전한 날짜 파싱 함수
      const parseDateSafe = (dateStr: string | undefined): Date | undefined => {
        if (!dateStr || dateStr.trim() === '') return undefined
        try {
          const date = parseDate(dateStr)
          if (date && !isNaN(date.getTime())) {
            return date
          }
          return undefined
        } catch (e) {
          console.log(`날짜 파싱 실패: ${dateStr}`, e)
          return undefined
        }
      }

      // 안전한 숫자 파싱 함수 (임대계약: 이미 원 단위로 저장됨)
      const parseAmount = (index: number): number => {
        const str = row[index]?.toString() || '0'
        const amount = parseInt(str.replace(/,/g, '')) || 0
        return amount // 이미 원 단위
      }

      // Google Sheets 열 매핑 (사용자 요구사항)
      // A열(row[0]): 공란
      // B열(row[1]): 번호
      const number = row[1]?.toString().trim() || ''

      // C열(row[2]): 동
      const building = row[2]?.toString().trim() || ''

      // D열(row[3]): 호
      const unit = row[3]?.toString().trim() || ''

      // E열(row[4]): 계약자이름
      const tenantName = row[4]?.toString().trim() || ''

      // F열(row[5]): 연락처
      const phone = row[5]?.toString().trim() || ''

      // G열(row[6]): 연락처2 (또는 "갱신/신규")
      const phone2OrContractType = row[6]?.toString().trim() || ''

      // H열(row[7]): 계약유형
      const contractType = row[7]?.toString().trim() || ''

      // I열(row[8]): 주민번호
      const idNumber = row[8]?.toString().trim() || ''

      // J열(row[9]): 전용면적
      const exclusiveArea = row[9]?.toString().trim() || ''

      // K열(row[10]): 공급면적
      const supplyArea = row[10]?.toString().trim() || ''

      // L열(row[11]): 임대보증금
      const deposit = parseAmount(11)

      // M열(row[12]): 월세
      const monthlyRent = parseAmount(12)

      // N열(row[13]): 계약서작성일
      const contractWrittenDate = parseDateSafe(row[13]?.toString())

      // O열(row[14]): 시작일
      const startDate = parseDateSafe(row[14]?.toString())

      // P열(row[15]): 종료일
      const endDate = parseDateSafe(row[15]?.toString())

      // Q열(row[16]): 실제퇴거일
      const actualMoveOutDate = parseDateSafe(row[16]?.toString())

      // R열(row[17]): 계약기간
      const contractPeriod = row[17]?.toString().trim() || ''

      // S열(row[18]): 보증보험 시작일
      const hugStartDate = parseDateSafe(row[18]?.toString())

      // T열(row[19]): 보증보험 종료일
      const hugEndDate = parseDateSafe(row[19]?.toString())

      // U열(row[20]): additionalInfo1
      const additionalInfo1 = row[20]?.toString().trim() || ''

      // V열(row[21]): additionalInfo2
      const additionalInfo2 = row[21]?.toString().trim() || ''

      // W열(row[22]): additionalInfo3
      const additionalInfo3 = row[22]?.toString().trim() || ''

      // X열(row[23]): additionalInfo4
      const additionalInfo4 = row[23]?.toString().trim() || ''

      // Y열(row[24]): 기타사항/비고
      const notes = row[24]?.toString().trim() || ''

      // 🔍 합계 행 및 무관한 데이터 필터링
      // 1. 동/호 유효성 검증 (더 엄격한 검증)
      const isValidBuildingOrUnit = (value: string): boolean => {
        if (!value) return false
        const trimmed = value.trim()
        // 빈 문자열, "-"만 있는 경우, 단위만 있는 경우 무효
        if (trimmed === '' || trimmed === '-') return false
        if (trimmed === '동' || trimmed === '호') return false
        // 숫자가 포함되어야 유효 (예: "108", "108동", "307호", "1707")
        return /\d/.test(trimmed)
      }

      if (!isValidBuildingOrUnit(building) || !isValidBuildingOrUnit(unit)) {
        return null
      }

      // 2. 합계 행 키워드 체크 (tenantName, building, unit 등에서)
      const summaryKeywords = ['계', '합계', 'total', '소계', 'sum', '전체']
      const checkForSummaryKeywords = (text: string): boolean => {
        if (!text) return false
        const lowerText = text.toLowerCase().trim()
        // "계 (55 세대)" 같은 패턴 체크
        return summaryKeywords.some(keyword => {
          // 정확한 매칭 또는 "계 (" 같은 패턴
          return lowerText === keyword || lowerText.startsWith(keyword + ' ') || lowerText.startsWith(keyword + '(')
        })
      }

      if (checkForSummaryKeywords(tenantName) ||
          checkForSummaryKeywords(building) ||
          checkForSummaryKeywords(unit) ||
          checkForSummaryKeywords(number)) {
        return null
      }

      // 3. 대부분의 필드가 비어있는 무관한 데이터 체크
      // 동/호는 있지만 계약자, 연락처, 보증금, 계약유형, 시작일, 종료일이 모두 없으면 무효
      const hasMinimalData = tenantName || phone || deposit > 0 || contractType || startDate || endDate
      if (!hasMinimalData) {
        return null
      }

      // 4. 매매계약 건 필터링
      // X열(additionalInfo4)에 "매매계약" 텍스트가 있고, Y열(notes)에 "말소" 텍스트가 있으면
      // 매매계약으로 전환된 건이므로 임대차 리스트에서 제외
      if (additionalInfo4.includes('매매계약') && notes.includes('말소')) {
        return null
      }

      return {
        id: `rental-${sheetId}-${rowIndex}`,
        sheetId,
        rowIndex,
        number,
        building,
        unit,
        tenantName,
        phone,
        phone2OrContractType,
        contractType,
        idNumber,
        exclusiveArea,
        supplyArea,
        deposit,
        monthlyRent,
        contractWrittenDate,
        startDate,
        endDate,
        actualMoveOutDate,
        contractPeriod,
        hugStartDate,
        hugEndDate,
        additionalInfo1,
        additionalInfo2,
        additionalInfo3,
        additionalInfo4,
        notes,
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: undefined
        }
      }
    } catch (err) {
      console.error('Parse row error:', err, 'Row data:', row)
      return null
    }
  }

  function contractToRow(contract: RentalContract): any[] {
    // 안전한 날짜 포맷 함수
    const formatDateSafe = (date: Date | undefined): string => {
      if (!date) return ''
      try {
        if (isNaN(date.getTime())) {
          return ''
        }
        return date.toISOString().substring(0, 10).replace(/-/g, '/')
      } catch (e) {
        console.log('날짜 포맷 실패:', date, e)
        return ''
      }
    }

    const row = new Array(25).fill('')

    // A열(row[0]): 공란
    row[0] = ''

    // B열(row[1]): 번호
    row[1] = contract.number || ''

    // C열(row[2]): 동
    row[2] = contract.building || ''

    // D열(row[3]): 호
    row[3] = contract.unit || ''

    // E열(row[4]): 계약자이름
    row[4] = contract.tenantName || ''

    // F열(row[5]): 연락처
    row[5] = contract.phone || ''

    // G열(row[6]): 연락처2 (또는 "갱신/신규")
    row[6] = contract.phone2OrContractType || ''

    // H열(row[7]): 계약유형
    row[7] = contract.contractType || ''

    // I열(row[8]): 주민번호
    row[8] = contract.idNumber || ''

    // J열(row[9]): 전용면적
    row[9] = contract.exclusiveArea || ''

    // K열(row[10]): 공급면적
    row[10] = contract.supplyArea || ''

    // L열(row[11]): 임대보증금 (원 단위 그대로 저장)
    row[11] = Math.round(contract.deposit || 0)

    // M열(row[12]): 월세 (원 단위 그대로 저장)
    row[12] = Math.round(contract.monthlyRent || 0)

    // N열(row[13]): 계약서작성일
    row[13] = formatDateSafe(contract.contractWrittenDate)

    // O열(row[14]): 시작일
    row[14] = formatDateSafe(contract.startDate)

    // P열(row[15]): 종료일
    row[15] = formatDateSafe(contract.endDate)

    // Q열(row[16]): 실제퇴거일
    row[16] = formatDateSafe(contract.actualMoveOutDate)

    // R열(row[17]): 계약기간
    row[17] = contract.contractPeriod || ''

    // S열(row[18]): 보증보험 시작일
    row[18] = formatDateSafe(contract.hugStartDate)

    // T열(row[19]): 보증보험 종료일
    row[19] = formatDateSafe(contract.hugEndDate)

    // U열(row[20]): additionalInfo1
    row[20] = contract.additionalInfo1 || ''

    // V열(row[21]): additionalInfo2
    row[21] = contract.additionalInfo2 || ''

    // W열(row[22]): additionalInfo3
    row[22] = contract.additionalInfo3 || ''

    // X열(row[23]): additionalInfo4
    row[23] = contract.additionalInfo4 || ''

    // Y열(row[24]): 기타사항/비고
    row[24] = contract.notes || ''

    return row
  }

  // 매도현황 계약 추가
  async function addSaleContract(contract: Omit<SaleContract, 'id' | 'metadata'>) {
    try {
      isLoading.value = true
      error.value = null

      const sheet = sheetsStore.sheets.find(s => s.id === contract.sheetId)
      if (!sheet) {
        throw new Error('Sheet not found')
      }

      // 1. 구분(category) 자동 넘버링
      // 기존 계약자가 있는 매도 계약 건수를 세서 다음 번호 부여
      // 예: 기존 6건 → 신규는 7번
      const existingCount = saleContracts.value.filter(c =>
        c.sheetId === contract.sheetId &&
        c.buyer &&
        c.buyer.trim() !== '' &&
        !c.metadata.deletedAt
      ).length
      const autoCategory = (existingCount + 1).toString()

      const newContract: SaleContract = {
        ...contract,
        category: autoCategory, // 자동 넘버링된 구분 번호 (무조건 덮어씀)
        id: generateId(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      // 2. 빈 리스트 찾기 및 덮어쓰기 로직
      // 시트에서 autoCategory에 해당하는 행을 찾아서 빈 리스트인지 확인
      // 빈 리스트 조건: category와 building은 있지만 buyer나 contractDate가 없음
      const range = sheet.tabName ? `${sheet.tabName}!A1:Z1000` : 'A1:Z1000'
      const sheetData = await sheetsService.readRange(sheet.spreadsheetId, range, sheet.gid)

      // 빈 리스트 찾기: category가 autoCategory와 같고, buyer나 contractDate가 없는 행
      let emptyRowIndex: number | null = null
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i]
        if (!row) continue // row가 undefined인 경우 스킵

        const rowCategory = row[1]?.toString().trim() || '' // B열: 구분
        const rowBuilding = row[2]?.toString().trim() || '' // C열: 동
        const rowBuyer = row[5]?.toString().trim() || '' // F열: 계약자
        const rowContractDate = row[6]?.toString().trim() || '' // G열: 계약일

        // 구분번호가 일치하고, 동은 있지만 계약자나 계약일이 없으면 빈 리스트
        if (
          rowCategory === autoCategory &&
          rowBuilding &&
          (!rowBuyer || !rowContractDate)
        ) {
          emptyRowIndex = i + 1 // 1-based index for Sheets API
          console.log(`📝 [addSaleContract] 빈 리스트 발견 (덮어쓰기): row ${emptyRowIndex}, category=${autoCategory}`)
          break
        }
      }

      const row = saleContractToRow(newContract)

      if (emptyRowIndex !== null) {
        // 3-1. 빈 리스트 덮어쓰기 (updateRow 사용)
        // ⚠️ B열부터 시작 (A열은 항상 빈칸이므로 제외)
        const updateRange = sheet.tabName
          ? `${sheet.tabName}!B${emptyRowIndex}:V${emptyRowIndex}`
          : `B${emptyRowIndex}:V${emptyRowIndex}`
        await sheetsService.updateRow(sheet.spreadsheetId, updateRange, row)

        // rowIndex 설정
        newContract.rowIndex = emptyRowIndex

        console.log(`✅ [addSaleContract] 빈 리스트 덮어쓰기 완료: row ${emptyRowIndex}`)
      } else {
        // 3-2. 빈 리스트가 없으면 맨 아래에 추가 (appendRow 사용)
        // ⚠️ B열부터 시작 (A열은 항상 빈칸이므로 제외)
        const appendRange = sheet.tabName ? `${sheet.tabName}!B:V` : 'B:V'
        await sheetsService.appendRow(sheet.spreadsheetId, appendRange, row)

        // rowIndex는 추가된 위치 (sheetData.length + 1)
        newContract.rowIndex = sheetData.length + 1

        console.log(`✅ [addSaleContract] 새 행 추가 완료: row ${newContract.rowIndex}`)
      }

      saleContracts.value.push(newContract)

      return newContract
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add sale contract'
      console.error('Add sale contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 매도현황 계약 수정
  async function updateSaleContract(contractId: string, updates: Partial<SaleContract>) {
    try {
      isLoading.value = true
      error.value = null

      const index = saleContracts.value.findIndex(c => c.id === contractId)
      if (index === -1) {
        throw new Error('Sale contract not found')
      }

      const contract = saleContracts.value[index]!
      const sheet = sheetsStore.sheets.find(s => s.id === contract.sheetId)
      if (!sheet) {
        throw new Error('Sheet not found')
      }

      const updatedContract: SaleContract = {
        ...contract,
        ...updates,
        metadata: {
          ...contract.metadata,
          updatedAt: new Date()
        }
      }

      // 시트 업데이트
      // ⚠️ B열부터 시작 (A열은 항상 빈칸이므로 제외)
      const row = saleContractToRow(updatedContract)
      const range = sheet.tabName
        ? `${sheet.tabName}!B${contract.rowIndex}:V${contract.rowIndex}`
        : `B${contract.rowIndex}:V${contract.rowIndex}`
      await sheetsService.updateRow(sheet.spreadsheetId, range, row)

      saleContracts.value[index] = updatedContract

      return updatedContract
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update sale contract'
      console.error('Update sale contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // 매도현황 계약 삭제
  async function deleteSaleContract(contractId: string) {
    try {
      isLoading.value = true
      error.value = null

      const contract = saleContracts.value.find(c => c.id === contractId)
      if (!contract) {
        throw new Error('Sale contract not found')
      }

      const sheet = sheetsStore.sheets.find(s => s.id === contract.sheetId)
      if (!sheet) {
        throw new Error('Sheet not found')
      }

      if (!sheet.gid) {
        throw new Error('Sheet GID not found')
      }

      console.log(`🗑️ [ContractsStore.deleteSaleContract] 시트에서 행 삭제: {rowIndex: ${contract.rowIndex}, sheetId: ${sheet.id}}`)

      // 시트에서 실제로 행 삭제
      await sheetsService.deleteRow(
        sheet.spreadsheetId,
        sheet.gid,
        contract.rowIndex
      )

      console.log(`✅ [ContractsStore.deleteSaleContract] 시트 행 삭제 완료: Row ${contract.rowIndex}`)

      // 로컬에서 제거
      saleContracts.value = saleContracts.value.filter(c => c.id !== contractId)

      console.log(`✅ [ContractsStore.deleteSaleContract] 로컬 스토어에서 제거 완료`)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete sale contract'
      console.error('❌ [ContractsStore.deleteSaleContract] 삭제 실패:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // SaleContract를 시트 row로 변환
  function saleContractToRow(contract: SaleContract): any[] {
    // 매도현황 시트 구조에 맞춰 row 생성
    // ⚠️ A열은 시트에서 항상 빈칸 → B열부터 시작하는 배열 생성
    // Google Sheets API append가 빈 A열 감지 시 한 칸 밀리는 현상 방지
    //
    // B열 (row[0]): 구분
    // C열 (row[1]): 동
    // D열 (row[2]): 빈칸
    // E열 (row[3]): 호
    // F열 (row[4]): 계약자
    // G열 (row[5]): 계약일
    // H열 (row[6]): 계약금 1차 금액
    // I열 (row[7]): 계약금 2차 일자
    // J열 (row[8]): 계약금 2차 금액
    // K열 (row[9]): 중도금 1차 일자
    // L열 (row[10]): 중도금 1차 금액
    // M열 (row[11]): 중도금 2차 일자
    // N열 (row[12]): 중도금 2차 금액
    // O열 (row[13]): 중도금 3차 일자
    // P열 (row[14]): 중도금 3차 금액
    // Q열 (row[15]): 잔금 일자
    // R열 (row[16]): 잔금 금액
    // S열 (row[17]): 합계
    // T열 (row[18]): 계약형식
    // U열 (row[19]): 채권양도
    // V열 (row[20]): 비고 (종결 (note text) 형식)

    console.log('🔍 [saleContractToRow] contract.category:', contract.category)
    console.log('🔍 [saleContractToRow] contract.building:', contract.building)
    console.log('🔍 [saleContractToRow] contract.unit:', contract.unit)
    console.log('🔍 [saleContractToRow] contract.buyer:', contract.buyer)

    // B열부터 시작 (A열 제외) - 21개 요소
    const row = new Array(21).fill('')

    // 안전한 날짜 포맷 함수
    const formatDateSafe = (date: Date | undefined): string => {
      if (!date) return ''
      try {
        // Invalid Date 체크
        if (isNaN(date.getTime())) {
          return ''
        }
        return date.toISOString().substring(0, 10).replace(/-/g, '/')
      } catch (e) {
        console.log('날짜 포맷 실패:', date, e)
        return ''
      }
    }

    // 기본 정보 (인덱스 -1: B열부터 시작)
    row[0] = contract.category || '' // B열: 구분
    row[1] = contract.building || '' // C열: 동
    // D열 (row[2]): 빈칸
    // 동-호에서 호수 추출 (예: "108-407" -> "407")
    const unitParts = contract.unit.split('-')
    row[3] = unitParts[1] || contract.unit || '' // E열: 호
    row[4] = contract.buyer || '' // F열: 계약자
    row[5] = formatDateSafe(contract.contractDate) // G열: 계약일

    // 계약금 1차 (H열)
    row[6] = Math.round((contract.downPayment || 0) / 1000) // H열: 계약금 1차 금액 (원 → 천원)

    // 계약금 2차 (I-J열)
    row[7] = formatDateSafe(contract.downPayment2Date) // I열: 계약금 2차 일자
    row[8] = Math.round((contract.downPayment2 || 0) / 1000) // J열: 계약금 2차 금액 (원 → 천원)

    // 중도금 1차 (K-L열)
    row[9] = formatDateSafe(contract.interimPayment1Date) // K열: 중도금 1차 일자
    row[10] = Math.round((contract.interimPayment1 || 0) / 1000) // L열: 중도금 1차 금액 (원 → 천원)

    // 중도금 2차 (M-N열)
    row[11] = formatDateSafe(contract.interimPayment2Date) // M열: 중도금 2차 일자
    row[12] = Math.round((contract.interimPayment2 || 0) / 1000) // N열: 중도금 2차 금액 (원 → 천원)

    // 중도금 3차 (O-P열)
    row[13] = formatDateSafe(contract.interimPayment3Date) // O열: 중도금 3차 일자
    row[14] = Math.round((contract.interimPayment3 || 0) / 1000) // P열: 중도금 3차 금액 (원 → 천원)

    // 잔금 (Q-R열)
    row[15] = formatDateSafe(contract.finalPaymentDate) // Q열: 잔금 일자
    row[16] = Math.round((contract.finalPayment || 0) / 1000) // R열: 잔금 금액 (원 → 천원)

    // 합계 (S열)
    row[17] = Math.round((contract.totalAmount || 0) / 1000) // S열: 합계 (원 → 천원)

    // 계약형식 (T열)
    row[18] = contract.contractFormat || '' // T열: 계약형식

    // 채권양도 (U열)
    row[19] = contract.bondTransfer || '' // U열: 채권양도

    // 비고 (V열) - "종결 (note text)" 형식으로 결합
    if (contract.status === 'completed') {
      row[20] = contract.notes ? `종결 (${contract.notes})` : '종결'
    } else {
      row[20] = contract.notes || ''
    }

    console.log('📊 [saleContractToRow] 생성된 row 배열 (B열부터 시작):')
    console.log('  row[0] (B열 구분):', row[0])
    console.log('  row[1] (C열 동):', row[1])
    console.log('  row[2] (D열 빈칸):', row[2])
    console.log('  row[3] (E열 호):', row[3])
    console.log('  row[4] (F열 계약자):', row[4])
    console.log('  전체 row:', JSON.stringify(row.slice(0, 10)))

    return row
  }

  function clearError() {
    error.value = null
  }

  return {
    // 임대차 계약
    contracts,
    activeContracts,
    vacantContracts,
    expiringContracts,
    recentContracts,
    expiredContracts, // deprecated, use expiringContracts
    contractsBySheet,
    // 매도현황 계약
    saleContracts,
    activeSaleContracts,
    completedSaleContracts,
    saleContractsBySheet,
    // 공통
    isLoading,
    error,
    loadContracts,
    addContract,
    updateContract,
    deleteContract,
    addSaleContract,
    updateSaleContract,
    deleteSaleContract,
    clearError
  }
})
