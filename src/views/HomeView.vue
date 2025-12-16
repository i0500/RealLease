<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSheetsStore } from '@/stores/sheets'
import { NLayout, NLayoutHeader, NLayoutSider, NLayoutContent, NMenu, NButton } from 'naive-ui'
import type { MenuOption } from 'naive-ui'

const router = useRouter()
const sheetsStore = useSheetsStore()

const hasSheets = computed(() => sheetsStore.sheetCount > 0)

onMounted(() => {
  // 시트가 있으면 대시보드로, 없으면 시트 추가 안내
  if (hasSheets.value) {
    router.replace({ name: 'dashboard' })
  }
})

const menuOptions: MenuOption[] = [
  {
    label: '대시보드',
    key: 'dashboard'
  },
  {
    label: '계약 관리',
    key: 'contracts'
  },
  {
    label: '알림',
    key: 'notifications'
  },
  {
    label: '설정',
    key: 'settings'
  }
]

function handleMenuSelect(key: string) {
  router.push({ name: key })
}
</script>

<template>
  <n-layout has-sider class="min-h-screen">
    <n-layout-sider
      bordered
      show-trigger
      collapse-mode="width"
      :collapsed-width="64"
      :width="240"
      :native-scrollbar="false"
    >
      <div class="p-4">
        <h1 class="text-xl font-bold text-primary">RealLease</h1>
      </div>
      <n-menu
        :options="menuOptions"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>

    <n-layout>
      <n-layout-header bordered class="p-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">임대차 관리</h2>
          <div class="flex items-center gap-4">
            <n-button @click="router.push({ name: 'notifications' })">
              <template #icon>🔔</template>
            </n-button>
            <n-button @click="router.push({ name: 'settings' })">
              <template #icon>⚙️</template>
            </n-button>
          </div>
        </div>
      </n-layout-header>

      <n-layout-content class="p-6">
        <div v-if="!hasSheets" class="text-center py-20">
          <div class="text-6xl mb-4">📊</div>
          <h2 class="text-2xl font-semibold mb-4">첫 시트를 추가해주세요</h2>
          <p class="text-gray-600 mb-8">
            구글 스프레드시트를 연결하여 임대차 관리를 시작하세요
          </p>
          <n-button
            type="primary"
            size="large"
            @click="router.push({ name: 'settings' })"
          >
            <template #icon>➕</template>
            시트 추가하기
          </n-button>
        </div>
        <router-view v-else />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
