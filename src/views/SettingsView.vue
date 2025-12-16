<script setup lang="ts">
import { ref, onMounted, h } from 'vue'
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
  NTag,
  NSpin,
  NAlert,
  NEmpty,
  NModal,
  NForm,
  NFormItem,
  NDivider,
  useMessage,
  useDialog
} from 'naive-ui'
import {
  HomeOutline as HomeIcon,
  AddOutline as AddIcon,
  RefreshOutline as RefreshIcon
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
const sheetForm = ref({
  name: '',
  sheetUrl: '',
  tabName: ''
})

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
  showAddSheetModal.value = true
}

async function handleSaveSheet() {
  try {
    if (!sheetForm.value.name || !sheetForm.value.sheetUrl) {
      message.error('시트 이름과 URL을 입력해주세요')
      return
    }

    await sheetsStore.addSheet(
      sheetForm.value.name,
      sheetForm.value.sheetUrl,
      sheetForm.value.tabName || undefined
    )

    message.success('시트가 추가되었습니다')
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

async function handleSetCurrentSheet(sheet: SheetConfig) {
  try {
    sheetsStore.setCurrentSheet(sheet.id)
    message.success(`"${sheet.name}" 시트를 선택했습니다`)

    // Load contracts from the selected sheet
    await contractsStore.loadContracts(sheet.id)
    await notificationsStore.checkNotifications()
  } catch (error) {
    console.error('Failed to set current sheet:', error)
    message.error('시트 선택에 실패했습니다')
  }
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
          <n-button type="primary" @click="handleAddSheet">
            <template #icon>
              <n-icon><AddIcon /></n-icon>
            </template>
            시트 추가
          </n-button>
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
            <template #header-extra>
              <n-tag v-if="sheetsStore.currentSheetId === sheet.id" type="success" size="small">
                현재 선택됨
              </n-tag>
            </template>

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
                  v-if="sheetsStore.currentSheetId !== sheet.id"
                  size="small"
                  type="primary"
                  @click="handleSetCurrentSheet(sheet)"
                >
                  선택
                </n-button>
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
          <n-input
            v-model:value="sheetForm.sheetUrl"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
        </n-form-item>

        <n-form-item label="탭 이름 (선택)">
          <n-input
            v-model:value="sheetForm.tabName"
            placeholder="예: 임대차현황 (비워두면 첫 번째 탭 사용)"
          />
        </n-form-item>

        <n-alert type="info" class="mt-4">
          <strong>안내:</strong><br />
          1. 구글 스프레드시트를 열고 상단의 URL을 복사해주세요<br />
          2. 시트는 "공유 가능한 링크가 있는 모든 사용자" 권한이 필요합니다<br />
          3. 탭 이름을 지정하지 않으면 첫 번째 탭을 사용합니다
        </n-alert>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddSheetModal = false">취소</n-button>
          <n-button type="primary" @click="handleSaveSheet">추가</n-button>
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
