# 🏢 RealLease - 부동산 임대차 관리 시스템

구글 스프레드시트와 연동하여 임대차 계약을 관리하는 PWA 앱

## ✨ 주요 기능

- 📝 **계약 관리**: 전세/월세 계약 정보 관리
- 🔔 **만료 알림**: 계약 만료 90일 전 자동 알림
- 🛡️ **HUG 보증 추적**: HUG 전세보증 만료일 관리
- 📊 **대시보드**: 전체 현황 한눈에 확인
- 📱 **PWA**: 설치 후 앱처럼 사용 가능
- 🔄 **구글 시트 연동**: 여러 시트 동시 관리

## 🚀 빠른 시작

### 사용자용 (설치 불필요)

1. **배포된 URL 접속**
   ```
   https://your-app.vercel.app
   ```

2. **로그인 후 바로 사용**

### 개발자용

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 브라우저에서 http://localhost:5173 접속
```

## 📦 빌드 및 배포

### 프로덕션 빌드
```bash
npm run build
```

### 빌드 파일 미리보기
```bash
npm run serve
# http://localhost:4173
```

### Vercel 배포 (추천)
1. https://vercel.com 에서 계정 생성
2. GitHub 저장소 연결
3. "Deploy" 클릭
4. 자동 배포 완료

자세한 내용은 [DEPLOYMENT.md](./DEPLOYMENT.md) 참조

## 📱 사용 방법

자세한 사용 설명서는 [USER_GUIDE.md](./USER_GUIDE.md) 참조

## 🛠️ 기술 스택

- **프레임워크**: Vue 3 + TypeScript
- **UI 라이브러리**: Naive UI
- **상태 관리**: Pinia
- **스타일링**: Tailwind CSS
- **빌드 도구**: Vite
- **PWA**: vite-plugin-pwa + Workbox
- **데이터 저장**: Google Sheets API + LocalForage

## 📋 프로젝트 구조

```
app/
├── src/
│   ├── components/      # 재사용 가능한 컴포넌트
│   ├── views/           # 페이지 컴포넌트
│   ├── stores/          # Pinia 스토어
│   ├── services/        # API 서비스
│   ├── router/          # 라우터 설정
│   ├── types/           # TypeScript 타입
│   └── utils/           # 유틸리티 함수
├── public/              # 정적 파일
└── dist/                # 빌드 결과물
```

## 🔧 주요 스크립트

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run preview` | 빌드 결과물 미리보기 |
| `npm run type-check` | TypeScript 타입 체크 |
| `npm run clean` | 빌드 파일 삭제 |

## 📄 라이선스

Private - 내부 사용 목적

## 👥 기여

이 프로젝트는 현재 비공개입니다.

## 📞 문의

프로젝트 관련 문의사항은 관리자에게 연락하세요.

---

**Version**: 1.0.0
**Last Updated**: 2024-12-16
