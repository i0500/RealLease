import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sheetsService } from '@/services/google/sheetsService'
import { storageService } from '@/services/storageService'
import type { SheetConfig } from '@/types'
import { generateId, extractSpreadsheetId, extractGid } from '@/utils/formatUtils'

const STORAGE_KEY = 'sheet_configs'

export const useSheetsStore = defineStore('sheets', () => {
  const sheets = ref<SheetConfig[]>([])
  const currentSheetId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const currentSheet = computed(() =>
    sheets.value.find(s => s.id === currentSheetId.value) || null
  )

  const sheetCount = computed(() => sheets.value.length)

  // Helper: tabName으로 시트 타입 추론 (sheetType이 없는 기존 시트 지원)
  function inferSheetType(sheet: SheetConfig): 'rental' | 'sale' | undefined {
    // 명시적 sheetType이 있으면 그대로 사용
    if (sheet.sheetType) return sheet.sheetType

    // tabName으로 추론
    if (sheet.tabName) {
      const tabNameLower = sheet.tabName.toLowerCase()
      if (tabNameLower.includes('매도') || tabNameLower.includes('sale')) {
        return 'sale'
      }
      // 매도가 아니면 rental로 간주
      return 'rental'
    }

    return undefined
  }

  // 현재 그룹(이름)의 임대차 시트 반환
  const currentRentalSheet = computed(() => {
    const current = currentSheet.value
    if (!current) return null

    // 같은 이름(그룹)의 rental 타입 시트 찾기 (tabName으로 추론 포함)
    return sheets.value.find(s =>
      s.name === current.name && inferSheetType(s) === 'rental'
    ) || null
  })

  // 현재 그룹(이름)의 매도 시트 반환
  const currentSaleSheet = computed(() => {
    const current = currentSheet.value
    if (!current) return null

    // 같은 이름(그룹)의 sale 타입 시트 찾기 (tabName으로 추론 포함)
    return sheets.value.find(s =>
      s.name === current.name && inferSheetType(s) === 'sale'
    ) || null
  })

  async function loadSheets() {
    try {
      isLoading.value = true
      error.value = null

      const stored = await storageService.get<SheetConfig[]>(STORAGE_KEY)
      if (stored) {
        sheets.value = stored.map(s => ({
          ...s,
          createdAt: new Date(s.createdAt),
          lastSynced: s.lastSynced ? new Date(s.lastSynced) : undefined
        }))

        if (sheets.value.length > 0 && !currentSheetId.value) {
          currentSheetId.value = sheets.value[0]!.id
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load sheets'
      console.error('Load sheets error:', err)
    } finally {
      isLoading.value = false
    }
  }

  // Helper: Date 객체를 ISO 문자열로 변환하여 저장 가능한 형태로 만들기
  function serializeSheetsForStorage(sheets: SheetConfig[]) {
    return sheets.map(sheet => ({
      ...sheet,
      createdAt: sheet.createdAt.toISOString(),
      lastSynced: sheet.lastSynced?.toISOString()
    }))
  }

  async function addSheet(name: string, sheetUrl: string, tabName?: string, sheetType?: 'rental' | 'sale') {
    try {
      isLoading.value = true
      error.value = null

      const spreadsheetId = extractSpreadsheetId(sheetUrl)

      if (!spreadsheetId) {
        throw new Error('Invalid Google Sheets URL')
      }

      // gid 추출 (탭 ID)
      const extractedGid = extractGid(sheetUrl)

      // 시트 접근 가능 여부 확인 및 실제 gid 가져오기
      const metadata = await sheetsService.getSpreadsheetMetadata(spreadsheetId)

      // metadata에서 시트 gid 가져오기
      let gid = extractedGid === null ? undefined : extractedGid

      if (metadata.sheets && metadata.sheets.length > 0) {
        // tabName이 지정된 경우, 해당 이름의 시트를 찾아 gid 설정
        if (tabName && !gid) {
          const matchedSheet = metadata.sheets.find(
            (s: any) => s.properties?.title === tabName
          )

          if (matchedSheet) {
            gid = matchedSheet.properties?.sheetId?.toString()
          }
        }

        // gid가 여전히 없으면 첫 번째 시트 사용
        if (!gid) {
          const firstSheet = metadata.sheets[0]
          const firstSheetGid = firstSheet?.properties?.sheetId?.toString()
          if (firstSheetGid) {
            gid = firstSheetGid
          }
        }
      }

      const newSheet: SheetConfig = {
        id: generateId(),
        name,
        sheetUrl,
        spreadsheetId,
        tabName,
        gid,
        sheetType, // ✅ 시트 타입 저장
        createdAt: new Date()
      }

      sheets.value.push(newSheet)

      // 저장 가능한 형태로 직렬화
      const serialized = serializeSheetsForStorage(sheets.value)
      await storageService.set(STORAGE_KEY, serialized)

      // 첫 시트라면 현재 시트로 설정
      if (sheets.value.length === 1) {
        currentSheetId.value = newSheet.id
      }

      return newSheet
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add sheet'
      console.error('❌ [SheetsStore.addSheet] 오류:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function removeSheet(sheetId: string) {
    try {
      isLoading.value = true
      error.value = null

      const index = sheets.value.findIndex(s => s.id === sheetId)
      if (index === -1) {
        throw new Error('Sheet not found')
      }

      sheets.value.splice(index, 1)

      // 저장 가능한 형태로 직렬화
      const serialized = serializeSheetsForStorage(sheets.value)
      await storageService.set(STORAGE_KEY, serialized)

      // 현재 시트가 삭제되었다면 다른 시트로 변경
      if (currentSheetId.value === sheetId) {
        currentSheetId.value = sheets.value.length > 0 ? sheets.value[0]!.id : null
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to remove sheet'
      console.error('Remove sheet error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateLastSynced(sheetId: string) {
    const sheet = sheets.value.find(s => s.id === sheetId)
    if (sheet) {
      sheet.lastSynced = new Date()

      // 저장 가능한 형태로 직렬화
      const serialized = serializeSheetsForStorage(sheets.value)
      await storageService.set(STORAGE_KEY, serialized)
    }
  }

  function setCurrentSheet(sheetId: string) {
    if (sheets.value.some(s => s.id === sheetId)) {
      currentSheetId.value = sheetId
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    sheets,
    currentSheetId,
    currentSheet,
    currentRentalSheet,
    currentSaleSheet,
    sheetCount,
    isLoading,
    error,
    loadSheets,
    addSheet,
    removeSheet,
    updateLastSynced,
    setCurrentSheet,
    clearError
  }
})
