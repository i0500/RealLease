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
  NCard,
  NButton,
  NInput,
  NSpace,
  NList,
  NIcon,
  NListItem,
  NThing,
  NSpin,
  NAlert,
  NEmpty,
  NModal,
  NForm,
  NFormItem,
  NDivider,
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
  CreateOutline as CreateIcon
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
  <div class="settings-view">
    <!-- Navigation Header -->
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold" style="color: #2c3e50;">설정</h1>
      <n-space>
        <n-button @click="router.push('/')" secondary>
          <template #icon>
            <n-icon><HomeIcon /></n-icon>
          </template>
          메인 화면
        </n-button>
      </n-space>
    </div>

    <!-- User Profile -->
    <n-card title="계정 정보" class="mb-6">
      <n-space vertical>
        <div v-if="authStore.user">
          <p><strong>이메일:</strong> {{ authStore.user.email }}</p>
          <p><strong>이름:</strong> {{ authStore.user.name }}</p>
        </div>
        <n-button type="error" @click="handleLogout">로그아웃</n-button>
      </n-space>
    </n-card>

    <n-divider />

    <!-- Sheet Management -->
    <n-card class="mb-6">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">구글 시트 관리</h2>
          <n-space>
            <n-button @click="showHelpGuide = true">
              <template #icon>
                <n-icon><HelpIcon /></n-icon>
              </template>
              도움말
            </n-button>
            <n-button type="info" @click="showCreateSheetModal = true">
              <template #icon>
                <n-icon><CreateIcon /></n-icon>
              </template>
              새 시트 생성
            </n-button>
            <n-button type="primary" @click="handleAddSheet">
              <template #icon>
                <n-icon><AddIcon /></n-icon>
              </template>
              시트 추가
            </n-button>
          </n-space>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="sheetsStore.isLoading" class="text-center py-10">
        <n-spin size="large" />
        <p class="mt-4 text-gray-600">시트 목록을 불러오는 중...</p>
      </div>

      <!-- Error State -->
      <n-alert
        v-else-if="sheetsStore.error"
        type="error"
        class="mb-4"
        closable
        @close="sheetsStore.clearError"
      >
        {{ sheetsStore.error }}
      </n-alert>

      <!-- Empty State -->
      <n-empty v-else-if="sheetsStore.sheets.length === 0" description="연결된 시트가 없습니다">
        <template #extra>
          <n-button type="primary" @click="handleAddSheet">첫 시트 추가하기</n-button>
        </template>
      </n-empty>

      <!-- Sheets List -->
      <n-list v-else hoverable>
        <n-list-item v-for="sheet in sheetsStore.sheets" :key="sheet.id">
          <n-thing :title="sheet.name">

            <template #description>
              <n-space vertical size="small">
                <div class="flex items-center gap-2">
                  <span class="text-sm text-gray-600">URL:</span>
                  <a
                    :href="sheet.sheetUrl"
                    target="_blank"
                    class="text-blue-500 hover:underline text-sm"
                  >
                    {{ sheet.spreadsheetId }}
                  </a>
                  <n-button size="tiny" @click="copySheetUrl(sheet.sheetUrl)">복사</n-button>
                </div>
                <div v-if="sheet.tabName" class="text-sm text-gray-600">
                  탭: {{ sheet.tabName }}
                </div>
                <div class="text-sm text-gray-600">
                  생성일: {{ formatDate(sheet.createdAt) }}
                </div>
                <div v-if="sheet.lastSynced" class="text-sm text-gray-600">
                  마지막 동기화: {{ formatDate(sheet.lastSynced) }}
                </div>
              </n-space>
            </template>

            <template #footer>
              <n-space>
                <n-button
                  size="small"
                  :loading="syncingSheetId === sheet.id"
                  @click="handleSyncSheet(sheet)"
                >
                  <template #icon>
                    <n-icon><RefreshIcon /></n-icon>
                  </template>
                  동기화
                </n-button>
                <n-button
                  size="small"
                  type="error"
                  @click="handleRemoveSheet(sheet)"
                >
                  삭제
                </n-button>
              </n-space>
            </template>
          </n-thing>
        </n-list-item>
      </n-list>
    </n-card>

    <n-divider />

    <!-- Notification Settings -->
    <n-card title="푸시 알림 설정" class="mb-6">
      <n-space vertical>
        <p class="text-sm text-gray-700">
          계약 만료, HUG 보증 만료 등 중요한 알림을 푸시로 받을 수 있습니다.
        </p>

        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p class="font-semibold mb-1">알림 권한 상태</p>
            <p class="text-sm text-gray-600">
              <span v-if="notificationPermission === 'granted'" class="text-green-600 font-medium">
                ✅ 허용됨 - 푸시 알림을 받을 수 있습니다
              </span>
              <span v-else-if="notificationPermission === 'denied'" class="text-red-600 font-medium">
                ❌ 거부됨 - 브라우저 설정에서 권한을 변경해주세요
              </span>
              <span v-else class="text-gray-600 font-medium">
                ⚠️ 미설정 - 아래 버튼을 눌러 권한을 허용해주세요
              </span>
            </p>
          </div>
          <n-button
            v-if="notificationPermission !== 'granted'"
            type="primary"
            :loading="isRequestingPermission"
            @click="handleRequestNotificationPermission"
          >
            🔔 알림 허용하기
          </n-button>
        </div>

        <n-alert type="info" class="mt-2">
          <template #header>
            <strong>📱 모바일에서 푸시 알림 받기</strong>
          </template>
          <n-space vertical size="small" class="text-sm">
            <p>1. 모바일 브라우저에서 이 사이트를 엽니다</p>
            <p>2. 브라우저 메뉴에서 <strong>"홈 화면에 추가"</strong> 또는 <strong>"바로가기 추가"</strong>를 선택합니다</p>
            <p>3. 홈 화면에 추가된 아이콘을 통해 앱을 실행합니다</p>
            <p>4. 위의 <strong>"알림 허용하기"</strong> 버튼을 눌러 권한을 허용합니다</p>
            <p>5. 이제 새로운 알림이 생성되면 푸시로 받을 수 있습니다!</p>
          </n-space>
        </n-alert>

        <n-alert type="warning" class="mt-2">
          <strong>주의사항</strong><br />
          • 푸시 알림은 권한을 허용한 기기에서만 받을 수 있습니다<br />
          • 앱이 백그라운드에 있어도 알림을 받을 수 있습니다<br />
          • 알림 권한을 거부하면 브라우저 설정에서 직접 변경해야 합니다
        </n-alert>
      </n-space>
    </n-card>

    <n-divider />

    <!-- Notification Period Settings -->
    <n-card title="⏰ 알림 기간 설정" class="mb-6">
      <n-space vertical size="large">
        <p class="text-sm text-gray-700">
          계약 만료 및 보험 만료 알림을 받을 기간을 설정할 수 있습니다.
        </p>

        <!-- 계약 만료 알림 기간 -->
        <n-form-item label="계약 만료 알림 기간" label-placement="left">
          <n-select
            v-model:value="contractExpiryNoticeDays"
            :options="periodOptions"
            style="width: 200px"
          />
        </n-form-item>

        <!-- HUG 보증 만료 알림 기간 -->
        <n-form-item label="보험 만료 알림 기간" label-placement="left">
          <n-select
            v-model:value="hugExpiryNoticeDays"
            :options="periodOptions"
            style="width: 200px"
          />
        </n-form-item>

        <!-- 푸시 알림 활성화 -->
        <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p class="font-semibold mb-1">푸시 알림 활성화</p>
            <p class="text-sm text-gray-600">
              설정한 시간에 하루 한 번 알림을 푸시로 받습니다
            </p>
          </div>
          <n-switch v-model:value="enablePushNotifications" />
        </div>

        <!-- 푸시 알림 시간대 -->
        <n-form-item
          v-if="enablePushNotifications"
          label="푸시 알림 시간"
          label-placement="left"
        >
          <n-time-picker
            v-model:formatted-value="pushNotificationTime"
            format="HH:mm"
            value-format="HH:mm"
            style="width: 200px"
          />
        </n-form-item>

        <n-alert type="info">
          <strong>알림 정책</strong><br />
          • 설정한 기간 이내에 만료되는 계약/보험에 대해 알림이 생성됩니다<br />
          • 푸시 알림은 앱을 열었을 때 설정 시간이 지났으면 자동으로 발송됩니다<br />
          • 알림 권한이 허용되어 있어야 푸시 알림을 받을 수 있습니다
        </n-alert>

        <div class="flex justify-end">
          <n-button type="primary" @click="handleSaveNotificationSettings">
            💾 설정 저장
          </n-button>
        </div>
      </n-space>
    </n-card>

    <!-- App Information -->
    <n-card title="앱 정보">
      <n-space vertical>
        <p><strong>버전:</strong> {{ appVersion }}</p>
        <p><strong>앱 이름:</strong> {{ appName }}</p>
        <p class="text-sm text-gray-600">
          부동산 임대차 관리 시스템 - 구글 스프레드시트와 연동하여 임대차 계약을 관리합니다.
        </p>

        <n-divider />

        <div>
          <p class="text-sm text-gray-600 mb-2">
            <strong>문제 해결:</strong> 데이터가 제대로 표시되지 않거나 개발 모드 데이터가 보이는 경우
          </p>
          <n-button type="error" @click="handleResetApp">
            🔄 앱 데이터 초기화
          </n-button>
        </div>
      </n-space>
    </n-card>

    <!-- Add Sheet Modal -->
    <n-modal
      v-model:show="showAddSheetModal"
      preset="card"
      title="시트 추가"
      style="width: 600px"
    >
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="시트 이름" required>
          <n-input
            v-model:value="sheetForm.name"
            placeholder="예: 아르테 임대차 현황"
          />
        </n-form-item>

        <n-form-item label="시트 URL" required>
          <n-space vertical style="width: 100%">
            <n-input
              v-model:value="sheetForm.sheetUrl"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
            <n-button
              type="primary"
              :loading="loadingTabs"
              :disabled="!sheetForm.sheetUrl"
              @click="fetchAvailableTabs"
            >
              📋 탭 목록 불러오기
            </n-button>
          </n-space>
        </n-form-item>

        <!-- Tab selection (shown after fetching) -->
        <n-form-item v-if="availableTabs.length > 0" label="탭 선택" required>
          <n-space vertical style="width: 100%">
            <n-alert type="success" size="small">
              {{ availableTabs.length }}개의 탭을 찾았습니다. 등록할 탭을 선택하세요:
            </n-alert>
            <n-checkbox-group v-model:value="selectedTabs">
              <n-space vertical>
                <n-checkbox
                  v-for="tab in availableTabs"
                  :key="tab.gid"
                  :value="tab.title"
                  :label="`${tab.index + 1}. ${tab.title} (gid: ${tab.gid})`"
                />
              </n-space>
            </n-checkbox-group>
          </n-space>
        </n-form-item>

        <n-alert type="info" class="mt-4">
          <strong>안내:</strong><br />
          1. 구글 스프레드시트를 열고 상단의 URL을 복사해주세요<br />
          2. 시트는 "공유 가능한 링크가 있는 모든 사용자" 권한이 필요합니다<br />
          3. "탭 목록 불러오기" 버튼을 클릭하여 사용 가능한 탭을 확인하세요<br />
          4. 여러 탭을 선택하면 각각 별도의 시트로 등록됩니다
        </n-alert>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddSheetModal = false">취소</n-button>
          <n-button type="primary" @click="handleSaveSheet">추가</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Help Guide Modal -->
    <n-modal
      v-model:show="showHelpGuide"
      preset="card"
      title="📚 시트 등록 가이드"
      style="width: 750px; max-width: 90vw; max-height: 85vh"
      :content-style="{ overflowY: 'auto' }"
    >
      <n-space vertical size="large">
        <!-- 방법 선택 안내 -->
        <n-alert type="info">
          <template #header>
            <strong>시트 등록 방법 안내</strong>
          </template>
          <n-space vertical size="small" class="text-sm mt-2">
            <p><strong>📋 기존 엑셀/구글 시트가 있는 경우:</strong> 1~3단계를 따라 시트를 등록하세요</p>
            <p><strong>🆕 처음 시작하는 경우:</strong> 아래 "새 시트 생성" 가이드를 참고하세요</p>
          </n-space>
        </n-alert>

        <n-divider title-placement="left">
          <span class="text-base font-semibold">📂 기존 시트 등록하기</span>
        </n-divider>

        <!-- Step 1 -->
        <div>
          <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
            1단계: 엑셀 파일을 구글 시트로 변환
          </h3>
          <n-space vertical size="small">
            <p class="text-sm text-gray-700">① 구글 드라이브(<a href="https://drive.google.com" target="_blank" class="text-blue-500 hover:underline">drive.google.com</a>)에 접속합니다</p>
            <p class="text-sm text-gray-700">② 왼쪽 상단의 <strong>"+ 새로 만들기"</strong> 버튼을 클릭합니다</p>
            <p class="text-sm text-gray-700">③ <strong>"파일 업로드"</strong>를 선택하여 엑셀 파일(.xlsx, .xls)을 업로드합니다</p>
            <p class="text-sm text-gray-700">④ 업로드된 엑셀 파일을 더블클릭하여 엽니다</p>
            <p class="text-sm text-gray-700">⑤ 상단 메뉴에서 <strong>"Google Sheets로 열기"</strong> 또는 <strong>"Google 스프레드시트로 열기"</strong>를 클릭합니다</p>
            <n-alert type="success" class="mt-2">
              <template #icon>
                <n-icon><HelpIcon /></n-icon>
              </template>
              <span class="text-sm">엑셀 파일이 구글 시트 형식(.gsheet)으로 자동 변환됩니다</span>
            </n-alert>
          </n-space>
        </div>

        <n-divider />

        <!-- Step 2 -->
        <div>
          <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
            2단계: 시트 공유 설정
          </h3>
          <n-space vertical size="small">
            <p class="text-sm text-gray-700">① 변환된 구글 시트에서 오른쪽 상단의 <strong>"공유"</strong> 버튼을 클릭합니다</p>
            <p class="text-sm text-gray-700">② "일반 액세스" 섹션에서 <strong>"제한됨"</strong>을 클릭합니다</p>
            <p class="text-sm text-gray-700">③ <strong>"링크가 있는 모든 사용자"</strong>를 선택합니다</p>
            <p class="text-sm text-gray-700">④ 권한을 <strong>"뷰어"</strong> 또는 <strong>"편집자"</strong>로 설정합니다</p>
            <p class="text-sm text-gray-700 ml-4">
              • <strong>뷰어</strong>: 앱에서 데이터를 읽기만 가능 (권장)<br />
              • <strong>편집자</strong>: 앱에서 데이터 수정 가능
            </p>
            <p class="text-sm text-gray-700">⑤ <strong>"완료"</strong> 버튼을 클릭합니다</p>
            <n-alert type="warning" class="mt-2">
              <span class="text-sm"><strong>중요:</strong> 링크가 있는 모든 사용자가 접근할 수 있도록 설정해야 앱에서 데이터를 불러올 수 있습니다</span>
            </n-alert>
          </n-space>
        </div>

        <n-divider />

        <!-- Step 3 -->
        <div>
          <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
            3단계: 시트 URL 등록 및 탭 불러오기
          </h3>
          <n-space vertical size="small">
            <p class="text-sm text-gray-700">① 구글 시트 상단 주소창의 URL을 전체 선택하여 복사합니다</p>
            <p class="text-sm text-gray-700 ml-4 text-gray-500">
              예: <code class="bg-gray-100 px-1 rounded">https://docs.google.com/spreadsheets/d/1ABC...</code>
            </p>
            <p class="text-sm text-gray-700">② RealLease 앱의 <strong>"시트 추가"</strong> 버튼을 클릭합니다</p>
            <p class="text-sm text-gray-700">③ <strong>"시트 이름"</strong>에 구분하기 쉬운 이름을 입력합니다</p>
            <p class="text-sm text-gray-700 ml-4 text-gray-500">예: "아르테 오피스텔", "A동 관리" 등 (현장명 권장)</p>
            <p class="text-sm text-gray-700">④ <strong>"시트 URL"</strong>에 복사한 구글 시트 링크를 붙여넣습니다</p>
          </n-space>

          <!-- 탭 불러오기 가이드 -->
          <n-alert type="success" class="mt-4">
            <template #header>
              <strong>📋 탭 목록 불러오기 기능</strong>
            </template>
            <n-space vertical size="small" class="text-sm mt-2">
              <p>⑤ <strong>"탭 목록 불러오기"</strong> 버튼을 클릭합니다</p>
              <p class="ml-4 text-gray-600">→ 스프레드시트에 있는 모든 탭이 자동으로 조회됩니다</p>
              <p>⑥ 등록하고 싶은 탭을 <strong>체크박스로 선택</strong>합니다</p>
              <p class="ml-4 text-gray-600">→ 여러 탭을 동시에 선택할 수 있습니다</p>
              <p class="ml-4 text-gray-600">→ "현재현황", "전체현황", "임대차" 포함 탭은 <strong>임대차현황</strong>으로 자동 분류</p>
              <p class="ml-4 text-gray-600">→ "매도현황" 포함 탭은 <strong>매도현황</strong>으로 자동 분류</p>
              <p>⑦ <strong>"추가"</strong> 버튼을 클릭하면 선택한 탭들이 같은 그룹으로 등록됩니다</p>
            </n-space>
          </n-alert>

          <n-alert type="info" class="mt-2">
            <span class="text-sm">
              <strong>💡 그룹이란?</strong> 같은 현장(건물)의 여러 탭을 하나의 그룹으로 관리합니다.<br />
              예: "아르테 오피스텔" 그룹 아래에 "임대차현황", "매도현황" 탭이 함께 등록됩니다.
            </span>
          </n-alert>
        </div>

        <n-divider title-placement="left">
          <span class="text-base font-semibold">🆕 새 시트 생성하기 (데이터가 없는 경우)</span>
        </n-divider>

        <!-- New Sheet Creation Guide -->
        <div>
          <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
            처음 시작할 때: 새 시트 생성
          </h3>
          <n-space vertical size="small">
            <p class="text-sm text-gray-700">기존 엑셀 파일 없이 처음 시작하는 경우, 앱에서 직접 새 시트를 생성할 수 있습니다.</p>

            <n-alert type="success" class="mt-2">
              <template #header>
                <strong>📝 새 시트 생성 방법</strong>
              </template>
              <n-space vertical size="small" class="text-sm mt-2">
                <p>① 설정 화면에서 <strong>"새 시트 생성"</strong> 버튼을 클릭합니다</p>
                <p>② <strong>"현장명"</strong>에 관리할 건물/현장 이름을 입력합니다</p>
                <p class="ml-4 text-gray-600">예: "아르테 오피스텔", "강남 타워" 등</p>
                <p>③ 필요한 탭을 선택합니다:</p>
                <p class="ml-4 text-gray-600">• <strong>📋 임대차현황</strong>: 임대차 계약 관리용 (호수, 계약자, 보증금, 계약기간 등)</p>
                <p class="ml-4 text-gray-600">• <strong>🏠 매도현황</strong>: 매도 계약 관리용 (호수, 매수자, 계약금, 잔금 등)</p>
                <p>④ <strong>"시트 생성"</strong> 버튼을 클릭합니다</p>
              </n-space>
            </n-alert>

            <n-alert type="info" class="mt-2">
              <template #header>
                <strong>✨ 자동 설정 기능</strong>
              </template>
              <n-space vertical size="small" class="text-sm mt-2">
                <p>• 구글 스프레드시트가 자동으로 생성됩니다</p>
                <p>• 선택한 탭별로 <strong>헤더(열 제목)가 자동 생성</strong>됩니다</p>
                <p>• 헤더에 <strong>스타일(색상, 고정 등)이 자동 적용</strong>됩니다</p>
                <p>• 생성된 시트가 <strong>앱에 자동 등록</strong>됩니다</p>
                <p>• 완료 후 새 탭에서 구글 시트가 열립니다</p>
              </n-space>
            </n-alert>

            <n-alert type="warning" class="mt-2">
              <span class="text-sm">
                <strong>참고:</strong> 새로 생성된 시트는 자동으로 "링크가 있는 모든 사용자"에게 공유됩니다.<br />
                데이터를 입력한 후 <strong>"동기화"</strong> 버튼을 클릭하면 앱에서 데이터를 확인할 수 있습니다.
              </span>
            </n-alert>
          </n-space>
        </div>

        <n-divider />

        <!-- FAQ Section -->
        <div>
          <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
            ❓ 자주 묻는 질문
          </h3>
          <n-space vertical size="small">
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-semibold text-gray-800">Q: 탭 목록 불러오기가 실패해요</p>
              <p class="text-sm text-gray-600 mt-1">A: 시트 공유 설정이 "링크가 있는 모든 사용자"로 되어있는지 확인해주세요. 공유 설정 후 몇 분 정도 기다린 후 다시 시도해보세요.</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-semibold text-gray-800">Q: 여러 탭을 등록했는데 어떻게 전환하나요?</p>
              <p class="text-sm text-gray-600 mt-1">A: 대시보드나 메뉴에서 시트 그룹을 선택하면 해당 그룹의 임대차/매도현황 탭이 자동으로 표시됩니다.</p>
            </div>
            <div class="p-3 bg-gray-50 rounded-lg">
              <p class="text-sm font-semibold text-gray-800">Q: 데이터가 표시되지 않아요</p>
              <p class="text-sm text-gray-600 mt-1">A: 시트 목록에서 해당 시트의 <strong>"동기화"</strong> 버튼을 클릭하여 최신 데이터를 불러오세요.</p>
            </div>
          </n-space>
        </div>
      </n-space>

      <template #footer>
        <n-space justify="end">
          <n-button type="primary" @click="showHelpGuide = false">확인</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Create New Sheet Modal -->
    <n-modal
      v-model:show="showCreateSheetModal"
      preset="card"
      title="새 시트 생성"
      style="width: 500px"
    >
      <n-form label-placement="left" label-width="120px">
        <n-form-item label="현장명" required>
          <n-input
            v-model:value="createSheetForm.name"
            placeholder="예: 아르테 오피스텔"
          />
        </n-form-item>

        <n-form-item label="탭 선택" required>
          <n-space vertical>
            <n-checkbox
              v-model:checked="createSheetForm.createRental"
            >
              📋 임대차현황 (임대차 계약 관리용)
            </n-checkbox>
            <n-checkbox
              v-model:checked="createSheetForm.createSale"
            >
              🏠 매도현황 (매도 계약 관리용)
            </n-checkbox>
          </n-space>
        </n-form-item>

        <n-alert type="info" class="mt-4">
          <strong>안내:</strong><br />
          • 새로운 구글 스프레드시트가 생성됩니다<br />
          • 선택한 탭에 맞는 헤더와 스타일이 자동 적용됩니다<br />
          • 생성된 시트는 자동으로 앱에 등록됩니다<br />
          • 생성 후 새 탭에서 시트가 열립니다
        </n-alert>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreateSheetModal = false" :disabled="isCreatingSheet">
            취소
          </n-button>
          <n-button
            type="primary"
            :loading="isCreatingSheet"
            @click="handleCreateSheet"
          >
            {{ isCreatingSheet ? '생성 중...' : '시트 생성' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.settings-view {
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}
</style>
