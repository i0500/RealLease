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

  // 현재 그룹(이름)의 임대차 시트 반환
  const currentRentalSheet = computed(() => {
    const current = currentSheet.value
    if (!current) return null

    // 같은 이름(그룹)의 rental 타입 시트 찾기
    return sheets.value.find(s =>
      s.name === current.name && s.sheetType === 'rental'
    ) || null
  })

  // 현재 그룹(이름)의 매도 시트 반환
  const currentSaleSheet = computed(() => {
    const current = currentSheet.value
    if (!current) return null

    // 같은 이름(그룹)의 sale 타입 시트 찾기
    return sheets.value.find(s =>
      s.name === current.name && s.sheetType === 'sale'
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
    console.log('➕ [SheetsStore.addSheet] 시작', {
      name,
      sheetUrl,
      tabName,
      sheetType,
      timestamp: new Date().toISOString()
    })

    try {
      isLoading.value = true
      error.value = null

      console.log('🔍 [SheetsStore.addSheet] URL에서 Spreadsheet ID 추출 중...')
      const spreadsheetId = extractSpreadsheetId(sheetUrl)

      if (!spreadsheetId) {
        console.error('❌ [SheetsStore.addSheet] 유효하지 않은 Google Sheets URL:', sheetUrl)
        throw new Error('Invalid Google Sheets URL')
      }

      console.log('✅ [SheetsStore.addSheet] Spreadsheet ID 추출 완료:', spreadsheetId)

      // gid 추출 (탭 ID)
      const extractedGid = extractGid(sheetUrl)
      console.log('🔢 [SheetsStore.addSheet] URL에서 gid 추출:', extractedGid || '없음')

      // 시트 접근 가능 여부 확인 및 실제 gid 가져오기
      console.log('🔐 [SheetsStore.addSheet] 시트 접근 권한 확인 중...')
      const metadata = await sheetsService.getSpreadsheetMetadata(spreadsheetId)
      console.log('✅ [SheetsStore.addSheet] 시트 접근 가능 확인')

      // metadata에서 시트 gid 가져오기
      let gid = extractedGid === null ? undefined : extractedGid

      if (metadata.sheets && metadata.sheets.length > 0) {
        // tabName이 지정된 경우, 해당 이름의 시트를 찾아 gid 설정
        if (tabName && !gid) {
          console.log('🔍 [SheetsStore.addSheet] tabName으로 시트 검색 중:', tabName)
          const matchedSheet = metadata.sheets.find(
            (s: any) => s.properties?.title === tabName
          )

          if (matchedSheet) {
            gid = matchedSheet.properties?.sheetId?.toString()
            console.log('✅ [SheetsStore.addSheet] tabName 일치하는 시트 발견:', {
              title: matchedSheet.properties?.title,
              gid: gid,
              index: matchedSheet.properties?.index
            })
          } else {
            console.warn('⚠️ [SheetsStore.addSheet] tabName과 일치하는 시트를 찾을 수 없음:', tabName)
            console.log('📋 [SheetsStore.addSheet] 사용 가능한 시트 목록:',
              metadata.sheets.map((s: any) => ({
                title: s.properties?.title,
                gid: s.properties?.sheetId,
                index: s.properties?.index
              }))
            )
          }
        }

        // gid가 여전히 없으면 첫 번째 시트 사용
        if (!gid) {
          const firstSheet = metadata.sheets[0]
          const firstSheetGid = firstSheet?.properties?.sheetId?.toString()
          if (firstSheetGid) {
            gid = firstSheetGid
            console.log('📋 [SheetsStore.addSheet] 기본값: 첫 번째 시트 gid 사용:', gid)
          }
        }
      }

      console.log('🔢 [SheetsStore.addSheet] 최종 gid:', gid || 'auto-detect (모든 탭 자동 탐색)')

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

      console.log('📋 [SheetsStore.addSheet] 새 시트 설정 생성:', {
        id: newSheet.id,
        name: newSheet.name,
        spreadsheetId: newSheet.spreadsheetId,
        tabName: newSheet.tabName || '(기본 탭)'
      })

      sheets.value.push(newSheet)

      // 저장 가능한 형태로 직렬화
      const serialized = serializeSheetsForStorage(sheets.value)
      await storageService.set(STORAGE_KEY, serialized)
      console.log('💾 [SheetsStore.addSheet] LocalStorage에 저장 완료')

      // 첫 시트라면 현재 시트로 설정
      if (sheets.value.length === 1) {
        currentSheetId.value = newSheet.id
        console.log('🎯 [SheetsStore.addSheet] 첫 시트로 자동 선택됨')
      }

      console.log('🎉 [SheetsStore.addSheet] 시트 추가 완료!')
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
