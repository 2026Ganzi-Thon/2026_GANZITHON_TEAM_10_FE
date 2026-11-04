# 공통 컴포넌트

여러 화면에서 재사용하는 UI를 둡니다. 컴포넌트별 폴더에 코드와 CSS를 함께 두며, 외부에서는 `@/components`로 가져옵니다. `_layout/`은 공통 모바일 프레임을 관리합니다. 기능 전용 UI는 해당 `features/`에 둡니다.

## SheepProfile

`color`로 `white`, `pink`, `purple`, `blue`, `green` 중 하나를 선택합니다. `size`는 가로·세로 크기(px)이며 기본값은 원본과 같은 82입니다. 프로필이 장식용이면 `alt=""`를 전달합니다.

```tsx
import { SheepProfile } from '@/components'

;<SheepProfile color="pink" size={40} alt="분홍색 양 프로필" />
```

## Button

`Button` 하나에서 `color`로 색상을 선택합니다. 기본값은 `green`이며, `gray`는 회색 배경에 검은 글자입니다. 기본 너비는 부모의 100%이므로 선택지처럼 나란히 놓을 때는 부모 요소로 너비를 조절합니다. 높이는 고정하지 않고 내용과 여백에 따라 늘어납니다.

```tsx
import { Button } from '@/components'

<Button onClick={handleNext}>다음</Button>
<Button color="gray" onClick={handleCancel}>취소</Button>
<Button color={selected ? 'green' : 'gray'} aria-pressed={selected} onClick={toggle}>
  선택지
</Button>
```

일반 버튼 속성(`disabled`, `type`, `className` 등)을 전달할 수 있습니다. 기본 `type`은 폼에서 의도치 않은 제출을 막는 `button`이며, 제출할 때는 `type="submit"`을 지정합니다. 포커스와 비활성 스타일은 임시 구현으로, 디자이너 확인 후 조정합니다. 선택 여부는 색상만으로 구분하지 말고 `aria-pressed`와 시각적 표시를 함께 제공하세요.

## Dropdown

커스텀 목록을 사용하며, 옵션과 선택값을 부모가 전달합니다. 너비는 부모의 100%입니다. `label`은 선택 사항이며 없으면 라벨과 여백이 표시되지 않습니다. 라벨이 없는 경우 `ariaLabel`을 지정하면 스크린 리더에 용도를 제공할 수 있습니다. 생략하면 안내 문구가 사용됩니다.

```tsx
import { Dropdown } from '@/components'

;<Dropdown
  id="age"
  label="나이"
  placeholder="나이 선택"
  value={age}
  onChange={setAge}
  options={[
    { value: '20', label: '20세' },
    { value: '21', label: '21세' },
  ]}
/>
```

방향키로 항목을 이동하고 Enter 또는 스페이스로 선택하며, Escape로 닫을 수 있습니다. `disabled`로 비활성화할 수 있습니다. 폼 전송과 필수값 검증은 사용하는 화면에서 처리합니다.

## Input

한 줄 텍스트 입력은 `Input`을 사용합니다. `label`은 선택 사항이며, 생략하면 라벨과 여백이 표시되지 않습니다. 라벨이 없는 경우 `aria-label`이나 외부 라벨로 입력 목적을 제공하세요. `value`, `onChange`, `disabled`, `maxLength` 등 일반 input 속성을 전달할 수 있습니다.

```tsx
import { Input } from '@/components'

;<Input id="nickname" label="닉네임" placeholder="닉네임을 입력해 주세요" />
```

## TextArea

여러 줄 입력은 기본 `textarea`를 사용합니다. `label`은 선택 사항이며, 없으면 별도의 라벨 여백이 생기지 않습니다. 라벨이 없을 때는 `aria-label`이나 외부 라벨로 이름을 제공하세요.

```tsx
<TextArea
  id="story"
  label="이야기"
  placeholder="자유롭게 적어주세요."
  minHeight={145}
  maxHeight={300}
/>
```

`minHeight`와 `maxHeight`는 숫자(px) 또는 CSS 길이 문자열을 받습니다. 최소 높이 기본값은 145px이며 최대 높이는 지정하지 않으면 제한이 없습니다. 입력 내용에 따라 높이가 자동으로 조절되고, 최대 높이를 넘으면 내부에서 스크롤됩니다. 사용자가 직접 크기를 끌어 조절할 수는 없습니다. 일반 `textarea` 속성도 전달할 수 있습니다.

## Modal

`useModal`로 열림 상태를 관리하고, `actions`에 버튼을 하나 또는 두 개 전달합니다. 버튼 클릭 시 닫을지 여부는 각 `onClick`에서 결정합니다. 닫기 아이콘과 Escape는 `onClose`를 호출합니다.

`title`과 `actions`를 생략하고 `children`에 제목과 버튼을 포함한 내용을 직접 구성할 수도 있습니다. 이때 `ariaLabel`로 모달의 접근 가능한 이름을 지정하세요.

```tsx
const { isOpen, openModal, closeModal } = useModal()

<Button onClick={openModal}>모달 열기</Button>
<Modal
  isOpen={isOpen}
  onClose={closeModal}
  title="그리기를 그만둘까요?"
  actions={[
    { label: '계속 그리기', color: 'gray', onClick: closeModal },
    { label: '확인', onClick: closeModal },
  ]}
>
  지금 나가면 그리고 있던 그림은 저장되지 않아요.
</Modal>
```

브라우저의 `dialog`를 사용하며, 모달을 닫으면 이전 포커스로 돌아갑니다. 모바일에서는 화면 전체, PC에서는 모바일 프레임 안에 배경을 표시합니다. 모달의 가로 폭은 해당 영역의 90%입니다.
