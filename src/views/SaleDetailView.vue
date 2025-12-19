<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import {
  NCard,
  NButton,
  NSpin,
  NAlert,
  NEmpty,
  NTag,
  NIcon,
  NDescriptions,
  NDescriptionsItem,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NDatePicker,
  NSelect,
  NSpace,
  useMessage,
  useDialog
} from 'naive-ui'
import { ArrowBackOutline as BackIcon, CreateOutline as EditIcon } from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()
const message = useMessage()
const dialog = useDialog()

// Edit modal state
const showEditModal = ref(false)
const editForm = ref({
  category: '',
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
  if (sheetsStore.currentSheet) {
    await contractsStore.loadContracts(sheetsStore.currentSheet.id)
  }
})

// Find sale contract by ID
const saleContract = computed(() => {
  const id = route.params.id as string
  return contractsStore.saleContracts.find((sale) => sale.id === id)
})

// Status tag
const statusTag = computed(() => {
  if (!saleContract.value) return { type: 'default', text: '알 수 없음' }
  return {
    type: saleContract.value.status === 'completed' ? 'success' : 'info',
    text: saleContract.value.status === 'completed' ? '종결' : '진행중'
  }
})

// Go back to sales list
function goBack() {
  router.push({ name: 'sales' })
}

// Status options
const statusOptions = [
  { label: '진행중', value: 'active' },
  { label: '종결', value: 'completed' }
]

// Computed total amount for edit form
const totalAmount = computed(() => {
  return (
    editForm.value.downPayment2 +
    editForm.value.interimPayment1 +
    editForm.value.interimPayment2 +
    editForm.value.interimPayment3 +
    editForm.value.finalPayment
  )
})

// Open edit modal
function openEditModal() {
  if (!saleContract.value) return

  // Parse unit number from "108-407" format
  const unitParts = saleContract.value.unit.split('-')
  const unitNumber = unitParts[1] || unitParts[0] || ''

  editForm.value = {
    category: saleContract.value.category,
    building: saleContract.value.building,
    unitNumber: unitNumber,
    buyer: saleContract.value.buyer,
    contractDate: saleContract.value.contractDate ? new Date(saleContract.value.contractDate).getTime() : null,
    downPayment2Date: saleContract.value.downPayment2Date ? new Date(saleContract.value.downPayment2Date).getTime() : null,
    downPayment2: saleContract.value.downPayment2,
    interimPayment1Date: saleContract.value.interimPayment1Date ? new Date(saleContract.value.interimPayment1Date).getTime() : null,
    interimPayment1: saleContract.value.interimPayment1,
    interimPayment2Date: saleContract.value.interimPayment2Date ? new Date(saleContract.value.interimPayment2Date).getTime() : null,
    interimPayment2: saleContract.value.interimPayment2,
    interimPayment3Date: saleContract.value.interimPayment3Date ? new Date(saleContract.value.interimPayment3Date).getTime() : null,
    interimPayment3: saleContract.value.interimPayment3,
    finalPaymentDate: saleContract.value.finalPaymentDate ? new Date(saleContract.value.finalPaymentDate).getTime() : null,
    finalPayment: saleContract.value.finalPayment,
    contractFormat: saleContract.value.contractFormat,
    bondTransfer: saleContract.value.bondTransfer,
    status: saleContract.value.status,
    notes: saleContract.value.notes
  }

  showEditModal.value = true
}

// Submit edit
async function handleUpdate() {
  if (!saleContract.value) {
    message.error('계약 정보를 찾을 수 없습니다')
    return
  }

  if (!editForm.value.buyer || !editForm.value.building || !editForm.value.unitNumber) {
    message.error('필수 필드를 입력해주세요 (동, 호수, 계약자)')
    return
  }

  try {
    const unit = `${editForm.value.building}-${editForm.value.unitNumber}`

    await contractsStore.updateSaleContract(saleContract.value.id, {
      category: editForm.value.category,
      building: editForm.value.building,
      unit,
      buyer: editForm.value.buyer,
      contractDate: editForm.value.contractDate ? new Date(editForm.value.contractDate) : undefined,
      downPayment2Date: editForm.value.downPayment2Date ? new Date(editForm.value.downPayment2Date) : undefined,
      downPayment2: editForm.value.downPayment2,
      interimPayment1Date: editForm.value.interimPayment1Date ? new Date(editForm.value.interimPayment1Date) : undefined,
      interimPayment1: editForm.value.interimPayment1,
      interimPayment2Date: editForm.value.interimPayment2Date ? new Date(editForm.value.interimPayment2Date) : undefined,
      interimPayment2: editForm.value.interimPayment2,
      interimPayment3Date: editForm.value.interimPayment3Date ? new Date(editForm.value.interimPayment3Date) : undefined,
      interimPayment3: editForm.value.interimPayment3,
      finalPaymentDate: editForm.value.finalPaymentDate ? new Date(editForm.value.finalPaymentDate) : undefined,
      finalPayment: editForm.value.finalPayment,
      totalAmount: totalAmount.value,
      contractFormat: editForm.value.contractFormat,
      bondTransfer: editForm.value.bondTransfer,
      status: editForm.value.status,
      notes: editForm.value.notes
    })

    message.success('매도 계약이 수정되었습니다')
    showEditModal.value = false

    // Reload contracts to reflect changes
    if (sheetsStore.currentSheet) {
      await contractsStore.loadContracts(sheetsStore.currentSheet.id)
    }
  } catch (error) {
    message.error('매도 계약 수정에 실패했습니다')
    console.error('Update error:', error)
  }
}

// Delete sale contract
async function handleDelete() {
  if (!saleContract.value) return

  dialog.warning({
    title: '매도 계약 삭제',
    content: `${saleContract.value.unit} (${saleContract.value.buyer}) 계약을 삭제하시겠습니까?`,
    positiveText: '삭제',
    negativeText: '취소',
    onPositiveClick: async () => {
      try {
        await contractsStore.deleteSaleContract(saleContract.value!.id)
        message.success('매도 계약이 삭제되었습니다')
        goBack()
      } catch (error) {
        message.error('매도 계약 삭제에 실패했습니다')
        console.error('Delete error:', error)
      }
    }
  })
}
</script>

<template>
  <div class="sale-detail-view">
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

    <!-- Not found -->
    <n-card v-else-if="!saleContract">
      <n-empty description="매도 계약을 찾을 수 없습니다" />
      <div class="mt-4 text-center">
        <n-button @click="goBack" type="primary">목록으로 돌아가기</n-button>
      </div>
    </n-card>

    <!-- Sale detail -->
    <div v-else>
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <n-button @click="goBack" circle>
            <template #icon>
              <n-icon><BackIcon /></n-icon>
            </template>
          </n-button>
          <div>
            <h1 class="text-2xl font-bold" style="color: #2c3e50;">
              {{ saleContract.building }}동 {{ saleContract.unit.split('-')[1] || saleContract.unit.split('-')[0] }}호
            </h1>
            <p class="text-sm text-gray-600 mt-1">매도현황 상세 정보</p>
          </div>
        </div>
        <n-tag :type="statusTag.type as any" size="large">
          {{ statusTag.text }}
        </n-tag>
      </div>

      <!-- Basic Information -->
      <n-card title="기본 정보" class="mb-4">
        <n-descriptions bordered :column="2">
          <n-descriptions-item label="동-호">
            {{ saleContract.building }}동 {{ saleContract.unit.split('-')[1] || saleContract.unit.split('-')[0] }}호
          </n-descriptions-item>
          <n-descriptions-item label="계약자">
            {{ saleContract.buyer }}
          </n-descriptions-item>
          <n-descriptions-item label="계약일">
            {{ saleContract.contractDate ? formatDate(saleContract.contractDate, 'yyyy.MM.dd') : '-' }}
          </n-descriptions-item>
          <n-descriptions-item label="계약형식">
            {{ saleContract.contractFormat || '-' }}
          </n-descriptions-item>
          <n-descriptions-item label="상태" :span="2">
            <n-tag :type="saleContract.status === 'completed' ? 'success' : 'info'">
              {{ saleContract.status === 'completed' ? '종결' : '진행중' }}
            </n-tag>
          </n-descriptions-item>
          <n-descriptions-item label="비고" :span="2">
            {{ saleContract.notes || '-' }}
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- Payment Details -->
      <n-card title="결제 정보 (단위: 천원)" class="mb-4">
        <n-descriptions bordered :column="1" label-placement="left">
          <n-descriptions-item label="계약금 2차">
            <div class="flex justify-between items-center">
              <span class="font-medium text-blue-600">
                {{ saleContract.downPayment2 > 0 ? saleContract.downPayment2.toLocaleString() : '-' }}
              </span>
              <span v-if="saleContract.downPayment2Date" class="text-sm text-gray-600">
                ({{ formatDate(saleContract.downPayment2Date, 'yyyy.MM.dd') }})
              </span>
            </div>
          </n-descriptions-item>
          <n-descriptions-item label="중도금 1차">
            <div class="flex justify-between items-center">
              <span class="font-medium text-orange-600">
                {{ saleContract.interimPayment1 > 0 ? saleContract.interimPayment1.toLocaleString() : '-' }}
              </span>
              <span v-if="saleContract.interimPayment1Date" class="text-sm text-gray-600">
                ({{ formatDate(saleContract.interimPayment1Date, 'yyyy.MM.dd') }})
              </span>
            </div>
          </n-descriptions-item>
          <n-descriptions-item label="중도금 2차">
            <div class="flex justify-between items-center">
              <span class="font-medium text-orange-600">
                {{ saleContract.interimPayment2 > 0 ? saleContract.interimPayment2.toLocaleString() : '-' }}
              </span>
              <span v-if="saleContract.interimPayment2Date" class="text-sm text-gray-600">
                ({{ formatDate(saleContract.interimPayment2Date, 'yyyy.MM.dd') }})
              </span>
            </div>
          </n-descriptions-item>
          <n-descriptions-item label="중도금 3차">
            <div class="flex justify-between items-center">
              <span class="font-medium text-orange-600">
                {{ saleContract.interimPayment3 > 0 ? saleContract.interimPayment3.toLocaleString() : '-' }}
              </span>
              <span v-if="saleContract.interimPayment3Date" class="text-sm text-gray-600">
                ({{ formatDate(saleContract.interimPayment3Date, 'yyyy.MM.dd') }})
              </span>
            </div>
          </n-descriptions-item>
          <n-descriptions-item label="잔금">
            <div class="flex justify-between items-center">
              <span class="font-medium text-green-600">
                {{ saleContract.finalPayment > 0 ? saleContract.finalPayment.toLocaleString() : '-' }}
              </span>
              <span v-if="saleContract.finalPaymentDate" class="text-sm text-gray-600">
                ({{ formatDate(saleContract.finalPaymentDate, 'yyyy.MM.dd') }})
              </span>
            </div>
          </n-descriptions-item>
          <n-descriptions-item label="총 금액">
            <span class="text-xl font-bold" style="color: #2c3e50;">
              {{ saleContract.totalAmount.toLocaleString() }}
            </span>
          </n-descriptions-item>
          <n-descriptions-item label="채권양도">
            {{ saleContract.bondTransfer || '-' }}
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <n-button @click="goBack">목록으로 돌아가기</n-button>
        <n-button type="primary" @click="openEditModal">
          <template #icon>
            <n-icon><EditIcon /></n-icon>
          </template>
          수정
        </n-button>
        <n-button type="error" @click="handleDelete">삭제</n-button>
      </div>
    </div>

    <!-- Edit Sale Modal -->
    <n-modal v-model:show="showEditModal" preset="dialog" title="매도 계약 수정">
      <n-form :model="editForm" label-placement="left" label-width="100">
        <n-form-item label="구분">
          <n-input v-model:value="editForm.category" placeholder="예: 1, 2, 3..." />
        </n-form-item>
        <n-form-item label="동" required>
          <n-input v-model:value="editForm.building" placeholder="예: 108" />
        </n-form-item>
        <n-form-item label="호수" required>
          <n-input v-model:value="editForm.unitNumber" placeholder="예: 407" />
        </n-form-item>
        <n-form-item label="계약자" required>
          <n-input v-model:value="editForm.buyer" placeholder="계약자 이름" />
        </n-form-item>
        <n-form-item label="계약일">
          <n-date-picker v-model:value="editForm.contractDate" type="date" style="width: 100%" />
        </n-form-item>

        <!-- 계약금 2차 -->
        <n-form-item label="계약금 2차 일자">
          <n-date-picker v-model:value="editForm.downPayment2Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약금 2차 (천원)">
          <n-input-number v-model:value="editForm.downPayment2" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 1차 -->
        <n-form-item label="중도금 1차 일자">
          <n-date-picker v-model:value="editForm.interimPayment1Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 1차 (천원)">
          <n-input-number v-model:value="editForm.interimPayment1" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 2차 -->
        <n-form-item label="중도금 2차 일자">
          <n-date-picker v-model:value="editForm.interimPayment2Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 2차 (천원)">
          <n-input-number v-model:value="editForm.interimPayment2" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 중도금 3차 -->
        <n-form-item label="중도금 3차 일자">
          <n-date-picker v-model:value="editForm.interimPayment3Date" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="중도금 3차 (천원)">
          <n-input-number v-model:value="editForm.interimPayment3" :min="0" style="width: 100%" />
        </n-form-item>

        <!-- 잔금 -->
        <n-form-item label="잔금 일자">
          <n-date-picker v-model:value="editForm.finalPaymentDate" type="date" style="width: 100%" />
        </n-form-item>
        <n-form-item label="잔금 (천원)">
          <n-input-number v-model:value="editForm.finalPayment" :min="0" style="width: 100%" />
        </n-form-item>

        <n-form-item label="합계 (천원)">
          <n-input-number :value="totalAmount" disabled style="width: 100%" />
        </n-form-item>
        <n-form-item label="계약형식">
          <n-input v-model:value="editForm.contractFormat" placeholder="예: 임대일부말소" />
        </n-form-item>
        <n-form-item label="채권양도">
          <n-input v-model:value="editForm.bondTransfer" placeholder="채권양도 정보" />
        </n-form-item>
        <n-form-item label="상태">
          <n-select v-model:value="editForm.status" :options="statusOptions" />
        </n-form-item>
        <n-form-item label="비고">
          <n-input v-model:value="editForm.notes" type="textarea" placeholder="비고 입력" />
        </n-form-item>
      </n-form>
      <template #action>
        <n-space justify="end">
          <n-button @click="showEditModal = false">취소</n-button>
          <n-button type="primary" @click="handleUpdate">저장</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.sale-detail-view {
  padding: 1rem;
  max-width: 1000px;
  margin: 0 auto;
}

@media (min-width: 768px) {
  .sale-detail-view {
    padding: 2rem;
  }
}
</style>
