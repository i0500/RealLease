import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sheetsService } from '@/services/google/sheetsService'
import { storageService } from '@/services/storageService'
import type { SheetConfig } from '@/types'
import { generateId, extractSpreadsheetId } from '@/utils/formatUtils'

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

  async function addSheet(name: string, sheetUrl: string, tabName?: string) {
    try {
      isLoading.value = true
      error.value = null

      const spreadsheetId = extractSpreadsheetId(sheetUrl)
      if (!spreadsheetId) {
        throw new Error('Invalid Google Sheets URL')
      }

      // 시트 접근 가능 여부 확인
      await sheetsService.getSpreadsheetMetadata(spreadsheetId)

      const newSheet: SheetConfig = {
        id: generateId(),
        name,
        sheetUrl,
        spreadsheetId,
        tabName,
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
      console.error('Add sheet error:', err)
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
