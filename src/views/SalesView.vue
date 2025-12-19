<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
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
  useMessage
} from 'naive-ui'
import { HomeOutline as HomeIcon, AddOutline as AddIcon } from '@vicons/ionicons5'

const router = useRouter()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()

// View state
const searchQuery = ref('')
const showAddModal = ref(false)
const saleForm = ref({
  category: '',
  building: '',
  unitNumber: '',
  buyer: '',
  contractDate: null as number | null,
  downPayment: 0,
  interimPayment: 0,
  finalPayment: 0,
  finalPaymentDate: null as number | null,
  contractFormat: '',
  status: 'active' as 'active' | 'completed',
  notes: ''
})

// Load data on mount
onMounted(async () => {
  if (sheetsStore.currentSheet) {
    await contractsStore.loadContracts(sheetsStore.currentSheet.id)
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

// Table columns
const columns = [
  {
    title: '구분',
    key: 'category',
    width: 60,
    ellipsis: { tooltip: true }
  },
  {
    title: '동-호',
    key: 'unit',
    width: 100,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약자',
    key: 'buyer',
    width: 100,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약금',
    key: 'downPayment',
    width: 110,
    render: (row: SaleContract) => {
      return row.downPayment > 0 ? `${row.downPayment.toLocaleString()}` : '-'
    }
  },
  {
    title: '중도금',
    key: 'interimPayment',
    width: 110,
    render: (row: SaleContract) => {
      return row.interimPayment > 0 ? `${row.interimPayment.toLocaleString()}` : '-'
    }
  },
  {
    title: '잔금',
    key: 'finalPayment',
    width: 110,
    render: (row: SaleContract) => {
      return row.finalPayment > 0 ? `${row.finalPayment.toLocaleString()}` : '-'
    }
  },
  {
    title: '합계',
    key: 'totalAmount',
    width: 120,
    render: (row: SaleContract) => `${row.totalAmount.toLocaleString()}`
  },
  {
    title: '계약형식',
    key: 'contractFormat',
    width: 100,
    ellipsis: { tooltip: true }
  },
  {
    title: '상태',
    key: 'status',
    width: 80,
    render: (row: SaleContract) => {
      return h(
        NTag,
        { type: row.status === 'completed' ? 'success' : 'info', size: 'small' },
        { default: () => (row.status === 'completed' ? '종결' : '진행중') }
      )
    }
  }
]

// Handle row click
function handleRowClick(row: SaleContract) {
  router.push({ name: 'sale-detail', params: { id: row.id } })
}

// Convert thousands to millions (천원 → 백만원)
function toMillions(thousands: number): string {
  if (thousands === 0) return '0'
  return (thousands / 1000).toFixed(0)
}

// Status options
const statusOptions = [
  { label: '진행중', value: 'active' },
  { label: '종결', value: 'completed' }
]

// Computed total amount
const totalAmount = computed(() => {
  return saleForm.value.downPayment + saleForm.value.interimPayment + saleForm.value.finalPayment
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
    downPayment: 0,
    interimPayment: 0,
    finalPayment: 0,
    finalPaymentDate: null,
    contractFormat: '',
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
      category: saleForm.value.category,
      building: saleForm.value.building,
      unit,
      buyer: saleForm.value.buyer,
      contractDate: saleForm.value.contractDate ? new Date(saleForm.value.contractDate) : undefined,
      downPayment: saleForm.value.downPayment,
      interimPayment: saleForm.value.interimPayment,
      finalPayment: saleForm.value.finalPayment,
      finalPaymentDate: saleForm.value.finalPaymentDate ? new Date(saleForm.value.finalPaymentDate) : undefined,
      totalAmount: totalAmount.value,
      contractFormat: saleForm.value.contractFormat,
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
      <n-card v-if="sheetsStore.currentSheet" class="mb-4">
        <n-space vertical>
          <n-input
            v-model:value="searchQuery"
            placeholder="동-호, 계약자, 구분으로 검색..."
            clearable
          />
          <div class="text-sm text-gray-600">
            총 {{ filteredSales.length }}건의 매도 계약
          </div>
        </n-space>
      </n-card>
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

    <!-- Data list/table -->
    <div v-else-if="sheetsStore.currentSheet">
      <!-- Mobile card layout (below md) -->
      <div class="md:hidden space-y-3">
        <div
          v-for="sale in filteredSales"
          :key="sale.id"
          class="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-green-50 hover:border-green-300 transition-all"
          @click="handleRowClick(sale)"
        >
          <!-- Line 1: 동-호, 계약자, 계약일 -->
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="font-semibold text-green-600">
                {{ sale.building }}동 {{ sale.unit.split('-')[1] || sale.unit.split('-')[0] }}호
              </span>
              <span class="text-gray-400">·</span>
              <span class="font-medium">{{ sale.buyer }}</span>
              <span v-if="sale.contractDate" class="text-gray-500 text-xs">
                {{ formatDate(sale.contractDate, 'MM.dd') }}
              </span>
            </div>
          </div>

          <!-- Line 2: 계약금, 중도금, 잔금, 합계, 상태 (백만원 단위) -->
          <div class="flex items-center justify-between text-xs">
            <div class="flex items-center gap-2 text-gray-600 flex-wrap">
              <span v-if="sale.downPayment > 0">계약금 {{ toMillions(sale.downPayment) }}</span>
              <span v-if="sale.interimPayment > 0">중도금 {{ toMillions(sale.interimPayment) }}</span>
              <span v-if="sale.finalPayment > 0">잔금 {{ toMillions(sale.finalPayment) }}</span>
              <span class="font-medium text-green-600">합계 {{ toMillions(sale.totalAmount) }}</span>
            </div>
            <n-tag
              :type="sale.status === 'completed' ? 'success' : 'info'"
              size="small"
              class="flex-shrink-0"
            >
              {{ sale.status === 'completed' ? '종결' : '진행중' }}
            </n-tag>
          </div>
        </div>

        <n-empty v-if="filteredSales.length === 0" description="매도 계약이 없습니다" class="py-10" />
      </div>

      <!-- PC table layout (md and above) -->
      <n-card class="hidden md:block">
        <n-data-table
          v-if="filteredSales.length > 0"
          :columns="columns"
          :data="filteredSales"
          :scroll-x="900"
          :pagination="{ pageSize: 20 }"
          striped
          :row-props="(row: SaleContract) => ({
            style: 'cursor: pointer;',
            onClick: () => handleRowClick(row)
          })"
        />
        <n-empty v-else description="매도 계약이 없습니다" class="py-10" />
      </n-card>
    </div>

    <!-- Add Sale Modal -->
    <n-modal v-model:show="showAddModal" preset="dialog" title="매도 계약 등록">
      <n-form :model="saleForm" label-placement="left" label-width="100">
        <n-form-item label="구분">
          <n-input v-model:value="saleForm.category" placeholder="예: 1, 2, 3..." />
        </n-form-item>
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
        <n-form-item label="계약금 (천원)">
          <n-input-number v-model:value="saleForm.downPayment" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 (천원)">
          <n-input-number v-model:value="saleForm.interimPayment" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="잔금 (천원)">
          <n-input-number v-model:value="saleForm.finalPayment" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="잔금일자">
          <n-date-picker v-model:value="saleForm.finalPaymentDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="합계 (천원)">
          <n-input-number :value="totalAmount" disabled style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약형식">
          <n-input v-model:value="saleForm.contractFormat" placeholder="예: 임대일부말소" />
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
</style>
