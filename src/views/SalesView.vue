<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import { formatCurrency } from '@/utils/formatUtils'
import type { SaleContract } from '@/types/contract'
import {
  NCard,
  NButton,
  NInput,
  NSpace,
  NDataTable,
  NSpin,
  NAlert,
  NEmpty,
  NIcon,
  NTag,
  NModal,
  NForm,
  NFormItem,
  NInputNumber,
  NDatePicker,
  NSelect,
  NRadio,
  NRadioGroup,
  useMessage
} from 'naive-ui'
import { HomeOutline as HomeIcon, AddOutline as AddIcon } from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()

// View state
const viewMode = ref<'table' | 'card'>('table')
const searchQuery = ref('')
const isMobile = ref(false)
const showAddModal = ref(false)
const saleForm = ref({
  category: '', // 자동 넘버링되므로 사용자는 입력하지 않음
  building: '',
  unitNumber: '',
  buyer: '',
  contractDate: null as number | null,
  downPayment2Date: null as number | null,
  downPayment2: 0,
  interimPayment1Date: null as number | null,
  interimPayment1: 0,
  interimPayment2Date: null as number | null,
  interimPayment2: 0,
  interimPayment3Date: null as number | null,
  interimPayment3: 0,
  finalPaymentDate: null as number | null,
  finalPayment: 0,
  contractFormat: '',
  bondTransfer: '',
  status: 'active' as 'active' | 'completed',
  notes: ''
})

// Load data on mount
onMounted(async () => {
  // 모바일 화면 감지
  const checkMobile = () => {
    isMobile.value = window.innerWidth < 768
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // 🔧 FIX: 새로고침 시 sheets가 로드되지 않은 경우를 대비해 먼저 로드
  if (sheetsStore.sheets.length === 0) {
    console.log('📦 [SalesView] Sheets 데이터 로딩 중...')
    await sheetsStore.loadSheets()
  }

  // Extract sheetId from route params
  const sheetId = route.params.sheetId as string

  if (sheetId) {
    // Set current sheet based on route param
    sheetsStore.setCurrentSheet(sheetId)
    // Load contracts for this specific sheet (명시적으로 'sale' 타입 전달)
    await contractsStore.loadContracts(sheetId, 'sale')
  } else if (sheetsStore.currentSheet) {
    // Fallback to currentSheet if no route param (명시적으로 'sale' 타입 전달)
    await contractsStore.loadContracts(sheetsStore.currentSheet.id, 'sale')
  }
})

// Filter sales contracts
const filteredSales = computed(() => {
  let sales = contractsStore.saleContracts

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    sales = sales.filter(
      (sale) =>
        sale.unit.toLowerCase().includes(query) ||
        sale.buyer.toLowerCase().includes(query) ||
        sale.category.toLowerCase().includes(query)
    )
  }

  return sales
})

// Desktop columns - Full table with all details
const desktopColumns = [
  {
    title: '구분',
    key: 'category',
    width: 60,
    align: 'center' as const,
    ellipsis: { tooltip: true }
  },
  {
    title: '동-호',
    key: 'unit',
    width: 100,
    align: 'center' as const,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약자',
    key: 'buyer',
    width: 100,
    align: 'center' as const,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약금2',
    key: 'downPayment2',
    width: 110,
    align: 'center' as const,
    render: (row: SaleContract) => {
      return row.downPayment2 > 0 ? formatCurrency(row.downPayment2 * 1000) : '-'
    }
  },
  {
    title: '중도금',
    key: 'interimPayments',
    width: 110,
    align: 'center' as const,
    render: (row: SaleContract) => {
      const total = row.interimPayment1 + row.interimPayment2 + row.interimPayment3
      return total > 0 ? formatCurrency(total * 1000) : '-'
    }
  },
  {
    title: '잔금',
    key: 'finalPayment',
    width: 110,
    align: 'center' as const,
    render: (row: SaleContract) => {
      return row.finalPayment > 0 ? formatCurrency(row.finalPayment * 1000) : '-'
    }
  },
  {
    title: '합계',
    key: 'totalAmount',
    width: 120,
    align: 'center' as const,
    render: (row: SaleContract) => formatCurrency(row.totalAmount * 1000)
  },
  {
    title: '계약형식',
    key: 'contractFormat',
    width: 100,
    align: 'center' as const,
    ellipsis: { tooltip: true }
  },
  {
    title: '상태',
    key: 'status',
    width: 80,
    align: 'center' as const,
    render: (row: SaleContract) => {
      return h(
        NTag,
        { type: row.status === 'completed' ? 'success' : 'info', size: 'small' },
        { default: () => (row.status === 'completed' ? '종결' : '진행중') }
      )
    }
  }
]

// Mobile columns - Compact version
const mobileColumns = [
  {
    title: '동-호',
    key: 'unit',
    width: 70,
    render: (row: SaleContract) => {
      const unitNum = row.unit.split('-')[1] || row.unit.split('-')[0]
      return h(
        'div',
        { style: 'font-weight: 600; color: #18a058; line-height: 1.3;' },
        [
          h('div', {}, `${row.building}동`),
          h('div', {}, `${unitNum}호`)
        ]
      )
    }
  },
  {
    title: '계약정보',
    key: 'info',
    width: 160,
    render: (row: SaleContract) => {
      return h(
        'div',
        { style: 'display: flex; flex-direction: column; gap: 3px;' },
        [
          h('div', { style: 'font-weight: 500; font-size: 13px;' }, row.buyer),
          h('div', { style: 'font-size: 11px; color: #666;' },
            `${formatCurrency(row.totalAmount * 1000)}`
          ),
          row.contractDate ? h('div', { style: 'font-size: 10px; color: #999;' },
            `계약: ${formatDate(row.contractDate, 'MM.dd')}`
          ) : null
        ].filter(Boolean)
      )
    }
  },
  {
    title: '상태',
    key: 'status',
    width: 65,
    render: (row: SaleContract) => {
      return h(
        NTag,
        { type: row.status === 'completed' ? 'success' : 'info', size: 'small' },
        { default: () => (row.status === 'completed' ? '종결' : '진행중') }
      )
    }
  }
]

// Computed columns based on screen size
const columns = computed(() => isMobile.value ? mobileColumns : desktopColumns)

// Handle row click
function handleRowClick(row: SaleContract) {
  router.push({ name: 'sale-detail', params: { id: row.id } })
}

// Status options
const statusOptions = [
  { label: '진행중', value: 'active' },
  { label: '종결', value: 'completed' }
]

// Computed total amount
const totalAmount = computed(() => {
  return (
    saleForm.value.downPayment2 +
    saleForm.value.interimPayment1 +
    saleForm.value.interimPayment2 +
    saleForm.value.interimPayment3 +
    saleForm.value.finalPayment
  )
})

// Open add modal
function openAddModal() {
  resetForm()
  showAddModal.value = true
}

// Reset form
function resetForm() {
  saleForm.value = {
    category: '',
    building: '',
    unitNumber: '',
    buyer: '',
    contractDate: null,
    downPayment2Date: null,
    downPayment2: 0,
    interimPayment1Date: null,
    interimPayment1: 0,
    interimPayment2Date: null,
    interimPayment2: 0,
    interimPayment3Date: null,
    interimPayment3: 0,
    finalPaymentDate: null,
    finalPayment: 0,
    contractFormat: '',
    bondTransfer: '',
    status: 'active',
    notes: ''
  }
}

// Submit new sale contract
async function handleSubmit() {
  if (!sheetsStore.currentSheet) {
    message.error('시트가 연결되지 않았습니다')
    return
  }

  if (!saleForm.value.buyer || !saleForm.value.building || !saleForm.value.unitNumber) {
    message.error('필수 필드를 입력해주세요 (동, 호수, 계약자)')
    return
  }

  try {
    const unit = `${saleForm.value.building}-${saleForm.value.unitNumber}`

    await contractsStore.addSaleContract({
      sheetId: sheetsStore.currentSheet.id,
      rowIndex: 0, // Will be set by API
      category: saleForm.value.category, // 자동 넘버링됨
      building: saleForm.value.building,
      unit,
      buyer: saleForm.value.buyer,
      contractDate: saleForm.value.contractDate ? new Date(saleForm.value.contractDate) : undefined,
      downPayment2Date: saleForm.value.downPayment2Date ? new Date(saleForm.value.downPayment2Date) : undefined,
      downPayment2: saleForm.value.downPayment2,
      interimPayment1Date: saleForm.value.interimPayment1Date ? new Date(saleForm.value.interimPayment1Date) : undefined,
      interimPayment1: saleForm.value.interimPayment1,
      interimPayment2Date: saleForm.value.interimPayment2Date ? new Date(saleForm.value.interimPayment2Date) : undefined,
      interimPayment2: saleForm.value.interimPayment2,
      interimPayment3Date: saleForm.value.interimPayment3Date ? new Date(saleForm.value.interimPayment3Date) : undefined,
      interimPayment3: saleForm.value.interimPayment3,
      finalPaymentDate: saleForm.value.finalPaymentDate ? new Date(saleForm.value.finalPaymentDate) : undefined,
      finalPayment: saleForm.value.finalPayment,
      totalAmount: totalAmount.value,
      contractFormat: saleForm.value.contractFormat,
      bondTransfer: saleForm.value.bondTransfer,
      status: saleForm.value.status,
      notes: saleForm.value.notes
    })

    message.success('매도 계약이 등록되었습니다')
    showAddModal.value = false

    // Reload contracts
    await contractsStore.loadContracts(sheetsStore.currentSheet.id)
  } catch (error) {
    message.error('매도 계약 등록에 실패했습니다')
    console.error('Add error:', error)
  }
}
</script>

<template>
  <div class="sales-view">
    <div class="header mb-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold" style="color: #2c3e50;">매도현황</h1>
        <n-space>
          <n-button @click="openAddModal" type="primary">
            <template #icon>
              <n-icon><AddIcon /></n-icon>
            </template>
            신규 등록
          </n-button>
          <n-button @click="() => router.push('/')" secondary>
            <template #icon>
              <n-icon><HomeIcon /></n-icon>
            </template>
            <span class="ml-1">홈</span>
          </n-button>
        </n-space>
      </div>

      <!-- No sheet message -->
      <n-alert v-if="!sheetsStore.currentSheet" type="warning" class="mb-4">
        시트가 연결되지 않았습니다. 설정에서 시트를 연결해주세요.
      </n-alert>

      <!-- Search and filters -->
      <n-space v-if="sheetsStore.currentSheet" class="mb-4" align="center">
        <n-input
          v-model:value="searchQuery"
          placeholder="동-호, 계약자, 구분으로 검색..."
          clearable
          style="width: 300px"
        />

        <!-- 뷰 모드 선택 -->
        <n-radio-group v-model:value="viewMode">
          <n-radio value="table">테이블</n-radio>
          <n-radio value="card">카드</n-radio>
        </n-radio-group>

        <div class="text-sm text-gray-600">
          총 {{ filteredSales.length }}건
        </div>
      </n-space>
    </div>

    <!-- Loading state -->
    <div v-if="contractsStore.isLoading" class="text-center py-10">
      <n-spin size="large" />
      <p class="mt-4 text-gray-600">데이터를 불러오는 중...</p>
    </div>

    <!-- Error state -->
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
    <n-empty v-else-if="sheetsStore.currentSheet && filteredSales.length === 0" description="매도 계약이 없습니다">
      <template #extra>
        <n-button type="primary" @click="openAddModal">첫 매도 계약 추가하기</n-button>
      </template>
    </n-empty>

    <!-- Table View -->
    <n-card v-else-if="sheetsStore.currentSheet && viewMode === 'table'" :class="{ 'mobile-table-card': isMobile }">
      <n-data-table
        :columns="columns"
        :data="filteredSales"
        :scroll-x="isMobile ? 400 : 900"
        :pagination="{ pageSize: isMobile ? 15 : 20 }"
        :bordered="false"
        :single-line="false"
        striped
        :row-props="(row: SaleContract) => ({
          style: 'cursor: pointer;',
          onClick: () => handleRowClick(row)
        })"
        class="sales-table"
      />
    </n-card>

    <!-- Card View -->
    <div v-else-if="sheetsStore.currentSheet && viewMode === 'card'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <n-card
        v-for="sale in filteredSales"
        :key="sale.id"
        hoverable
        class="sale-card"
        style="cursor: pointer"
        @click="handleRowClick(sale)"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-bold text-lg">{{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호</span>
            <n-tag
              :type="sale.status === 'completed' ? 'success' : 'info'"
              size="small"
            >
              {{ sale.status === 'completed' ? '종결' : '진행중' }}
            </n-tag>
          </div>
        </template>

        <div class="sale-info space-y-3">
          <div class="info-row">
            <span class="label">👤 계약자</span>
            <span class="value">{{ sale.buyer }}</span>
          </div>

          <div v-if="sale.contractDate" class="info-row">
            <span class="label">📅 계약일</span>
            <span class="value">{{ formatDate(sale.contractDate, 'yyyy.MM.dd') }}</span>
          </div>

          <div v-if="sale.downPayment2 > 0" class="info-row">
            <span class="label">💰 계약금2</span>
            <span class="value font-bold text-blue-600">{{ formatCurrency(sale.downPayment2 * 1000) }}</span>
          </div>

          <div v-if="sale.interimPayment1 > 0" class="info-row">
            <span class="label">💳 중도금1</span>
            <span class="value font-semibold text-purple-600">{{ formatCurrency(sale.interimPayment1 * 1000) }}</span>
          </div>

          <div v-if="sale.interimPayment2 > 0" class="info-row">
            <span class="label">💳 중도금2</span>
            <span class="value font-semibold text-purple-600">{{ formatCurrency(sale.interimPayment2 * 1000) }}</span>
          </div>

          <div v-if="sale.interimPayment3 > 0" class="info-row">
            <span class="label">💳 중도금3</span>
            <span class="value font-semibold text-purple-600">{{ formatCurrency(sale.interimPayment3 * 1000) }}</span>
          </div>

          <div v-if="sale.finalPayment > 0" class="info-row">
            <span class="label">💵 잔금</span>
            <span class="value font-bold text-orange-600">{{ formatCurrency(sale.finalPayment * 1000) }}</span>
          </div>

          <div class="info-row border-t-2 border-gray-300 pt-2 mt-2">
            <span class="label font-bold">📊 합계</span>
            <span class="value font-bold text-green-600 text-lg">{{ formatCurrency(sale.totalAmount * 1000) }}</span>
          </div>

          <div v-if="sale.contractFormat" class="info-row">
            <span class="label">📋 계약형식</span>
            <span class="value">{{ sale.contractFormat }}</span>
          </div>
        </div>

        <template #footer>
          <div class="text-sm text-gray-500 text-center">클릭하여 상세정보 보기</div>
        </template>
      </n-card>
    </div>

    <!-- Add Sale Modal -->
    <n-modal v-model:show="showAddModal" preset="dialog" title="매도 계약 등록">
      <n-form :model="saleForm" label-placement="left" label-width="120">
        <n-form-item label="동" required>
          <n-input v-model:value="saleForm.building" placeholder="예: 108" />
        </n-form-item>
        <n-form-item label="호수" required>
          <n-input v-model:value="saleForm.unitNumber" placeholder="예: 407" />
        </n-form-item>
        <n-form-item label="계약자" required>
          <n-input v-model:value="saleForm.buyer" placeholder="계약자 이름" />
        </n-form-item>
        <n-form-item label="계약일">
          <n-date-picker v-model:value="saleForm.contractDate" type="date" style="width: 100%" />
        </n-form-item>

        <!-- 계약금 2차 -->
        <n-form-item label="계약금 2차 일자">
          <n-date-picker v-model:value="saleForm.downPayment2Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약금 2차 (천원)">
          <n-input-number v-model:value="saleForm.downPayment2" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 1차 -->
        <n-form-item label="중도금 1차 일자">
          <n-date-picker v-model:value="saleForm.interimPayment1Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 1차 (천원)">
          <n-input-number v-model:value="saleForm.interimPayment1" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 2차 -->
        <n-form-item label="중도금 2차 일자">
          <n-date-picker v-model:value="saleForm.interimPayment2Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 2차 (천원)">
          <n-input-number v-model:value="saleForm.interimPayment2" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 3차 -->
        <n-form-item label="중도금 3차 일자">
          <n-date-picker v-model:value="saleForm.interimPayment3Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 3차 (천원)">
          <n-input-number v-model:value="saleForm.interimPayment3" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 잔금 -->
        <n-form-item label="잔금 일자">
          <n-date-picker v-model:value="saleForm.finalPaymentDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="잔금 (천원)">
          <n-input-number v-model:value="saleForm.finalPayment" :min="0" style="width: 100%" />
        </n-form-item>

        <n-form-item label="합계 (천원)">
          <n-input-number :value="totalAmount" disabled style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약형식">
          <n-input v-model:value="saleForm.contractFormat" placeholder="예: 임대일부말소" />
        </n-form-item>
        <n-form-item label="채권양도">
          <n-input v-model:value="saleForm.bondTransfer" placeholder="채권양도 정보" />
        </n-form-item>
        <n-form-item label="상태">
          <n-select v-model:value="saleForm.status" :options="statusOptions" />
        </n-form-item>
        <n-form-item label="비고">
          <n-input v-model:value="saleForm.notes" type="textarea" placeholder="비고 입력" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showAddModal = false">취소</n-button>
          <n-button type="primary" @click="handleSubmit">등록</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.sales-view {
  padding: 1rem;
  max-width: 1400px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .sales-view {
    padding: 2rem;
  }
}

.sale-card {
  transition: all 0.3s ease;
}

.sale-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.sale-info {
  font-size: 14px;
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
  .sale-info {
    font-size: 13px;
  }

  .info-row .label {
    min-width: 80px;
    font-size: 12px;
  }

  .info-row .value {
    font-size: 13px;
  }

  /* 모바일 테이블 최적화 */
  .mobile-table-card {
    padding: 0;
  }

  .mobile-table-card :deep(.n-card__content) {
    padding: 8px;
  }

  .sales-table :deep(.n-data-table-th) {
    padding: 8px 4px !important;
    font-size: 12px !important;
    font-weight: 600;
  }

  .sales-table :deep(.n-data-table-td) {
    padding: 10px 4px !important;
    font-size: 13px !important;
  }

  .sales-table :deep(.n-data-table-table) {
    min-width: auto !important;
  }

  /* 모바일 테이블 행 스타일 */
  .sales-table :deep(.n-data-table-tr) {
    border-bottom: 1px solid #f0f0f0;
  }

  .sales-table :deep(.n-data-table-tr:hover) {
    background-color: #f5f7fa;
  }
}

/* 데스크톱 테이블 스타일 */
@media (min-width: 769px) {
  .sales-table :deep(.n-data-table-th) {
    background-color: #fafafa;
  }

  .sales-table :deep(.n-data-table-tr:hover) {
    background-color: #f9fafb;
  }
}
</style>
