import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Modal, PageHeader } from '@/components'
import { DrawingImage } from '@/features/drawing-conversation/DrawingImage'
import {
  advanceMeeting,
  endMeeting,
  getMeetingReflection,
  getServerMeetingChat,
  meetingApiMessage,
  sendMeetingMessage,
  uploadMeetingDrawing,
} from '@/features/meeting-list/meetingApi'
import type { MeetingReflection, ServerMeetingMessage } from '@/features/meeting-list/meetingApi'
import { getMeetingListPath } from '@/features/meeting-list/meetingEntry'
import { pastConversationDuration } from '@/features/meeting-list/meetingMock'
import { readServerPastMeeting } from '@/features/meeting-list/serverMeetingHistory'
import { MoyangApiError } from '@/lib/moyang-api'
import { maskMeetingText, phaseLabels } from './chatContent'
import { drawingDuration, drawingGraceDuration, formatRemainingTime } from './chatTiming'
import { readDrawingDraft } from './drawingDraft'
import type { MeetingDrawingDraft } from './drawingDraft'
import { useServerMeetingChat } from './useServerMeetingChat'
import styles from './MeetingChat.module.css'

const readText = (key: string) => {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
const time = new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short', timeZone: 'Asia/Seoul' })

export const ServerMeetingChat = ({ id, scope }: { id: string; scope: string }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const path = `/meetings/${encodeURIComponent(id)}`
  const listPath = getMeetingListPath(location.state?.meetingListSearch ?? '?tab=mine')
  const draftKey = JSON.stringify(['moyang:meeting-message', scope, id])
  const [text, setText] = useState(() => readText(draftKey))
  const [draft, setDraft] = useState<MeetingDrawingDraft | null>(null)
  const [selected, setSelected] = useState<ServerMeetingMessage>()
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const [dialog, setDialog] = useState<'end' | 'share' | 'advance'>()
  const [history] = useState(() => readServerPastMeeting(scope, id))
  const [showReflection, setShowReflection] = useState(
    () => new URLSearchParams(location.search).get('view') === 'drawing',
  )
  const [reflection, setReflection] = useState<MeetingReflection>()
  const [reflectionError, setReflectionError] = useState('')
  const [reflectionAttempt, setReflectionAttempt] = useState(0)
  const [expired, setExpired] = useState(
    () => showReflection && Boolean(history && history.deleteAt <= Date.now()),
  )
  const [now, setNow] = useState(Date.now)
  const mutation = useRef<AbortController | null>(null)
  const uploaded = useRef<{ draft: string; drawingId: number } | undefined>(undefined)
  const lastSentTextId = useRef(0)
  const uncertainText = useRef<{ content: string; afterId: number } | undefined>(undefined)
  const messageList = useRef<HTMLDivElement>(null)
  const { chat, canSkip, error, refresh } = useServerMeetingChat(id, scope, !expired)
  const ended = chat?.status === 'ENDED'
  const deleteAt = chat?.deleteAt
  const deadline = deleteAt ? Date.parse(deleteAt) : NaN
  const historyRemaining = Math.min(deadline - now, pastConversationDuration)
  const showHistoryTimer = ended && Number.isFinite(deadline) && !expired
  const ownDrawing = chat?.messages.some((message) => message.mine && message.type === 'DRAWING')
  const entryDenied = error instanceof MoyangApiError && error.code === 'NOT_PARTICIPANT'
  const lookupEndedDrawing =
    expired || (error instanceof MoyangApiError && error.code === 'MEETING_NOT_FOUND')
  const canViewReflection = Boolean(
    reflection || (ended && ownDrawing) || (lookupEndedDrawing && history?.hasDrawing),
  )
  const shouldReadReflection =
    (showReflection && canViewReflection) || (lookupEndedDrawing && !history)
  const active = chat?.status === 'IN_PROGRESS' && !error
  const canDraw = active && chat.phase === 'DRAWING' && !ownDrawing
  const canAdvance = active && canSkip && (chat.phase === 'INTRO' || chat.phase === 'SHARING')
  const drawingStartedAt =
    active && chat.phase === 'DRAWING'
      ? chat.messages.findLast((message) => message.type === 'SYSTEM')?.createdAt
      : undefined
  const drawingRemaining = drawingStartedAt
    ? Date.parse(drawingStartedAt) + drawingDuration - now
    : NaN

  useEffect(() => () => mutation.current?.abort(), [])
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, text)
    } catch {
      return
    }
  }, [draftKey, text])
  useEffect(() => {
    if (!canDraw) return
    let current = true
    readDrawingDraft({ scope, meetingId: id, server: true }).then(
      (value) => {
        if (current) setDraft(value)
      },
      () => {
        if (current) setActionError('그림 초안을 불러오지 못했어요.')
      },
    )
    return () => {
      current = false
    }
  }, [id, scope, canDraw])
  useEffect(() => {
    if (!deleteAt || !Number.isFinite(deadline)) return
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, deadline - Date.now()))
    return () => window.clearTimeout(timer)
  }, [deadline, deleteAt])
  useEffect(() => {
    if (!drawingStartedAt && !showHistoryTimer) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [drawingStartedAt, showHistoryTimer])
  useEffect(() => {
    if (!shouldReadReflection || reflection) return
    const controller = new AbortController()
    let timer: number | undefined
    let attempts = 0
    const load = async () => {
      try {
        const card = await getMeetingReflection(id, controller.signal)
        if (!controller.signal.aborted) setReflection(card)
      } catch (cause) {
        if (controller.signal.aborted) return
        if (
          cause instanceof MoyangApiError &&
          cause.code === 'NO_DRAWING_IN_MEETING' &&
          showReflection &&
          ++attempts < 10
        ) {
          timer = window.setTimeout(load, 3000)
        } else setReflectionError('내 그림 이야기를 불러오지 못했어요.')
      }
    }
    void load()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [id, reflection, reflectionAttempt, shouldReadReflection, showReflection])
  const messageCount = chat?.messages.length ?? 0
  useEffect(() => {
    const list = messageList.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messageCount])

  const sendText = async (signal: AbortSignal) => {
    const content = text.trim()
    if (!content) return
    const uncertain = uncertainText.current
    if (uncertain?.content === content) {
      const latest = await getServerMeetingChat(id, signal, uncertain.afterId || undefined)
      const sent = latest.messages.findLast(
        (message) => message.mine && message.type === 'TEXT' && message.content === content,
      )
      if (sent) {
        lastSentTextId.current = sent.messageId
        uncertainText.current = undefined
        setText('')
        return
      }
    }
    const afterId = Math.max(lastSentTextId.current, chat?.messages.at(-1)?.messageId ?? 0)
    uncertainText.current = { content, afterId }
    const sent = await sendMeetingMessage(id, signal, { type: 'TEXT', content })
    lastSentTextId.current = sent.messageId
    uncertainText.current = undefined
    setText('')
  }
  const share = async (signal: AbortSignal) => {
    if (!draft?.photo) return
    const latest = await getServerMeetingChat(id, signal)
    if (latest.messages.some((message) => message.mine && message.type === 'DRAWING')) return
    if (latest.status !== 'IN_PROGRESS' || latest.phase !== 'DRAWING')
      throw new MoyangApiError('MEETING_NOT_IN_PROGRESS', 409)
    const key = `${draft.id}:${draft.revision}`
    if (uploaded.current?.draft !== key) {
      const response = await uploadMeetingDrawing(draft.photo, draft.inputType, signal)
      uploaded.current = { draft: key, drawingId: response.drawingId }
    }
    await sendMeetingMessage(id, signal, {
      type: 'DRAWING',
      drawingId: uploaded.current.drawingId,
      content: [draft.fields.title.trim(), draft.fields.note.trim()].filter(Boolean).join('\n'),
    })
  }
  const run = async (action: 'send' | 'end' | 'share' | 'advance') => {
    if (
      !active ||
      mutation.current ||
      (action === 'advance' && !canAdvance) ||
      (action === 'share' && !canDraw)
    )
      return
    const controller = new AbortController()
    const { signal } = controller
    mutation.current = controller
    setPending(true)
    setActionError('')
    try {
      switch (action) {
        case 'send':
          await sendText(signal)
          break
        case 'share':
          await share(signal)
          break
        case 'end':
          await endMeeting(id, signal)
          break
        case 'advance':
          await advanceMeeting(id, signal)
          break
      }
      if (!signal.aborted) {
        setDialog(undefined)
        refresh()
      }
    } catch (cause) {
      if (!signal.aborted) {
        setActionError(
          meetingApiMessage(cause, '처리 결과를 확인하지 못했어요. 연결 상태를 확인해 주세요.'),
        )
        refresh()
      }
    } finally {
      mutation.current = null
      if (!signal.aborted) setPending(false)
    }
  }

  const back = () =>
    navigate(listPath, { state: { meetingListKey: location.state?.meetingListKey } })
  const openReflection = () => {
    setReflectionError('')
    setShowReflection(true)
  }
  const reflectionModal = (
    <Modal
      isOpen={canViewReflection && showReflection}
      title="내 그림 이야기"
      onClose={() => setShowReflection(false)}
      actions={[{ label: '확인', onClick: () => setShowReflection(false) }]}
    >
      {reflection ? (
        <div className={styles.picture}>
          <DrawingImage src={reflection.drawing.imageUrl} alt="내가 공유한 그림" />
          <p>{maskMeetingText(reflection.card.todaysStory ?? '')}</p>
        </div>
      ) : (
        <p role={reflectionError ? 'alert' : 'status'}>
          {reflectionError || '그림 이야기를 불러오고 있어요.'}
          {reflectionError && (
            <button
              type="button"
              onClick={() => {
                setReflectionError('')
                setReflectionAttempt((value) => value + 1)
              }}
            >
              다시 시도
            </button>
          )}
        </p>
      )}
    </Modal>
  )
  if (lookupEndedDrawing && (expired || history || reflection)) {
    if (canViewReflection && showReflection) return reflectionModal
    const backAction = { label: '목록으로', onClick: back }
    return (
      <Modal
        isOpen
        title="대화 열람 기간이 지났어요"
        onClose={back}
        actions={
          canViewReflection
            ? [{ label: '내 그림 이야기 보기', onClick: openReflection }, backAction]
            : [backAction]
        }
      >
        모임 종료 후 24시간이 지났어요.
      </Modal>
    )
  }
  if (chat?.status === 'OPEN' || chat?.status === 'RECRUITING') {
    return <Navigate replace to={`${path}/waiting`} state={location.state} />
  }

  return (
    <div className={styles.shell}>
      <PageHeader title="모양 모임" action="back" onNavigate={back} />
      {!chat ? (
        error ? (
          <Modal
            isOpen
            title={entryDenied ? '입장하지 않아 볼 수 없어요' : '대화를 불러오지 못했어요'}
            onClose={back}
            actions={
              entryDenied
                ? [{ label: '목록으로', onClick: back }]
                : [
                    { label: '다시 시도', onClick: refresh },
                    { label: '목록으로', color: 'gray', onClick: back },
                  ]
            }
          >
            {entryDenied
              ? '모임 대화는 입장한 참여자만 볼 수 있어요.'
              : meetingApiMessage(error, '연결 상태를 확인하고 다시 시도해 주세요.')}
          </Modal>
        ) : (
          <p className={styles.notice} role="status">
            모임 대화를 불러오고 있어요.
          </p>
        )
      ) : (
        <>
          {chat.phase && (
            <p className={styles.notice}>
              {phaseLabels[chat.phase]}
              {chat.topic && ` · ${maskMeetingText(chat.topic)}`}
            </p>
          )}
          {chat.status === 'CANCELED' && (
            <p className={styles.notice} role="status">
              취소된 모임이에요.
            </p>
          )}
          {ended && (
            <div className={styles.historyTimer}>
              <span>모임이 종료됐어요. 대화는 종료 후 24시간 동안 볼 수 있어요.</span>
              {showHistoryTimer && (
                <time aria-label="대화 열람 남은 시간">
                  {formatRemainingTime(historyRemaining, true)}
                </time>
              )}
            </div>
          )}
          <div className={styles.messages} ref={messageList}>
            {chat.messages.map((message) => {
              const content = maskMeetingText(message.content ?? '')
              const label =
                message.type === 'SYSTEM' ? '모양 AI' : (message.senderNickname ?? '참여자')
              return (
                <div
                  key={message.messageId}
                  className={
                    message.type === 'SYSTEM'
                      ? styles.guide
                      : `${styles.message} ${message.mine ? styles.mine : ''}`
                  }
                >
                  <div className={styles.messageBody}>
                    {!message.mine && (
                      <span className={styles.nickname}>{maskMeetingText(label)}</span>
                    )}
                    {message.type === 'DRAWING' && message.imageUrl ? (
                      <button
                        className={styles.drawingMessage}
                        type="button"
                        onClick={() => setSelected(message)}
                      >
                        <DrawingImage src={message.imageUrl} alt="공유한 그림" />
                        {content && <span>{content}</span>}
                      </button>
                    ) : (
                      <p className={styles.bubble}>{content}</p>
                    )}
                    <time className={styles.messageTime} dateTime={message.createdAt}>
                      {time.format(new Date(message.createdAt))}
                    </time>
                  </div>
                </div>
              )
            })}
          </div>
          {error !== undefined && (
            <div className={styles.error} role="alert">
              연결을 다시 확인하고 있어요.{' '}
              <button type="button" onClick={refresh}>
                다시 시도
              </button>
            </div>
          )}
          {actionError && (
            <p className={styles.error} role="alert">
              {actionError}
            </p>
          )}
          {active && chat.phase === 'DRAWING' && (
            <p className={styles.notice} role="status">
              그림 제출 {chat.submittedDrawingCount}/{chat.participantCount}명
            </p>
          )}
          {canDraw && (
            <div className={styles.drawingActions}>
              {!Number.isNaN(drawingRemaining) &&
                (drawingRemaining > 0 ? (
                  <span>그리기 남은 시간 {formatRemainingTime(drawingRemaining)}</span>
                ) : drawingRemaining + drawingGraceDuration > 0 ? (
                  <span role="status">
                    그림 제출까지 {formatRemainingTime(drawingRemaining + drawingGraceDuration)} 더
                    기다릴게요.
                  </span>
                ) : (
                  <span role="status">모두 그림을 공유하면 다음 단계로 넘어가요.</span>
                ))}
              <Link
                to={`${path}/drawing/choose`}
                state={{ ...location.state, meetingChatIndex: window.history.state?.idx }}
              >
                {draft?.photo ? '그림 수정하기' : '그리기 방식 선택'}
              </Link>
              {draft?.photo && (
                <Button disabled={pending} onClick={() => setDialog('share')}>
                  그림 공유하기
                </Button>
              )}
            </div>
          )}
          {active && (
            <>
              <div className={styles.endActions}>
                {canAdvance && (
                  <Button disabled={pending} onClick={() => setDialog('advance')}>
                    다음 단계로
                  </Button>
                )}
                <Button disabled={pending || chat.endAgreed} onClick={() => setDialog('end')}>
                  {chat.endAgreed
                    ? `종료 동의 ${chat.endAgreedCount}/${chat.participantCount}`
                    : '대화 종료'}
                </Button>
              </div>
              <form
                className={styles.composer}
                onSubmit={(event) => {
                  event.preventDefault()
                  void run('send')
                }}
              >
                <textarea
                  aria-label="메시지 입력"
                  placeholder="메시지를 입력해 주세요"
                  maxLength={500}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  readOnly={pending}
                />
                <button type="submit" disabled={pending || !text.trim()}>
                  전송
                </button>
              </form>
            </>
          )}
          {ended && ownDrawing && <Button onClick={openReflection}>내 그림 이야기 보기</Button>}
        </>
      )}
      <Modal
        isOpen={Boolean(chat && selected)}
        title={maskMeetingText(selected?.senderNickname ?? '내 그림')}
        onClose={() => setSelected(undefined)}
        actions={[{ label: '확인', onClick: () => setSelected(undefined) }]}
      >
        {selected?.imageUrl && (
          <div className={styles.picture}>
            <DrawingImage src={selected.imageUrl} alt="공유한 그림" />
            <p>{maskMeetingText(selected.content ?? '')}</p>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={Boolean(chat && dialog)}
        title={
          dialog === 'end'
            ? '대화를 마무리할까요?'
            : dialog === 'share'
              ? '이 그림을 공유할까요?'
              : '다음 단계로 넘어갈까요?'
        }
        onClose={() => {
          if (!pending) setDialog(undefined)
        }}
        actions={[
          {
            label: '돌아가기',
            color: 'gray',
            disabled: pending,
            onClick: () => setDialog(undefined),
          },
          {
            label: '확인',
            disabled:
              pending ||
              !active ||
              (dialog === 'advance' && !canAdvance) ||
              (dialog === 'share' && !canDraw) ||
              (dialog === 'end' && chat?.endAgreed === true),
            onClick: () => {
              if (dialog) void run(dialog)
            },
          },
        ]}
      >
        {dialog === 'end' && '참여자 모두가 동의하면 모임이 종료돼요.'}
        {actionError && <p role="alert">{actionError}</p>}
      </Modal>
      {reflectionModal}
    </div>
  )
}
