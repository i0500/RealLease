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

      console.log(`🔎 [findHeaderRowIndex] Row ${i} 검사:`, {
        cells: cells.slice(0, 10),
        saleMatches: `${saleMatches}/${saleHeaders.length}`,
        rentalMatches: `${rentalMatches}/${rentalHeaders.length}`
      })

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
  const activeContracts = computed(() =>
    contracts.value.filter(c => c.contract.status === 'active')
  )

  const expiredContracts = computed(() =>
    contracts.value.filter(c => c.contract.status === 'expired')
  )

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
    saleContracts.value.filter(c => c.status === 'active')
  )

  const completedSaleContracts = computed(() =>
    saleContracts.value.filter(c => c.status === 'completed')
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

  async function loadContracts(sheetId: string) {
    console.log('🎬 [ContractsStore.loadContracts] 시작', {
      sheetId,
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

      // 🔍 시트 타입 자동 감지
      const sheetType = detectSheetType(_headers)
      console.log('🔖 [ContractsStore.loadContracts] 감지된 시트 타입:', sheetType)

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

          if (index < 3) {
            console.log(`🔍 [ContractsStore.loadContracts] 매도 Row ${index + 1}:`, {
              rowIndex: actualRowIndex,
              row0_구분: row[0],
              row1_동호: row[1],
              row2_계약자: row[2],
              row15_합계: row[15],
              fullRow: row.slice(0, 20)
            })
          }

          const contract = parseRowToSale(row, _headers, sheetId, actualRowIndex)

          if (contract && index < 3) {
            console.log(`📝 [ContractsStore.loadContracts] 샘플 매도 ${index + 1}:`, {
              id: contract.id,
              unit: contract.unit,
              buyer: contract.buyer,
              totalAmount: contract.totalAmount,
              notes: contract.notes
            })
          }
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

          if (index < 3) {
            console.log(`🔍 [ContractsStore.loadContracts] 임대 Row ${index + 1}:`, {
              rowIndex: actualRowIndex,
              row0_번호: row[0],
              row1_동: row[1],
              row2_호수: row[2],
              row3_이름: row[3],
              row4_연락처: row[4],
              row10_보증금: row[10],
              row11_월세: row[11],
              row13_시작일: row[13],
              row14_종료일: row[14],
              fullRow: row
            })
          }

          const contract = parseRowToContract(row, _headers, sheetId, actualRowIndex)

          if (contract && index < 3) {
            console.log(`📝 [ContractsStore.loadContracts] 샘플 임대 ${index + 1}:`, {
              id: contract.id,
              'property.address': contract.property.address,
              'property.unit': contract.property.unit,
              'tenant.name': contract.tenant.name,
              'tenant.phone': contract.tenant.phone,
              'contract.type': contract.contract.type,
              'contract.deposit': contract.contract.deposit,
              'contract.monthlyRent': contract.contract.monthlyRent,
              'contract.status': contract.contract.status
            })
          }
          return contract
        }).filter(c => c !== null) as RentalContract[]

        console.log('✅ [ContractsStore.loadContracts] 임대 파싱 완료:', {
          parsedCount: parsedContracts.length,
          activeCount: parsedContracts.filter(c => c.contract.status === 'active').length,
          expiredCount: parsedContracts.filter(c => c.contract.status === 'expired').length
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

      const newContract: RentalContract = {
        ...contract,
        id: generateId(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      // 시트에 행 추가
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
      // 📊 매도현황 시트 구조 (고정 인덱스):
      // A열 (row[0]): 빈칸 (무시)
      // B열 (row[1]): 구분
      // C열 (row[2]): 동
      // D열 (row[3]): 하이픈 (-)
      // E열 (row[4]): 호수
      // F열 (row[5]): 계약자
      // G열 (row[6]): 계약일
      // H열 (row[7]): 계약금
      // P열 (row[15]): 중도금
      // Q열 (row[16]): 잔금일자
      // R열 (row[17]): 잔금
      // S열 (row[18]): 합계
      // T열 (row[19]): 계약형식
      // U열+ (row[20+]): 비고

      const category = row[1]?.toString().trim() || ''
      const building = row[2]?.toString().trim() || ''
      const hyphen = row[3]?.toString().trim() || '-'
      const unitNum = row[4]?.toString().trim() || ''
      const buyer = row[5]?.toString().trim() || ''

      // 동-호 조합 (예: "108-407")
      const unit = building && unitNum ? `${building}${hyphen}${unitNum}` : ''

      // 필수 필드 검증: 계약자가 있는 경우만 유효한 매도 계약으로 처리
      if (!buyer || !unit) {
        console.log('⏭️ [parseRowToSale] 필수 필드 누락으로 건너뜀:', {
          rowIndex,
          category,
          building,
          unitNum,
          unit,
          buyer,
          reason: !buyer ? '계약자 없음' : '동-호 정보 없음'
        })
        return null
      }

      // 헤더 행 체크 (구분, 동, 계약자 등의 컬럼명이면 건너뜀)
      if (category === '구분' || buyer === '계약자' || building === '동') {
        return null
      }

      // 계약일 파싱
      const contractDateStr = row[6]?.toString()
      const contractDate = contractDateStr ? parseDate(contractDateStr) : undefined

      // 금액 파싱 헬퍼 함수 (단위: 천원)
      const parseAmount = (idx: number): number => {
        const amountStr = row[idx]?.toString()
        if (!amountStr || amountStr.trim() === '') return 0
        return parseInt(amountStr.replace(/,/g, '')) || 0
      }

      const downPayment = parseAmount(7) // H열: 계약금
      const interimPayment = parseAmount(15) // P열: 중도금
      const finalPayment = parseAmount(17) // R열: 잔금
      const totalAmount = parseAmount(18) // S열: 합계

      // 잔금일자 파싱
      const finalPaymentDateStr = row[16]?.toString()
      const finalPaymentDate = finalPaymentDateStr ? parseDate(finalPaymentDateStr) : undefined

      // 계약형식
      const contractFormat = row[19]?.toString().trim() || ''

      // 비고 (U열, V열 등 여러 컬럼 확인)
      const notesU = row[20]?.toString().trim() || ''
      const notesV = row[21]?.toString().trim() || ''
      const notesRaw = notesV || notesU // V열 우선, 없으면 U열

      // 상태 판별: 비고에 "종결" 포함 여부
      // "종결 (임차인 매수)" 같은 경우도 "종결"로 인식
      const status: 'active' | 'completed' = notesRaw.includes('종결') ? 'completed' : 'active'

      // 비고
      const notes = notesRaw

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
        interimPayment,
        finalPayment,
        finalPaymentDate,
        totalAmount,
        contractFormat,
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
      // 🔧 첫 번째 컬럼이 공란인 경우 offset 조정
      const firstCell = row[0]?.toString().trim() || ''
      const offset = firstCell === '' ? 1 : 0

      // 실제 엑셀 시트 구조 (offset 적용):
      // row[0+offset]: 번호
      // row[1+offset]: 동 (108)
      // row[2+offset]: 호수 (108, 305, 306...)
      // row[3+offset]: 이름
      // row[4+offset]: 연락처
      // row[5+offset]: 연락처 2
      // row[6+offset]: 계약유형 (최초/갱신)
      // row[7+offset]: 주민번호
      // row[8+offset]: 전용면적
      // row[9+offset]: 공급면적
      // row[10+offset]: 임대보증금
      // row[11+offset]: 월세
      // row[12+offset]: 계약서 작성일
      // row[13+offset]: 시작일
      // row[14+offset]: 종료일

      const idxName = 3 + offset
      const idxStartDate = 13 + offset
      const idxEndDate = 14 + offset

      // 필수 필드 검증 (이름, 시작일, 종료일이 없으면 건너뛰기)
      if (!row[idxName] || !row[idxStartDate] || !row[idxEndDate]) {
        console.log('⏭️ [parseRowToContract] 필수 필드 누락으로 건너뜀:', {
          rowIndex,
          offset,
          name: row[idxName],
          startDate: row[idxStartDate],
          endDate: row[idxEndDate],
          fullRow: row
        })
        return null
      }

      // 날짜 파싱 및 검증
      const startDate = parseDate(row[idxStartDate])
      const endDate = parseDate(row[idxEndDate])

      // Invalid Date 체크
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.log('⏭️ [parseRowToContract] 잘못된 날짜 형식으로 건너뜀:', {
          rowIndex,
          offset,
          startDate: row[idxStartDate],
          endDate: row[idxEndDate],
          parsedStart: startDate,
          parsedEnd: endDate
        })
        return null
      }

      // 동-호수 조합으로 주소 생성
      const building = row[1 + offset]?.toString() || ''
      const unit = row[2 + offset]?.toString() || ''
      const address = building ? `${building}동 ${unit}호` : unit

      // 보증금 파싱 (쉼표 제거)
      const depositStr = row[10 + offset]?.toString() || '0'
      const deposit = parseInt(depositStr.replace(/,/g, '')) || 0

      // 월세 파싱 (빈 값이면 undefined)
      const monthlyRentStr = row[11 + offset]?.toString()
      const monthlyRent = monthlyRentStr && monthlyRentStr.trim()
        ? parseInt(monthlyRentStr.replace(/,/g, ''))
        : undefined

      // 계약 타입 결정 (월세 값이 있으면 월세, 없으면 전세)
      const contractTypeValue = monthlyRent ? 'wolse' : 'jeonse'

      // 계약 구분 매핑 (최초 -> new, 갱신 -> renewal)
      const contractCategoryStr = row[6 + offset]?.toString() || ''
      let contractCategory: 'new' | 'renewal' | 'change' = 'new'
      if (contractCategoryStr.includes('갱신')) {
        contractCategory = 'renewal'
      } else if (contractCategoryStr.includes('변경')) {
        contractCategory = 'change'
      }

      // 상태 판단 (종료일 기준)
      const today = new Date()
      const status: 'active' | 'expired' | 'terminated' =
        endDate < today ? 'expired' : 'active'

      return {
        id: row[0 + offset]?.toString() || generateId(),
        sheetId,
        rowIndex,
        tenant: {
          name: row[3 + offset]?.toString() || '',
          phone: row[4 + offset]?.toString() || '',
          email: row[5 + offset]?.toString() || undefined,
          idNumber: row[7 + offset]?.toString() || undefined
        },
        property: {
          address: address,
          type: '아파트',
          unit: unit
        },
        contract: {
          type: contractTypeValue,
          deposit: deposit,
          monthlyRent: monthlyRent,
          startDate: startDate,
          endDate: endDate,
          status: status,
          contractType: contractCategory
        },
        metadata: {
          createdAt: row[12 + offset] ? parseDate(row[12 + offset]) : new Date(),
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
    // 실제 엑셀 시트 구조에 맞춰 row 생성
    // row[0]: 번호
    // row[1]: 동
    // row[2]: 호수
    // row[3]: 이름
    // row[4]: 연락처
    // row[5]: 연락처 2
    // row[6]: 계약유형 (최초/갱신)
    // row[7]: 주민번호
    // row[8]: 전용면적
    // row[9]: 공급면적
    // row[10]: 임대보증금
    // row[11]: 월세
    // row[12]: 계약서 작성일
    // row[13]: 시작일
    // row[14]: 종료일

    // property.address에서 동/호수 추출 (예: "108동 305호")
    const addressParts = contract.property.address.split('동')
    const building = addressParts[0]?.trim() || ''
    const unitPart = addressParts[1]?.replace('호', '').trim() || contract.property.unit || ''

    // 계약구분 변환 (new -> 최초, renewal -> 갱신)
    let contractCategory = '최초'
    if (contract.contract.contractType === 'renewal') {
      contractCategory = '갱신'
    } else if (contract.contract.contractType === 'change') {
      contractCategory = '변경'
    }

    return [
      contract.id,
      building,
      unitPart,
      contract.tenant.name,
      contract.tenant.phone,
      contract.tenant.email || '',
      contractCategory,
      contract.tenant.idNumber || '',
      '', // 전용면적 (비어있음)
      '', // 공급면적 (비어있음)
      contract.contract.deposit.toLocaleString(), // 쉼표 포함
      contract.contract.monthlyRent ? contract.contract.monthlyRent.toLocaleString() : '',
      contract.metadata.createdAt.toISOString().substring(0, 10),
      contract.contract.startDate.toISOString().substring(0, 10),
      contract.contract.endDate.toISOString().substring(0, 10).replace(/-/g, '/')
    ]
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

      const newContract: SaleContract = {
        ...contract,
        id: generateId(),
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      // 시트에 행 추가
      const row = saleContractToRow(newContract)
      const range = sheet.tabName ? `${sheet.tabName}!A:Z` : 'A:Z'
      await sheetsService.appendRow(sheet.spreadsheetId, range, row)

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
      const row = saleContractToRow(updatedContract)
      const range = sheet.tabName
        ? `${sheet.tabName}!A${contract.rowIndex}:Z${contract.rowIndex}`
        : `A${contract.rowIndex}:Z${contract.rowIndex}`
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

      // 소프트 삭제 (deletedAt 설정)
      await updateSaleContract(contractId, {
        metadata: {
          ...contract.metadata,
          deletedAt: new Date()
        }
      })

      // 로컬에서 제거
      saleContracts.value = saleContracts.value.filter(c => c.id !== contractId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete sale contract'
      console.error('Delete sale contract error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // SaleContract를 시트 row로 변환
  function saleContractToRow(contract: SaleContract): any[] {
    // 매도현황 시트 구조에 맞춰 row 생성
    // A열 (row[0]): 빈칸 또는 구분 번호
    // B열 (row[1]): 구분
    // C열 (row[2]): 동
    // D열 (row[3]): 하이픈
    // E열 (row[4]): 호수
    // F열 (row[5]): 계약자
    // G열 (row[6]): 계약일
    // H열 (row[7]): 계약금
    // P열 (row[15]): 중도금
    // Q열 (row[16]): 잔금일자
    // R열 (row[17]): 잔금
    // S열 (row[18]): 합계
    // T열 (row[19]): 계약형식
    // U열 (row[20]): 비고

    const row = new Array(21).fill('')

    row[1] = contract.category
    row[2] = contract.building
    row[3] = '-'
    // 동-호에서 호수 추출 (예: "108-407" -> "407")
    const unitParts = contract.unit.split('-')
    row[4] = unitParts[1] || contract.unit
    row[5] = contract.buyer
    row[6] = contract.contractDate ? contract.contractDate.toISOString().substring(0, 10).replace(/-/g, '/') : ''
    row[7] = contract.downPayment
    row[15] = contract.interimPayment
    row[16] = contract.finalPaymentDate ? contract.finalPaymentDate.toISOString().substring(0, 10).replace(/-/g, '/') : ''
    row[17] = contract.finalPayment
    row[18] = contract.totalAmount
    row[19] = contract.contractFormat
    row[20] = contract.notes

    return row
  }

  function clearError() {
    error.value = null
  }

  return {
    // 임대차 계약
    contracts,
    activeContracts,
    expiredContracts,
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
