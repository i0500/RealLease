import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import router from './router'
import './assets/styles/main.css'

// 개발 모드가 아닐 때 mock 데이터 정리
if (import.meta.env.VITE_DEV_MODE !== 'true') {
  localStorage.removeItem('mock_sheets_data')
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
