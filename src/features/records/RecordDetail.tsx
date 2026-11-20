import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronRight,
  faChevronDown,
  faXmark,
  faComment,
  faLightbulb,
} from '@fortawesome/free-solid-svg-icons'
import { Button, PageHeader } from '@/components'
import { ConversationMessages } from '@/features/drawing-conversation'
import {
  loadServerDrawingResult,
  openDrawingConversation,
} from '@/features/drawing-conversation/conversationApi'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { moyangRequest } from '@/lib/moyang-api'
import drawing from '@/assets/drawing/drawing-2.png'
import { RecordImage } from './RecordImage'
import type { RecordDetail as Detail, RecordItem } from './types'
import styles from './Records.module.css'

const mock: Detail = {
  recordId: 1,
  recordDate: '2026-11-04',
  title: '나의 마음 정원',
  imageUrl: drawing,
  drawingDescription: '마음이 편안해지는 풍경을 그렸어요.',
  todaysStory: '편안한 풍경을 그리며 지금 나에게 필요한 여유를 떠올렸어요.',
  whatISaid: '마음이 편안해지는 풍경을 그리고 싶었어요.',
  thoughts: '바쁜 하루에도 잠시 쉬어 가고 싶다는 생각이 들었어요.',
  analysis: {
    mainElements: '그림에 담긴 요소를 살펴보았어요.',
    spatialComposition: '편안한 공간이 표현되어 있어요.',
    lineExpression: '부드러운 선으로 표현했어요.',
    emotionMeaning: '나만의 마음을 천천히 돌아보았어요.',
  },
  messages: [
    {
      sequenceNo: 1,
      role: 'ASSISTANT',
      content: '그림에서 가장 먼저 이야기하고 싶은 부분이 있나요?',
    },
    { sequenceNo: 2, role: 'USER', content: '편안한 풍경에 대해 이야기하고 싶어요.' },
  ],
}
type RecordDetailContentProps = {
  recordId: string
  preview: boolean
  record?: RecordItem
  onClose?: () => void
}

export const RecordDetailContent = (props: RecordDetailContentProps) => {
  const scope = useMockStorageScope()
  return <ScopedRecordDetailContent key={`${scope}:${props.recordId}`} {...props} />
}

const ScopedRecordDetailContent = ({
  recordId,
  preview,
  record,
  onClose,
}: RecordDetailContentProps) => {
  const [detail, setDetail] = useState<Detail | null>(preview ? { ...mock, ...record } : null)
  const [error, setError] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    const { signal } = controller
    moyangRequest(signal)
      .json<Detail>(`/api/records/${encodeURIComponent(recordId)}`)
      .then(async (saved) => {
        if (signal.aborted) return
        if (!saved || saved.recordId !== Number(recordId)) throw new Error('Invalid response')
        setDetail(saved)
        if (saved.todaysStory && saved.whatISaid && saved.thoughts) return

        const drawingId = Number(/^\/api\/drawings\/(\d+)\/image$/.exec(saved.imageUrl ?? '')?.[1])
        if (!Number.isSafeInteger(drawingId) || drawingId <= 0) return

        try {
          const opened = await openDrawingConversation(drawingId, signal)
          if (opened?.recordId !== saved.recordId || !opened.conversationId) return
          const result = await loadServerDrawingResult(
            opened.conversationId,
            opened.drawing,
            signal,
          )
          if (!signal.aborted && result.recordId === saved.recordId) {
            setDetail({
              ...saved,
              todaysStory: saved.todaysStory || result.card.todaysStory,
              whatISaid: saved.whatISaid || result.card.whatISaid,
              thoughts: saved.thoughts || result.card.thoughts,
            })
          }
        } catch {
          return
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [recordId, preview, attempt])
  return (
    <div className={onClose ? styles.inlineDetail : styles.detailContent}>
      {onClose && (
        <button
          type="button"
          className={styles.closeDetail}
          onClick={onClose}
          aria-label="달력으로 돌아가기"
        >
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
      {error ? (
        <p role="alert">
          기록을 불러오지 못했어요.{' '}
          <button
            onClick={() => {
              setError(false)
              setAttempt((value) => value + 1)
            }}
          >
            다시 시도
          </button>
        </p>
      ) : !detail ? (
        <p>기록을 불러오고 있어요.</p>
      ) : showConversation ? (
        <div className={styles.conversation}>
          <PageHeader
            title="대화 내용"
            action="back"
            onNavigate={() => setShowConversation(false)}
          />
          <ConversationMessages
            readOnly
            scrollWithPage
            messages={(detail.messages ?? [])
              .filter((message) => message.role === 'USER' || message.role === 'ASSISTANT')
              .map((message) => ({
                role: message.role === 'USER' ? 'user' : 'assistant',
                text: message.content,
              }))}
          >
            {!detail.messages?.length && <p>저장된 대화가 없어요.</p>}
          </ConversationMessages>
        </div>
      ) : (
        <>
          <div className={styles.detailImage}>
            <RecordImage key={detail.imageUrl} url={detail.imageUrl} preview={preview} />
          </div>
          <h2 className={styles.detailTitle}>{detail.title || '나의 그림 기록'}</h2>
          <Button className={styles.conversationButton} onClick={() => setShowConversation(true)}>
            대화 내용 보기 <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </Button>
          <section className={`${styles.detailBox} ${styles.story}`}>
            <h3>종합 이야기</h3>
            <p className={styles.help}>
              오늘의 그림과 대화에서 나눈 마음을 하나의 이야기로 정리해 드려요.
            </p>
            <p className={styles.reflection}>
              {detail.todaysStory || '저장된 종합 이야기가 없어요.'}
            </p>
          </section>
          <section className={styles.detailBox}>
            <h3>그림 자세히 살펴보기</h3>
            <p className={styles.help}>그림을 보며 나눈 이야기를 다시 살펴봐요.</p>
            {[
              { label: '내가 말한 내용', text: detail.whatISaid, icon: faComment },
              { label: '대화에서 떠올린 생각', text: detail.thoughts, icon: faLightbulb },
            ].map(({ label, text, icon }) => (
              <details key={label} className={styles.analysis}>
                <summary>
                  <FontAwesomeIcon icon={icon} aria-hidden="true" />
                  <span>{label}</span>
                  <FontAwesomeIcon
                    className={styles.detailChevron}
                    icon={faChevronDown}
                    aria-hidden="true"
                  />
                </summary>
                <p className={styles.reflection}>{text || '저장된 내용이 없어요.'}</p>
              </details>
            ))}
          </section>
          {detail.analysis && (
            <section className={styles.detailBox}>
              <h3>그림 분석</h3>
              {[
                { label: '주요 요소', text: detail.analysis.mainElements },
                { label: '공간과 배치', text: detail.analysis.spatialComposition },
                { label: '선과 표현', text: detail.analysis.lineExpression },
                { label: '감정과 의미', text: detail.analysis.emotionMeaning },
              ]
                .filter(({ text }) => Boolean(text))
                .map(({ label, text }) => (
                  <details key={label} className={styles.analysis}>
                    <summary>
                      <span>{label}</span>
                      <FontAwesomeIcon
                        className={styles.detailChevron}
                        icon={faChevronDown}
                        aria-hidden="true"
                      />
                    </summary>
                    <p className={styles.reflection}>{text}</p>
                  </details>
                ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}

/** 홈과 최근 기록에서 진입하는 회고 상세 화면이다. */
export const RecordDetail = () => {
  const { recordId = '' } = useParams()
  const { search, state } = useLocation()
  const navigate = useNavigate()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const { from, record } = (state as { from?: 'home' | 'recent'; record?: RecordItem } | null) ?? {}
  const goBack = () => {
    if ((from === 'home' || from === 'recent') && window.history.state?.idx > 0) {
      navigate(-1)
      return
    }

    const params = new URLSearchParams()
    if (preview) params.set('preview', '')
    if (from === 'recent') params.set('tab', 'recent')
    navigate(
      { pathname: from === 'home' ? '/home' : '/records', search: params.toString() },
      {
        replace: true,
      },
    )
  }
  return (
    <div className={styles.detailPage}>
      <PageHeader title="나의 그림 기록" action="back" onNavigate={goBack} />
      <RecordDetailContent key={recordId} recordId={recordId} preview={preview} record={record} />
    </div>
  )
}
