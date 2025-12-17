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
      // 기본 데이터 파싱 (컬럼 인덱스는 실제 시트 구조에 맞게 조정 필요)
      return {
        id: row[0] || generateId(),
        sheetId,
        rowIndex,
        tenant: {
          name: row[1] || '',
          phone: row[2] || '',
          email: row[3],
          idNumber: row[4]
        },
        property: {
          address: row[5] || '',
          type: row[6] || '',
          unit: row[7]
        },
        contract: {
          type: (row[8] === '월세' ? 'wolse' : 'jeonse') as 'jeonse' | 'wolse',
          deposit: parseInt(row[9]) || 0,
          monthlyRent: row[10] ? parseInt(row[10]) : undefined,
          startDate: parseDate(row[11]),
          endDate: parseDate(row[12]),
          status: (row[13] || 'active') as 'active' | 'expired' | 'terminated',
          contractType: (row[14] || 'new') as 'new' | 'renewal' | 'change'
        },
        hug: row[15] === 'Y' ? {
          guaranteed: true,
          startDate: parseDate(row[16]),
          endDate: parseDate(row[17]),
          amount: parseInt(row[18]) || 0,
          insuranceNumber: row[19]
        } : undefined,
        realtor: row[20] ? {
          name: row[20],
          phone: row[21],
          address: row[22],
          fee: row[23] ? parseInt(row[23]) : undefined
        } : undefined,
        metadata: {
          createdAt: row[24] ? parseDate(row[24]) : new Date(),
          updatedAt: row[25] ? parseDate(row[25]) : new Date(),
          deletedAt: row[26] ? parseDate(row[26]) : undefined
        }
      }
    } catch (err) {
      console.error('Parse row error:', err)
      return null
    }
  }

  function contractToRow(contract: RentalContract): any[] {
    return [
      contract.id,
      contract.tenant.name,
      contract.tenant.phone,
      contract.tenant.email || '',
      contract.tenant.idNumber || '',
      contract.property.address,
      contract.property.type,
      contract.property.unit || '',
      contract.contract.type === 'wolse' ? '월세' : '전세',
      contract.contract.deposit,
      contract.contract.monthlyRent || '',
      contract.contract.startDate.toISOString().split('T')[0],
      contract.contract.endDate.toISOString().split('T')[0],
      contract.contract.status,
      contract.contract.contractType,
      contract.hug ? 'Y' : 'N',
      contract.hug?.startDate.toISOString().split('T')[0] || '',
      contract.hug?.endDate.toISOString().split('T')[0] || '',
      contract.hug?.amount || '',
      contract.hug?.insuranceNumber || '',
      contract.realtor?.name || '',
      contract.realtor?.phone || '',
      contract.realtor?.address || '',
      contract.realtor?.fee || '',
      contract.metadata.createdAt.toISOString().split('T')[0],
      contract.metadata.updatedAt.toISOString().split('T')[0],
      contract.metadata.deletedAt?.toISOString().split('T')[0] || ''
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
