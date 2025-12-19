import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { storageService } from '@/services/storageService'
import type { NotificationSettings } from '@/types/notification'
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/types/notification'

const STORAGE_KEY = 'notification_settings'

export const useNotificationSettingsStore = defineStore('notificationSettings', () => {
  const settings = ref<NotificationSettings>({ ...DEFAULT_NOTIFICATION_SETTINGS })
  const isLoading = ref(false)

  /**
   * 설정 로드
   */
  async function loadSettings() {
    try {
      isLoading.value = true
      const stored = await storageService.get<NotificationSettings>(STORAGE_KEY)

      if (stored) {
        settings.value = { ...DEFAULT_NOTIFICATION_SETTINGS, ...stored }
        console.log('✅ [NotificationSettings] 설정 로드 완료:', settings.value)
      } else {
        // 기본값으로 초기화 및 저장
        settings.value = { ...DEFAULT_NOTIFICATION_SETTINGS }
        await saveSettings()
        console.log('✅ [NotificationSettings] 기본 설정 생성 완료')
      }
    } catch (error) {
      console.error('❌ [NotificationSettings] 설정 로드 실패:', error)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 설정 저장
   */
  async function saveSettings() {
    try {
      // Vue reactive proxy를 plain object로 변환하여 IndexedDB에 저장
      const plainSettings = toRaw(settings.value)
      await storageService.set(STORAGE_KEY, plainSettings)
      console.log('✅ [NotificationSettings] 설정 저장 완료:', plainSettings)
    } catch (error) {
      console.error('❌ [NotificationSettings] 설정 저장 실패:', error)
      throw error
    }
  }

  /**
   * 설정 업데이트
   */
  async function updateSettings(newSettings: Partial<NotificationSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    await saveSettings()
  }

  /**
   * 설정 초기화
   */
  async function resetSettings() {
    settings.value = { ...DEFAULT_NOTIFICATION_SETTINGS }
    await saveSettings()
  }

  /**
   * 초기화
   */
  async function initialize() {
    await loadSettings()
  }

  return {
    settings,
    isLoading,
    loadSettings,
    saveSettings,
    updateSettings,
    resetSettings,
    initialize
  }
})
