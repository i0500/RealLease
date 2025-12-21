<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { useNotificationSettingsStore } from '@/stores/notificationSettings'
import { formatCurrency, formatCurrencyFull } from '@/utils/formatUtils'
import { formatDate } from '@/utils/dateUtils'
import type { RentalContract } from '@/types/contract'
import {
  NCard,
  NButton,
  NInput,
  NSelect,
  NSpace,
  NDataTable,
  NSpin,
  NAlert,
  NEmpty,
  NTag,
  NModal,
  NIcon,
  NForm,
  NFormItem,
  NInputNumber,
  NDatePicker,
  NRadio,
  NRadioGroup,
  useMessage,
  useDialog
} from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'
import { h } from 'vue'

const router = useRouter()
const route = useRoute()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()
const settingsStore = useNotificationSettingsStore()
const message = useMessage()
const dialog = useDialog()

// View state
const isMobile = ref(false)
const viewMode = ref<'table' | 'card'>('table')
const searchQuery = ref('')
const filterStatus = ref<'all' | 'vacant' | 'expiring' | 'hugExpiring'>('all')

// Modal state
const showContractModal = ref(false)
const showDetailModal = ref(false)
const editingContract = ref<RentalContract | null>(null)
const viewingContract = ref<RentalContract | null>(null)

// 새로운 RentalContract 구조에 맞춘 폼
const contractForm = ref({
  number: '',
  building: '',
  unit: '',
  tenantName: '',
  phone: '',
  phone2OrContractType: '',
  contractType: '',
  idNumber: '',
  exclusiveArea: '',
  supplyArea: '',
  deposit: 0,
  monthlyRent: 0,
  contractWrittenDate: null as number | null,
  startDate: null as number | null,
  endDate: null as number | null,
  actualMoveOutDate: null as number | null,
  contractPeriod: '',
  hugStartDate: null as number | null,
  hugEndDate: null as number | null,
  additionalInfo1: '',
  additionalInfo2: '',
  additionalInfo3: '',
  additionalInfo4: '',
  notes: ''
})

// Load contracts on mount
onMounted(async () => {
  // 모바일 화면 감지 (768px 이하)
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 768
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // 🔧 FIX: 새로고침 시 sheets가 로드되지 않은 경우를 대비해 먼저 로드
  if (sheetsStore.sheets.length === 0) {
    console.log('📦 [RentalContractsView] Sheets 데이터 로딩 중...')
    await sheetsStore.loadSheets()
  }

  // Extract sheetId from route params and handle query parameters
  const sheetId = route.params.sheetId as string
  const { status, id } = route.query

  // Determine which sheet to use (route param takes priority)
  // ⚠️ 임대차현황 뷰에서는 반드시 rental 타입 시트 사용
  const targetSheetId = sheetId || sheetsStore.currentRentalSheet?.id

  if (targetSheetId) {
    try {
      // Set current sheet based on route param
      if (sheetId) {
        sheetsStore.setCurrentSheet(sheetId)
      }

      // Load contracts for this specific sheet (명시적으로 'rental' 타입 전달)
      await contractsStore.loadContracts(targetSheetId, 'rental')

      // Open detail modal if contract id is provided (after data loaded)
      if (id && typeof id === 'string') {
        const contract = contractsStore.contracts.find(c => c.id === id)
        if (contract) {
          viewingContract.value = contract
          showDetailModal.value = true
        }
      }
    } catch (error) {
      console.error('Failed to load contracts:', error)
      message.error('계약 정보를 불러오는데 실패했습니다')
    }
  }

  // Apply status filter if provided
  if (status && (status === 'vacant' || status === 'expiring' || status === 'hugExpiring')) {
    filterStatus.value = status as 'vacant' | 'expiring' | 'hugExpiring'
  }
})

// Watch for contract loading to handle dashboard navigation with query.id
watch(
  () => contractsStore.contracts,
  (contracts) => {
    // Only proceed if we have an id in the query and modal is not already open
    const id = route.query.id
    if (id && typeof id === 'string' && !showDetailModal.value && contracts.length > 0) {
      const contract = contracts.find(c => c.id === id)
      if (contract) {
        viewingContract.value = contract
        showDetailModal.value = true
        // Clear the query parameter after opening the modal to prevent re-triggering
        router.replace({ query: { ...route.query, id: undefined } })
      }
    }
  },
  { immediate: false }
)

// 전세/월세 구분 가져오기 (계약중 또는 만료예정인 경우에만)
function getRentalType(contract: RentalContract): string {
  // 공실이면 표시 안함
  if (!contract.tenantName || contract.tenantName.trim() === '') {
    return ''
  }
  // 월세가 있으면 "월", 없으면 "전"
  return contract.monthlyRent > 0 ? '월' : '전'
}

// 계약 상태 가져오기
function getContractStatus(contract: RentalContract): { text: string; type: 'success' | 'warning' | 'default' } {
  // 공실
  if (!contract.tenantName || contract.tenantName.trim() === '') {
    return { text: '공실', type: 'default' }
  }

  // 만료예정 (3개월 이내)
  if (contract.endDate) {
    const today = new Date()
    const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
    if (contract.endDate >= today && contract.endDate <= threeMonthsLater) {
      return { text: '만료예정', type: 'warning' }
    }
  }

  // 계약중
  return { text: '계약중', type: 'success' }
}

// 현재 시트 ID (route param 또는 currentRentalSheet)
const currentSheetId = computed(() => {
  const routeSheetId = route.params.sheetId as string
  return routeSheetId || sheetsStore.currentRentalSheet?.id || null
})

// Filtered contracts
const filteredContracts = computed(() => {
  // 🔧 FIX: 현재 시트의 계약만 표시 (다른 시트 데이터 필터링)
  let result = contractsStore.contracts.filter(c =>
    !c.metadata.deletedAt &&
    (currentSheetId.value ? c.sheetId === currentSheetId.value : true)
  )

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (c) =>
        c.tenantName.toLowerCase().includes(query) ||
        `${c.building}동 ${c.unit}호`.toLowerCase().includes(query) ||
        c.phone.includes(query)
    )
  }

  // Status filter - 설정값 사용
  if (filterStatus.value === 'vacant') {
    result = result.filter((c) => !c.tenantName || c.tenantName.trim() === '')
  } else if (filterStatus.value === 'expiring') {
    const today = new Date()
    // ✅ 설정의 contractExpiryNoticeDays 사용 (기본 150일)
    const noticeDays = settingsStore.settings.contractExpiryNoticeDays || 150
    const expiryDate = new Date(today.getTime() + noticeDays * 24 * 60 * 60 * 1000)
    result = result.filter((c) => {
      if (!c.endDate) return false
      return c.endDate >= today && c.endDate <= expiryDate
    })
  } else if (filterStatus.value === 'hugExpiring') {
    // ✅ 설정의 hugExpiryNoticeDays 사용 (기본 90일)
    const today = new Date()
    const noticeDays = settingsStore.settings.hugExpiryNoticeDays || 90
    const expiryDate = new Date(today.getTime() + noticeDays * 24 * 60 * 60 * 1000)
    result = result.filter((c) => {
      if (!c.hugEndDate) return false
      return c.hugEndDate >= today && c.hugEndDate <= expiryDate
    })
  }

  return result
})

// Table columns - Desktop version (all columns)
const desktopColumns = [
  {
    title: '구분',
    key: 'number',
    width: 60,
    align: 'center' as const,
    render: (row: RentalContract) => {
      return filteredContracts.value.findIndex(c => c.id === row.id) + 1
    }
  },
  {
    title: '동-호',
    key: 'address',
    width: 120,
    align: 'center' as const,
    render: (row: RentalContract) => `${row.building}동 ${row.unit}호`
  },
  {
    title: '계약자',
    key: 'tenantName',
    width: 100,
    align: 'center' as const,
    render: (row: RentalContract) => row.tenantName || '공실'
  },
  {
    title: '계약유형',
    key: 'contractType',
    width: 90,
    align: 'center' as const,
    render: (row: RentalContract) => row.contractType || '-'
  },
  {
    title: '보증금',
    key: 'deposit',
    width: 110,
    align: 'center' as const,
    render: (row: RentalContract) => formatCurrency(row.deposit)
  },
  {
    title: '월세',
    key: 'monthlyRent',
    width: 100,
    align: 'center' as const,
    render: (row: RentalContract) =>
      row.monthlyRent ? formatCurrency(row.monthlyRent) : '-'
  },
  {
    title: '계약기간',
    key: 'period',
    width: 200,
    align: 'center' as const,
    render: (row: RentalContract) => {
      if (!row.startDate || !row.endDate) return '-'
      return `${formatDate(row.startDate, 'yyyy.MM.dd')} ~ ${formatDate(row.endDate, 'yyyy.MM.dd')}`
    }
  },
  {
    title: '상태',
    key: 'status',
    width: 110,
    align: 'center' as const,
    render: (row: RentalContract) => {
      const hasName = row.tenantName && row.tenantName.trim() !== ''
      const isExpiring = row.endDate && (() => {
        const today = new Date()
        const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate())
        return row.endDate >= today && row.endDate <= threeMonthsLater
      })()

      // 전세/월세 구분 (공실이 아닌 경우에만)
      const rentalType = hasName ? (row.monthlyRent > 0 ? '월' : '전') : ''

      if (!hasName) {
        return h(NTag, { type: 'default', size: 'small' }, { default: () => '공실' })
      } else if (isExpiring) {
        // 만료예정 + 전/월 표시 (줄바꿈 방지: flex nowrap)
        return h('div', { style: 'display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap;' }, [
          h(NTag, { type: 'warning', size: 'small' }, { default: () => '만료예정' }),
          h(NTag, { type: rentalType === '월' ? 'info' : 'default', size: 'small', bordered: false }, { default: () => rentalType })
        ])
      } else {
        // 계약중 + 전/월 표시 (줄바꿈 방지: flex nowrap)
        return h('div', { style: 'display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap;' }, [
          h(NTag, { type: 'success', size: 'small' }, { default: () => '계약중' }),
          h(NTag, { type: rentalType === '월' ? 'info' : 'default', size: 'small', bordered: false }, { default: () => rentalType })
        ])
      }
    }
  },
  {
    title: 'HUG',
    key: 'hugEndDate',
    width: 70,
    align: 'center' as const,
    render: (row: RentalContract) =>
      row.hugEndDate ? '가입' : '-'
  }
]


// Filter options
const statusOptions = [
  { label: '전체', value: 'all' },
  { label: '공실', value: 'vacant' },
  { label: '만료예정', value: 'expiring' },
  { label: '보증만료예정', value: 'hugExpiring' }
]

// Actions
function handleAdd() {
  editingContract.value = null
  resetForm()
  showContractModal.value = true
}

function handleView(contract: RentalContract) {
  viewingContract.value = contract
  showDetailModal.value = true
}

function handleEditFromDetail() {
  if (viewingContract.value) {
    showDetailModal.value = false
    handleEdit(viewingContract.value)
  }
}

function handleDeleteFromDetail() {
  if (viewingContract.value) {
    showDetailModal.value = false
    handleDelete(viewingContract.value)
  }
}

function handleEdit(contract: RentalContract) {
  editingContract.value = contract
  // Populate form with contract data
  contractForm.value = {
    number: contract.number,
    building: contract.building,
    unit: contract.unit,
    tenantName: contract.tenantName,
    phone: contract.phone,
    phone2OrContractType: contract.phone2OrContractType,
    contractType: contract.contractType,
    idNumber: contract.idNumber,
    exclusiveArea: contract.exclusiveArea,
    supplyArea: contract.supplyArea,
    deposit: contract.deposit,
    monthlyRent: contract.monthlyRent,
    contractWrittenDate: contract.contractWrittenDate?.getTime() || null,
    startDate: contract.startDate?.getTime() || null,
    endDate: contract.endDate?.getTime() || null,
    actualMoveOutDate: contract.actualMoveOutDate?.getTime() || null,
    contractPeriod: contract.contractPeriod,
    hugStartDate: contract.hugStartDate?.getTime() || null,
    hugEndDate: contract.hugEndDate?.getTime() || null,
    additionalInfo1: contract.additionalInfo1,
    additionalInfo2: contract.additionalInfo2,
    additionalInfo3: contract.additionalInfo3,
    additionalInfo4: contract.additionalInfo4,
    notes: contract.notes
  }
  showContractModal.value = true
}

function handleDelete(contract: RentalContract) {
  const contractLabel = contract.tenantName || `${contract.building}동 ${contract.unit}호`
  dialog.warning({
    title: '계약 삭제',
    content: `${contractLabel} 계약을 삭제하시겠습니까?`,
    positiveText: '삭제',
    negativeText: '취소',
    onPositiveClick: async () => {
      try {
        await contractsStore.deleteContract(contract.id)
        message.success('계약이 삭제되었습니다')
      } catch (error) {
        console.error('Failed to delete contract:', error)
        message.error('계약 삭제에 실패했습니다')
      }
    }
  })
}

async function handleSave() {
  try {
    // ⚠️ 임대차현황 뷰에서는 반드시 rental 타입 시트 사용
    const rentalSheet = sheetsStore.currentRentalSheet
    if (!rentalSheet) {
      message.error('임대차 시트가 선택되지 않았습니다')
      return
    }

    // 필수 필드 검증
    if (!contractForm.value.building || !contractForm.value.unit) {
      message.error('동과 호를 입력해주세요')
      return
    }

    // 계약유형 필수 검증
    if (!contractForm.value.contractType || contractForm.value.contractType.trim() === '') {
      message.error('계약유형을 입력해주세요 (예: 최초, 갱신, 공실)')
      return
    }

    const contractData: any = {
      sheetId: rentalSheet.id,
      rowIndex: editingContract.value?.rowIndex || 0,
      number: contractForm.value.number,
      building: contractForm.value.building,
      unit: contractForm.value.unit,
      tenantName: contractForm.value.tenantName,
      phone: contractForm.value.phone,
      phone2OrContractType: contractForm.value.phone2OrContractType,
      contractType: contractForm.value.contractType,
      idNumber: contractForm.value.idNumber,
      exclusiveArea: contractForm.value.exclusiveArea,
      supplyArea: contractForm.value.supplyArea,
      deposit: contractForm.value.deposit,
      monthlyRent: contractForm.value.monthlyRent,
      contractWrittenDate: contractForm.value.contractWrittenDate
        ? new Date(contractForm.value.contractWrittenDate)
        : undefined,
      startDate: contractForm.value.startDate
        ? new Date(contractForm.value.startDate)
        : undefined,
      endDate: contractForm.value.endDate
        ? new Date(contractForm.value.endDate)
        : undefined,
      actualMoveOutDate: contractForm.value.actualMoveOutDate
        ? new Date(contractForm.value.actualMoveOutDate)
        : undefined,
      contractPeriod: contractForm.value.contractPeriod,
      hugStartDate: contractForm.value.hugStartDate
        ? new Date(contractForm.value.hugStartDate)
        : undefined,
      hugEndDate: contractForm.value.hugEndDate
        ? new Date(contractForm.value.hugEndDate)
        : undefined,
      additionalInfo1: contractForm.value.additionalInfo1,
      additionalInfo2: contractForm.value.additionalInfo2,
      additionalInfo3: contractForm.value.additionalInfo3,
      additionalInfo4: contractForm.value.additionalInfo4,
      notes: contractForm.value.notes
    }

    if (editingContract.value) {
      await contractsStore.updateContract(editingContract.value.id, contractData)
      message.success('계약이 수정되었습니다')
    } else {
      await contractsStore.addContract(contractData)
      message.success('계약이 추가되었습니다')
    }

    // 저장 후 Google Sheets에서 최신 데이터 다시 로드 (rental 시트)
    if (rentalSheet.id) {
      await contractsStore.loadContracts(rentalSheet.id, 'rental')
    }

    showContractModal.value = false
    resetForm()
  } catch (error) {
    console.error('Failed to save contract:', error)
    message.error('계약 저장에 실패했습니다')
  }
}

function resetForm() {
  contractForm.value = {
    number: '',
    building: '',
    unit: '',
    tenantName: '',
    phone: '',
    phone2OrContractType: '',
    contractType: '',
    idNumber: '',
    exclusiveArea: '',
    supplyArea: '',
    deposit: 0,
    monthlyRent: 0,
    contractWrittenDate: null,
    startDate: null,
    endDate: null,
    actualMoveOutDate: null,
    contractPeriod: '',
    hugStartDate: null,
    hugEndDate: null,
    additionalInfo1: '',
    additionalInfo2: '',
    additionalInfo3: '',
    additionalInfo4: '',
    notes: ''
  }
}
</script>

<template>
  <div class="contracts-view">
    <div class="header mb-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold" style="color: #2c3e50;">임대차 현황</h1>
        <n-space>
          <n-button type="primary" @click="handleAdd">
            <template #icon>➕</template>
            <span class="hidden sm:inline">계약 추가</span>
            <span class="sm:hidden">추가</span>
          </n-button>
          <n-button @click="() => router.push('/')" secondary>
            <template #icon>
              <n-icon><HomeIcon /></n-icon>
            </template>
            메인 화면
          </n-button>
        </n-space>
      </div>

      <!-- Filters and Search -->
      <n-space class="mb-4" align="center">
        <n-input
          v-model:value="searchQuery"
          placeholder="계약자명, 동-호, 연락처 검색"
          clearable
          style="width: 300px"
        >
          <template #prefix>🔍</template>
        </n-input>

        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          style="width: 120px"
        />

        <!-- PC/모바일 모두 뷰 모드 선택 표시 -->
        <n-radio-group v-model:value="viewMode">
          <n-radio value="table">테이블</n-radio>
          <n-radio value="card">카드</n-radio>
        </n-radio-group>

        <div class="text-sm text-gray-600">
          총 {{ filteredContracts.length }}건
        </div>
      </n-space>
    </div>

    <!-- Loading State -->
    <div v-if="contractsStore.isLoading" class="text-center py-10">
      <n-spin size="large" />
      <p class="mt-4 text-gray-600">데이터를 불러오는 중...</p>
    </div>

    <!-- Error State -->
    <n-alert
      v-else-if="contractsStore.error"
      type="error"
      class="mb-4"
      closable
      @close="contractsStore.clearError"
    >
      {{ contractsStore.error }}
    </n-alert>

    <!-- Empty State -->
    <n-empty v-else-if="filteredContracts.length === 0" description="계약이 없습니다">
      <template #extra>
        <n-button type="primary" @click="handleAdd">첫 계약 추가하기</n-button>
      </template>
    </n-empty>

    <!-- Table View - Desktop -->
    <n-card v-else-if="viewMode === 'table' && !isMobile">
      <n-data-table
        :columns="desktopColumns"
        :data="filteredContracts"
        :pagination="{ pageSize: 10 }"
        :bordered="false"
        :single-line="false"
        :row-props="(row: RentalContract) => ({
          style: 'cursor: pointer;',
          onClick: () => handleView(row)
        })"
        class="rental-table"
      />
    </n-card>

    <!-- Table View - Mobile (Dashboard Style List) -->
    <div v-else-if="viewMode === 'table' && isMobile" class="space-y-3">
      <div
        v-for="contract in filteredContracts"
        :key="contract.id"
        class="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-all"
        @click="handleView(contract)"
      >
        <!-- Header: 동-호 & 상태 -->
        <div class="flex items-start justify-between mb-2">
          <h4 class="font-semibold text-blue-600 hover:underline text-sm">
            {{ contract.building }}동 {{ contract.unit }}호
          </h4>
          <div class="flex items-center gap-1 ml-2 flex-shrink-0" style="white-space: nowrap;">
            <n-tag
              :type="getContractStatus(contract).type"
              size="small"
            >
              {{ getContractStatus(contract).text }}
            </n-tag>
            <n-tag
              v-if="getRentalType(contract)"
              :type="getRentalType(contract) === '월' ? 'info' : 'default'"
              size="small"
              :bordered="false"
            >
              {{ getRentalType(contract) }}
            </n-tag>
          </div>
        </div>

        <!-- 계약자 & 계약유형 -->
        <div class="flex flex-wrap items-center gap-2 mb-2 text-xs text-gray-600">
          <span class="font-medium">{{ contract.tenantName || '공실' }}</span>
          <span v-if="contract.contractType" class="text-gray-400">·</span>
          <span v-if="contract.contractType" class="font-medium">{{ contract.contractType }}</span>
          <span v-if="contract.deposit > 0" class="text-gray-400">·</span>
          <span v-if="contract.deposit > 0" class="font-medium">
            보증금 {{ isMobile ? formatCurrency(contract.deposit) : formatCurrencyFull(contract.deposit) }}
            <span v-if="contract.monthlyRent > 0"> / 월세 {{ isMobile ? formatCurrency(contract.monthlyRent) : formatCurrencyFull(contract.monthlyRent) }}</span>
          </span>
        </div>

        <!-- 계약 기간 -->
        <div v-if="contract.startDate || contract.endDate" class="flex items-center gap-3 text-xs text-gray-500">
          <span v-if="contract.startDate">시작: {{ formatDate(contract.startDate, 'yyyy.MM.dd') }}</span>
          <span v-if="contract.startDate && contract.endDate" class="text-gray-400">→</span>
          <span v-if="contract.endDate">종료: {{ formatDate(contract.endDate, 'yyyy.MM.dd') }}</span>
        </div>
      </div>
    </div>

    <!-- Card View (모바일 최적화) -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <n-card
        v-for="contract in filteredContracts"
        :key="contract.id"
        hoverable
        class="contract-card"
        style="cursor: pointer"
        @click="handleView(contract)"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-bold text-lg">{{ contract.building }}동 {{ contract.unit }}호</span>
            <div class="flex items-center gap-1" style="white-space: nowrap;">
              <n-tag
                :type="getContractStatus(contract).type"
                size="small"
              >
                {{ getContractStatus(contract).text }}
              </n-tag>
              <n-tag
                v-if="getRentalType(contract)"
                :type="getRentalType(contract) === '월' ? 'info' : 'default'"
                size="small"
                :bordered="false"
              >
                {{ getRentalType(contract) }}
              </n-tag>
            </div>
          </div>
        </template>
        <div class="contract-info space-y-3">
          <div class="info-row">
            <span class="label">👤 계약자</span>
            <span class="value">{{ contract.tenantName || '공실' }}</span>
          </div>

          <div v-if="contract.contractType" class="info-row">
            <span class="label">📝 계약유형</span>
            <span class="value font-semibold">{{ contract.contractType }}</span>
          </div>

          <div class="info-row">
            <span class="label">💰 보증금</span>
            <span class="value font-bold text-blue-600">
              {{ isMobile ? formatCurrency(contract.deposit) : formatCurrencyFull(contract.deposit) }}
            </span>
          </div>

          <div v-if="contract.monthlyRent" class="info-row">
            <span class="label">🏠 월세</span>
            <span class="value font-bold text-green-600">
              {{ isMobile ? formatCurrency(contract.monthlyRent) : formatCurrencyFull(contract.monthlyRent) }}
            </span>
          </div>

          <div v-if="contract.startDate && contract.endDate" class="info-row">
            <span class="label">📅 계약기간</span>
            <span class="value text-sm">
              {{ formatDate(contract.startDate, 'yyyy.MM.dd') }}<br class="sm:hidden" />
              <span class="hidden sm:inline"> ~ </span>
              {{ formatDate(contract.endDate, 'yyyy.MM.dd') }}
            </span>
          </div>

          <div v-if="contract.hugEndDate" class="info-row">
            <span class="label">🛡️ HUG보증</span>
            <span class="value text-green-600">가입 (~ {{ formatDate(contract.hugEndDate, 'yyyy.MM.dd') }})</span>
          </div>

          <div v-if="contract.phone" class="info-row">
            <span class="label">📞 연락처</span>
            <span class="value">{{ contract.phone }}</span>
          </div>
        </div>

        <template #footer>
          <div class="text-sm text-gray-500 text-center">클릭하여 상세정보 보기</div>
        </template>
      </n-card>
    </div>

    <!-- 계약 상세보기 모달 -->
    <n-modal
      v-model:show="showDetailModal"
      preset="card"
      style="width: 90%; max-width: 900px; max-height: 90vh; overflow-y: auto"
      :segmented="{ content: true }"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold" style="color: #2c3e50;">
              {{ viewingContract?.building }}동 {{ viewingContract?.unit }}호
            </h2>
            <p class="text-sm text-gray-600 mt-1">임대차 계약 상세 정보</p>
          </div>
          <n-tag
            v-if="viewingContract"
            :type="
              viewingContract.tenantName && viewingContract.tenantName.trim() !== ''
                ? 'success'
                : 'default'
            "
            size="large"
          >
            {{ viewingContract.tenantName ? '계약중' : '공실' }}
          </n-tag>
        </div>
      </template>

      <div v-if="viewingContract">
        <!-- 기본 정보 -->
        <n-card title="기본 정보" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item label="동-호">
              {{ viewingContract.building }}동 {{ viewingContract.unit }}호
            </n-descriptions-item>
            <n-descriptions-item label="계약자명">
              {{ viewingContract.tenantName || '공실' }}
            </n-descriptions-item>
            <n-descriptions-item label="연락처">
              {{ viewingContract.phone || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="연락처2">
              {{ viewingContract.phone2OrContractType || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="계약유형">
              {{ viewingContract.contractType || '-' }}
            </n-descriptions-item>
            <n-descriptions-item label="주민번호">
              {{ viewingContract.idNumber || '-' }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.exclusiveArea" label="전용면적">
              {{ viewingContract.exclusiveArea }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.supplyArea" label="공급면적">
              {{ viewingContract.supplyArea }}
            </n-descriptions-item>
            <n-descriptions-item label="상태" :span="2">
              <n-tag :type="viewingContract.tenantName && viewingContract.tenantName.trim() !== '' ? 'success' : 'default'">
                {{ viewingContract.tenantName ? '계약중' : '공실' }}
              </n-tag>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 계약 금액 정보 -->
        <n-card title="계약 금액" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item label="임대보증금">
              <span class="font-bold text-xl" style="color: #2080f0;">
                {{ formatCurrency(viewingContract.deposit) }}
              </span>
            </n-descriptions-item>
            <n-descriptions-item label="월세">
              <span v-if="viewingContract.monthlyRent" class="font-bold text-xl" style="color: #18a058;">
                {{ formatCurrency(viewingContract.monthlyRent) }}
              </span>
              <span v-else>-</span>
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 계약 기간 정보 -->
        <n-card title="계약 기간" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item v-if="viewingContract.contractWrittenDate" label="계약서작성일">
              {{ formatDate(viewingContract.contractWrittenDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.contractPeriod" label="계약기간">
              {{ viewingContract.contractPeriod }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.startDate" label="시작일">
              {{ formatDate(viewingContract.startDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.endDate" label="종료일">
              {{ formatDate(viewingContract.endDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.actualMoveOutDate" label="실제퇴거일" :span="2">
              {{ formatDate(viewingContract.actualMoveOutDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- HUG 보증 정보 -->
        <n-card v-if="viewingContract.hugStartDate || viewingContract.hugEndDate" title="HUG 보증보험 정보" class="mb-4">
          <n-descriptions bordered :column="2" label-align="center">
            <n-descriptions-item v-if="viewingContract.hugStartDate" label="보증시작일">
              {{ formatDate(viewingContract.hugStartDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.hugEndDate" label="보증종료일">
              {{ formatDate(viewingContract.hugEndDate, 'yyyy.MM.dd') }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 추가 정보 -->
        <n-card v-if="viewingContract.additionalInfo1 || viewingContract.additionalInfo2 || viewingContract.additionalInfo3 || viewingContract.additionalInfo4" title="추가 정보" class="mb-4">
          <n-descriptions bordered :column="1" label-align="center">
            <n-descriptions-item v-if="viewingContract.additionalInfo1" label="추가정보1">
              {{ viewingContract.additionalInfo1 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo2" label="추가정보2">
              {{ viewingContract.additionalInfo2 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo3" label="추가정보3">
              {{ viewingContract.additionalInfo3 }}
            </n-descriptions-item>
            <n-descriptions-item v-if="viewingContract.additionalInfo4" label="추가정보4">
              {{ viewingContract.additionalInfo4 }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>

        <!-- 비고 -->
        <n-card v-if="viewingContract.notes" title="기타사항/비고" class="mb-4">
          <n-descriptions bordered :column="1" label-align="center">
            <n-descriptions-item>
              {{ viewingContract.notes }}
            </n-descriptions-item>
          </n-descriptions>
        </n-card>
      </div>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showDetailModal = false">닫기</n-button>
          <n-button type="primary" @click="handleEditFromDetail">수정</n-button>
          <n-button type="error" @click="handleDeleteFromDetail">삭제</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- Contract Modal -->
    <n-modal
      v-model:show="showContractModal"
      preset="card"
      :title="editingContract ? '계약 수정' : '계약 추가'"
      style="width: 800px; max-height: 80vh; overflow-y: auto"
    >
      <n-form label-placement="left" label-width="140px">
        <!-- 기본 정보 -->
        <h3 class="text-lg font-semibold mb-3">기본 정보</h3>
        <n-form-item label="동" required>
          <n-input v-model:value="contractForm.building" placeholder="예: 101" />
        </n-form-item>
        <n-form-item label="호" required>
          <n-input v-model:value="contractForm.unit" placeholder="예: 1001" />
        </n-form-item>
        <n-form-item label="계약자명">
          <n-input v-model:value="contractForm.tenantName" placeholder="공실인 경우 비워두세요" />
        </n-form-item>
        <n-form-item label="연락처">
          <n-input v-model:value="contractForm.phone" />
        </n-form-item>
        <n-form-item label="연락처2">
          <n-input v-model:value="contractForm.phone2OrContractType" placeholder="갱신/신규 등" />
        </n-form-item>
        <n-form-item label="계약유형" required>
          <n-input v-model:value="contractForm.contractType" placeholder="예: 최초, 갱신, 공실" />
        </n-form-item>
        <n-form-item label="주민번호">
          <n-input v-model:value="contractForm.idNumber" />
        </n-form-item>

        <!-- 면적 정보 -->
        <h3 class="text-lg font-semibold mb-3 mt-6">면적 정보</h3>
        <n-form-item label="전용면적">
          <n-input v-model:value="contractForm.exclusiveArea" placeholder="예: 84㎡" />
        </n-form-item>
        <n-form-item label="공급면적">
          <n-input v-model:value="contractForm.supplyArea" placeholder="예: 102㎡" />
        </n-form-item>

        <!-- 계약 금액 -->
        <h3 class="text-lg font-semibold mb-3 mt-6">계약 금액</h3>
        <n-form-item label="임대보증금" required>
          <n-input-number v-model:value="contractForm.deposit" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="월세">
          <n-input-number v-model:value="contractForm.monthlyRent" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 계약 기간 -->
        <h3 class="text-lg font-semibold mb-3 mt-6">계약 기간</h3>
        <n-form-item label="계약서작성일">
          <n-date-picker v-model:value="contractForm.contractWrittenDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="시작일">
          <n-date-picker v-model:value="contractForm.startDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="종료일">
          <n-date-picker v-model:value="contractForm.endDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="실제퇴거일">
          <n-date-picker v-model:value="contractForm.actualMoveOutDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약기간">
          <n-input v-model:value="contractForm.contractPeriod" placeholder="예: 2년 또는 4개월" />
        </n-form-item>

        <!-- HUG 보증보험 -->
        <h3 class="text-lg font-semibold mb-3 mt-6">HUG 보증보험</h3>
        <n-form-item label="보증시작일">
          <n-date-picker v-model:value="contractForm.hugStartDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="보증종료일">
          <n-date-picker v-model:value="contractForm.hugEndDate" type="date" style="width: 100%" />
        </n-form-item>

        <!-- 추가 정보 -->
        <h3 class="text-lg font-semibold mb-3 mt-6">추가 정보</h3>
        <n-form-item label="추가정보1">
          <n-input v-model:value="contractForm.additionalInfo1" placeholder="갱신/퇴거/고민중 등" />
        </n-form-item>
        <n-form-item label="추가정보2">
          <n-input v-model:value="contractForm.additionalInfo2" />
        </n-form-item>
        <n-form-item label="추가정보3">
          <n-input v-model:value="contractForm.additionalInfo3" />
        </n-form-item>
        <n-form-item label="추가정보4">
          <n-input v-model:value="contractForm.additionalInfo4" />
        </n-form-item>
        <n-form-item label="기타사항/비고">
          <n-input
            v-model:value="contractForm.notes"
            type="textarea"
            :rows="3"
            placeholder="기타 특이사항 입력"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showContractModal = false">취소</n-button>
          <n-button type="primary" @click="handleSave">저장</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.contracts-view {
  padding: 1rem;
}

.contract-card {
  transition: all 0.3s ease;
}

.contract-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.contract-info {
  font-size: 14px;
}

/* 세부정보 팝업 테이블 값 중앙정렬 */
:deep(.n-descriptions .n-descriptions-table-content) {
  text-align: center !important;
  justify-content: center !important;
}

:deep(.n-descriptions .n-descriptions-table-content__item) {
  text-align: center !important;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.info-row:last-child {
  border-bottom: none;
}

.info-row .label {
  flex-shrink: 0;
  font-weight: 500;
  color: #666;
  min-width: 90px;
}

.info-row .value {
  flex: 1;
  text-align: right;
  color: #2c3e50;
  word-break: keep-all;
}

@media (max-width: 768px) {
  .contract-info {
    font-size: 13px;
  }

  .info-row .label {
    min-width: 80px;
    font-size: 12px;
  }

  .info-row .value {
    font-size: 13px;
  }
}

/* 상세보기 모달 스타일 */
.contract-detail {
  font-size: 14px;
}

.detail-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e8e8e8;
}

.detail-section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item.full-width {
  grid-column: 1 / -1;
}

.detail-item .label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.detail-item .value {
  font-size: 14px;
  color: #2c3e50;
  font-weight: 400;
}

@media (max-width: 768px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .section-title {
    font-size: 15px;
  }

  /* 모바일 테이블 최적화 */
  .mobile-table-card {
    padding: 0;
  }

  .mobile-table-card :deep(.n-card__content) {
    padding: 8px;
  }

  .rental-table :deep(.n-data-table-th) {
    padding: 8px 4px !important;
    font-size: 12px !important;
    font-weight: 600;
  }

  .rental-table :deep(.n-data-table-td) {
    padding: 10px 4px !important;
    font-size: 13px !important;
  }

  .rental-table :deep(.n-data-table-table) {
    min-width: auto !important;
  }

  /* 모바일 테이블 행 스타일 */
  .rental-table :deep(.n-data-table-tr) {
    border-bottom: 1px solid #f0f0f0;
  }

  .rental-table :deep(.n-data-table-tr:hover) {
    background-color: #f5f7fa;
  }
}

/* 데스크톱 테이블 스타일 */
@media (min-width: 769px) {
  .rental-table :deep(.n-data-table-th) {
    background-color: #fafafa;
  }

  .rental-table :deep(.n-data-table-tr:hover) {
    background-color: #f9fafb;
  }
}
</style>
