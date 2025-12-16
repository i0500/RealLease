# 🚀 RealLease 배포 체크리스트

관리자용 배포 가이드 - 단계별로 따라하세요!

## ✅ 사전 준비 완료 상태
- [x] Vercel 계정 생성
- [x] GitHub 계정 연동
- [x] 프로젝트 개발 완료
- [x] Git 초기화 완료
- [x] vercel.json 생성 완료

## 📝 지금 해야 할 일

### 1️⃣ Git 사용자 정보 설정 (1분)

**터미널에서 실행** (본인 정보로 변경):
```bash
cd /mnt/f/RealLease/app

git config user.name "본인이름"
git config user.email "본인이메일@gmail.com"
```

**확인**:
```bash
git config user.name
git config user.email
```

---

### 2️⃣ GitHub 저장소 생성 (2분)

**방법 A: GitHub 웹사이트에서**
1. https://github.com/new 접속
2. 정보 입력:
   - Repository name: `reallease`
   - Private 선택 (개인 프로젝트)
   - ⚠️ README, .gitignore 체크 해제
3. "Create repository" 클릭
4. 생성된 저장소 URL 복사:
   ```
   https://github.com/본인계정/reallease.git
   ```

**방법 B: GitHub CLI** (gh 설치되어 있다면):
```bash
gh repo create reallease --private --source=. --remote=origin --push
```

---

### 3️⃣ 첫 커밋 생성 및 푸시 (2분)

**터미널에서 실행**:
```bash
cd /mnt/f/RealLease/app

# vercel.json 추가
git add .

# 첫 커밋 생성
git commit -m "Initial commit: RealLease v1.0.0 - 부동산 임대차 관리 시스템"

# 원격 저장소 추가 (URL은 본인 것으로 변경!)
git remote add origin https://github.com/본인계정/reallease.git

# 푸시
git push -u origin main
```

**GitHub 인증**:
- Username: GitHub 아이디
- Password: **Personal Access Token** 사용
  - https://github.com/settings/tokens
  - "Generate new token (classic)" 클릭
  - `repo` 권한 전체 체크
  - 생성된 토큰 복사 → 비밀번호로 사용

---

### 4️⃣ Vercel에서 배포 (3분)

1. **https://vercel.com/new** 접속

2. **"Import Git Repository"** 클릭

3. **GitHub 저장소 찾기**:
   - `본인계정/reallease` 검색
   - "Import" 클릭

4. **프로젝트 설정**:
   - Project Name: `reallease`
   - Framework Preset: `Vite` (자동 감지)
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `dist`

5. **환경 변수 추가** (Environment Variables):

   **프로덕션용** (필수):
   ```
   VITE_APP_NAME=RealLease
   VITE_APP_VERSION=1.0.0
   VITE_DEV_MODE=false
   ```

   **나중에 추가할 것** (Google OAuth 설정 후):
   ```
   VITE_GOOGLE_CLIENT_ID=실제클라이언트ID
   ```

6. **"Deploy"** 클릭!

---

### 5️⃣ 배포 URL 확인 (1분)

배포 완료 후 Vercel이 생성한 URL:
```
https://reallease-본인계정.vercel.app
```

이 URL을 사용자들에게 공유하면 됩니다!

---

### 6️⃣ Google OAuth 설정 (선택사항, 10분)

실제 Google Sheets 연동이 필요하면:

1. **`GOOGLE_OAUTH_SETUP.md` 파일 참고**

2. **Google Cloud Console**에서:
   - OAuth 2.0 클라이언트 ID 생성
   - 승인된 자바스크립트 원본에 Vercel URL 추가
   - 승인된 리디렉션 URI에 Vercel URL 추가

3. **Vercel 환경 변수 추가**:
   - Settings → Environment Variables
   - `VITE_GOOGLE_CLIENT_ID` 추가
   - Redeploy 필요

---

## 🎉 배포 완료 후

### 사용자에게 공유할 내용:

```
📱 RealLease 사용 안내

1. 브라우저에서 접속:
   https://reallease-본인계정.vercel.app

2. 로그인 후 바로 사용 가능합니다

3. 모바일/PC 모두 지원:
   - 모바일: "홈 화면에 추가"로 앱처럼 사용
   - PC: "설치" 버튼 클릭

📖 사용 설명서: USER_GUIDE.md 참고
```

---

## 🔄 코드 업데이트 시

```bash
git add .
git commit -m "Update: 수정 내용"
git push origin main
```

→ Vercel이 자동으로 재배포합니다!

---

## ⚠️ 중요 체크포인트

- [ ] .env 파일은 Git에 올라가지 않음 (민감정보 보호)
- [ ] Vercel 환경 변수 설정 완료
- [ ] 배포 URL 접속 테스트 완료
- [ ] Google OAuth 리디렉션 URI 업데이트 (실제 연동 시)

---

## 📞 문제 발생 시

1. **빌드 실패**: Vercel 대시보드 → Deployments → 로그 확인
2. **404 에러**: vercel.json 파일 확인
3. **환경 변수 오류**: Settings → Environment Variables 확인
4. **OAuth 오류**: Google Cloud Console 리디렉션 URI 확인

---

**준비되었습니다! 위 단계대로 진행해주세요.**

첫 번째로 할 일: Git 사용자 정보 설정
```bash
git config user.name "본인이름"
git config user.email "본인이메일"
```
