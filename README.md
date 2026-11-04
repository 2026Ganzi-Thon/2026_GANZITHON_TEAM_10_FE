# 모양 MOYANG

그림과 AI의 질문을 통해 자신의 마음을 알아보고, 동의한 사용자끼리 그림을 나누는 모바일 중심 서비스입니다. 현재 프론트엔드 초기 개발 단계이며, 홈에는 공통 컴포넌트를 확인하기 위한 임시 예시가 있습니다.

## 시작하기

Node.js 20.19 이상 또는 22.12 이상이 필요합니다.

```bash
git clone https://github.com/2026Ganzi-Thon/2026_GANZITHON_TEAM_10_FE.git
cd 2026_GANZITHON_TEAM_10_FE
npm ci
npm run dev
```

터미널에 표시된 주소로 접속합니다. 백엔드 연동이 필요하면 `.env.example`을 `.env.local`로 복사하고 주소를 입력한 뒤 개발 서버를 다시 시작하세요.

| 환경 변수                  | 용도                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `VITE_API_DEVELOPMENT_URL` | 개발 시 `/api` 요청을 전달할 백엔드 주소. `/api` 경로는 유지됩니다. |
| `VITE_API_PRODUCTION_URL`  | 배포 시 사용할 API 기본 주소. 예: `https://example.com/api`         |

배포 환경에서도 프로덕션 주소를 설정하고 다시 빌드해야 합니다. `VITE_` 변수는 브라우저에 공개되므로 비밀키를 넣지 않습니다.

변경 사항은 아래 명령으로 확인합니다.

```bash
npm run format:check
npm run lint
npm run build
```

## 기술과 구조

React, TypeScript, Vite, React Router, Axios, CSS Modules를 사용합니다. 공통 색상·텍스트 위계·폰트는 `src/index.css`에서 관리하고, 아이콘은 Font Awesome 무료 버전을 사용합니다.

```text
src/
├─ assets/       이미지와 아이콘
├─ components/   공통 컴포넌트와 레이아웃
├─ features/     기능별 코드
├─ hooks/        공통 훅
├─ lib/          API 클라이언트 등 공통 설정
├─ pages/        페이지
├─ routes/       라우트 설정
└─ index.css     전역 스타일과 디자인 변수
```

## 공통 컴포넌트

`@/components`에서 가져와 사용할 수 있습니다.

| 컴포넌트       | 역할                                                                |
| -------------- | ------------------------------------------------------------------- |
| `Button`       | 초록색 또는 회색을 선택할 수 있는 공통 버튼                         |
| `Dropdown`     | 선택적인 라벨과 키보드 조작을 지원하는 드롭다운                     |
| `Input`        | 선택적인 라벨을 지원하는 한 줄 텍스트 입력                          |
| `TextArea`     | 내용에 따라 높이가 조절되는 여러 줄 입력                            |
| `Modal`        | 하나 또는 두 개의 버튼을 전달하거나 내용을 직접 구성할 수 있는 모달 |
| `SheepProfile` | 색상과 크기를 선택할 수 있는 양 프로필 이미지                       |
| `HomeLayout`   | 페이지 내용의 스크롤 영역과 하단 메뉴를 제공하는 레이아웃           |
| `RootLayout`   | 전체 페이지를 감싸는 모바일 프레임                                  |

```tsx
import { Button, Input } from '@/components'

<Input id="nickname" label="닉네임" placeholder="닉네임을 입력해 주세요" />
<Button>확인</Button>
```

상세 사용법은 [공통 컴포넌트 안내](src/components/README.md)에서 확인할 수 있습니다. 디자인 기준은 [Figma 프론트 참고사항](https://www.figma.com/design/BHaDl2CrYuDVY82GDo8rZN?node-id=210-479)을 참고하세요.

## GitHub 협업 규칙

### 브랜치와 병합

`main`은 안정적인 코드를, `dev`는 작업 내용을 통합해 확인하는 코드를 관리합니다. 기능 개발이나 수정은 최신 `dev`에서 작업 브랜치를 만들어 진행합니다. 브랜치 이름은 `종류/작업-내용` 형식으로 작성하고, 작업 내용에는 소문자와 하이픈을 사용합니다.

```text
feat/home-page
fix/dropdown-keyboard
design/onboarding-screen
docs/update-readme
```

1. 최신 `dev`에서 `feat/...`, `fix/...` 등의 작업 브랜치를 만듭니다.
2. 작업 브랜치에 커밋하고 GitHub에 push합니다.
3. GitHub 웹에서 **작업 브랜치 → `dev`** Pull Request를 만들고 변경 사항과 확인 내용을 작성합니다.
4. 팀원의 코드 리뷰와 검사를 거친 후 GitHub 웹의 PR에서 병합하고, 작업 브랜치를 삭제합니다.
5. `dev`의 통합 확인이 끝나면 **`dev` → `main`** PR을 만들고, 같은 방식으로 코드 리뷰와 검사를 거쳐 GitHub 웹에서 병합합니다.

병합은 로컬에서 직접 처리하지 않고 GitHub 웹의 Pull Request를 통해 진행합니다. 첫 초기 프로젝트를 `main`에 올린 뒤 `dev`를 만들어 사용합니다.

### 커밋 메시지

`종류(범위): 변경 내용` 형식을 사용합니다. 범위는 필수이며 소문자와 하이픈으로 작성하고, 제목 끝에 마침표를 붙이지 않습니다. 전체 첫 줄은 72자 이내로 작성합니다.

```text
feat(home): 홈 화면 추가
fix(dropdown): 키보드 선택 오류 수정
design(button): 버튼 스타일 조정
docs(readme): 시작 방법 수정
```

사용 가능한 종류는 `feat`, `fix`, `design`, `style`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`, `ci`, `revert`입니다. 커밋 시 Husky와 Commitlint가 메시지 형식을 검사합니다. GitHub Actions는 PR과 `main`에 push할 때 서식·린트·빌드를 검사합니다. 브랜치 보호와 필수 리뷰 설정은 GitHub에서 별도로 설정해야 합니다.

대회 공지에 따라 **2026년 11월 20일 23:59까지 개발과 커밋을 완료**하고, 이후에는 코드를 수정하거나 추가 커밋하지 않습니다.
