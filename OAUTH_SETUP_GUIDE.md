# Google OAuth Client ID 설정 가이드

RealLease 앱에서 Google Sheets 편집 기능을 사용하려면 OAuth 2.0 Client ID가 필요합니다.

## 1단계: Google Cloud Console 프로젝트 생성

1. **Google Cloud Console 접속**
   - https://console.cloud.google.com/

2. **새 프로젝트 생성**
   - 상단 "프로젝트 선택" 클릭
   - "새 프로젝트" 클릭
   - 프로젝트 이름: `RealLease` 입력
   - "만들기" 클릭

## 2단계: Google Sheets API 활성화

1. **API 및 서비스** → **라이브러리** 이동
   - https://console.cloud.google.com/apis/library

2. **"Google Sheets API" 검색**
   - 검색 결과에서 "Google Sheets API" 클릭
   - "사용 설정" 버튼 클릭

## 3단계: OAuth 동의 화면 구성

1. **API 및 서비스** → **OAuth 동의 화면** 이동
   - https://console.cloud.google.com/apis/credentials/consent

2. **User Type 선택**
   - "외부" 선택 (개인 사용자용)
   - "만들기" 클릭

3. **앱 정보 입력**
   - **앱 이름**: `RealLease`
   - **사용자 지원 이메일**: 본인 Gmail 주소
   - **앱 로고**: (선택사항)
   - **앱 도메인**: (선택사항 - 로컬 개발 시 불필요)
   - **개발자 연락처 정보**: 본인 Gmail 주소
   - "저장 후 계속" 클릭

4. **범위 추가**
   - "범위 추가 또는 삭제" 클릭
   - 다음 범위 검색 및 추가:
     - `https://www.googleapis.com/auth/spreadsheets` (Google Sheets 읽기/쓰기)
     - `https://www.googleapis.com/auth/drive.file` (Drive 파일 접근)
   - "업데이트" 클릭
   - "저장 후 계속" 클릭

5. **테스트 사용자 추가** (외부 앱인 경우)
   - "테스트 사용자 추가" 클릭
   - 본인 Gmail 주소 입력
   - "추가" 클릭
   - "저장 후 계속" 클릭

6. **요약 확인**
   - "대시보드로 돌아가기" 클릭

## 4단계: OAuth 2.0 Client ID 생성

1. **API 및 서비스** → **사용자 인증 정보** 이동
   - https://console.cloud.google.com/apis/credentials

2. **"사용자 인증 정보 만들기"** 클릭
   - "OAuth 클라이언트 ID" 선택

3. **애플리케이션 유형 선택**
   - **웹 애플리케이션** 선택
   - 이름: `RealLease Web Client` 입력

4. **승인된 JavaScript 원본 추가**
   ```
   http://localhost:5173
   ```
   (개발 서버 주소)

5. **승인된 리디렉션 URI 추가**
   ```
   http://localhost:5173
   http://localhost:5173/
   ```

   (프로덕션 배포 시 실제 도메인 추가)

6. **"만들기"** 클릭

7. **Client ID 복사**
   - 팝업 창에서 "클라이언트 ID" 복사
   - 형식: `123456789-abc123def456.apps.googleusercontent.com`

## 5단계: .env 파일 설정

1. **RealLease 프로젝트 폴더** 열기
   ```
   /mnt/f/RealLease/app/
   ```

2. **.env 파일 편집**
   ```bash
   # 복사한 Client ID를 여기에 붙여넣기
   VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE

   # App Configuration
   VITE_APP_NAME=RealLease
   VITE_APP_VERSION=1.0.0

   # Development Mode - OAuth 사용 시 false로 변경
   VITE_DEV_MODE=false
   ```

3. **저장**

## 6단계: 앱 재빌드

```bash
cd /mnt/f/RealLease/app
npm run build
```

## 7단계: 앱 테스트

1. **브라우저 캐시 클리어**
   - `Ctrl+Shift+R` (하드 리프레시)

2. **앱 데이터 초기화**
   - 설정 → "앱 데이터 초기화" 클릭

3. **Google 로그인**
   - 로그인 화면에서 "Google로 로그인" 클릭
   - Google 계정 선택
   - 권한 승인

4. **시트 추가 및 편집 테스트**
   - URL 입력: `https://docs.google.com/spreadsheets/d/1hj8OiaCpM8iDVzWiBmxMXTJcxNCQ-dR7/edit?usp=sharing`
   - 데이터 로드 확인
   - 편집 기능 테스트

---

## 문제 해결

### "401 오류: invalid_client" 발생 시
- `.env` 파일의 Client ID가 정확한지 확인
- 앱 재빌드: `npm run build`
- 브라우저 캐시 클리어

### "403 오류: access_denied" 발생 시
- OAuth 동의 화면의 "테스트 사용자"에 본인 Gmail 주소가 추가되었는지 확인
- Google Cloud Console에서 앱 상태가 "테스트 중"인지 확인

### 로그인 후에도 시트를 읽지 못하는 경우
- Google Sheets API가 활성화되었는지 확인
- 시트 공유 설정: "링크가 있는 모든 사용자 - 편집자" 권한 확인

---

## 보안 참고사항

- **Client ID는 공개되어도 안전합니다** (프론트엔드에서 사용)
- **Client Secret은 절대 공개하지 마세요** (서버에서만 사용)
- 현재 앱은 Client ID만 사용하므로 보안 문제 없음

---

## 추가 리소스

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sheets API Quickstart](https://developers.google.com/sheets/api/quickstart/js)
- [Google Cloud Console](https://console.cloud.google.com/)
