<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSheetsStore } from '@/stores/sheets'
import { useContractsStore } from '@/stores/contracts'
import { useNotificationsStore } from '@/stores/notifications'
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
  useMessage,
  useDialog
} from 'naive-ui'
import {
  HomeOutline as HomeIcon,
  AddOutline as AddIcon,
  RefreshOutline as RefreshIcon,
  HelpCircleOutline as HelpIcon
} from '@vicons/ionicons5'

const router = useRouter()
const authStore = useAuthStore()
const sheetsStore = useSheetsStore()
const contractsStore = useContractsStore()
const notificationsStore = useNotificationsStore()
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

// Tab selection state
const availableTabs = ref<Array<{ title: string; gid: string; index: number }>>([])
const selectedTabs = ref<string[]>([])
const loadingTabs = ref(false)

// Sync state
const syncingSheetId = ref<string | null>(null)

// Load sheets on mount
onMounted(async () => {
  try {
    await sheetsStore.loadSheets()
  } catch (error) {
    console.error('Failed to load sheets:', error)
    message.error('시트 목록을 불러오는데 실패했습니다')
  }
})

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

      // 선택된 각 탭을 별도의 SheetConfig로 저장
      for (const tabTitle of selectedTabs.value) {
        const tabInfo = availableTabs.value.find(t => t.title === tabTitle)
        if (!tabInfo) continue

        // 탭 이름에 따라 시트 이름 생성
        const sheetName = selectedTabs.value.length > 1
          ? `${sheetForm.value.name} - ${tabInfo.title}`
          : sheetForm.value.name

        console.log(`➕ [SettingsView] 시트 추가:`, {
          name: sheetName,
          tabTitle: tabInfo.title,
          gid: tabInfo.gid
        })

        await sheetsStore.addSheet(
          sheetName,
          sheetForm.value.sheetUrl,
          tabInfo.title
        )
      }

      message.success(`${selectedTabs.value.length}개의 시트가 추가되었습니다`)
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
      title="시트 등록 가이드"
      style="width: 700px; max-width: 90vw"
    >
      <n-space vertical size="large">
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
            3단계: 공유 링크 복사 및 앱에 추가
          </h3>
          <n-space vertical size="small">
            <p class="text-sm text-gray-700">① 구글 시트 상단 주소창의 URL을 전체 선택하여 복사합니다</p>
            <p class="text-sm text-gray-700 ml-4 text-gray-500">
              예: <code class="bg-gray-100 px-1 rounded">https://docs.google.com/spreadsheets/d/1ABC...</code>
            </p>
            <p class="text-sm text-gray-700">② RealLease 앱의 <strong>"시트 추가"</strong> 버튼을 클릭합니다</p>
            <p class="text-sm text-gray-700">③ <strong>"시트 이름"</strong>에 구분하기 쉬운 이름을 입력합니다</p>
            <p class="text-sm text-gray-700 ml-4 text-gray-500">예: "아르테 임대차 현황", "A동 관리 시트" 등</p>
            <p class="text-sm text-gray-700">④ <strong>"시트 URL"</strong>에 복사한 구글 시트 링크를 붙여넣습니다</p>
            <p class="text-sm text-gray-700">⑤ (선택) 특정 탭을 사용하려면 <strong>"탭 이름"</strong>을 입력합니다</p>
            <p class="text-sm text-gray-700 ml-4 text-gray-500">비워두면 첫 번째 탭을 자동으로 사용합니다</p>
            <p class="text-sm text-gray-700">⑥ <strong>"추가"</strong> 버튼을 클릭하여 시트를 등록합니다</p>
            <n-alert type="info" class="mt-2">
              <span class="text-sm">시트 추가 후 <strong>"동기화"</strong> 버튼을 클릭하면 최신 데이터를 불러올 수 있습니다</span>
            </n-alert>
          </n-space>
        </div>
      </n-space>

      <template #footer>
        <n-space justify="end">
          <n-button type="primary" @click="showHelpGuide = false">확인</n-button>
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
