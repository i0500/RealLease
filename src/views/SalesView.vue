<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import { useContractsStore } from '@/stores/contracts'
import { useSheetsStore } from '@/stores/sheets'
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
  NTag
} from 'naive-ui'
import { HomeOutline as HomeIcon } from '@vicons/ionicons5'

const router = useRouter()
const contractsStore = useContractsStore()
const sheetsStore = useSheetsStore()

// View state
const searchQuery = ref('')

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
    width: 80,
    ellipsis: { tooltip: true }
  },
  {
    title: '동-호',
    key: 'unit',
    width: 120,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약자',
    key: 'buyer',
    width: 120,
    ellipsis: { tooltip: true }
  },
  {
    title: '계약금',
    key: 'downPayment',
    width: 120,
    render: (row: SaleContract) => {
      const total =
        (row.downPayment1?.amount || 0) + (row.downPayment2?.amount || 0)
      return total > 0 ? `${total.toLocaleString()}만원` : '-'
    }
  },
  {
    title: '중도금',
    key: 'interimPayment',
    width: 120,
    render: (row: SaleContract) => {
      const total =
        (row.interimPayment1?.amount || 0) +
        (row.interimPayment2?.amount || 0) +
        (row.interimPayment3?.amount || 0)
      return total > 0 ? `${total.toLocaleString()}만원` : '-'
    }
  },
  {
    title: '잔금',
    key: 'finalPayment',
    width: 120,
    render: (row: SaleContract) => {
      return row.finalPayment?.amount
        ? `${row.finalPayment.amount.toLocaleString()}만원`
        : '-'
    }
  },
  {
    title: '합계',
    key: 'totalAmount',
    width: 140,
    render: (row: SaleContract) => `${row.totalAmount.toLocaleString()}만원`
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
    width: 100,
    render: (row: SaleContract) => {
      const isCompleted = row.notes?.includes('종결')
      return h(
        NTag,
        { type: isCompleted ? 'success' : 'info' },
        { default: () => (isCompleted ? '종결' : '진행중') }
      )
    }
  },
  {
    title: '비고',
    key: 'notes',
    width: 150,
    ellipsis: { tooltip: true }
  }
]

// Handle row click
function handleRowClick(row: SaleContract) {
  router.push({ name: 'sale-detail', params: { id: row.id } })
}
</script>

<template>
  <div class="sales-view">
    <div class="header mb-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-2xl font-bold" style="color: #2c3e50;">매도현황</h1>
        <n-button @click="() => router.push('/')" secondary>
          <template #icon>
            <n-icon><HomeIcon /></n-icon>
          </template>
          <span class="ml-1">홈</span>
        </n-button>
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

    <!-- Data table -->
    <n-card v-else-if="sheetsStore.currentSheet">
      <n-data-table
        v-if="filteredSales.length > 0"
        :columns="columns"
        :data="filteredSales"
        :scroll-x="1200"
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
