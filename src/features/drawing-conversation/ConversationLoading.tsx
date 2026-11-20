import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components'
import styles from './DrawingConversation.module.css'

const tips = [
  '그림과 AI 대화는 다른 사람에게 동의 없이 공개되지 않아요.',
  'AI는 사용자가 적은 그림 설명과 대화에서 단서를 찾아요. 그림의 의미나 감정을 단정하지 않아요.',
  '같은 그림이라도 사람마다 담긴 의미는 달라요. 그림의 진짜 의미는 그린 사람의 이야기에 있어요.',
  '검은색이 꼭 슬픔을 의미하지는 않아요. AI는 특정 색이나 형태만으로 감정을 판단하지 않아요.',
  '미술은 말로 표현하기 어려운 생각과 감정을 색, 선, 모양 등으로 나타낼 수 있는 비언어적 표현 방법이에요.',
  '완성된 그림을 다시 바라보는 과정에서 미처 알아차리지 못했던 생각이나 감정을 발견할 수도 있어요.',
  '‘모양’은 사용자의 생활환경, 고민, 현재 감정을 참고해 개인에게 맞는 미술 활동을 제안해요.',
]

type ConversationLoadingProps = {
  image: ReactNode
  failed: boolean
  onRetry: () => void
}

export const ConversationLoading = ({ image, failed, onRetry }: ConversationLoadingProps) => {
  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    if (failed) return

    const timer = window.setInterval(() => setTipIndex((index) => (index + 1) % tips.length), 3000)
    return () => window.clearInterval(timer)
  }, [failed])

  return (
    <div className={styles.loading}>
      <div className={styles.loadingPreview}>
        <div className={styles.loadingDrawing} data-scanning={failed ? undefined : true}>
          {image}
        </div>
      </div>
      <div className={styles.loadingText}>
        {failed ? (
          <>
            <h1 className="text-heading" role="alert">
              그림 대화를 시작하지 못했어요
            </h1>
            <Button className={styles.retryButton} onClick={onRetry}>
              다시 시도
            </Button>
          </>
        ) : (
          <div role="status">
            <h1 className="text-heading">그림 대화를 준비하고 있어요</h1>
            <p className="text-body">그림에 담긴 이야기를 시작할 첫 질문을 만들고 있어요.</p>
          </div>
        )}
      </div>
      <aside className={styles.tip} aria-label="그림 대화 안내" aria-live="off">
        <p>
          <FontAwesomeIcon icon={faBullhorn} /> 알고 있나요?
        </p>
        <p>{tips[tipIndex]}</p>
      </aside>
    </div>
  )
}
