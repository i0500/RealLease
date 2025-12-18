<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
import { formatDate } from '@/utils/dateUtils'
import {
  NCard,
  NButton,
  NSpace,
  NSpin,
  NAlert,
  NEmpty,
  NTag,
  NIcon,
  NDescriptions,
  NDescriptionsItem,
  NDivider
} from 'naive-ui'
import { ArrowBackOutline as BackIcon } from '@vicons/ionicons5'

const router = useRouter()
const route = useRoute()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()

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
  const isCompleted = saleContract.value.notes?.includes('종결')
  return {
    type: isCompleted ? 'success' : 'info',
    text: isCompleted ? '종결' : '진행중'
  }
})

// Go back to sales list
function goBack() {
  router.push({ name: 'sales' })
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
              {{ saleContract.unit }}
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
          <n-descriptions-item label="구분">
            {{ saleContract.category }}
          </n-descriptions-item>
          <n-descriptions-item label="동-호">
            {{ saleContract.unit }}
          </n-descriptions-item>
          <n-descriptions-item label="계약자">
            {{ saleContract.buyer }}
          </n-descriptions-item>
          <n-descriptions-item label="계약형식">
            {{ saleContract.contractFormat || '-' }}
          </n-descriptions-item>
          <n-descriptions-item label="채권양도">
            {{ saleContract.bondTransfer || '-' }}
          </n-descriptions-item>
          <n-descriptions-item label="비고">
            {{ saleContract.notes || '-' }}
          </n-descriptions-item>
        </n-descriptions>
      </n-card>

      <!-- Payment Details -->
      <n-card title="결제 정보" class="mb-4">
        <n-space vertical size="large">
          <!-- 계약금 -->
          <div v-if="saleContract.downPayment1 || saleContract.downPayment2">
            <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
              계약금
            </h3>
            <n-descriptions bordered :column="1">
              <n-descriptions-item
                v-if="saleContract.downPayment1"
                label="계약금 1차"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium text-blue-600">
                    {{ saleContract.downPayment1.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.downPayment1.date" class="text-gray-600">
                    {{ formatDate(saleContract.downPayment1.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
              <n-descriptions-item
                v-if="saleContract.downPayment2"
                label="계약금 2차"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium text-blue-600">
                    {{ saleContract.downPayment2.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.downPayment2.date" class="text-gray-600">
                    {{ formatDate(saleContract.downPayment2.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
            </n-descriptions>
          </div>

          <!-- 중도금 -->
          <div
            v-if="
              saleContract.interimPayment1 ||
              saleContract.interimPayment2 ||
              saleContract.interimPayment3
            "
          >
            <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">
              중도금
            </h3>
            <n-descriptions bordered :column="1">
              <n-descriptions-item
                v-if="saleContract.interimPayment1"
                label="중도금 1차"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium text-orange-600">
                    {{ saleContract.interimPayment1.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.interimPayment1.date" class="text-gray-600">
                    {{ formatDate(saleContract.interimPayment1.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
              <n-descriptions-item
                v-if="saleContract.interimPayment2"
                label="중도금 2차"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium text-orange-600">
                    {{ saleContract.interimPayment2.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.interimPayment2.date" class="text-gray-600">
                    {{ formatDate(saleContract.interimPayment2.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
              <n-descriptions-item
                v-if="saleContract.interimPayment3"
                label="중도금 3차"
              >
                <div class="flex justify-between items-center">
                  <span class="font-medium text-orange-600">
                    {{ saleContract.interimPayment3.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.interimPayment3.date" class="text-gray-600">
                    {{ formatDate(saleContract.interimPayment3.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
            </n-descriptions>
          </div>

          <!-- 잔금 -->
          <div v-if="saleContract.finalPayment">
            <h3 class="text-lg font-semibold mb-3" style="color: #2c3e50;">잔금</h3>
            <n-descriptions bordered :column="1">
              <n-descriptions-item label="잔금">
                <div class="flex justify-between items-center">
                  <span class="font-medium text-green-600">
                    {{ saleContract.finalPayment.amount.toLocaleString() }}만원
                  </span>
                  <span v-if="saleContract.finalPayment.date" class="text-gray-600">
                    {{ formatDate(saleContract.finalPayment.date, 'yyyy.MM.dd') }}
                  </span>
                </div>
              </n-descriptions-item>
            </n-descriptions>
          </div>

          <n-divider />

          <!-- 합계 -->
          <div>
            <n-descriptions bordered :column="1">
              <n-descriptions-item label="총 금액">
                <span class="text-xl font-bold" style="color: #2c3e50;">
                  {{ saleContract.totalAmount.toLocaleString() }}만원
                </span>
              </n-descriptions-item>
            </n-descriptions>
          </div>
        </n-space>
      </n-card>

      <!-- Actions -->
      <div class="flex justify-end gap-3">
        <n-button @click="goBack">목록으로 돌아가기</n-button>
      </div>
    </div>
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
