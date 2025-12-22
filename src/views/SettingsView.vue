<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSheetsStore } from '@/stores/sheets'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
import { useNotificationSettingsStore } from '@/stores/notificationSettings'
import { formatDate } from '@/utils/dateUtils'
import type { SheetConfig } from '@/types/sheet'
import {
  NButton,
  NInput,
  NIcon,
  NSpin,
  NAlert,
  NModal,
  NCheckboxGroup,
  NCheckbox,
  NSelect,
  NTimePicker,
  NSwitch,
  useMessage,
  useDialog
} from 'naive-ui'
import {
  HomeOutline as HomeIcon,
  AddOutline as AddIcon,
  RefreshOutline as RefreshIcon,
  HelpCircleOutline as HelpIcon,
  CreateOutline as CreateIcon,
  SettingsOutline as SettingsIcon,
  PersonOutline as PersonIcon,
  DocumentTextOutline as DocumentIcon,
  NotificationsOutline as NotificationIcon,
  TimeOutline as TimeIcon,
  InformationCircleOutline as InfoIcon
} from '@vicons/ionicons5'
import { sheetsService } from '@/services/google/sheetsService'

const router = useRouter()
const authStore = useAuthStore()
const sheetsStore = useSheetsStore()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
const notificationSettingsStore = useNotificationSettingsStore()
const message = useMessage()
const dialog = useDialog()

// App info
const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0'
const appName = import.meta.env.VITE_APP_NAME || 'RealLease'

// Modal state
const showAddSheetModal = ref(false)
const showHelpGuide = ref(false)
const sheetForm = ref({
  name: '',
  sheetUrl: '',
  tabName: ''
})

// Create new sheet modal state
const showCreateSheetModal = ref(false)
const isCreatingSheet = ref(false)
const createSheetForm = ref({
  name: '',
  createRental: true,
  createSale: false
})

// Tab selection state
const availableTabs = ref<Array<{ title: string; gid: string; index: number }>>([])
const selectedTabs = ref<string[]>([])
const loadingTabs = ref(false)

// Sync state
const syncingSheetId = ref<string | null>(null)

// Notification settings
const notificationPermission = ref<NotificationPermission>('default')
const isRequestingPermission = ref(false)

// Notification period settings
const contractExpiryNoticeDays = ref(90)
const hugExpiryNoticeDays = ref(90)
const pushNotificationTime = ref('10:00')
const enablePushNotifications = ref(true)

// Options for period selection (1~6개월)
const periodOptions = [
  { label: '1개월 전', value: 30 },
  { label: '2개월 전', value: 60 },
  { label: '3개월 전', value: 90 },
  { label: '4개월 전', value: 120 },
  { label: '5개월 전', value: 150 },
  { label: '6개월 전', value: 180 }
]

// Load sheets on mount
onMounted(async () => {
  try {
    await sheetsStore.loadSheets()
    // Check notification permission
    notificationPermission.value = notificationsStore.pushNotificationService.getPermission()

    // Load notification settings
    await notificationSettingsStore.initialize()
    const settings = notificationSettingsStore.settings
    contractExpiryNoticeDays.value = settings.contractExpiryNoticeDays
    hugExpiryNoticeDays.value = settings.hugExpiryNoticeDays
    pushNotificationTime.value = settings.pushNotificationTime
    enablePushNotifications.value = settings.enablePushNotifications
  } catch (error) {
    console.error('Failed to load sheets:', error)
    message.error('시트 목록을 불러오는데 실패했습니다')
  }
})

// Request notification permission
async function handleRequestNotificationPermission() {
  try {
    isRequestingPermission.value = true
    const permission = await notificationsStore.pushNotificationService.requestPermission()
    notificationPermission.value = permission

    if (permission === 'granted') {
      message.success('알림 권한이 허용되었습니다! 이제 새로운 알림을 푸시로 받을 수 있습니다.')
    } else if (permission === 'denied') {
      message.error('알림 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.')
    } else {
      message.warning('알림 권한 요청이 취소되었습니다.')
    }
  } catch (error) {
    console.error('Failed to request notification permission:', error)
    message.error('알림 권한 요청에 실패했습니다')
  } finally {
    isRequestingPermission.value = false
  }
}

// Save notification settings
async function handleSaveNotificationSettings() {
  try {
    await notificationSettingsStore.updateSettings({
      contractExpiryNoticeDays: contractExpiryNoticeDays.value,
      hugExpiryNoticeDays: hugExpiryNoticeDays.value,
      pushNotificationTime: pushNotificationTime.value,
      enablePushNotifications: enablePushNotifications.value
    })

    // 설정 저장 후 알림 재체크
    await notificationsStore.checkNotifications()

    message.success('알림 설정이 저장되었습니다')
  } catch (error) {
    console.error('Failed to save notification settings:', error)
    message.error('알림 설정 저장에 실패했습니다')
  }
}

// Actions
function handleAddSheet() {
  sheetForm.value = {
    name: '',
    sheetUrl: '',
    tabName: ''
  }
  availableTabs.value = []
  selectedTabs.value = []
  showAddSheetModal.value = true
}

// Fetch available tabs from spreadsheet
async function fetchAvailableTabs() {
  if (!sheetForm.value.sheetUrl) {
    message.error('시트 URL을 먼저 입력해주세요')
    return
  }

  try {
    loadingTabs.value = true

    // Extract spreadsheet ID from URL
    const urlMatch = sheetForm.value.sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    if (!urlMatch || !urlMatch[1]) {
      message.error('올바른 구글 시트 URL이 아닙니다')
      return
    }

    const spreadsheetId = urlMatch[1]
    console.log('📋 [SettingsView] 스프레드시트 메타데이터 조회:', spreadsheetId)

    // Get metadata using sheetsService
    const { sheetsService } = await import('@/services/google/sheetsService')
    const metadata = await sheetsService.getSpreadsheetMetadata(spreadsheetId)

    if (metadata.sheets && metadata.sheets.length > 0) {
      availableTabs.value = metadata.sheets.map((sheet: any) => ({
        title: sheet.properties?.title || '(이름 없음)',
        gid: sheet.properties?.sheetId?.toString() || '0',
        index: sheet.properties?.index || 0
      }))

      console.log('✅ [SettingsView] 탭 목록 조회 완료:', availableTabs.value)
      message.success(`${availableTabs.value.length}개의 탭을 찾았습니다`)
    } else {
      message.warning('탭 정보를 찾을 수 없습니다')
    }
  } catch (error) {
    console.error('❌ [SettingsView] 탭 목록 조회 실패:', error)
    message.error('탭 목록을 불러오는데 실패했습니다. 시트 공유 권한을 확인해주세요.')
  } finally {
    loadingTabs.value = false
  }
}

async function handleSaveSheet() {
  try {
    if (!sheetForm.value.name || !sheetForm.value.sheetUrl) {
      message.error('시트 이름과 URL을 입력해주세요')
      return
    }

    // 탭 선택이 있는 경우
    if (selectedTabs.value.length > 0) {
      console.log('📋 [SettingsView] 선택된 탭으로 시트 추가:', selectedTabs.value)

      // 선택된 각 탭을 별도의 SheetConfig로 저장 (같은 그룹명 사용)
      for (const tabTitle of selectedTabs.value) {
        const tabInfo = availableTabs.value.find(t => t.title === tabTitle)
        if (!tabInfo) continue

        // ✅ 탭 이름에 따라 시트 타입 자동 판별
        let sheetType: 'rental' | 'sale' | undefined
        if (tabInfo.title.includes('매도현황')) {
          sheetType = 'sale'
        } else if (tabInfo.title.includes('현재현황') || tabInfo.title.includes('전체현황') || tabInfo.title.includes('임대차')) {
          sheetType = 'rental'
        }

        console.log(`➕ [SettingsView] 시트 추가:`, {
          name: sheetForm.value.name, // ← 파일명만 사용 (탭 이름 제거)
          tabTitle: tabInfo.title,
          gid: tabInfo.gid,
          sheetType
        })

        await sheetsStore.addSheet(
          sheetForm.value.name, // ← 모든 탭이 같은 그룹명 사용
          sheetForm.value.sheetUrl,
          tabInfo.title,
          sheetType // ← sheetType 전달
        )
      }

      message.success(`${selectedTabs.value.length}개의 탭이 "${sheetForm.value.name}" 그룹으로 추가되었습니다`)
    } else {
      // 탭 선택이 없으면 기존 방식대로 (첫 번째 탭 사용)
      await sheetsStore.addSheet(
        sheetForm.value.name,
        sheetForm.value.sheetUrl,
        sheetForm.value.tabName || undefined
      )

      message.success('시트가 추가되었습니다')
    }

    showAddSheetModal.value = false
  } catch (error) {
    console.error('Failed to add sheet:', error)
    message.error('시트 추가에 실패했습니다. URL을 확인해주세요.')
  }
}

// Handle create new sheet
async function handleCreateSheet() {
  if (!createSheetForm.value.name.trim()) {
    message.error('현장명(시트 이름)을 입력해주세요')
    return
  }

  if (!createSheetForm.value.createRental && !createSheetForm.value.createSale) {
    message.error('최소 하나의 탭을 선택해주세요')
    return
  }

  try {
    isCreatingSheet.value = true
    console.log('📋 [SettingsView] 새 스프레드시트 생성 시작:', createSheetForm.value)

    // Create new spreadsheet with selected tabs
    const result = await sheetsService.createSpreadsheet(
      createSheetForm.value.name.trim(),
      createSheetForm.value.createRental,
      createSheetForm.value.createSale
    )

    console.log('✅ [SettingsView] 스프레드시트 생성 완료:', result)

    // Auto-register created sheets
    for (const sheet of result.sheets) {
      // Determine sheet type based on tab name
      let sheetType: 'rental' | 'sale' | undefined
      if (sheet.title.includes('매도현황')) {
        sheetType = 'sale'
      } else if (sheet.title.includes('임대차현황')) {
        sheetType = 'rental'
      }

      console.log(`➕ [SettingsView] 시트 자동 등록:`, {
        name: createSheetForm.value.name.trim(),
        tabTitle: sheet.title,
        gid: sheet.gid,
        sheetType
      })

      await sheetsStore.addSheet(
        createSheetForm.value.name.trim(),
        result.spreadsheetUrl,
        sheet.title,
        sheetType
      )
    }

    message.success(`"${createSheetForm.value.name}" 스프레드시트가 생성되고 자동 등록되었습니다!`)

    // Open the created spreadsheet in new tab
    window.open(result.spreadsheetUrl, '_blank')

    // Reset form and close modal
    showCreateSheetModal.value = false
    createSheetForm.value = {
      name: '',
      createRental: true,
      createSale: false
    }
  } catch (error: any) {
    console.error('❌ [SettingsView] 스프레드시트 생성 실패:', error)
    message.error(error.message || '스프레드시트 생성에 실패했습니다')
  } finally {
    isCreatingSheet.value = false
  }
}

function handleRemoveSheet(sheet: SheetConfig) {
  dialog.warning({
    title: '시트 삭제',
    content: `"${sheet.name}" 시트를 삭제하시겠습니까? 이 시트와 연결된 모든 데이터가 삭제됩니다.`,
    positiveText: '삭제',
    negativeText: '취소',
    onPositiveClick: async () => {
      try {
        await sheetsStore.removeSheet(sheet.id)
        message.success('시트가 삭제되었습니다')
      } catch (error) {
        console.error('Failed to remove sheet:', error)
        message.error('시트 삭제에 실패했습니다')
      }
    }
  })
}

async function handleSyncSheet(sheet: SheetConfig) {
  try {
    syncingSheetId.value = sheet.id
    await contractsStore.loadContracts(sheet.id)
    await sheetsStore.updateLastSynced(sheet.id)
    await notificationsStore.checkNotifications()
    message.success('동기화가 완료되었습니다')
  } catch (error) {
    console.error('Failed to sync sheet:', error)
    message.error('동기화에 실패했습니다')
  } finally {
    syncingSheetId.value = null
  }
}

function handleLogout() {
  dialog.warning({
    title: '로그아웃',
    content: '로그아웃 하시겠습니까?',
    positiveText: '로그아웃',
    negativeText: '취소',
    onPositiveClick: async () => {
      try {
        await authStore.signOut()
        router.push({ name: 'auth' })
        message.success('로그아웃 되었습니다')
      } catch (error) {
        console.error('Failed to logout:', error)
        message.error('로그아웃에 실패했습니다')
      }
    }
  })
}

function copySheetUrl(url: string) {
  navigator.clipboard.writeText(url)
  message.success('URL이 복사되었습니다')
}

function handleResetApp() {
  dialog.error({
    title: '⚠️ 앱 데이터 초기화',
    content: '모든 로컬 데이터(로그인 정보, 시트 설정, 캐시)가 삭제됩니다. 계속하시겠습니까?',
    positiveText: '초기화',
    negativeText: '취소',
    onPositiveClick: () => {
      try {
        console.log('🔄 앱 데이터 초기화 시작...')

        // LocalStorage 완전 클리어
        localStorage.clear()
        console.log('✅ localStorage 클리어 완료')

        // 세션 스토리지도 클리어
        sessionStorage.clear()
        console.log('✅ sessionStorage 클리어 완료')

        // IndexedDB도 클리어 (PWA 캐시)
        if ('indexedDB' in window) {
          indexedDB.databases().then((databases) => {
            databases.forEach((db) => {
              if (db.name) {
                indexedDB.deleteDatabase(db.name)
                console.log(`✅ IndexedDB "${db.name}" 삭제 완료`)
              }
            })
          })
        }

        console.log('🎉 모든 데이터 초기화 완료! 즉시 새로고침...')

        // 즉시 페이지 리로드 (딜레이 제거하여 데이터 재저장 방지)
        location.reload()
      } catch (error) {
        console.error('❌ 데이터 초기화 실패:', error)
        message.error('데이터 초기화에 실패했습니다')
      }
    }
  })
}
</script>

<template>
  <div class="settings-container">
    <!-- Header Section -->
    <header class="settings-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-icon">
            <n-icon size="24" color="#fff">
              <SettingsIcon />
            </n-icon>
          </div>
          <div class="header-text">
            <h1 class="header-title">설정</h1>
            <p class="header-subtitle">시스템 환경설정</p>
          </div>
        </div>
        <n-button @click="router.push('/')" class="home-button">
          <template #icon>
            <n-icon><HomeIcon /></n-icon>
          </template>
          <span class="home-button-text">메인 화면</span>
        </n-button>
      </div>
    </header>

    <div class="settings-content">
      <!-- Left Column: Fixed height blocks -->
      <div class="settings-left-column">
        <!-- Account Section -->
        <section class="settings-section">
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-icon account">
                <n-icon size="20" color="#8b5cf6"><PersonIcon /></n-icon>
              </div>
              <div class="section-header-text">
                <h2 class="section-title">계정 정보</h2>
                <p class="section-subtitle">로그인 및 계정 관리</p>
              </div>
            </div>
            <div class="section-card-body">
              <div v-if="authStore.user" class="account-info">
                <div class="account-row">
                  <span class="account-label">이메일</span>
                  <span class="account-value">{{ authStore.user.email }}</span>
                </div>
                <div class="account-row">
                  <span class="account-label">이름</span>
                  <span class="account-value">{{ authStore.user.name }}</span>
                </div>
              </div>
              <div class="section-actions">
                <n-button type="error" size="small" @click="handleLogout">
                  로그아웃
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- Push Notification Section -->
        <section class="settings-section">
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-icon notification">
                <n-icon size="20" color="#f59e0b"><NotificationIcon /></n-icon>
              </div>
              <div class="section-header-text">
                <h2 class="section-title">푸시 알림</h2>
                <p class="section-subtitle">알림 권한 및 설정</p>
              </div>
            </div>
            <div class="section-card-body">
              <!-- Permission Status -->
              <div class="permission-card" :class="{
                'granted': notificationPermission === 'granted',
                'denied': notificationPermission === 'denied'
              }">
                <div class="permission-status">
                  <span class="permission-icon">
                    {{ notificationPermission === 'granted' ? '✅' : notificationPermission === 'denied' ? '❌' : '⚠️' }}
                  </span>
                  <div class="permission-text">
                    <span class="permission-label">알림 권한</span>
                    <span class="permission-value">
                      {{ notificationPermission === 'granted' ? '허용됨' : notificationPermission === 'denied' ? '거부됨' : '미설정' }}
                    </span>
                  </div>
                </div>
                <n-button
                  v-if="notificationPermission !== 'granted'"
                  type="primary"
                  size="small"
                  :loading="isRequestingPermission"
                  @click="handleRequestNotificationPermission"
                >
                  알림 허용
                </n-button>
              </div>

              <!-- Mobile Guide -->
              <div class="info-card">
                <div class="info-header">
                  <span class="info-icon">📱</span>
                  <span class="info-title">모바일에서 푸시 알림 받기</span>
                </div>
                <ol class="info-steps">
                  <li>모바일 브라우저에서 이 사이트를 엽니다</li>
                  <li>브라우저 메뉴에서 "홈 화면에 추가"를 선택합니다</li>
                  <li>홈 화면 아이콘으로 앱을 실행합니다</li>
                  <li>"알림 허용" 버튼을 눌러 권한을 허용합니다</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <!-- Notification Period Section -->
        <section class="settings-section">
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-icon time">
                <n-icon size="20" color="#3b82f6"><TimeIcon /></n-icon>
              </div>
              <div class="section-header-text">
                <h2 class="section-title">알림 기간 설정</h2>
                <p class="section-subtitle">만료 알림 수신 기간</p>
              </div>
            </div>
            <div class="section-card-body">
              <div class="settings-form">
                <div class="form-row">
                  <label class="form-label">계약 만료 알림</label>
                  <n-select
                    v-model:value="contractExpiryNoticeDays"
                    :options="periodOptions"
                    class="form-select"
                  />
                </div>
                <div class="form-row">
                  <label class="form-label">보험 만료 알림</label>
                  <n-select
                    v-model:value="hugExpiryNoticeDays"
                    :options="periodOptions"
                    class="form-select"
                  />
                </div>
                <div class="form-row toggle-row">
                  <div class="toggle-info">
                    <span class="form-label">푸시 알림 활성화</span>
                    <span class="form-hint">매일 설정한 시간에 알림 발송</span>
                  </div>
                  <n-switch v-model:value="enablePushNotifications" />
                </div>
                <div v-if="enablePushNotifications" class="form-row">
                  <label class="form-label">알림 시간</label>
                  <n-time-picker
                    v-model:formatted-value="pushNotificationTime"
                    format="HH:mm"
                    value-format="HH:mm"
                    class="form-select"
                  />
                </div>
              </div>
              <div class="section-footer">
                <n-button type="primary" @click="handleSaveNotificationSettings">
                  설정 저장
                </n-button>
              </div>
            </div>
          </div>
        </section>

        <!-- App Info Section -->
        <section class="settings-section">
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-icon info">
                <n-icon size="20" color="#6b7280"><InfoIcon /></n-icon>
              </div>
              <div class="section-header-text">
                <h2 class="section-title">앱 정보</h2>
                <p class="section-subtitle">버전 및 시스템 정보</p>
              </div>
            </div>
            <div class="section-card-body">
              <div class="app-info">
                <div class="info-row">
                  <span class="info-label">앱 이름</span>
                  <span class="info-value">{{ appName }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">버전</span>
                  <span class="info-value">{{ appVersion }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">설명</span>
                  <span class="info-value desc">구글 스프레드시트와 연동하여 임대차 계약을 관리합니다</span>
                </div>
              </div>
              <div class="danger-zone">
                <div class="danger-header">
                  <span class="danger-title">문제 해결</span>
                  <span class="danger-desc">데이터가 제대로 표시되지 않는 경우</span>
                </div>
                <n-button type="error" size="small" @click="handleResetApp">
                  앱 데이터 초기화
                </n-button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- Right Column: Variable height sheet management -->
      <div class="settings-right-column">
        <!-- Sheet Management Section -->
        <section class="settings-section sheets-section">
          <div class="section-card">
            <div class="section-card-header">
              <div class="section-icon sheets">
                <n-icon size="20" color="#10b981"><DocumentIcon /></n-icon>
              </div>
              <div class="section-header-text">
                <h2 class="section-title">구글 시트 관리</h2>
                <p class="section-subtitle">데이터 소스 연결 및 동기화</p>
              </div>
            </div>
            <div class="sheet-actions-bar">
              <n-button class="help-button" size="small" @click="showHelpGuide = true">
                <template #icon>
                  <n-icon><HelpIcon /></n-icon>
                </template>
                <span class="help-button-text">도움말</span>
              </n-button>
              <div class="sheet-actions-main">
                <n-button type="info" size="small" @click="showCreateSheetModal = true">
                  <template #icon>
                    <n-icon><CreateIcon /></n-icon>
                  </template>
                  <span class="btn-text">새 시트</span>
                </n-button>
                <n-button type="primary" size="small" @click="handleAddSheet">
                  <template #icon>
                    <n-icon><AddIcon /></n-icon>
                  </template>
                  <span class="btn-text">시트 추가</span>
                </n-button>
              </div>
            </div>
            <div class="section-card-body">
              <!-- Loading State -->
              <div v-if="sheetsStore.isLoading" class="loading-state">
                <n-spin size="medium" />
                <p>시트 목록을 불러오는 중...</p>
              </div>

              <!-- Error State -->
              <n-alert
                v-else-if="sheetsStore.error"
                type="error"
                closable
                @close="sheetsStore.clearError"
              >
                {{ sheetsStore.error }}
              </n-alert>

              <!-- Empty State -->
              <div v-else-if="sheetsStore.sheets.length === 0" class="empty-state">
                <div class="empty-icon">
                  <n-icon size="48" color="#94a3b8"><DocumentIcon /></n-icon>
                </div>
                <p class="empty-title">연결된 시트가 없습니다</p>
                <p class="empty-desc">구글 스프레드시트를 연결하여 시작하세요</p>
                <n-button type="primary" @click="handleAddSheet">첫 시트 추가하기</n-button>
              </div>

              <!-- Sheets List -->
              <div v-else class="sheets-list">
                <div v-for="sheet in sheetsStore.sheets" :key="sheet.id" class="sheet-item">
                  <div class="sheet-info">
                    <div class="sheet-name">{{ sheet.name }}</div>
                    <div class="sheet-meta">
                      <span v-if="sheet.tabName" class="sheet-tab">{{ sheet.tabName }}</span>
                      <a :href="sheet.sheetUrl" target="_blank" class="sheet-link">
                        {{ sheet.spreadsheetId.substring(0, 20) }}...
                      </a>
                    </div>
                    <div class="sheet-dates">
                      <span>생성: {{ formatDate(sheet.createdAt) }}</span>
                      <span v-if="sheet.lastSynced">· 동기화: {{ formatDate(sheet.lastSynced) }}</span>
                    </div>
                  </div>
                  <div class="sheet-actions">
                    <n-button
                      size="tiny"
                      quaternary
                      @click="copySheetUrl(sheet.sheetUrl)"
                    >
                      복사
                    </n-button>
                    <n-button
                      size="tiny"
                      :loading="syncingSheetId === sheet.id"
                      @click="handleSyncSheet(sheet)"
                    >
                      <template #icon>
                        <n-icon size="14"><RefreshIcon /></n-icon>
                      </template>
                      동기화
                    </n-button>
                    <n-button
                      size="tiny"
                      type="error"
                      quaternary
                      @click="handleRemoveSheet(sheet)"
                    >
                      삭제
                    </n-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- Add Sheet Modal -->
    <n-modal
      v-model:show="showAddSheetModal"
      preset="card"
      style="width: 600px; max-width: 95vw"
      :content-style="{ padding: 0 }"
      :header-style="{ display: 'none' }"
    >
      <div class="sheet-modal">
        <!-- Modal Header -->
        <div class="sheet-modal-header add">
          <div class="modal-header-icon">➕</div>
          <div class="modal-header-text">
            <h2>기존 시트 등록</h2>
            <p>구글 스프레드시트를 연결합니다</p>
          </div>
        </div>

        <!-- Form Content -->
        <div class="sheet-modal-body">
          <!-- Step 1: Sheet Name -->
          <div class="modal-form-group">
            <label class="form-group-label">
              <span class="label-step">1</span>
              <span class="label-text">현장명 (시트 이름)</span>
            </label>
            <n-input
              v-model:value="sheetForm.name"
              placeholder="예: 아르테 오피스텔"
              size="large"
            />
            <span class="form-hint">관리할 건물/현장의 이름을 입력하세요</span>
          </div>

          <!-- Step 2: Sheet URL -->
          <div class="modal-form-group">
            <label class="form-group-label">
              <span class="label-step">2</span>
              <span class="label-text">구글 시트 URL</span>
            </label>
            <n-input
              v-model:value="sheetForm.sheetUrl"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 3 }"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              size="large"
            />
            <n-button
              class="fetch-tabs-btn"
              type="primary"
              :loading="loadingTabs"
              :disabled="!sheetForm.sheetUrl"
              @click="fetchAvailableTabs"
            >
              <template #icon>
                <n-icon><RefreshIcon /></n-icon>
              </template>
              탭 목록 불러오기
            </n-button>
          </div>

          <!-- Step 3: Tab Selection (shown after fetching) -->
          <div v-if="availableTabs.length > 0" class="modal-form-group">
            <label class="form-group-label">
              <span class="label-step">3</span>
              <span class="label-text">등록할 탭 선택</span>
            </label>
            <div class="tabs-found-badge">
              ✅ {{ availableTabs.length }}개의 탭을 찾았습니다
            </div>
            <div class="tab-selection-list">
              <n-checkbox-group v-model:value="selectedTabs">
                <div class="tab-checkbox-grid">
                  <div
                    v-for="tab in availableTabs"
                    :key="tab.gid"
                    class="tab-checkbox-item"
                    :class="{ selected: selectedTabs.includes(tab.title) }"
                  >
                    <n-checkbox :value="tab.title">
                      <div class="tab-checkbox-content">
                        <span class="tab-name">{{ tab.title }}</span>
                        <span class="tab-gid">gid: {{ tab.gid }}</span>
                      </div>
                    </n-checkbox>
                  </div>
                </div>
              </n-checkbox-group>
            </div>
          </div>

          <!-- Info Box -->
          <div class="modal-info-box">
            <div class="info-box-header">
              <span class="info-box-icon">💡</span>
              <span>시트 등록 안내</span>
            </div>
            <ul class="info-box-list">
              <li>구글 시트 상단 주소창의 URL을 전체 복사하세요</li>
              <li>시트가 "링크가 있는 모든 사용자"로 공유되어야 합니다</li>
              <li>탭 이름에 따라 임대차/매도 유형이 자동 분류됩니다</li>
            </ul>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="sheet-modal-footer">
          <n-button size="large" @click="showAddSheetModal = false">취소</n-button>
          <n-button type="primary" size="large" @click="handleSaveSheet">
            시트 등록
          </n-button>
        </div>
      </div>
    </n-modal>

    <!-- Help Guide Modal -->
    <n-modal
      v-model:show="showHelpGuide"
      preset="card"
      style="width: 750px; max-width: 90vw; max-height: 85vh"
      :content-style="{ overflowY: 'auto', padding: 0 }"
      :header-style="{ display: 'none' }"
    >
      <div class="help-modal">
        <!-- Modal Header -->
        <div class="help-modal-header">
          <div class="help-header-icon">📚</div>
          <div class="help-header-text">
            <h2>시트 등록 가이드</h2>
            <p>구글 시트 연결 방법을 안내합니다</p>
          </div>
        </div>

        <!-- Quick Choice Section -->
        <div class="help-choice-section">
          <div class="help-choice-card existing">
            <div class="choice-icon">📋</div>
            <div class="choice-content">
              <strong>기존 시트가 있는 경우</strong>
              <span>구글 시트 또는 엑셀 파일을 연결합니다</span>
            </div>
          </div>
          <div class="help-choice-card new">
            <div class="choice-icon">🆕</div>
            <div class="choice-content">
              <strong>처음 시작하는 경우</strong>
              <span>앱에서 새 시트를 자동 생성합니다</span>
            </div>
          </div>
        </div>

        <!-- Existing Sheet Registration -->
        <div class="help-section">
          <div class="help-section-header existing">
            <span class="section-badge">기존 시트 등록</span>
          </div>

          <!-- Step 1: URL 복사 및 등록 (가장 먼저!) -->
          <div class="help-step">
            <div class="step-number">1</div>
            <div class="step-content">
              <h4>구글 시트 URL 복사하기</h4>
              <div class="step-body">
                <p>이미 구글 시트가 있다면 바로 등록할 수 있습니다:</p>
                <ol class="step-list">
                  <li>구글 시트를 열고 <strong>상단 주소창의 URL을 전체 복사</strong>합니다</li>
                  <li>RealLease 앱에서 <strong>"시트 추가"</strong> 버튼을 클릭합니다</li>
                  <li><strong>"시트 이름"</strong>에 현장명을 입력합니다 (예: 아르테 오피스텔)</li>
                  <li><strong>"시트 URL"</strong>에 복사한 링크를 붙여넣습니다</li>
                </ol>
                <div class="step-tip info">
                  <span class="tip-icon">💡</span>
                  <span>URL 예시: <code>https://docs.google.com/spreadsheets/d/1ABC...</code></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: 공유 설정 -->
          <div class="help-step">
            <div class="step-number">2</div>
            <div class="step-content">
              <h4>시트 공유 설정하기</h4>
              <div class="step-body">
                <p>앱에서 데이터를 읽으려면 공유 설정이 필요합니다:</p>
                <ol class="step-list">
                  <li>구글 시트 오른쪽 상단의 <strong>"공유"</strong> 버튼 클릭</li>
                  <li>"일반 액세스" 섹션에서 <strong>"링크가 있는 모든 사용자"</strong> 선택</li>
                  <li>권한을 <strong>"뷰어"</strong> 또는 <strong>"편집자"</strong>로 설정</li>
                  <li><strong>"완료"</strong> 버튼 클릭</li>
                </ol>
                <div class="step-tip warning">
                  <span class="tip-icon">⚠️</span>
                  <span>공유 설정이 없으면 앱에서 데이터를 불러올 수 없습니다</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: 탭 선택 -->
          <div class="help-step">
            <div class="step-number">3</div>
            <div class="step-content">
              <h4>탭 선택 및 등록 완료</h4>
              <div class="step-body">
                <ol class="step-list">
                  <li><strong>"탭 목록 불러오기"</strong> 버튼을 클릭합니다</li>
                  <li>스프레드시트의 모든 탭이 자동으로 조회됩니다</li>
                  <li>등록할 탭을 <strong>체크박스로 선택</strong>합니다</li>
                  <li><strong>"추가"</strong> 버튼을 클릭하면 완료!</li>
                </ol>
                <div class="step-tip success">
                  <span class="tip-icon">✨</span>
                  <span>탭 이름에 따라 임대차/매도현황이 자동 분류됩니다</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Excel file case -->
          <div class="help-note">
            <div class="note-header">
              <span class="note-icon">📁</span>
              <strong>엑셀 파일(.xlsx)을 사용하는 경우</strong>
            </div>
            <div class="note-body">
              <ol class="step-list compact">
                <li><a href="https://drive.google.com" target="_blank">구글 드라이브</a>에 엑셀 파일을 업로드합니다</li>
                <li>파일을 더블클릭 → <strong>"Google 스프레드시트로 열기"</strong> 선택</li>
                <li>변환된 시트의 URL을 복사하여 위 1단계부터 진행합니다</li>
              </ol>
            </div>
          </div>
        </div>

        <!-- New Sheet Creation -->
        <div class="help-section">
          <div class="help-section-header new">
            <span class="section-badge">새 시트 생성</span>
          </div>

          <div class="help-step compact">
            <div class="step-content full">
              <h4>🆕 데이터 없이 처음 시작할 때</h4>
              <div class="step-body">
                <p>앱에서 직접 새 구글 시트를 생성할 수 있습니다:</p>
                <ol class="step-list">
                  <li>설정 화면에서 <strong>"새 시트"</strong> 버튼 클릭</li>
                  <li>현장명 입력 (예: 아르테 오피스텔)</li>
                  <li>필요한 탭 선택:
                    <ul class="sub-list">
                      <li>📋 <strong>임대차현황</strong>: 임대차 계약 관리</li>
                      <li>🏠 <strong>매도현황</strong>: 매도 계약 관리</li>
                    </ul>
                  </li>
                  <li><strong>"시트 생성"</strong> 버튼 클릭</li>
                </ol>
                <div class="step-tip success">
                  <span class="tip-icon">✨</span>
                  <span>헤더 자동 생성 + 스타일 적용 + 앱 자동 등록까지 한번에!</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- FAQ Section -->
        <div class="help-section faq">
          <div class="help-section-header faq">
            <span class="section-badge">자주 묻는 질문</span>
          </div>

          <div class="faq-list">
            <div class="faq-item">
              <div class="faq-q">Q: 탭 목록 불러오기가 실패해요</div>
              <div class="faq-a">시트 공유 설정을 확인하고, 설정 후 잠시 기다린 뒤 다시 시도하세요.</div>
            </div>
            <div class="faq-item">
              <div class="faq-q">Q: 여러 탭을 등록했는데 어떻게 전환하나요?</div>
              <div class="faq-a">대시보드에서 시트 그룹 선택 시 해당 탭들이 자동 표시됩니다.</div>
            </div>
            <div class="faq-item">
              <div class="faq-q">Q: 데이터가 표시되지 않아요</div>
              <div class="faq-a">시트 목록에서 "동기화" 버튼을 클릭하여 최신 데이터를 불러오세요.</div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="help-modal-footer">
          <n-button type="primary" size="large" @click="showHelpGuide = false">
            확인
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- Create New Sheet Modal -->
    <n-modal
      v-model:show="showCreateSheetModal"
      preset="card"
      style="width: 520px; max-width: 95vw"
      :content-style="{ padding: 0 }"
      :header-style="{ display: 'none' }"
    >
      <div class="sheet-modal">
        <!-- Modal Header -->
        <div class="sheet-modal-header create">
          <div class="modal-header-icon">🆕</div>
          <div class="modal-header-text">
            <h2>새 시트 생성</h2>
            <p>구글 스프레드시트를 새로 만듭니다</p>
          </div>
        </div>

        <!-- Form Content -->
        <div class="sheet-modal-body">
          <!-- Site Name -->
          <div class="modal-form-group">
            <label class="form-group-label">
              <span class="label-step">1</span>
              <span class="label-text">현장명</span>
            </label>
            <n-input
              v-model:value="createSheetForm.name"
              placeholder="예: 아르테 오피스텔"
              size="large"
            />
            <span class="form-hint">관리할 건물/현장의 이름을 입력하세요</span>
          </div>

          <!-- Tab Selection -->
          <div class="modal-form-group">
            <label class="form-group-label">
              <span class="label-step">2</span>
              <span class="label-text">생성할 탭 선택</span>
            </label>
            <div class="create-tab-options">
              <div
                class="create-tab-option"
                :class="{ selected: createSheetForm.createRental }"
                @click="createSheetForm.createRental = !createSheetForm.createRental"
              >
                <div class="tab-option-check">
                  <n-checkbox v-model:checked="createSheetForm.createRental" />
                </div>
                <div class="tab-option-content">
                  <div class="tab-option-icon">📋</div>
                  <div class="tab-option-text">
                    <strong>임대차현황</strong>
                    <span>임대차 계약 관리</span>
                  </div>
                </div>
              </div>
              <div
                class="create-tab-option"
                :class="{ selected: createSheetForm.createSale }"
                @click="createSheetForm.createSale = !createSheetForm.createSale"
              >
                <div class="tab-option-check">
                  <n-checkbox v-model:checked="createSheetForm.createSale" />
                </div>
                <div class="tab-option-content">
                  <div class="tab-option-icon">🏠</div>
                  <div class="tab-option-text">
                    <strong>매도현황</strong>
                    <span>매도 계약 관리</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- What's included -->
          <div class="modal-feature-box">
            <div class="feature-box-header">
              <span class="feature-box-icon">✨</span>
              <span>자동으로 설정되는 항목</span>
            </div>
            <div class="feature-box-grid">
              <div class="feature-item">
                <span class="feature-icon">📊</span>
                <span>헤더 자동 생성</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">🎨</span>
                <span>스타일 자동 적용</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">🔗</span>
                <span>앱 자동 연결</span>
              </div>
              <div class="feature-item">
                <span class="feature-icon">🌐</span>
                <span>공유 설정 완료</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="sheet-modal-footer">
          <n-button size="large" @click="showCreateSheetModal = false" :disabled="isCreatingSheet">
            취소
          </n-button>
          <n-button
            type="primary"
            size="large"
            :loading="isCreatingSheet"
            @click="handleCreateSheet"
          >
            {{ isCreatingSheet ? '생성 중...' : '시트 생성' }}
          </n-button>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
/* Container */
.settings-container {
  min-height: 100vh;
  background: #f8fafc;
}

/* Header */
.settings-header {
  background: linear-gradient(135deg, #1a252f 0%, #2c3e50 50%, #34495e 100%);
  padding: 1.5rem;
  margin: 0 0 1.5rem 0;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 4px 20px rgba(44, 62, 80, 0.25);
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-text {
  color: #fff;
}

.header-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.header-subtitle {
  font-size: 0.875rem;
  opacity: 0.8;
  margin: 0.25rem 0 0 0;
}

.home-button {
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  color: #fff !important;
}

.home-button:hover {
  background: rgba(255, 255, 255, 0.2) !important;
}

/* Content */
.settings-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem 2rem 1rem;
  display: grid;
  gap: 1.5rem;
}

/* Section Cards */
.settings-section {
  width: 100%;
}

.section-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.section-card-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  border-bottom: 1px solid #f1f5f9;
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-icon.account {
  background: rgba(139, 92, 246, 0.1);
}

.section-icon.sheets {
  background: rgba(16, 185, 129, 0.1);
}

.section-icon.notification {
  background: rgba(245, 158, 11, 0.1);
}

.section-icon.time {
  background: rgba(59, 130, 246, 0.1);
}

.section-icon.info {
  background: rgba(107, 114, 128, 0.1);
}

.section-header-text {
  flex: 1;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.section-subtitle {
  font-size: 0.8125rem;
  color: #64748b;
  margin: 0.25rem 0 0 0;
}

.section-card-body {
  padding: 1.25rem;
}

.section-actions {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
}

.section-footer {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
}

/* Account Info */
.account-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.account-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.account-label {
  font-size: 0.875rem;
  color: #64748b;
  min-width: 60px;
}

.account-value {
  font-size: 0.9375rem;
  color: #1e293b;
  font-weight: 500;
}

/* Sheet Actions Bar */
.sheet-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.sheet-actions-main {
  display: flex;
  gap: 0.5rem;
}

/* Loading & Empty States */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
  gap: 1rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  text-align: center;
}

.empty-icon {
  margin-bottom: 1rem;
}

.empty-title {
  font-size: 1rem;
  font-weight: 600;
  color: #475569;
  margin: 0 0 0.5rem 0;
}

.empty-desc {
  font-size: 0.875rem;
  color: #94a3b8;
  margin: 0 0 1.5rem 0;
}

/* Sheets List */
.sheets-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sheet-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s ease;
}

.sheet-item:hover {
  border-color: #cbd5e1;
  background: #f1f5f9;
}

.sheet-info {
  flex: 1;
  min-width: 0;
}

.sheet-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.25rem;
}

.sheet-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}

.sheet-tab {
  font-size: 0.75rem;
  font-weight: 500;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
}

.sheet-link {
  font-size: 0.75rem;
  color: #64748b;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-link:hover {
  color: #3b82f6;
  text-decoration: underline;
}

.sheet-dates {
  font-size: 0.75rem;
  color: #94a3b8;
}

.sheet-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}

/* Permission Card */
.permission-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  margin-bottom: 1rem;
}

.permission-card.granted {
  background: #dcfce7;
  border-color: #86efac;
}

.permission-card.denied {
  background: #fee2e2;
  border-color: #fca5a5;
}

.permission-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.permission-icon {
  font-size: 1.5rem;
}

.permission-text {
  display: flex;
  flex-direction: column;
}

.permission-label {
  font-size: 0.875rem;
  color: #64748b;
}

.permission-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
}

/* Info Card */
.info-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.info-card .info-icon {
  font-size: 1.25rem;
}

.info-card .info-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
}

.info-steps {
  margin: 0;
  padding-left: 1.5rem;
  font-size: 0.875rem;
  color: #475569;
  line-height: 1.8;
}

/* Settings Form */
.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #475569;
  min-width: 120px;
  flex-shrink: 0;
}

.form-select {
  flex: 1;
  max-width: 200px;
}

.toggle-row {
  justify-content: space-between;
  padding: 0.75rem 0;
  border-top: 1px solid #f1f5f9;
}

.toggle-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-hint {
  font-size: 0.75rem;
  color: #94a3b8;
}

/* App Info */
.app-info {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.info-label {
  font-size: 0.875rem;
  color: #64748b;
  min-width: 60px;
  flex-shrink: 0;
}

.info-value {
  font-size: 0.9375rem;
  color: #1e293b;
  font-weight: 500;
}

.info-value.desc {
  font-weight: 400;
  color: #475569;
  line-height: 1.5;
}

/* Danger Zone */
.danger-zone {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.danger-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.danger-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #dc2626;
}

.danger-desc {
  font-size: 0.75rem;
  color: #991b1b;
}

/* Help Button Style */
.help-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
  border: none !important;
  color: #fff !important;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  transition: all 0.2s ease;
}

.help-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.help-button-text {
  margin-left: 4px;
}

/* =====================================================
   HELP MODAL STYLES
   ===================================================== */
.help-modal {
  background: #fff;
}

.help-modal-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.help-header-icon {
  font-size: 2.5rem;
}

.help-header-text h2 {
  color: #fff;
  font-size: 1.375rem;
  font-weight: 700;
  margin: 0;
}

.help-header-text p {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.875rem;
  margin: 0.25rem 0 0 0;
}

.help-choice-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  padding: 1.25rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.help-choice-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #fff;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
}

.help-choice-card.existing {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.help-choice-card.new {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.choice-icon {
  font-size: 1.5rem;
}

.choice-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.choice-content strong {
  font-size: 0.875rem;
  color: #1e293b;
}

.choice-content span {
  font-size: 0.75rem;
  color: #64748b;
}

.help-section {
  padding: 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.help-section.faq {
  background: #f8fafc;
  border-bottom: none;
}

.help-section-header {
  margin-bottom: 1rem;
}

.help-section-header .section-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.375rem 0.875rem;
  border-radius: 20px;
  font-size: 0.8125rem;
  font-weight: 600;
}

.help-section-header.existing .section-badge {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.help-section-header.new .section-badge {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

.help-section-header.faq .section-badge {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.help-step {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.help-step.compact {
  margin-bottom: 0;
}

.step-number {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: #fff;
  font-weight: 700;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-content.full {
  width: 100%;
}

.step-content h4 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem 0;
}

.step-body {
  font-size: 0.875rem;
  color: #475569;
}

.step-body p {
  margin: 0 0 0.75rem 0;
}

.step-list {
  margin: 0;
  padding-left: 1.25rem;
  line-height: 1.8;
}

.step-list.compact {
  line-height: 1.6;
}

.step-list li {
  margin-bottom: 0.25rem;
}

.sub-list {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style: none;
}

.sub-list li {
  margin-bottom: 0.25rem;
}

.step-tip {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
}

.step-tip.info {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  color: #1d4ed8;
}

.step-tip.warning {
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #b45309;
}

.step-tip.success {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  color: #047857;
}

.step-tip code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.tip-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.help-note {
  background: #f1f5f9;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1rem;
}

.note-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.note-icon {
  font-size: 1.25rem;
}

.note-header strong {
  font-size: 0.875rem;
  color: #1e293b;
}

.note-body {
  font-size: 0.8125rem;
  color: #475569;
}

.note-body a {
  color: #2563eb;
  text-decoration: none;
}

.note-body a:hover {
  text-decoration: underline;
}

.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.faq-item {
  background: #fff;
  border-radius: 10px;
  padding: 1rem;
  border: 1px solid #e2e8f0;
}

.faq-q {
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 0.5rem;
}

.faq-a {
  font-size: 0.8125rem;
  color: #64748b;
  line-height: 1.5;
}

.help-modal-footer {
  display: flex;
  justify-content: center;
  padding: 0.5rem 0;
}

/* =====================================================
   SHEET MODAL STYLES (Add & Create)
   ===================================================== */
.sheet-modal {
  background: #fff;
}

.sheet-modal-header {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.sheet-modal-header.add {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.sheet-modal-header.create {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
}

.modal-header-icon {
  font-size: 2rem;
}

.modal-header-text h2 {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
}

.modal-header-text p {
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.8125rem;
  margin: 0.25rem 0 0 0;
}

.sheet-modal-body {
  padding: 1.5rem;
}

.modal-form-group {
  margin-bottom: 1.5rem;
}

.modal-form-group:last-child {
  margin-bottom: 0;
}

.form-group-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.label-step {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.label-text {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
}

.form-hint {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.375rem;
}

.fetch-tabs-btn {
  margin-top: 0.75rem;
  width: 100%;
}

.tabs-found-badge {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.tab-selection-list {
  max-height: 200px;
  overflow-y: auto;
}

.tab-checkbox-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tab-checkbox-item {
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  transition: all 0.15s ease;
}

.tab-checkbox-item.selected {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.tab-checkbox-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: 0.25rem;
}

.tab-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;
}

.tab-gid {
  font-size: 0.75rem;
  color: #94a3b8;
}

.modal-info-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1.5rem;
}

.info-box-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.info-box-icon {
  font-size: 1.125rem;
}

.info-box-header span:last-child {
  font-size: 0.875rem;
  font-weight: 600;
  color: #0369a1;
}

.info-box-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.8125rem;
  color: #0c4a6e;
  line-height: 1.7;
}

.create-tab-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.create-tab-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 12px;
  border: 2px solid #e2e8f0;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.15s ease;
}

.create-tab-option:hover {
  border-color: #cbd5e1;
}

.create-tab-option.selected {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
}

.tab-option-check {
  flex-shrink: 0;
}

.tab-option-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.tab-option-icon {
  font-size: 1.5rem;
}

.tab-option-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tab-option-text strong {
  font-size: 0.9375rem;
  color: #1e293b;
}

.tab-option-text span {
  font-size: 0.8125rem;
  color: #64748b;
}

.modal-feature-box {
  background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
  border: 1px solid #86efac;
  border-radius: 12px;
  padding: 1rem;
  margin-top: 1.5rem;
}

.feature-box-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.feature-box-icon {
  font-size: 1.125rem;
}

.feature-box-header span:last-child {
  font-size: 0.875rem;
  font-weight: 600;
  color: #166534;
}

.feature-box-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #15803d;
}

.feature-icon {
  font-size: 1rem;
}

.sheet-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}

/* =====================================================
   PC LAYOUT (2 Columns: Left Fixed + Right Variable)
   ===================================================== */
@media (min-width: 900px) {
  .settings-content {
    display: flex;
    gap: 1.5rem;
    padding: 0 1.5rem 2rem 1.5rem;
    align-items: flex-start;
  }

  .settings-left-column {
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .settings-right-column {
    flex: 1;
    min-width: 0;
  }

  .sheets-section .section-card {
    min-height: 400px;
  }

  .header-content {
    padding: 0 0.5rem;
  }

  .home-button-text {
    display: inline;
  }

  .btn-text {
    display: inline;
  }

  .form-row {
    max-width: 100%;
  }
}

/* Tablet Layout (717px - 899px) */
@media (min-width: 717px) and (max-width: 899px) {
  .settings-content {
    display: block;
    padding: 0 1.5rem 2rem 1.5rem;
  }

  .settings-left-column,
  .settings-right-column {
    width: 100%;
  }

  .settings-left-column {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .settings-right-column {
    margin-bottom: 0;
  }

  .header-content {
    padding: 0 0.5rem;
  }

  .home-button-text {
    display: inline;
  }

  .btn-text {
    display: inline;
  }

  .form-row {
    max-width: 400px;
  }

  .help-choice-section {
    grid-template-columns: 1fr 1fr;
  }
}

/* Mobile Layout (Galaxy Fold folded and smaller) */
@media (max-width: 716px) {
  .settings-header {
    padding: 1rem;
    border-radius: 0;
    margin: 0 0 1rem 0;
  }

  .header-icon {
    width: 40px;
    height: 40px;
  }

  .header-title {
    font-size: 1.25rem;
  }

  .home-button-text {
    display: none;
  }

  .btn-text {
    display: none;
  }

  .help-button-text {
    display: none;
  }

  .settings-content {
    display: block;
    padding: 0 0.75rem 1.5rem 0.75rem;
  }

  .settings-left-column,
  .settings-right-column {
    width: 100%;
  }

  .settings-left-column {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .section-card {
    border-radius: 12px;
  }

  .section-card-header {
    padding: 1rem;
  }

  .section-icon {
    width: 36px;
    height: 36px;
  }

  .section-title {
    font-size: 1rem;
  }

  .section-card-body {
    padding: 1rem;
  }

  .sheet-actions-bar {
    padding: 0.5rem 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .sheet-item {
    flex-direction: column;
    gap: 0.75rem;
  }

  .sheet-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .form-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .form-label {
    min-width: auto;
  }

  .form-select {
    width: 100%;
    max-width: none;
  }

  .toggle-row {
    flex-direction: row;
    align-items: center;
  }

  .danger-zone {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .permission-card {
    flex-direction: column;
    align-items: flex-start;
  }

  /* Help Modal Mobile */
  .help-choice-section {
    grid-template-columns: 1fr;
    padding: 1rem;
  }

  .help-step {
    gap: 0.75rem;
  }

  .step-number {
    width: 28px;
    height: 28px;
    font-size: 0.75rem;
  }

  .feature-box-grid {
    grid-template-columns: 1fr;
  }
}

</style>
