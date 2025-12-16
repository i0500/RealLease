# RealLease 배포 가이드

Vercel을 통한 프로덕션 배포 전체 과정입니다.

## 📋 사전 준비

- ✅ Vercel 계정 (https://vercel.com)
- ✅ GitHub 계정 연동 완료
- ⬜ Git 사용자 정보 설정
- ⬜ GitHub 저장소 생성

## 1단계: Git 사용자 정보 설정

### 전역 설정 (모든 프로젝트에 적용)
```bash
git config --global user.name "본인 이름"
git config --global user.email "본인이메일@example.com"
```

### 프로젝트별 설정 (이 프로젝트만)
```bash
cd /mnt/f/RealLease/app
git config user.name "본인 이름"
git config user.email "본인이메일@example.com"
```

**확인**:
```bash
git config user.name
git config user.email
```

## 2단계: GitHub 저장소 생성

### 방법 1: GitHub 웹사이트에서

1. https://github.com/new 접속
2. 저장소 정보 입력:
   - **Repository name**: `reallease` (또는 원하는 이름)
   - **Description**: `부동산 임대차 관리 시스템`
   - **Public/Private**: Private 추천 (개인 프로젝트)
   - ⚠️ **"Add README file" 체크 해제** (이미 있음)
   - ⚠️ **"Add .gitignore" 체크 해제** (이미 있음)
3. **"Create repository"** 클릭

### 방법 2: GitHub CLI (gh 명령어)
```bash
gh repo create reallease --private --source=. --remote=origin
```

## 3단계: 첫 커밋 생성

```bash
cd /mnt/f/RealLease/app

# 모든 파일 스테이징
git add .

# 커밋 생성
git commit -m "Initial commit: RealLease v1.0.0"
```

## 4단계: GitHub에 푸시

### GitHub 저장소 URL 확인
생성한 저장소 페이지에서 HTTPS URL 복사:
```
https://github.com/본인계정/reallease.git
```

### 원격 저장소 연결 및 푸시
```bash
# 원격 저장소 추가
git remote add origin https://github.com/본인계정/reallease.git

# 푸시
git push -u origin main
```

**인증 방법**:
- **Personal Access Token** 사용 (추천)
  1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  2. "Generate new token (classic)" 클릭
  3. 권한 선택: `repo` 전체 체크
  4. 토큰 복사 후 비밀번호 대신 사용

- **GitHub CLI** 사용:
  ```bash
  gh auth login
  ```

## 5단계: Vercel에서 프로젝트 Import

### Vercel 대시보드에서 배포

1. **https://vercel.com/new** 접속

2. **"Import Git Repository"** 클릭

3. **GitHub 저장소 선택**:
   - `본인계정/reallease` 선택
   - "Import" 클릭

4. **프로젝트 설정**:
   - **Project Name**: `reallease` (또는 원하는 이름)
   - **Framework Preset**: `Vite` (자동 감지됨)
   - **Root Directory**: `./` (기본값)
   - **Build Command**: `npm run build` (자동 설정됨)
   - **Output Directory**: `dist` (자동 설정됨)

5. **환경 변수 추가** (중요!):

   "Environment Variables" 섹션에서 추가:

   | Name | Value | Environment |
   |------|-------|-------------|
   | `VITE_APP_NAME` | `RealLease` | Production, Preview, Development |
   | `VITE_APP_VERSION` | `1.0.0` | Production, Preview, Development |
   | `VITE_DEV_MODE` | `false` | Production만 |
   | `VITE_GOOGLE_CLIENT_ID` | `실제 Client ID` | Production, Preview |

   **Google OAuth Client ID 설정 방법**은 `GOOGLE_OAUTH_SETUP.md` 참조

6. **"Deploy"** 클릭

### 배포 완료!

배포가 완료되면 Vercel이 자동으로 URL을 생성합니다:
```
https://reallease-본인계정.vercel.app
```

## 6단계: 배포 확인 및 테스트

### 1. 배포 URL 접속
```
https://your-app.vercel.app
```

### 2. 기능 테스트
- ✅ 로그인 화면 표시
- ✅ Google 로그인 동작
- ✅ 메인 화면 접근
- ✅ PWA 설치 프롬프트 (모바일/데스크톱)

### 3. Google OAuth 리디렉션 URI 업데이트

Google Cloud Console에서:
1. OAuth 2.0 클라이언트 ID 수정
2. **승인된 자바스크립트 원본**에 추가:
   ```
   https://your-app.vercel.app
   ```
3. **승인된 리디렉션 URI**에 추가:
   ```
   https://your-app.vercel.app
   https://your-app.vercel.app/auth
   ```

## 7단계: 자동 배포 설정 (완료!)

Vercel은 자동으로 다음과 같이 설정됩니다:

- ✅ **main 브랜치 푸시** → 자동 프로덕션 배포
- ✅ **Pull Request** → 자동 미리보기 배포
- ✅ **커밋마다 빌드 및 배포**

### 코드 업데이트 배포하기

```bash
# 코드 수정 후
git add .
git commit -m "Update: 기능 개선"
git push origin main

# Vercel이 자동으로 배포합니다!
```

## 🔧 트러블슈팅

### 빌드 실패 시

**Vercel 로그 확인**:
1. Vercel 대시보드 → 프로젝트 선택
2. "Deployments" 탭
3. 실패한 배포 클릭 → "Building" 로그 확인

**일반적인 문제**:
- 환경 변수 누락 → Settings → Environment Variables 확인
- 빌드 명령어 오류 → Settings → Build & Development Settings 확인
- TypeScript 에러 → 로컬에서 `npm run type-check` 실행

### 배포 후 404 에러

**원인**: SPA 라우팅 문제

**해결**: `vercel.json` 파일 생성 (이미 생성되어 있음)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Google OAuth 오류

**"redirect_uri_mismatch"**:
- Google Cloud Console에서 리디렉션 URI 확인
- Vercel URL과 정확히 일치하는지 확인
- 변경 후 5-10분 대기

## 📊 배포 후 모니터링

### Vercel Analytics (선택사항)
1. Vercel 대시보드 → Analytics
2. 페이지 뷰, 성능, 사용자 통계 확인

### 커스텀 도메인 연결 (선택사항)
1. Vercel 대시보드 → Settings → Domains
2. 도메인 추가 → DNS 설정
3. SSL 자동 설정

## 🚀 다음 단계

- ✅ PWA 아이콘 추가 (`public/icons/` 폴더)
- ✅ Google OAuth 프로덕션 검토 신청
- ✅ 사용자 매뉴얼 작성
- ✅ 백업 정책 수립

---

**배포 완료 후 사용자에게 공유할 URL**:
```
https://your-app.vercel.app
```

📱 **모바일에서 설치 안내**:
"브라우저에서 접속 후 '홈 화면에 추가' 버튼을 눌러 앱처럼 사용하세요!"
