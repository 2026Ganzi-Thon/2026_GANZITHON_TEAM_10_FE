import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button, Modal, PageHeader } from '@/components'
import { apiClient } from '@/lib/api-client'
import { useModal } from '@/hooks/useModal'
import drawingGuide from '@/assets/drawing/drawing-2.png'
import styles from './DrawingMethod.module.css'

/** 그림 주제와 그리기 방식을 안내하고 선택한 방식으로 이동한다. */
export const DrawingMethod = () => {
  const navigate = useNavigate()
  const { search } = useLocation()
  const isPreview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const { isOpen, openModal, closeModal } = useModal()
  const [method, setMethod] = useState<'paper' | 'canvas' | null>(null)
  const [topic, setTopic] = useState<{
    topicId: number
    title: string
    description: string
    hints: string[]
  } | null>(null)
  const [topicError, setTopicError] = useState(false)

  useEffect(() => {
    if (isPreview) return
    let cancelled = false
    apiClient
      .get<{
        success: boolean
        data: {
          topics: Array<{ topicId: number; title: string; description: string; hints: string[] }>
        }
      }>('/api/topics/recommended')
      .then(({ data }) => {
        if (!cancelled) {
          if (data.success && data.data.topics.length) setTopic(data.data.topics[0])
          else setTopicError(true)
        }
      })
      .catch(() => {
        if (!cancelled) setTopicError(true)
      })
    return () => {
      cancelled = true
    }
  }, [isPreview])

  return (
    <div className={styles.page}>
      <PageHeader title="" action="back" onNavigate={openModal} />
      <div className={styles.content}>
        <div className={styles.illustration}>
          <div className={styles.artwork}>
            <img src={drawingGuide} alt="" />
          </div>
          <p className={styles.guide}>
            알려주신 내용을 바탕으로
            <br />
            첫 번째 미술 활동을 준비했어요.
            <br />잘 그리려 하지 않아도 괜찮아요.
          </p>
        </div>
        <section className={styles.topic}>
          <p className="text-caption-medium">주제 설명</p>
          <h1 className="text-section">
            {isPreview || topicError
              ? '내 마음속 방을 그려볼까요?'
              : (topic?.title ?? '주제를 불러오고 있어요.')}
          </h1>
        </section>
        <section className={styles.methods} aria-labelledby="method-heading">
          <p className="text-caption-medium">방식 선택</p>
          <h2 id="method-heading" className="text-section">
            편한 방법을 골라 시작해 보세요.
          </h2>
          <p className={`text-caption ${styles.description}`}>
            완성한 그림으로 AI와 대화할 수 있어요.
            <br />
            ‘모양’은 종이에 직접 그리기를 추천해요.
          </p>
          <div className={styles.choices}>
            <div>
              <Button
                color="gray"
                className={method === 'paper' ? styles.selected : undefined}
                aria-pressed={method === 'paper'}
                onClick={() => setMethod('paper')}
              >
                종이에 그리기
              </Button>
              <p className="text-caption">
                종이와 연필을 준비하여
                <br />
                그린 뒤 사진을 올려주세요
              </p>
            </div>
            <div>
              <Button
                color="gray"
                className={method === 'canvas' ? styles.selected : undefined}
                aria-pressed={method === 'canvas'}
                onClick={() => setMethod('canvas')}
              >
                웹에서 그리기
              </Button>
              <p className="text-caption">
                준비물 없이 화면에
                <br />
                그릴 수 있어요
              </p>
            </div>
          </div>
        </section>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={!method || (!isPreview && !topic && !topicError)}
          onClick={() =>
            navigate(
              `/drawing/onboarding/3?type=${method === 'paper' ? 'paper' : 'canvas'}${isPreview ? '&preview' : ''}`,
              { state: { topic, fallbackTopic: topicError } },
            )
          }
        >
          이 주제로 시작하기
        </Button>
      </div>
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
