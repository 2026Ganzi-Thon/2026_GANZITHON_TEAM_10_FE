# 공통 레이아웃

`RootLayout`은 전체 화면의 모바일 프레임과 경로 이동 시 프레임 내부 스크롤 초기화를 담당합니다.

`HomeLayout`은 페이지 내용을 감싸 사용합니다. 내용은 푸터를 제외한 영역에서 스크롤되고, 하단 메뉴는 프레임 아래에 유지됩니다. 홈·그리기·모임·기록·마이 기본 페이지에 적용되어 있습니다.

```tsx
import { HomeLayout } from '@/components'

;<HomeLayout>페이지 내용</HomeLayout>
```
