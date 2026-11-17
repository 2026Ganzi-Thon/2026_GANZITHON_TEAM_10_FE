import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Modal, PageHeader } from '@/components'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import {
  getMeetingChatError,
  readMeetingChat,
  readMeetingChatSummary,
  readOwnMeetingDrawing,
} from './chatMock'
import type { ChatStorageContext, MeetingChat, SharedDrawing } from './chatMock'
import { maskMeetingText, phasePrompts } from './chatContent'
import { SavedDrawingImage } from './SavedDrawingImage'
import { getChatReadTime } from './chatPreview'
import { ChatMessage } from './ChatMessage'
import { ChatGuide } from './ChatGuide'
import { DrawingModal } from './DrawingModal'
import { ExpiredChatNotice } from './ExpiredChatNotice'
import styles from './MeetingChat.module.css'

export const MeetingHistory = () => {
  const { meetingId } = useParams<'meetingId'>()
  const scope = useMockStorageScope()
  const location = useLocation()
  const navigate = useNavigate()
  const params = new URLSearchParams(location.search)
  const drawingOnly = params.get('view') === 'drawing'
  const scenario = import.meta.env.DEV ? params.get('mock') : null
  const context = useMemo(
    () => (scope && meetingId ? { scope, meetingId, scenario } : null),
    [scope, meetingId, scenario],
  )
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('storage', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  const origin = location.state as {
    fromMeetingChat?: boolean
    meetingListSearch?: string
    meetingListKey?: string
  } | null
  const back = () =>
    navigate(
      `/meetings${typeof origin?.meetingListSearch === 'string' ? origin.meetingListSearch : '?tab=mine'}`,
      {
        replace: true,
        state: { meetingListKey: origin?.meetingListKey },
      },
    )
  return (
    <div className={styles.shell}>
      <PageHeader
        title={drawingOnly ? '내가 그린 그림' : '지난 대화'}
        action="back"
        onNavigate={() => (origin?.fromMeetingChat ? navigate(-1) : back())}
      />
      <HistoryContent
        key={JSON.stringify(context)}
        context={context}
        drawingOnly={drawingOnly}
        now={now}
        onBack={back}
      />
    </div>
  )
}

const HistoryContent = ({
  context,
  drawingOnly,
  now,
  onBack,
}: {
  context: ChatStorageContext | null
  drawingOnly: boolean
  now: number
  onBack: () => void
}) => {
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null)
  let chat: MeetingChat | null = null
  let drawing: SharedDrawing | null = null
  let error = ''
  try {
    if (!context) throw new Error('로그인 정보를 확인할 수 없어요.')
    const summary = readMeetingChatSummary(context)
    if (!summary || summary.endedAt === null) throw new Error('종료된 모임 기록이 없어요.')
    if (drawingOnly) drawing = readOwnMeetingDrawing(context)
    else {
      chat = readMeetingChat(context, getChatReadTime(context, now))
      if (!chat) throw new Error('모임 기록을 불러오지 못했어요.')
    }
  } catch (cause) {
    error = getMeetingChatError(cause, '모임 기록을 확인하지 못했어요.')
  }
  if (context && error === '대화 열람 기간이 지났어요.')
    return <ExpiredChatNotice context={context} onBack={onBack} />
  if (error || !context)
    return (
      <Modal
        isOpen
        title="모임 기록을 열 수 없어요"
        onClose={onBack}
        actions={[{ label: '나의 모임으로 돌아가기', onClick: onBack }]}
      >
        <p role="alert">{error}</p>
      </Modal>
    )
  if (drawingOnly) {
    return (
      <section className={styles.messages}>
        {drawing ? (
          <div className={styles.picture}>
            <SavedDrawingImage context={context} drawing={drawing} retryable />
            <h2>{maskMeetingText(drawing.title)}</h2>
            <p>{maskMeetingText(drawing.description)}</p>
          </div>
        ) : (
          <p>이 모임에서 공유한 내 그림이 없어요.</p>
        )}
      </section>
    )
  }
  if (!chat) return null
  const selectedDrawing = chat.messages.find(
    (message) => message.type === 'DRAWING' && message.participantId === selectedParticipant,
  )
  return (
    <div className={styles.messages}>
      <p className={styles.system} role="status">
        종료된 모임의 대화예요. 메시지를 보낼 수 없어요.
      </p>
      {chat.messages.map((message) => {
        if (message.type === 'SYSTEM') {
          if (message.event === 'STARTED' || message.event === 'PHASE_CHANGED')
            return (
              <ChatGuide key={message.messageId}>
                <p className={styles.bubble}>
                  {phasePrompts[message.phase]}
                  {message.phase === 'DRAWING' && (
                    <strong> 오늘의 주제: {maskMeetingText(chat.topic)}</strong>
                  )}
                </p>
              </ChatGuide>
            )
          return (
            <p key={message.messageId} className={styles.system}>
              {message.event === 'END_REQUESTED'
                ? '한 참여자가 대화 종료를 요청했어요. 모두 동의하면 종료돼요.'
                : '모두의 동의로 모임이 종료됐어요.'}
            </p>
          )
        }
        const member = chat.participants.find(({ id }) => id === message.participantId)!
        return (
          <ChatMessage
            key={message.messageId}
            message={message}
            member={member}
            context={context}
            onOpenDrawing={() => setSelectedParticipant(member.id)}
          />
        )
      })}
      <DrawingModal
        isOpen={selectedParticipant !== null}
        context={context}
        drawing={selectedDrawing?.type === 'DRAWING' ? selectedDrawing.drawing : null}
        nickname={
          chat.participants.find(({ id }) => id === selectedParticipant)?.nickname ?? '참여자'
        }
        onClose={() => setSelectedParticipant(null)}
      />
    </div>
  )
}
