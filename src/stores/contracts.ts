import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sheetsService } from '@/services/google/sheetsService'
import { useSheetsStore } from './sheets'
import type { RentalContract } from '@/types'
import { generateId } from '@/utils/formatUtils'
import { parseDate } from '@/utils/dateUtils'

export const useContractsStore = defineStore('contracts', () => {
  const contracts = ref<RentalContract[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const sheetsStore = useSheetsStore()

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
        sampleData: data.slice(0, 3)
      })

      if (data.length === 0) {
        console.warn('⚠️ [ContractsStore.loadContracts] 빈 데이터')
        contracts.value = []
        return
      }

      // 헤더 행 제외하고 데이터 파싱
      const _headers = data[0]!
      const rows = data.slice(1)

      console.log('🔄 [ContractsStore.loadContracts] 데이터 파싱 시작:', {
        headerColumns: _headers.length,
        dataRowsCount: rows.length
      })

      const parsedContracts: RentalContract[] = rows.map((row, index) => {
        const contract = parseRowToContract(row, _headers, sheetId, index + 2)
        if (contract && index < 2) {
          console.log(`📝 [ContractsStore.loadContracts] 샘플 계약 ${index + 1}:`, {
            id: contract.id,
            tenant: contract.tenant.name,
            property: `${contract.property.address} ${contract.property.unit}`,
            type: contract.contract.type,
            status: contract.contract.status
          })
        }
        return contract
      }).filter(c => c !== null) as RentalContract[]

      console.log('✅ [ContractsStore.loadContracts] 파싱 완료:', {
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

      console.log('💾 [ContractsStore.loadContracts] 스토어 업데이트:', {
        beforeCount,
        afterCount,
        addedCount: parsedContracts.length
      })

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

  function parseRowToContract(
    row: any[],
    _headers: string[],
    sheetId: string,
    rowIndex: number
  ): RentalContract | null {
    try {
      // 실제 엑셀 시트 구조 (Tab 2: 아르테자이임대):
      // row[0]: 번호
      // row[1]: 동 (108)
      // row[2]: 호수 (108, 305, 306...)
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

      // 필수 필드 검증 (이름, 시작일, 종료일이 없으면 건너뛰기)
      if (!row[3] || !row[13] || !row[14]) {
        return null
      }

      // 동-호수 조합으로 주소 생성
      const building = row[1]?.toString() || ''
      const unit = row[2]?.toString() || ''
      const address = building ? `${building}동 ${unit}호` : unit

      // 보증금 파싱 (쉼표 제거)
      const depositStr = row[10]?.toString() || '0'
      const deposit = parseInt(depositStr.replace(/,/g, '')) || 0

      // 월세 파싱 (빈 값이면 undefined)
      const monthlyRentStr = row[11]?.toString()
      const monthlyRent = monthlyRentStr && monthlyRentStr.trim()
        ? parseInt(monthlyRentStr.replace(/,/g, ''))
        : undefined

      // 계약 타입 결정 (월세 값이 있으면 월세, 없으면 전세)
      const contractTypeValue = monthlyRent ? 'wolse' : 'jeonse'

      // 계약 구분 매핑 (최초 -> new, 갱신 -> renewal)
      const contractCategoryStr = row[6]?.toString() || ''
      let contractCategory: 'new' | 'renewal' | 'change' = 'new'
      if (contractCategoryStr.includes('갱신')) {
        contractCategory = 'renewal'
      } else if (contractCategoryStr.includes('변경')) {
        contractCategory = 'change'
      }

      // 상태 판단 (종료일 기준)
      const endDate = parseDate(row[14])
      const today = new Date()
      const status: 'active' | 'expired' | 'terminated' =
        endDate < today ? 'expired' : 'active'

      return {
        id: row[0]?.toString() || generateId(),
        sheetId,
        rowIndex,
        tenant: {
          name: row[3]?.toString() || '',
          phone: row[4]?.toString() || '',
          email: row[5]?.toString() || undefined,
          idNumber: row[7]?.toString() || undefined
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
          startDate: parseDate(row[13]),
          endDate: endDate,
          status: status,
          contractType: contractCategory
        },
        metadata: {
          createdAt: row[12] ? parseDate(row[12]) : new Date(),
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

  function clearError() {
    error.value = null
  }

  return {
    contracts,
    activeContracts,
    expiredContracts,
    contractsBySheet,
    isLoading,
    error,
    loadContracts,
    addContract,
    updateContract,
    deleteContract,
    clearError
  }
})
