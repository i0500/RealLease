# PWA 아이콘 가이드

RealLease PWA 앱에 필요한 아이콘 파일 목록입니다.

## 필요한 아이콘 파일

다음 파일들을 `public/` 폴더에 추가해야 합니다:

### 필수 파일
- `favicon.ico` - 브라우저 탭 아이콘 (16x16, 32x32, 48x48 멀티 사이즈)
- `icon-192x192.png` - PWA 기본 아이콘 (192x192 픽셀)
- `icon-512x512.png` - PWA 고해상도 아이콘 (512x512 픽셀)
- `apple-touch-icon.png` - iOS 홈 화면 아이콘 (180x180 픽셀)

### 선택 파일
- `icon-maskable-192x192.png` - 마스크 가능 아이콘 (192x192, 안전 영역 포함)
- `icon-maskable-512x512.png` - 마스크 가능 아이콘 (512x512, 안전 영역 포함)

## 아이콘 디자인 가이드라인

### 색상
- 주 색상: `#3B82F6` (파란색)
- 배경: 흰색 또는 투명
- 로고: 🏠 (집 아이콘) + "RealLease" 텍스트

### 안전 영역
- 마스크 가능 아이콘의 경우 중심 80% 영역에 중요 콘텐츠 배치
- 외곽 20%는 다양한 플랫폼에서 마스킹될 수 있음

### 파일 형식
- PNG 형식 사용 (투명 배경 권장)
- 최적화된 압축 적용
- 파일 크기: 각 아이콘 100KB 이하 권장

## 아이콘 생성 도구

### 온라인 도구
- **PWA Asset Generator**: https://www.pwabuilder.com/imageGenerator
- **Favicon Generator**: https://realfavicongenerator.net/
- **Icon Kitchen**: https://icon.kitchen/

### 로컬 도구
- Figma (디자인)
- Adobe Illustrator (벡터)
- GIMP (무료 이미지 편집)

## 아이콘 생성 단계

1. **기본 디자인 생성** (512x512 PNG)
   - 🏠 집 아이콘과 "RealLease" 텍스트 배치
   - 주 색상 #3B82F6 사용
   - 깔끔하고 단순한 디자인

2. **다양한 크기로 리사이즈**
   - 512x512 → icon-512x512.png
   - 192x192 → icon-192x192.png
   - 180x180 → apple-touch-icon.png

3. **Favicon 생성**
   - 48x48 크기로 리사이즈
   - ICO 형식으로 변환 (멀티 사이즈 포함)

4. **마스크 가능 아이콘 생성** (선택)
   - 중요 콘텐츠를 중심 80% 영역에 배치
   - 배경 색상 추가 (흰색 또는 #3B82F6)
   - 파일명에 'maskable' 포함

## 파일 배치 예시

```
public/
├── favicon.ico
├── icon-192x192.png
├── icon-512x512.png
├── apple-touch-icon.png
├── icon-maskable-192x192.png (선택)
└── icon-maskable-512x512.png (선택)
```

## 현재 상태

⚠️ **현재 아이콘 파일이 없습니다!**

앱을 배포하기 전에 반드시 아이콘 파일을 생성하여 `public/` 폴더에 추가해야 합니다.

### 임시 해결 방법

개발 중에는 아이콘 없이도 앱이 동작하지만, PWA로 설치할 때 기본 아이콘이 표시됩니다.
프로덕션 배포 전에 반드시 아이콘을 추가하세요.

## 참고 사항

- Vercel 배포 시 `public/` 폴더의 모든 파일이 자동으로 정적 파일로 제공됩니다
- 아이콘 변경 시 브라우저 캐시를 지워야 새 아이콘이 표시됩니다
- iOS Safari에서는 `apple-touch-icon.png`가 필수입니다
