import { useState } from 'react'
import { Button, Dropdown, HomeLayout, Input, Modal, SheepProfile, TextArea } from '@/components'
import { PersonalProgramHomeSection } from '@/features/personal-program/ProgramOverview'
import { useModal } from '@/hooks/useModal'
import styles from './HomePage.module.css'

/**
 * 홈 화면을 담당한다.
 *
 * @returns 하단 메뉴가 포함된 홈 페이지 요소
 */
export const HomePage = () => {
  const [age, setAge] = useState('')
  const { isOpen, openModal, closeModal } = useModal()

  return (
    <HomeLayout>
      <div className={styles.page}>
        <div className={styles.personalProgram}>
          <PersonalProgramHomeSection />
        </div>
        <Button color="gray" onClick={openModal}>
          모달 열기 (임시 예시)
        </Button>
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
        <section className={styles.example}>
          <p className="text-body">양 프로필 (임시 예시)</p>
          <div className={styles.sheepProfiles}>
            <SheepProfile size={128} color="white" alt="흰색 양" />
            <SheepProfile color="pink" alt="분홍색 양" />
            <SheepProfile color="purple" alt="보라색 양" />
            <SheepProfile color="blue" alt="파란색 양" />
            <SheepProfile color="green" alt="초록색 양" />
          </div>
          <Dropdown
            id="sample-age"
            label=""
            value={age}
            onChange={setAge}
            placeholder="나이를 선택해 주세요"
            options={['10대', '20대', '30대', '40대 이상'].map((item) => ({
              value: item,
              label: item,
            }))}
          />
          {age && <p className="text-body">선택한 나이: {age}</p>}
          <Input
            id="sample-nickname"
            label="닉네임 (임시 데이터)"
            placeholder="닉네임을 입력해 주세요"
          />
          <TextArea
            id="sample-story"
            label="이야기 (임시 데이터)"
            placeholder="예) 자유롭게 이야기를 적어주세요."
            maxHeight={300}
          />
        </section>
      </div>
    </HomeLayout>
  )
}
