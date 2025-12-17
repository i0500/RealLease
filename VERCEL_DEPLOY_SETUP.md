# Vercel 배포 설정 가이드

배포 URL: https://real-lease.vercel.app

## Google Cloud Console 설정

### 1. OAuth Client ID 수정

**URL:** https://console.cloud.google.com/apis/credentials

**Client ID:** 955483406554-ot64a5jsghsdhkso3nhhskilid97252p.apps.googleusercontent.com

**수정 내용:**

#### 승인된 JavaScript 원본
```
기존:
http://localhost:5173

추가:
https://real-lease.vercel.app
```

#### 승인된 리디렉션 URI
```
기존:
http://localhost:5173
http://localhost:5173/

추가:
https://real-lease.vercel.app
https://real-lease.vercel.app/
```

**저장** 클릭

---

## Vercel 환경 변수 설정

**URL:** https://vercel.com/dashboard (프로젝트: real-lease)

**Settings → Environment Variables 추가:**

### 변수 1
```
Name:  VITE_GOOGLE_CLIENT_ID
Value: 955483406554-ot64a5jsghsdhkso3nhhskilid97252p.apps.googleusercontent.com
Environment: Production, Preview, Development (모두 체크)
```

### 변수 2
```
Name:  VITE_DEV_MODE
Value: false
Environment: Production, Preview, Development (모두 체크)
```

### 변수 3
```
Name:  VITE_APP_NAME
Value: RealLease
Environment: Production, Preview, Development (모두 체크)
```

### 변수 4
```
Name:  VITE_APP_VERSION
Value: 1.0.0
Environment: Production, Preview, Development (모두 체크)
```

---

## Vercel 재배포

**Deployments → 최신 배포 → ⋯ → Redeploy**

배포 완료 후:
- https://real-lease.vercel.app 접속
- Google 로그인 테스트
- 편집 기능 확인
