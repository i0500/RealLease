# RealLease 배포 가이드

## Vercel 배포 (추천)

### 1단계: Vercel 계정 생성
1. https://vercel.com 접속
2. "Sign Up" → GitHub 계정으로 로그인

### 2단계: 프로젝트 배포
1. Vercel 대시보드에서 "Add New" → "Project" 클릭
2. GitHub 저장소 연결 (또는 직접 업로드)
3. Framework Preset: "Vite" 선택
4. "Deploy" 클릭

### 3단계: URL 공유
- 배포 완료 후 `https://your-app.vercel.app` 형태의 URL 생성
- 이 URL을 다른 사람에게 공유

### 사용자 안내 메시지
```
RealLease 앱 사용 방법:

1. 브라우저에서 이 주소로 접속하세요:
   https://your-app.vercel.app

2. 처음 접속 시 로그인 화면이 나타납니다

3. 설치 팝업이 뜨면 "설치" 버튼을 눌러주세요
   (앱처럼 사용할 수 있습니다)

4. 설치 후에는 바탕화면 아이콘으로 실행 가능합니다

📱 모바일에서도 동일하게 사용 가능합니다!
```

## 환경 변수 설정

Vercel 대시보드에서 환경 변수 추가:
- `VITE_APP_NAME`: RealLease
- `VITE_APP_VERSION`: 1.0.0

## 자동 배포 설정

GitHub에 코드를 푸시하면 자동으로 배포됩니다:
```bash
git add .
git commit -m "Update app"
git push
```

---

## 로컬 실행 (기술 사용자용)

기술적 지식이 있는 사용자의 경우:

### 필요 사항
- Node.js 18 이상

### 실행 방법
```bash
# 1. 패키지 설치
npm install

# 2. 앱 실행
npm run dev

# 3. 브라우저에서 접속
# http://localhost:5173
```

## Netlify 배포 (대안)

1. https://netlify.com 접속
2. "Add new site" → "Deploy manually"
3. `dist` 폴더를 드래그 앤 드롭
4. 생성된 URL 공유

## GitHub Pages 배포 (대안)

```bash
# vite.config.ts에 base 추가
export default defineConfig({
  base: '/reallease/',
  // ...
})

# 빌드 및 배포
npm run build
npx gh-pages -d dist
```
