import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { Button, Modal, PageHeader } from '@/components'
import { useModal } from '@/hooks/useModal'
import styles from './DrawingInstructions.module.css'

/** 선택한 그림 방식에 맞는 준비물과 활동 안내를 표시한다. */
export const DrawingInstructions = ({ type }: { type: 'paper' | 'canvas' }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')
  const state = location.state as {
    topic?: { topicId: number; title: string; description: string; hints: string[] }
    fallbackTopic?: boolean
  } | null
  const topic = state?.topic
  const showFallback = isPreview || state?.fallbackTopic === true
  const { isOpen, openModal, closeModal } = useModal()
  const [showHints, setShowHints] = useState(false)
  const hintsRef = useRef<HTMLDialogElement>(null)
  const isPaper = type === 'paper'

  useEffect(() => {
    const dialog = hintsRef.current
    if (!dialog) return
    if (showHints && !dialog.open) dialog.showModal()
    if (!showHints && dialog.open) dialog.close()
  }, [showHints])

  if (!showFallback && !topic) return <Navigate to="/drawing/onboarding/2" replace />

  return (
    <div className={styles.page}>
      <PageHeader title="" action="back" onNavigate={openModal} />
      <div className={styles.content}>
        <span className={styles.label}>주제 설명</span>
        <h1 className="text-question">
          {showFallback ? '내 마음속 방을 그려볼까요?' : topic?.title}
        </h1>
        <p className="text-body">
          {showFallback
            ? '사람들과의 관계 속에서 느끼는 요즘 내 마음이 하나의 방이라면 어떤 모습일까요? 그 방의 모습과 그 안에 놓인 물건들을 자유롭게 그려보세요. 문이나 창문, 가구 등 무엇이든 괜찮아요.'
            : topic?.description}
        </p>
        <section className={styles.guide} aria-labelledby="drawing-guide-title">
          <h2 id="drawing-guide-title" className="text-body">
            준비물 및 활동 안내
          </h2>
          <ul className="text-caption">
            {isPaper && <li>종이 한 장과 연필 또는 펜을 준비해 주세요.</li>}
            <li>잘 그리려 하지 않아도 괜찮아요.</li>
            <li>원하는 만큼 천천히 표현해 보세요.</li>
          </ul>
        </section>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.help}
          aria-haspopup="dialog"
          onClick={() => setShowHints(true)}
        >
          그림 시작이 어려워요
        </button>
        <Button
          onClick={() =>
            navigate(
              `${isPaper ? '/drawing/upload' : '/drawing/canvas'}${isPreview ? '?preview' : ''}`,
              { state: { topic, fallbackTopic: state?.fallbackTopic } },
            )
          }
        >
          {isPaper ? '다 그렸어요' : '그림을 그려볼게요'}
        </Button>
      </div>
      <dialog
        ref={hintsRef}
        className={styles.hints}
        aria-labelledby="drawing-hints-title"
        onCancel={(event) => {
          event.preventDefault()
          setShowHints(false)
        }}
      >
        <button
          type="button"
          className={styles.close}
          aria-label="그림 힌트 닫기"
          onClick={() => setShowHints(false)}
        >
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
        <h2 id="drawing-hints-title">
          아래 질문을 참고해 천천히 그려보세요.
          <br />
          그림에 정답은 없습니다.
        </h2>
        <ul>
          {(showFallback
            ? [
                '내가 편안함을 느끼는 공간은 어디인가요?',
                '그 공간에는 어떤 물건을 놓고 싶나요?',
                '지금 내 마음을 닮은 공간이라면 무엇이 다를까요?',
              ]
            : (topic?.hints ?? [])
          ).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </dialog>
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        title="그리기를 그만둘까요?"
        actions={[
          { label: '계속 그리기', onClick: closeModal, color: 'gray' },
          { label: '홈으로 나가기', onClick: () => navigate('/home') },
        ]}
      >
        지금 나가면 그리고 있던 그림은 저장되지 않아요.
      </Modal>
    </div>
  )
}
