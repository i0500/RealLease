<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { formatCurrency } from '@/utils/formatUtils'
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
  NSwitch,
  useMessage,
  useDialog
} from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()
const dialog = useDialog()

// View state
const isMobile = ref(false)
const viewMode = ref<'table' | 'card'>('table')
const searchQuery = ref('')
const filterType = ref<'all' | 'jeonse' | 'wolse'>('all')
const filterStatus = ref<'all' | 'active' | 'expired' | 'terminated'>('all')

// Modal state
const showContractModal = ref(false)
const showDetailModal = ref(false)
const editingContract = ref<RentalContract | null>(null)
const viewingContract = ref<RentalContract | null>(null)
const contractForm = ref({
  tenant: { name: '', phone: '', email: '', idNumber: '' },
  property: { address: '', type: '', unit: '' },
  contract: {
    type: 'wolse' as 'jeonse' | 'wolse',
    deposit: 0,
    monthlyRent: 0,
    startDate: null as number | null,
    endDate: null as number | null,
    status: 'active' as 'active' | 'expired' | 'terminated',
    contractType: 'new' as 'new' | 'renewal' | 'change'
  },
  hug: {
    guaranteed: false,
    startDate: null as number | null,
    endDate: null as number | null,
    amount: 0,
    insuranceNumber: ''
  },
  realtor: { name: '', phone: '', address: '', fee: 0 }
})

// Load contracts on mount
onMounted(async () => {
  // 모바일 화면 감지 (768px 이하)
  const checkMobile = () => {
    const mobile = window.innerWidth < 768
    isMobile.value = mobile
    // 모바일에서는 자동으로 카드 뷰
    if (mobile) {
      viewMode.value = 'card'
    }
  }
  checkMobile()
  window.addEventListener('resize', checkMobile)

  // Handle query parameters from dashboard navigation
  const { status, id } = route.query

  if (sheetsStore.currentSheet) {
    try {
      await contractsStore.loadContracts(sheetsStore.currentSheet.id)

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
  if (status && (status === 'active' || status === 'expired')) {
    filterStatus.value = status
  }
})

// Filtered contracts
const filteredContracts = computed(() => {
  let result = contractsStore.contracts

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(
      (c) =>
        c.tenant.name.toLowerCase().includes(query) ||
        c.property.address.toLowerCase().includes(query) ||
        c.tenant.phone.includes(query)
    )
  }

  // Type filter
  if (filterType.value !== 'all') {
    result = result.filter((c) => c.contract.type === filterType.value)
  }

  // Status filter
  if (filterStatus.value !== 'all') {
    result = result.filter((c) => c.contract.status === filterStatus.value)
  }

  return result
})

// Table columns
const columns = [
  {
    title: '임차인',
    key: 'tenant.name',
    render: (row: RentalContract) => {
      return h(
        'a',
        {
          href: 'javascript:void(0)',
          onClick: () => handleView(row),
          style: 'color: #18a058; cursor: pointer; text-decoration: underline;'
        },
        row.tenant.name
      )
    }
  },
  {
    title: '물건지',
    key: 'property.address',
    render: (row: RentalContract) => `${row.property.address} ${row.property.unit || ''}`
  },
  {
    title: '계약구분',
    key: 'contract.type',
    render: (row: RentalContract) => (
      row.contract.type === 'jeonse' ? '전세' : '월세'
    )
  },
  {
    title: '보증금',
    key: 'contract.deposit',
    render: (row: RentalContract) => formatCurrency(row.contract.deposit)
  },
  {
    title: '월세',
    key: 'contract.monthlyRent',
    render: (row: RentalContract) =>
      row.contract.monthlyRent ? formatCurrency(row.contract.monthlyRent) : '-'
  },
  {
    title: '계약기간',
    key: 'contract.period',
    render: (row: RentalContract) =>
      `${formatDate(row.contract.startDate)} ~ ${formatDate(row.contract.endDate)}`
  },
  {
    title: '상태',
    key: 'contract.status',
    render: (row: RentalContract) => {
      const statusMap = {
        active: { text: '진행중', type: 'success' as const },
        expired: { text: '만료', type: 'error' as const },
        terminated: { text: '해지', type: 'warning' as const }
      }
      const status = statusMap[row.contract.status]
      return h(NTag, { type: status.type }, { default: () => status.text })
    }
  },
  {
    title: 'HUG보증',
    key: 'hug.guaranteed',
    render: (row: RentalContract) =>
      row.hug?.guaranteed ? '가입' : '-'
  },
  {
    title: '작업',
    key: 'actions',
    render: (row: RentalContract) => {
      return h(
        NSpace,
        {},
        {
          default: () => [
            h(
              NButton,
              {
                size: 'small',
                onClick: () => handleEdit(row)
              },
              { default: () => '수정' }
            ),
            h(
              NButton,
              {
                size: 'small',
                type: 'error',
                onClick: () => handleDelete(row)
              },
              { default: () => '삭제' }
            )
          ]
        }
      )
    }
  }
]

// Filter options
const typeOptions = [
  { label: '전체', value: 'all' },
  { label: '전세', value: 'jeonse' },
  { label: '월세', value: 'wolse' }
]

const statusOptions = [
  { label: '전체', value: 'all' },
  { label: '진행중', value: 'active' },
  { label: '만료', value: 'expired' },
  { label: '해지', value: 'terminated' }
]

const contractTypeOptions = [
  { label: '신규', value: 'new' },
  { label: '갱신', value: 'renewal' },
  { label: '변경', value: 'change' }
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
    tenant: {
      name: contract.tenant.name,
      phone: contract.tenant.phone,
      email: contract.tenant.email || '',
      idNumber: contract.tenant.idNumber || ''
    },
    property: {
      address: contract.property.address,
      type: contract.property.type,
      unit: contract.property.unit || ''
    },
    contract: {
      type: contract.contract.type,
      deposit: contract.contract.deposit,
      monthlyRent: contract.contract.monthlyRent || 0,
      startDate: contract.contract.startDate.getTime(),
      endDate: contract.contract.endDate.getTime(),
      status: contract.contract.status,
      contractType: contract.contract.contractType
    },
    hug: contract.hug
      ? {
          guaranteed: contract.hug.guaranteed,
          startDate: contract.hug.startDate.getTime(),
          endDate: contract.hug.endDate.getTime(),
          amount: contract.hug.amount,
          insuranceNumber: contract.hug.insuranceNumber || ''
        }
      : {
          guaranteed: false,
          startDate: null,
          endDate: null,
          amount: 0,
          insuranceNumber: ''
        },
    realtor: contract.realtor
      ? {
          name: contract.realtor.name,
          phone: contract.realtor.phone,
          address: contract.realtor.address || '',
          fee: contract.realtor.fee || 0
        }
      : {
          name: '',
          phone: '',
          address: '',
          fee: 0
        }
  }
  showContractModal.value = true
}

function handleDelete(contract: RentalContract) {
  dialog.warning({
    title: '계약 삭제',
    content: `${contract.tenant.name}님의 계약을 삭제하시겠습니까?`,
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
    if (!sheetsStore.currentSheet) {
      message.error('시트가 선택되지 않았습니다')
      return
    }

    if (!contractForm.value.contract.startDate || !contractForm.value.contract.endDate) {
      message.error('계약 시작일과 종료일을 입력해주세요')
      return
    }

    const contractData: any = {
      sheetId: sheetsStore.currentSheet.id,
      rowIndex: editingContract.value?.rowIndex || 0,
      tenant: {
        name: contractForm.value.tenant.name,
        phone: contractForm.value.tenant.phone,
        email: contractForm.value.tenant.email || '',
        idNumber: contractForm.value.tenant.idNumber || ''
      },
      property: {
        address: contractForm.value.property.address,
        type: contractForm.value.property.type,
        unit: contractForm.value.property.unit || ''
      },
      contract: {
        type: contractForm.value.contract.type,
        deposit: contractForm.value.contract.deposit,
        monthlyRent: contractForm.value.contract.monthlyRent || 0,
        startDate: new Date(contractForm.value.contract.startDate),
        endDate: new Date(contractForm.value.contract.endDate),
        status: contractForm.value.contract.status,
        contractType: contractForm.value.contract.contractType
      },
      hug: contractForm.value.hug.guaranteed && contractForm.value.hug.startDate && contractForm.value.hug.endDate
        ? {
            guaranteed: true,
            startDate: new Date(contractForm.value.hug.startDate),
            endDate: new Date(contractForm.value.hug.endDate),
            amount: contractForm.value.hug.amount,
            insuranceNumber: contractForm.value.hug.insuranceNumber || ''
          }
        : undefined,
      realtor: contractForm.value.realtor.name
        ? {
            name: contractForm.value.realtor.name,
            phone: contractForm.value.realtor.phone,
            address: contractForm.value.realtor.address || '',
            fee: contractForm.value.realtor.fee || 0
          }
        : undefined
    }

    if (editingContract.value) {
      await contractsStore.updateContract(editingContract.value.id, contractData)
      message.success('계약이 수정되었습니다')
    } else {
      await contractsStore.addContract(contractData)
      message.success('계약이 추가되었습니다')
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
    tenant: { name: '', phone: '', email: '', idNumber: '' },
    property: { address: '', type: '', unit: '' },
    contract: {
      type: 'wolse',
      deposit: 0,
      monthlyRent: 0,
      startDate: null,
      endDate: null,
      status: 'active',
      contractType: 'new'
    },
    hug: {
      guaranteed: false,
      startDate: null,
      endDate: null,
      amount: 0,
      insuranceNumber: ''
    },
    realtor: { name: '', phone: '', address: '', fee: 0 }
  }
}

// Import h from vue for rendering
import { h } from 'vue'
</script>

<template>
  <div class="contracts-view">
    <div class="header mb-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold" style="color: #2c3e50;">임대차 현황</h1>
        <n-button @click="() => router.push('/')" secondary>
          <template #icon>
            <n-icon><HomeIcon /></n-icon>
          </template>
          메인 화면
        </n-button>
      </div>

      <!-- Filters and Search -->
      <n-space class="mb-4" align="center">
        <n-input
          v-model:value="searchQuery"
          placeholder="임차인명, 주소, 연락처 검색"
          clearable
          style="width: 300px"
        >
          <template #prefix>🔍</template>
        </n-input>

        <n-select
          v-model:value="filterType"
          :options="typeOptions"
          style="width: 120px"
        />

        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          style="width: 120px"
        />

        <n-button type="primary" @click="handleAdd">
          <template #icon>➕</template>
          <span class="hidden sm:inline">계약 추가</span>
          <span class="sm:hidden">추가</span>
        </n-button>

        <!-- 데스크톱에서만 뷰 모드 선택 표시 -->
        <n-radio-group v-if="!isMobile" v-model:value="viewMode">
          <n-radio value="table">테이블</n-radio>
          <n-radio value="card">카드</n-radio>
        </n-radio-group>
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

    <!-- Table View -->
    <n-card v-else-if="viewMode === 'table'">
      <n-data-table
        :columns="columns"
        :data="filteredContracts"
        :pagination="{ pageSize: 10 }"
        :bordered="false"
      />
    </n-card>

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
            <span class="font-bold text-lg">{{ contract.tenant.name }}</span>
            <n-tag
              :type="
                contract.contract.status === 'active'
                  ? 'success'
                  : contract.contract.status === 'expired'
                  ? 'error'
                  : 'warning'
              "
              size="small"
            >
              {{
                contract.contract.status === 'active'
                  ? '진행중'
                  : contract.contract.status === 'expired'
                  ? '만료'
                  : '해지'
              }}
            </n-tag>
          </div>
        </template>
        <div class="contract-info space-y-3">
          <div class="info-row">
            <span class="label">📍 물건지</span>
            <span class="value">{{ contract.property.address }} {{ contract.property.unit }}</span>
          </div>

          <div class="info-row">
            <span class="label">📝 계약구분</span>
            <span class="value font-semibold">
              {{ contract.contract.type === 'jeonse' ? '전세' : '월세' }}
            </span>
          </div>

          <div class="info-row">
            <span class="label">💰 보증금</span>
            <span class="value font-bold text-blue-600">{{ formatCurrency(contract.contract.deposit) }}</span>
          </div>

          <div v-if="contract.contract.monthlyRent" class="info-row">
            <span class="label">🏠 월세</span>
            <span class="value font-bold text-green-600">{{ formatCurrency(contract.contract.monthlyRent) }}</span>
          </div>

          <div class="info-row">
            <span class="label">📅 계약기간</span>
            <span class="value text-sm">
              {{ formatDate(contract.contract.startDate) }}<br class="sm:hidden" />
              <span class="hidden sm:inline"> ~ </span>
              {{ formatDate(contract.contract.endDate) }}
            </span>
          </div>

          <div v-if="contract.hug?.guaranteed" class="info-row">
            <span class="label">🛡️ HUG보증</span>
            <span class="value text-green-600">가입</span>
          </div>

          <div class="info-row">
            <span class="label">📞 연락처</span>
            <span class="value">{{ contract.tenant.phone }}</span>
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
      title="계약 상세정보"
      style="width: 90%; max-width: 800px; max-height: 90vh; overflow-y: auto"
      :segmented="{ content: true }"
    >
      <div v-if="viewingContract" class="contract-detail">
        <!-- 상태 표시 -->
        <div class="flex items-center justify-between mb-6 p-4 rounded" style="background-color: #f5f7fa;">
          <div>
            <h2 class="text-2xl font-bold mb-2">{{ viewingContract.tenant.name }}</h2>
            <p class="text-sm text-gray-600">{{ viewingContract.property.address }}</p>
          </div>
          <n-tag
            :type="
              viewingContract.contract.status === 'active'
                ? 'success'
                : viewingContract.contract.status === 'expired'
                ? 'error'
                : 'warning'
            "
            size="large"
          >
            {{
              viewingContract.contract.status === 'active'
                ? '진행중'
                : viewingContract.contract.status === 'expired'
                ? '만료'
                : '해지'
            }}
          </n-tag>
        </div>

        <!-- 임차인 정보 -->
        <div class="detail-section">
          <h3 class="section-title">👤 임차인 정보</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">이름</span>
              <span class="value">{{ viewingContract.tenant.name }}</span>
            </div>
            <div class="detail-item">
              <span class="label">연락처</span>
              <span class="value">{{ viewingContract.tenant.phone }}</span>
            </div>
            <div v-if="viewingContract.tenant.email" class="detail-item">
              <span class="label">이메일</span>
              <span class="value">{{ viewingContract.tenant.email }}</span>
            </div>
            <div v-if="viewingContract.tenant.idNumber" class="detail-item">
              <span class="label">주민번호</span>
              <span class="value">{{ viewingContract.tenant.idNumber }}</span>
            </div>
          </div>
        </div>

        <!-- 물건 정보 -->
        <div class="detail-section">
          <h3 class="section-title">🏠 물건 정보</h3>
          <div class="detail-grid">
            <div class="detail-item full-width">
              <span class="label">주소</span>
              <span class="value">{{ viewingContract.property.address }}</span>
            </div>
            <div class="detail-item">
              <span class="label">물건유형</span>
              <span class="value">{{ viewingContract.property.type }}</span>
            </div>
            <div v-if="viewingContract.property.unit" class="detail-item">
              <span class="label">호수</span>
              <span class="value">{{ viewingContract.property.unit }}</span>
            </div>
          </div>
        </div>

        <!-- 계약 정보 -->
        <div class="detail-section">
          <h3 class="section-title">📝 계약 정보</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">계약구분</span>
              <span class="value font-bold">
                {{ viewingContract.contract.type === 'jeonse' ? '전세' : '월세' }}
              </span>
            </div>
            <div class="detail-item">
              <span class="label">계약유형</span>
              <span class="value">
                {{
                  viewingContract.contract.contractType === 'new'
                    ? '신규'
                    : viewingContract.contract.contractType === 'renewal'
                    ? '갱신'
                    : '변경'
                }}
              </span>
            </div>
            <div class="detail-item">
              <span class="label">보증금</span>
              <span class="value font-bold text-blue-600">
                {{ formatCurrency(viewingContract.contract.deposit) }}
              </span>
            </div>
            <div v-if="viewingContract.contract.monthlyRent" class="detail-item">
              <span class="label">월세</span>
              <span class="value font-bold text-green-600">
                {{ formatCurrency(viewingContract.contract.monthlyRent) }}
              </span>
            </div>
            <div class="detail-item full-width">
              <span class="label">계약기간</span>
              <span class="value">
                {{ formatDate(viewingContract.contract.startDate) }} ~
                {{ formatDate(viewingContract.contract.endDate) }}
              </span>
            </div>
          </div>
        </div>

        <!-- HUG 보증 정보 -->
        <div v-if="viewingContract.hug?.guaranteed" class="detail-section">
          <h3 class="section-title">🛡️ HUG 전세보증 정보</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">보증금액</span>
              <span class="value">{{ formatCurrency(viewingContract.hug.amount) }}</span>
            </div>
            <div class="detail-item">
              <span class="label">보험번호</span>
              <span class="value">{{ viewingContract.hug.insuranceNumber || '-' }}</span>
            </div>
            <div class="detail-item full-width">
              <span class="label">보증기간</span>
              <span class="value">
                {{ formatDate(viewingContract.hug.startDate) }} ~
                {{ formatDate(viewingContract.hug.endDate) }}
              </span>
            </div>
          </div>
        </div>

        <!-- 부동산 정보 -->
        <div v-if="viewingContract.realtor" class="detail-section">
          <h3 class="section-title">🏢 부동산 정보</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">상호</span>
              <span class="value">{{ viewingContract.realtor.name }}</span>
            </div>
            <div class="detail-item">
              <span class="label">연락처</span>
              <span class="value">{{ viewingContract.realtor.phone }}</span>
            </div>
            <div v-if="viewingContract.realtor.address" class="detail-item full-width">
              <span class="label">주소</span>
              <span class="value">{{ viewingContract.realtor.address }}</span>
            </div>
            <div v-if="viewingContract.realtor.fee" class="detail-item">
              <span class="label">중개수수료</span>
              <span class="value">{{ formatCurrency(viewingContract.realtor.fee) }}</span>
            </div>
          </div>
        </div>
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
      <n-form label-placement="left" label-width="120px">
        <!-- Tenant Information -->
        <h3 class="text-lg font-semibold mb-3">임차인 정보</h3>
        <n-form-item label="이름" required>
          <n-input v-model:value="contractForm.tenant.name" />
        </n-form-item>
        <n-form-item label="연락처" required>
          <n-input v-model:value="contractForm.tenant.phone" />
        </n-form-item>
        <n-form-item label="이메일">
          <n-input v-model:value="contractForm.tenant.email" />
        </n-form-item>
        <n-form-item label="주민번호">
          <n-input v-model:value="contractForm.tenant.idNumber" />
        </n-form-item>

        <!-- Property Information -->
        <h3 class="text-lg font-semibold mb-3 mt-6">물건 정보</h3>
        <n-form-item label="주소" required>
          <n-input v-model:value="contractForm.property.address" />
        </n-form-item>
        <n-form-item label="물건유형">
          <n-input v-model:value="contractForm.property.type" placeholder="아파트, 오피스텔 등" />
        </n-form-item>
        <n-form-item label="호수">
          <n-input v-model:value="contractForm.property.unit" />
        </n-form-item>

        <!-- Contract Information -->
        <h3 class="text-lg font-semibold mb-3 mt-6">계약 정보</h3>
        <n-form-item label="계약구분" required>
          <n-radio-group v-model:value="contractForm.contract.type">
            <n-radio value="jeonse">전세</n-radio>
            <n-radio value="wolse">월세</n-radio>
          </n-radio-group>
        </n-form-item>
        <n-form-item label="계약유형" required>
          <n-select
            v-model:value="contractForm.contract.contractType"
            :options="contractTypeOptions"
          />
        </n-form-item>
        <n-form-item label="보증금" required>
          <n-input-number v-model:value="contractForm.contract.deposit" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item v-if="contractForm.contract.type === 'wolse'" label="월세">
          <n-input-number v-model:value="contractForm.contract.monthlyRent" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약시작일" required>
          <n-date-picker v-model:value="contractForm.contract.startDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약종료일" required>
          <n-date-picker v-model:value="contractForm.contract.endDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약상태">
          <n-radio-group v-model:value="contractForm.contract.status">
            <n-radio value="active">진행중</n-radio>
            <n-radio value="expired">만료</n-radio>
            <n-radio value="terminated">해지</n-radio>
          </n-radio-group>
        </n-form-item>

        <!-- HUG Guarantee Information -->
        <h3 class="text-lg font-semibold mb-3 mt-6">HUG 전세보증 정보</h3>
        <n-form-item label="HUG 가입여부">
          <n-switch v-model:value="contractForm.hug.guaranteed" />
        </n-form-item>
        <template v-if="contractForm.hug.guaranteed">
          <n-form-item label="보증금액">
            <n-input-number v-model:value="contractForm.hug.amount" :min="0" style="width: 100%" />
          </n-form-item>
          <n-form-item label="보증시작일">
            <n-date-picker v-model:value="contractForm.hug.startDate" type="date" style="width: 100%" />
          </n-form-item>
          <n-form-item label="보증종료일">
            <n-date-picker v-model:value="contractForm.hug.endDate" type="date" style="width: 100%" />
          </n-form-item>
          <n-form-item label="보험번호">
            <n-input v-model:value="contractForm.hug.insuranceNumber" />
          </n-form-item>
        </template>

        <!-- Realtor Information -->
        <h3 class="text-lg font-semibold mb-3 mt-6">부동산 정보</h3>
        <n-form-item label="상호">
          <n-input v-model:value="contractForm.realtor.name" />
        </n-form-item>
        <n-form-item label="연락처">
          <n-input v-model:value="contractForm.realtor.phone" />
        </n-form-item>
        <n-form-item label="주소">
          <n-input v-model:value="contractForm.realtor.address" />
        </n-form-item>
        <n-form-item label="중개수수료">
          <n-input-number v-model:value="contractForm.realtor.fee" :min="0" style="width: 100%" />
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
}
</style>
