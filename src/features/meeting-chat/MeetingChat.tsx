import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowLeft,
  faArrowUp,
  faChevronRight,
  faClipboard,
} from '@fortawesome/free-solid-svg-icons'
import { Button, Modal } from '@/components'
import type { Meeting } from '@/features/meeting-list/meetingMock'
import { getMockMeetingFixture } from '@/features/meeting-list/meetingMock'
import { readWaitingRoom } from '@/features/meeting-waiting-room/waitingRoomMock'
import type { WaitingRoom } from '@/features/meeting-waiting-room/waitingRoomMock'
import { getMockStorageScope } from '@/lib/mock-storage'
import {
  initializeMeetingChat,
  ChatDraftConflict,
  getMeetingChatError,
  isMeetingChatStorageEvent,
  meetingSampleImage,
  readMeetingChat,
  updateMeetingChat,
  chatHistoryDuration,
} from './chatMock'
import type {
  ChatCommand,
  ChatStorageContext,
  MeetingChat as Chat,
  SharedDrawing,
} from './chatMock'
import { assertCurrentDrawing, openDrawingDraftChannel, readDrawingDraft } from './drawingDraft'
import { SavedDrawingImage } from './SavedDrawingImage'
import { maskMeetingText, phaseLabels, phasePrompts } from './chatContent'
import { useDraftNavigation } from './useDraftNavigation'
import { getChatReadTime, prepareChatPreview } from './chatPreview'
import { ChatGuide } from './ChatGuide'
import { ChatMessage } from './ChatMessage'
import { DrawingModal } from './DrawingModal'
import { ExpiredChatNotice } from './ExpiredChatNotice'
import {
  drawingDuration,
  drawingGraceDuration,
  formatRemainingTime,
  getDrawingStartedAt,
} from './chatTiming'
import styles from './MeetingChat.module.css'

export const MeetingChat = ({
  meeting,
  room,
  scope,
  scenario,
  openedAt,
  onBack,
}: {
  meeting: Meeting
  room: WaitingRoom
  scope: string
  scenario: string | null
  openedAt: number
  onBack: () => void
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const context: ChatStorageContext = useMemo(
    () => ({ scope, meetingId: meeting.id, scenario }),
    [scope, meeting.id, scenario],
  )
  const key = JSON.stringify([scope, meeting.id, scenario])
  return (
    <ChatScreen
      key={key}
      context={context}
      meeting={meeting}
      room={room}
      openedAt={openedAt}
      onBack={onBack}
      onOpenHistory={() =>
        navigate(`/meetings/${encodeURIComponent(meeting.id)}/history${location.search}`, {
          state: { ...location.state, fromMeetingChat: true },
        })
      }
      onDraw={(step) =>
        navigate(`/meetings/${encodeURIComponent(meeting.id)}/drawing/${step}${location.search}`, {
          state: { ...location.state, meetingChatIndex: window.history.state?.idx },
        })
      }
    />
  )
}

const ChatScreen = ({
  context,
  meeting,
  room,
  openedAt,
  onBack,
  onOpenHistory,
  onDraw,
}: {
  context: ChatStorageContext
  meeting: Meeting
  room: WaitingRoom
  openedAt: number
  onBack: () => void
  onOpenHistory: () => void
  onDraw: (step: 'canvas' | 'upload' | 'details') => void
}) => {
  const [chat, setChat] = useState<Chat | null>(null)
  const [text, setText] = useState('')
  const textRef = useRef('')
  const savedDraft = useRef({ text: '', drawing: null as SharedDrawing | null })
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [expired, setExpired] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)
  const [drawingDraft, setDrawingDraft] = useState({ methodSelected: false, hasPhoto: false })
  const [dismissedReminder, setDismissedReminder] = useState<number | null>(null)
  const [modal, setModal] = useState<'leave' | 'end' | 'share' | 'profile' | 'advance' | null>(null)
  const [shareDrawing, setShareDrawing] = useState<SharedDrawing | null>(null)
  const [profileId, setProfileId] = useState('me')
  const [now, setNow] = useState(Date.now)
  const [offline, setOffline] = useState(
    () => !navigator.onLine || context.scenario === 'chat-offline',
  )
  const active = useRef(false)
  const initialized = useRef(false)
  const request = useRef<AbortController | null>(null)
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const leaveRequest = useRef<symbol | null>(null)
  const failedOnce = useRef(false)
  const sendId = useRef<string | null>(null)
  const messages = useRef<HTMLDivElement>(null)
  const messageContent = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const initialScroll = useRef(true)
  const scrollKey = `moyang:meeting-chat-scroll:${JSON.stringify(context)}`
  const writeError = useRef(false)
  const pendingWrites = useRef(0)
  const [hasWriteError, setHasWriteError] = useState(false)
  const [textConflict, setTextConflict] = useState(false)
  const [initialRoom] = useState(() => ({
    participants: room.participants,
    moderatorId: room.isHost ? 'me' : room.participants[0].id,
  }))
  const current = useCallback(
    () => active.current && getMockStorageScope() === context.scope,
    [context.scope],
  )
  const shouldBlock = useCallback(
    () => current() && chat?.endedAt === null && (pendingWrites.current > 0 || writeError.current),
    [current, chat?.endedAt],
  )
  const flush = useCallback(() => writes.current, [])
  const canLeave = useCallback(
    () =>
      current() && (chat?.endedAt !== null || (pendingWrites.current === 0 && !writeError.current)),
    [current, chat?.endedAt],
  )
  const navigation = useDraftNavigation({ shouldBlock, flush, canLeave })
  const canParticipate = useCallback(() => {
    const latest = getMockMeetingFixture(context.meetingId)
    if (!latest) return false
    const status = readWaitingRoom(
      latest,
      context.scope,
      context.scenario ?? null,
      Date.now(),
      openedAt,
    )
    return status.entered && status.phase === 'IN_PROGRESS'
  }, [context, openedAt])

  const storedNickname = chat?.participants.find(({ id }) => id === 'me')?.nickname
  const roomNickname = room.nickname
  const nicknameReady = room.nicknameReady
  const chatActive = chat?.endedAt === null
  useEffect(() => {
    if (!chatActive || !storedNickname || storedNickname === roomNickname || !nicknameReady) return
    const controller = new AbortController()
    void updateMeetingChat(
      context,
      { type: 'rename-self', nickname: roomNickname },
      canParticipate,
      controller.signal,
    ).catch(() => {})
    return () => controller.abort()
  }, [canParticipate, chatActive, context, nicknameReady, roomNickname, storedNickname])

  const refresh = useCallback(() => {
    if (!current() || !initialized.current) return
    try {
      const next = readMeetingChat(context, getChatReadTime(context, Date.now()))
      if (!next) throw new Error('저장된 모임 대화가 없어요.')
      setChat(next)
      if (textRef.current === savedDraft.current.text) {
        textRef.current = next.draft.text
        setText(next.draft.text)
        savedDraft.current = next.draft
      }
      setLoadError('')
    } catch (cause) {
      initialScroll.current = true
      if (cause instanceof Error && cause.message === '대화 열람 기간이 지났어요.') setExpired(true)
      else setLoadError(getMeetingChatError(cause, '대화를 불러오지 못했어요.'))
    }
  }, [context, current])

  useEffect(() => {
    active.current = true
    initialized.current = false
    const controller = new AbortController()
    const begin = async () => {
      try {
        let next = await initializeMeetingChat(
          context,
          {
            ...initialRoom,
            topic: meeting.title,
          },
          canParticipate,
          controller.signal,
        )
        if (!current() || controller.signal.aborted) return
        if (context.scenario === 'chat-load-error' && !failedOnce.current) {
          failedOnce.current = true
          throw new Error('대화를 불러오지 못했어요. 다시 불러와 주세요.')
        }
        next = await prepareChatPreview(context, next, canParticipate, controller.signal)
        if (!current() || controller.signal.aborted) return
        initialized.current = true
        setChat(next)
        savedDraft.current = next.draft
        textRef.current = next.draft.text
        setText(next.draft.text)
        setLoadError('')
        setError('')
      } catch (cause) {
        if (!current() || controller.signal.aborted) return
        setExpired(cause instanceof Error && cause.message === '대화 열람 기간이 지났어요.')
        setLoadError(getMeetingChatError(cause, '대화를 불러오지 못했어요.'))
      }
    }
    void begin()
    const timer = window.setInterval(() => {
      setNow(Date.now())
      refresh()
    }, 1000)
    const connectionChanged = () => {
      const connected = navigator.onLine
      if (!connected) request.current?.abort()
      setOffline(!connected)
      refresh()
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingWrites.current > 0 || writeError.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const pageHide = () => {
      active.current = false
      controller.abort()
      request.current?.abort()
    }
    const pageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      active.current = true
      request.current = null
      setPending(false)
      setNow(Date.now())
      setOffline(!navigator.onLine)
      if (initialized.current) refresh()
      else setAttempt((value) => value + 1)
    }
    window.addEventListener('storage', refresh)
    window.addEventListener('online', connectionChanged)
    window.addEventListener('offline', connectionChanged)
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', pageShow)
    return () => {
      active.current = false
      controller.abort()
      request.current?.abort()
      clearInterval(timer)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('online', connectionChanged)
      window.removeEventListener('offline', connectionChanged)
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('pageshow', pageShow)
    }
  }, [context, current, canParticipate, initialRoom, meeting.title, attempt, refresh])

  useEffect(() => {
    if (chat?.phase !== 'DRAWING') return
    let active = true
    let read = 0
    const refreshDraft = () => {
      const revision = ++read
      void readDrawingDraft(context)
        .then((draft) => {
          if (active && current() && revision === read)
            setDrawingDraft({
              methodSelected: Boolean(draft?.methodSelected || draft?.photo || draft?.paths.length),
              hasPhoto: Boolean(draft?.photo),
            })
        })
        .catch(() => {
          if (active && current() && revision === read)
            setDrawingDraft({ methodSelected: false, hasPhoto: false })
        })
    }
    const onStorage = ({ key }: StorageEvent) => {
      if (isMeetingChatStorageEvent(key)) refreshDraft()
    }
    refreshDraft()
    const channel = openDrawingDraftChannel(context)
    channel?.addEventListener('message', refreshDraft)
    window.addEventListener('focus', refreshDraft)
    window.addEventListener('storage', onStorage)
    return () => {
      active = false
      channel?.close()
      window.removeEventListener('focus', refreshDraft)
      window.removeEventListener('storage', onStorage)
    }
  }, [context, current, chat?.phase])

  useLayoutEffect(() => {
    const container = messages.current
    if (!container) return
    if (initialScroll.current) {
      initialScroll.current = false
      try {
        const stored = localStorage.getItem(scrollKey)
        const position = stored === null ? null : Number(stored)
        if (position !== null && Number.isFinite(position) && position >= 0) {
          container.scrollTop = position
          following.current =
            container.scrollHeight - container.scrollTop - container.clientHeight < 70
          return
        }
      } catch {
        container.scrollTop = container.scrollHeight
        return
      }
    }
    if (following.current) container.scrollTop = container.scrollHeight
  }, [chat?.messages.length, loadError, scrollKey])

  useLayoutEffect(() => {
    const content = messageContent.current
    const container = messages.current
    if (!content || !container) return
    const observer = new ResizeObserver(() => {
      if (following.current) container.scrollTop = container.scrollHeight
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [chat?.meetingId, expired, loadError])

  const persistText = (value: string, retry = false) => {
    pendingWrites.current += 1
    textRef.current = value
    setText(value)
    const task = writes.current
      .then(async () => {
        if (context.scenario === 'chat-save-error' && !failedOnce.current) {
          failedOnce.current = true
          throw new Error(
            '입력 내용을 저장하지 못했어요. 현재 입력을 유지한 채 다시 저장해 주세요.',
          )
        }
        const before = retry ? readMeetingChat(context)?.draft : savedDraft.current
        if (!before) throw new Error('대화를 먼저 불러와 주세요.')
        const next = await updateMeetingChat(
          context,
          {
            type: 'draft-text',
            text: value,
            previousText: before.text,
          },
          canParticipate,
          new AbortController().signal,
        )
        savedDraft.current = next.draft
        if (current()) {
          setChat(next)
          if (writeError.current) setError('')
          writeError.current = false
          setHasWriteError(false)
          setTextConflict(false)
        }
      })
      .finally(() => {
        pendingWrites.current -= 1
      })
    writes.current = task.catch((cause) => {
      if (current()) {
        writeError.current = true
        setHasWriteError(true)
        setTextConflict(cause instanceof ChatDraftConflict)
        setError(getMeetingChatError(cause, '입력을 저장하지 못했어요.'))
      }
    })
    return task
  }

  const run = async (command: ChatCommand) => {
    if (!current() || request.current || offline || !navigator.onLine) return false
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError('')
    try {
      await writes.current
      controller.signal.throwIfAborted()
      if (writeError.current)
        throw new Error('입력 내용을 저장하지 못했어요. 다시 저장한 뒤 시도해 주세요.')
      if (
        !failedOnce.current &&
        ((context.scenario === 'chat-send-error' && command.type === 'send') ||
          (context.scenario === 'chat-share-error' && command.type === 'share'))
      ) {
        failedOnce.current = true
        throw new Error('전송하지 못했어요. 내용을 유지한 채 다시 시도해 주세요.')
      }
      const next = await updateMeetingChat(
        context,
        command,
        async () => {
          if (!navigator.onLine || !canParticipate()) return false
          if (
            command.type === 'share' &&
            command.participantId === 'me' &&
            command.drawing.imageUrl.startsWith('meeting-draft:')
          ) {
            await assertCurrentDrawing(context, command.drawing)
          }
          return navigator.onLine && canParticipate()
        },
        controller.signal,
      )
      if (!current() || controller.signal.aborted) return false
      if (command.type === 'send' || command.type === 'share') following.current = true
      setChat(next)
      savedDraft.current = next.draft
      if (command.type === 'send') {
        textRef.current = next.draft.text
        setText(next.draft.text)
        sendId.current = null
      }
      return true
    } catch (cause) {
      if (current() && navigator.onLine && !controller.signal.aborted)
        setError(getMeetingChatError(cause, '처리하지 못했어요. 다시 시도해 주세요.'))
      return false
    } finally {
      if (request.current === controller) {
        request.current = null
        if (current()) setPending(false)
      }
    }
  }

  useEffect(() => {
    if (offline || !navigator.onLine || loadError || expired || !initialized.current) return
    const controller = new AbortController()
    const canSimulate = () => navigator.onLine && canParticipate()
    const simulate = async () => {
      let next: Chat | null
      try {
        next = readMeetingChat(context)
      } catch {
        return
      }
      if (!next || next.endedAt !== null) return
      if (
        next.phase === 'INTRO' &&
        next.moderatorId !== 'me' &&
        now >= next.messages[0].createdAt + 8000
      ) {
        next = await updateMeetingChat(
          context,
          { type: 'advance', participantId: next.moderatorId, from: 'INTRO' },
          canSimulate,
          controller.signal,
        )
      }
      const own = next.messages.find(
        (item) => item.type === 'DRAWING' && item.participantId === 'me',
      )
      if (next.phase === 'DRAWING' && own && now >= own.createdAt + 2000) {
        const submitted = new Set(
          next.messages
            .filter((message) => message.type === 'DRAWING')
            .map((message) => message.participantId),
        )
        for (const member of next.participants.filter(
          ({ id }) => id !== 'me' && !submitted.has(id),
        )) {
          next = await updateMeetingChat(
            context,
            {
              type: 'share',
              requestId: `peer-drawing:${member.id}`,
              participantId: member.id,
              drawing: {
                id: `peer-drawing:${member.id}`,
                title: '나의 마음',
                description: '오늘의 마음을 그림으로 표현했어요.',
                imageUrl: meetingSampleImage,
              },
            },
            canSimulate,
            controller.signal,
          )
        }
      }
      const sharingStarted = next.messages.find(
        (message) =>
          message.type === 'SYSTEM' &&
          message.event === 'PHASE_CHANGED' &&
          message.phase === 'SHARING',
      )
      if (
        next.phase === 'SHARING' &&
        next.moderatorId !== 'me' &&
        sharingStarted &&
        now >= sharingStarted.createdAt + 8000
      ) {
        next = await updateMeetingChat(
          context,
          { type: 'advance', participantId: next.moderatorId, from: 'SHARING' },
          canSimulate,
          controller.signal,
        )
      }
      const endRequest = next.messages.find(
        (item) => item.type === 'SYSTEM' && item.event === 'END_REQUESTED',
      )
      if (endRequest && now >= endRequest.createdAt + 4000) {
        for (const member of next.participants.filter(({ id }) => id !== 'me'))
          next = await updateMeetingChat(
            context,
            { type: 'agree-end', participantId: member.id },
            canSimulate,
            controller.signal,
          )
      }
      if (current() && !controller.signal.aborted) setChat(next)
    }
    void simulate().catch((cause) => {
      if (current() && navigator.onLine && !controller.signal.aborted)
        setError(getMeetingChatError(cause, '모임 상태를 갱신하지 못했어요.'))
    })
    return () => controller.abort()
  }, [now, offline, loadError, expired, context, canParticipate, current])

  if (expired) return <ExpiredChatNotice context={context} onBack={onBack} />
  if (!chat || loadError)
    return (
      <section className={styles.notice}>
        {!loadError && <p role="status">모임 대화를 불러오고 있어요.</p>}
        <Button color="gray" onClick={onBack}>
          모임 목록으로 돌아가기
        </Button>
        <Modal
          isOpen={Boolean(loadError) && !navigation.leaving.current}
          title="모임 대화를 불러오지 못했어요"
          onClose={onBack}
          actions={[
            {
              label: '다시 불러오기',
              onClick: () => {
                if (initialized.current) refresh()
                else {
                  setLoadError('')
                  setAttempt((value) => value + 1)
                }
              },
            },
            { label: '모임 목록으로 돌아가기', color: 'gray', onClick: onBack },
          ]}
        >
          <p role="alert">{loadError}</p>
        </Modal>
        {navigation.prompt}
      </section>
    )
  const ended = chat.endedAt !== null
  const ownShared = chat.messages.some(
    (item) => item.type === 'DRAWING' && item.participantId === 'me',
  )
  const agreedToEnd = chat.endAgreedIds.includes('me')
  const canShare = !ended && chat.phase === 'DRAWING' && !ownShared
  const activeModal =
    (modal === 'end' && (ended || agreedToEnd)) || (modal === 'share' && !canShare) ? null : modal
  const canCompose =
    chat.phase !== 'DRAWING' ||
    drawingDraft.methodSelected ||
    ownShared ||
    Boolean(chat.draft.drawing)
  const composerLocked = ended || !canCompose
  const drawingStartedAt = getDrawingStartedAt(chat)
  const drawingNow =
    drawingStartedAt !== null && context.scenario === 'chat-drawing-expiring'
      ? now + drawingDuration - 5000
      : drawingStartedAt !== null && context.scenario === 'chat-drawing-late'
        ? now + drawingDuration + drawingGraceDuration - 5000
        : now
  const drawingRemaining =
    drawingStartedAt === null
      ? drawingDuration
      : Math.min(drawingDuration, drawingStartedAt + drawingDuration - drawingNow)
  const selected = chat.messages.find(
    (item) => item.type === 'DRAWING' && item.participantId === profileId,
  )
  const changePhase = () => {
    if (chat.phase === 'DRAWING') setModal('advance')
    else void run({ type: 'advance', participantId: 'me', from: chat.phase })
  }
  const send = () => {
    if (!text.trim() || pending || offline || ended || !canCompose) return
    sendId.current ??= crypto.randomUUID()
    void run({
      type: 'send',
      participantId: 'me',
      requestId: sendId.current,
      content: text,
      expectedDraft: text,
    })
  }
  const continueChat = () => {
    leaveRequest.current = null
    setModal(null)
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button
          type="button"
          aria-label="뒤로 가기"
          onClick={() => (ended ? onBack() : setModal('leave'))}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <span className={styles.hidden}>{phaseLabels[chat.phase]}</span>
        <button
          type="button"
          disabled={
            ended || pending || offline || chat.moderatorId !== 'me' || chat.phase === 'CLOSING'
          }
          onClick={changePhase}
        >
          다음 단계
        </button>
        <button
          type="button"
          disabled={ended || pending || offline || agreedToEnd}
          onClick={() => setModal('end')}
        >
          {agreedToEnd ? '종료 동의 완료' : '대화 종료'}
        </button>
      </header>
      <h1 className={styles.hidden}>{maskMeetingText(meeting.title)} 모임 채팅</h1>
      {offline && (
        <div className={styles.error} role="status">
          연결이 끊겼어요. 대화와 그림은 보관돼요.
          <button
            type="button"
            onClick={() => {
              if (navigator.onLine) {
                setOffline(false)
                setNow(Date.now())
              }
            }}
          >
            다시 연결하기
          </button>
        </div>
      )}
      <div
        className={styles.messages}
        ref={messages}
        onScroll={() => {
          const element = messages.current
          if (!element) return
          following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70
          try {
            if (current()) localStorage.setItem(scrollKey, String(element.scrollTop))
          } catch {
            return
          }
        }}
      >
        <div ref={messageContent}>
          {!ended &&
            chat.messages.map((message) => {
              if (message.type === 'SYSTEM') {
                if (message.event === 'STARTED' || message.event === 'PHASE_CHANGED')
                  return (
                    <ChatGuide key={message.messageId}>
                      <p className={styles.bubble}>
                        {phasePrompts[message.phase]}
                        {message.phase === 'DRAWING' && (
                          <>
                            <br />
                            <strong>오늘의 주제: {maskMeetingText(chat.topic)}</strong>
                          </>
                        )}
                      </p>
                      {message.phase === 'DRAWING' && chat.phase === 'DRAWING' && !ownShared && (
                        <div className={styles.methodChoices}>
                          <div>
                            <button
                              type="button"
                              disabled={offline || pending}
                              onClick={() => onDraw('upload')}
                            >
                              종이에 그리기
                            </button>
                            <span>종이에 그린 뒤 사진을 올려 주세요.</span>
                          </div>
                          <div>
                            <button
                              type="button"
                              disabled={offline || pending}
                              onClick={() => onDraw('canvas')}
                            >
                              앱에서 그리기
                            </button>
                            <span>준비물 없이 화면에 그릴 수 있어요.</span>
                          </div>
                          {drawingDraft.hasPhoto && (
                            <button
                              className={styles.resumeDrawing}
                              type="button"
                              disabled={offline || pending}
                              onClick={() => onDraw('details')}
                            >
                              작성하던 그림 확인하기
                            </button>
                          )}
                        </div>
                      )}
                      {message.phase === 'DRAWING' && chat.phase === 'DRAWING' && (
                        <time
                          className={styles.drawingTimer}
                          aria-label={
                            drawingRemaining > 0 ? '그림 그리기 남은 시간' : '추가 대기 남은 시간'
                          }
                        >
                          {formatRemainingTime(
                            drawingRemaining > 0
                              ? drawingRemaining
                              : drawingRemaining + drawingGraceDuration,
                          )}
                        </time>
                      )}
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
                  onOpenDrawing={() => {
                    setProfileId(member.id)
                    setModal('profile')
                  }}
                />
              )
            })}
          {!ended && chat.phase === 'DRAWING' && drawingRemaining <= 0 && (
            <ChatGuide>
              <p className={styles.bubble} role="status">
                {drawingRemaining + drawingGraceDuration > 0
                  ? '아직 준비 중인 그림이 있어요. 마무리할 수 있도록 1분 더 기다릴게요.'
                  : '아직 준비 중인 그림이 있어요. 모든 참여자가 그림을 공유하면 함께 이야기를 나눌 수 있어요.'}
              </p>
            </ChatGuide>
          )}
          {chat.endAgreedIds.length > 0 && !ended && (
            <p className={styles.system} role="status">
              종료 동의 {chat.endAgreedIds.length}/{chat.participants.length}명
            </p>
          )}
          {ended && (
            <section className={styles.ended}>
              <ChatGuide>
                <p className={styles.bubble}>
                  오늘의 그림 나눔이 끝났어요! 🌿 함께 그림을 그리고 마음을 나눠주셔서 감사해요.
                  모임 종료 후 24시간 동안 대화를 볼 수 있어요.
                  {ownShared && ' 내가 그린 그림은 이후에도 계속 확인할 수 있어요.'}
                </p>
                {ownShared && (
                  <button
                    type="button"
                    className={styles.ownDrawing}
                    onClick={() => {
                      setProfileId('me')
                      setModal('profile')
                    }}
                  >
                    <FontAwesomeIcon icon={faClipboard} />
                    <span>내가 그린 그림 확인하기</span>
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                )}
              </ChatGuide>
              <div className={styles.historyTimer}>
                <span>대화 열람 종료까지 남은 시간</span>
                <time aria-label="대화 열람 남은 시간">
                  {formatRemainingTime(
                    Math.min(
                      chatHistoryDuration,
                      (chat.endedAt ?? now) + chatHistoryDuration - getChatReadTime(context, now),
                    ),
                    true,
                  )}
                </time>
              </div>
              <div className={styles.endActions}>
                <button type="button" onClick={onOpenHistory}>
                  지난 대화 보기
                </button>
                <button type="button" onClick={onBack}>
                  모임 목록으로 돌아가기
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
      {hasWriteError && !error && (
        <div className={styles.error}>
          <button type="button" onClick={() => void persistText(text, true).catch(() => {})}>
            입력 다시 저장하기
          </button>
        </div>
      )}
      <Modal
        isOpen={Boolean(error) && activeModal === null && !navigation.leaving.current}
        title={hasWriteError ? '입력을 저장하지 못했어요' : '요청을 처리하지 못했어요'}
        onClose={() => setError('')}
        actions={
          hasWriteError
            ? [
                {
                  label: '입력 다시 저장하기',
                  onClick: () => void persistText(text, true).catch(() => {}),
                },
                { label: '닫기', color: 'gray', onClick: () => setError('') },
              ]
            : [{ label: '확인', onClick: () => setError('') }]
        }
      >
        <p role="alert">{error}</p>
        {textConflict && <p>다시 저장하면 이 화면에서 입력한 메시지 초안을 사용해요.</p>}
      </Modal>
      {canShare && chat.draft.drawing && (
        <div className={styles.drawingActions}>
          <Button
            disabled={offline || pending}
            onClick={() => {
              setShareDrawing(chat.draft.drawing)
              setModal('share')
            }}
          >
            준비한 그림 공유하기
          </Button>
        </div>
      )}
      <form
        className={`${styles.composer} ${composerLocked ? styles.composerLocked : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <textarea
          aria-label="모임 메시지"
          value={composerLocked ? '' : text}
          maxLength={500}
          disabled={composerLocked || offline || pending}
          rows={1}
          placeholder={
            ended
              ? '종료된 모임이에요.'
              : canCompose
                ? '메시지를 입력해 주세요.'
                : '그리기 방식을 먼저 선택해 주세요.'
          }
          onChange={(event) => {
            sendId.current = null
            void persistText(event.target.value).catch(() => {})
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
        />
        {!composerLocked && (
          <button
            type="submit"
            aria-label="메시지 보내기"
            disabled={offline || pending || !text.trim()}
          >
            <FontAwesomeIcon icon={faArrowUp} />
          </button>
        )}
      </form>
      <Modal
        isOpen={modal === 'advance' && !ended && chat.phase === 'DRAWING'}
        title="아직 다음 단계로 넘어갈 수 없어요"
        onClose={() => setModal(null)}
        actions={[{ label: '확인', onClick: () => setModal(null) }]}
      >
        <p>모든 참여자가 그림을 제출하면 다음 단계로 넘어가요.</p>
      </Modal>
      <Modal
        isOpen={
          !ended &&
          chat.phase === 'DRAWING' &&
          !ownShared &&
          drawingRemaining <= 0 &&
          drawingRemaining + drawingGraceDuration > 0 &&
          dismissedReminder !== drawingStartedAt &&
          activeModal === null &&
          !error &&
          !navigation.leaving.current
        }
        title="아직 그림을 제출하지 않았어요."
        onClose={() => setDismissedReminder(drawingStartedAt)}
      >
        <p>
          다른 참여자들이 기다리고 있어요.
          <br />
          조금만 더 시간을 내어 그림을 제출해 주세요.
        </p>
        <time className={styles.reminderTimer}>
          남은 시간 {formatRemainingTime(drawingRemaining + drawingGraceDuration)}
        </time>
      </Modal>
      <Modal
        isOpen={modal === 'leave'}
        title="잠시 모임에서 나갈까요?"
        onClose={continueChat}
        actions={[
          { label: '계속 참여하기', color: 'gray', onClick: continueChat },
          {
            label: '목록으로 돌아가기',
            onClick: () => {
              const id = Symbol()
              leaveRequest.current = id
              void writes.current.then(() => {
                if (leaveRequest.current !== id) return
                leaveRequest.current = null
                if (current() && !writeError.current) onBack()
              })
            },
          },
        ]}
      >
        <p>참여 상태는 유지돼요. 돌아오기 전에 다른 참여자들의 동의로 모임이 종료될 수 있어요.</p>
        {hasWriteError && (
          <p role="alert">
            입력 저장에 실패했어요. 계속 참여하기를 누르고 입력을 다시 저장해 주세요.
          </p>
        )}
      </Modal>
      <Modal
        isOpen={activeModal === 'end'}
        title="대화 종료에 동의할까요?"
        onClose={() => {
          if (!pending) setModal(null)
        }}
        actions={[
          {
            label: '계속 대화하기',
            color: 'gray',
            disabled: pending,
            onClick: () => setModal(null),
          },
          {
            label: '종료에 동의하기',
            disabled: offline || pending,
            onClick: () => {
              void run({ type: 'agree-end', participantId: 'me' }).then((ok) => {
                if (ok) setModal(null)
              })
            },
          },
        ]}
      >
        <p>참여자 전원이 동의하면 모임이 종료돼요. 동의 후 취소는 할 수 없어요.</p>
        {activeModal === 'end' && offline && (
          <p role="status">연결이 끊겼어요. 다시 연결되면 종료에 동의할 수 있어요.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </Modal>
      <Modal
        isOpen={activeModal === 'share'}
        title="이 그림을 모임에 공유할까요?"
        onClose={() => {
          if (!pending) setModal(null)
        }}
        actions={[
          { label: '돌아가기', color: 'gray', disabled: pending, onClick: () => setModal(null) },
          {
            label: '그림 공유하기',
            disabled: offline || pending || !shareDrawing,
            onClick: () => {
              if (shareDrawing)
                void run({
                  type: 'share',
                  participantId: 'me',
                  requestId: `drawing:${shareDrawing.id}`,
                  drawing: shareDrawing,
                }).then((ok) => {
                  if (ok) setModal(null)
                })
            },
          },
        ]}
      >
        {activeModal === 'share' && shareDrawing && (
          <div className={styles.picture}>
            <SavedDrawingImage context={context} drawing={shareDrawing} retryable />
            <strong>{maskMeetingText(shareDrawing.title)}</strong>
            <p>{maskMeetingText(shareDrawing.description)}</p>
          </div>
        )}
        {activeModal === 'share' && offline && (
          <p role="status">연결이 끊겼어요. 다시 연결되면 그림을 공유할 수 있어요.</p>
        )}
        {error && <p role="alert">{error}</p>}
      </Modal>
      <DrawingModal
        isOpen={modal === 'profile'}
        context={context}
        drawing={modal === 'profile' && selected?.type === 'DRAWING' ? selected.drawing : null}
        nickname={chat.participants.find(({ id }) => id === profileId)?.nickname ?? '참여자'}
        onClose={() => setModal(null)}
      />
      {navigation.prompt}
    </div>
  )
}
