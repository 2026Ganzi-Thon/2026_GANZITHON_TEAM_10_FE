import { hasMoyangApi } from '@/lib/moyang-api'
import { getServerMeetingChat, meetingApiMessage } from '@/features/meeting-list/meetingApi'
import { useServerMeetingChat } from './useServerMeetingChat'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Modal, PageHeader } from '@/components'
import { DrawingCanvas } from '@/features/drawing-canvas/DrawingCanvas'
import { DrawingUpload, DrawingCamera, DrawingDetails } from '@/features/drawing-upload'
import { getMockMeetingFixture } from '@/features/meeting-list/meetingMock'
import { readWaitingRoom } from '@/features/meeting-waiting-room/waitingRoomMock'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { getMockStorageScope } from '@/lib/mock-storage'
import { getMeetingChatError, readMeetingChat, updateMeetingChat } from './chatMock'
import type { ChatStorageContext } from './chatMock'
import {
  assertCurrentDrawing,
  DrawingDraftConflict,
  readDrawingDraft,
  saveDrawingDraft,
  validateDrawingPhoto,
} from './drawingDraft'
import type { DrawingDraftPatch, MeetingDrawingDraft } from './drawingDraft'
import { maskMeetingText } from './chatContent'
import { useDraftNavigation } from './useDraftNavigation'
import { isMeetingPreview } from '@/features/meeting-list/meetingEntry'
import styles from './MeetingChat.module.css'

export const MeetingDrawingFlow = () => {
  const { meetingId, step = 'choose' } = useParams<'meetingId' | 'step'>()
  const scope = useMockStorageScope()
  const location = useLocation()
  const scenario = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null
  const server = hasMoyangApi && !isMeetingPreview(location.search, meetingId)
  const context = useMemo(
    () => (scope && meetingId ? { scope, meetingId, scenario, server } : null),
    [scope, meetingId, scenario, server],
  )
  if (!context) return <Navigate to="/meetings" replace state={{ meetingNotice: 'unavailable' }} />
  return (
    <DrawingFlowScreen
      key={JSON.stringify([scope, meetingId, scenario, server])}
      context={context}
      step={step}
    />
  )
}

const DrawingFlowScreen = ({ context, step }: { context: ChatStorageContext; step: string }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [openedAt] = useState(Date.now)
  const [initialStep] = useState(step)
  const [now, setNow] = useState(openedAt)
  const [draft, setDraft] = useState<MeetingDrawingDraft | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [error, setError] = useState<{ message: string; retryDraft?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [confirmation, setConfirmation] = useState(false)
  const alive = useRef(false)
  const routeKey = useRef(location.key)
  const saved = useRef<MeetingDrawingDraft | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const returnRequest = useRef<symbol | null>(null)
  const failedPatch = useRef<DrawingDraftPatch>({})
  const displayedFields = useRef({ title: '', note: '' })
  const syncFields = useRef(false)
  const completing = useRef(false)
  const preparation = useRef<AbortController | null>(null)
  const photoSelection = useRef(0)
  const pageVersion = useRef(0)
  const saveFailure = useRef(false)
  const pendingSaves = useRef(0)
  const pendingWrites = useRef(0)
  useLayoutEffect(() => {
    routeKey.current = location.key
  }, [location.key])
  const chatPath = `/meetings/${encodeURIComponent(context.meetingId)}/chat${location.search}`
  const current = useCallback(
    () => alive.current && getMockStorageScope() === context.scope,
    [context.scope],
  )
  const pathFor = (next: string) =>
    `/meetings/${encodeURIComponent(context.meetingId)}/drawing/${next}${location.search}`
  const goChat = () => {
    const chatIndex = location.state?.meetingChatIndex
    const index = window.history.state?.idx
    if (
      Number.isInteger(chatIndex) &&
      Number.isInteger(index) &&
      chatIndex >= 0 &&
      index > chatIndex
    )
      navigate(chatIndex - index)
    else navigate(chatPath, { replace: true, state: location.state })
  }

  const wire = useServerMeetingChat(context.meetingId, context.scope, context.server)
  let chat: Pick<
    NonNullable<ReturnType<typeof readMeetingChat>>,
    'topic' | 'phase' | 'endedAt'
  > | null = null
  let alreadyShared = false
  let permitted = false
  let missing = false
  let lookupError = ''
  try {
    if (context.server) {
      const serverChat = wire.chat
      permitted = serverChat?.status === 'IN_PROGRESS' || serverChat?.status === 'ENDED'
      lookupError = wire.error
        ? meetingApiMessage(wire.error, '모임 상태를 확인하지 못했어요.')
        : ''
      if (serverChat?.phase) {
        chat = {
          phase: serverChat.phase,
          topic: serverChat.topic ?? '오늘의 그림',
          endedAt: serverChat.endAt ? Date.parse(serverChat.endAt) : null,
        }
        alreadyShared = serverChat.messages.some(
          (message) => message.type === 'DRAWING' && message.mine,
        )
      }
    } else {
      const meeting = getMockMeetingFixture(context.meetingId)
      missing = !meeting
      if (meeting) {
        const room = readWaitingRoom(
          meeting,
          context.scope,
          context.scenario ?? null,
          now,
          openedAt,
        )
        permitted = room.entered && room.phase === 'IN_PROGRESS'
        if (permitted) {
          const stored = readMeetingChat(context)
          chat = stored
          alreadyShared = Boolean(
            stored?.messages.some(
              (message) => message.type === 'DRAWING' && message.participantId === 'me',
            ),
          )
        }
      }
    }
  } catch (cause) {
    lookupError = getMeetingChatError(cause, '모임 정보를 확인하지 못했어요.')
  }
  const canDraw = Boolean(
    permitted && chat?.endedAt === null && chat.phase === 'DRAWING' && !alreadyShared,
  )
  const shouldBlock = useCallback(
    () => current() && canDraw && (pendingWrites.current > 0 || saveFailure.current),
    [current, canDraw],
  )
  const flush = useCallback(() => queue.current, [])
  const canLeave = useCallback(
    () => current() && (!canDraw || (pendingWrites.current === 0 && !saveFailure.current)),
    [current, canDraw],
  )
  const navigation = useDraftNavigation({ shouldBlock, flush, canLeave })

  useEffect(() => {
    alive.current = true
    const refresh = () => setNow(Date.now())
    const pageHide = () => {
      alive.current = false
      pageVersion.current += 1
      photoSelection.current += 1
      preparation.current?.abort()
    }
    const pageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      alive.current = true
      refresh()
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingSaves.current > 0 || saveFailure.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('storage', refresh)
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    window.addEventListener('pageshow', pageShow)
    return () => {
      pageHide()
      clearInterval(timer)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
      window.removeEventListener('pageshow', pageShow)
    }
  }, [])

  useEffect(() => {
    if (!canDraw) return
    let active = true
    readDrawingDraft(context)
      .then(async (value) => {
        if (!active || getMockStorageScope() !== context.scope) return
        let next = value
        if (!next) {
          try {
            next = await saveDrawingDraft(context, {}, null)
          } catch (cause) {
            next = await readDrawingDraft(context)
            if (!next) throw cause
          }
        }
        if (
          ['canvas', 'upload', 'camera', 'details'].includes(initialStep) &&
          !next.methodSelected
        ) {
          if (!active || getMockStorageScope() !== context.scope) return
          next = await saveDrawingDraft(context, { methodSelected: true }, next)
        }
        if (active && getMockStorageScope() === context.scope) {
          saved.current = next
          displayedFields.current = next.fields
          setDraft(next)
          setError(null)
        }
      })
      .catch((cause) => {
        if (active)
          setError({ message: getMeetingChatError(cause, '그림 초안을 불러오지 못했어요.') })
      })
    return () => {
      active = false
    }
  }, [context, attempt, canDraw, initialStep])

  const persist = (patch: DrawingDraftPatch, retry = false) => {
    pendingSaves.current += 1
    pendingWrites.current += 1
    const task = queue.current
      .then(async () => {
        const edits = { ...failedPatch.current, ...patch }
        if (failedPatch.current.fields && patch.fields) {
          edits.fields = { ...failedPatch.current.fields, ...patch.fields }
        }
        try {
          const previous = saved.current
          const before = retry ? await readDrawingDraft(context) : previous
          if (!before || before.id !== previous?.id)
            throw new Error('이 화면에서 작성한 그림 초안을 확인하지 못했어요.')
          const next = await saveDrawingDraft(context, edits, before)
          saved.current = next
          failedPatch.current = {}
          saveFailure.current = false
          if (before.revision !== previous.revision) syncFields.current = true
          if (current()) {
            if (syncFields.current && pendingWrites.current === 1) {
              displayedFields.current = next.fields
              syncFields.current = false
              setFormVersion((version) => version + 1)
            }
            setDraft(next)
            setError(null)
          }
          return next
        } catch (cause) {
          failedPatch.current = edits
          throw cause
        }
      })
      .finally(() => {
        pendingSaves.current -= 1
        pendingWrites.current -= 1
      })
    queue.current = task.catch((cause) => {
      saveFailure.current = true
      if (current())
        setError({
          message: getMeetingChatError(cause, '그림 초안을 저장하지 못했어요.'),
          retryDraft: true,
        })
    })
    return task
  }

  const editFields = (fields: MeetingDrawingDraft['fields']) => {
    const previous = displayedFields.current
    displayedFields.current = fields
    return {
      ...(fields.title !== previous.title && { title: fields.title }),
      ...(fields.note !== previous.note && { note: fields.note }),
    }
  }

  const move = async (next: string, replace = false) => {
    const before = location.key
    const version = pageVersion.current
    if (['canvas', 'upload'].includes(next) && !saved.current?.methodSelected) {
      try {
        await persist({ methodSelected: true })
      } catch {
        return
      }
    }
    await queue.current
    if (saveFailure.current) return
    if (
      current() &&
      !navigation.leaving.current &&
      before === routeKey.current &&
      version === pageVersion.current
    ) {
      const state =
        next === 'camera'
          ? { ...location.state, meetingCameraFromUpload: step === 'upload' }
          : location.state
      navigate(pathFor(next), { state, replace })
    }
  }

  const selectPhoto = async (photo: Blob, inputType: MeetingDrawingDraft['inputType']) => {
    pendingSaves.current += 1
    const selection = ++photoSelection.current
    const before = location.key
    const isLatest = () =>
      selection === photoSelection.current &&
      current() &&
      !navigation.leaving.current &&
      before === routeKey.current
    try {
      await validateDrawingPhoto(photo)
      if (!isLatest()) return
      await persist({ photo, inputType, paths: [] })
      if (isLatest()) await move('details')
    } catch (cause) {
      if (isLatest() && !saveFailure.current)
        setError({ message: getMeetingChatError(cause, '그림을 확인하지 못했어요.') })
    } finally {
      pendingSaves.current -= 1
    }
  }

  const complete = async (fields: MeetingDrawingDraft['fields']) => {
    if (completing.current) return
    completing.current = true
    const controller = new AbortController()
    preparation.current = controller
    const before = location.key
    try {
      const next = await persist({ fields: editFields(fields) })
      if (controller.signal.aborted) return
      if (!current() || navigation.leaving.current || before !== routeKey.current || !next.photo)
        return
      if (context.server) {
        const latest = await getServerMeetingChat(context.meetingId, controller.signal)
        if (
          latest.status !== 'IN_PROGRESS' ||
          latest.phase !== 'DRAWING' ||
          latest.messages.some((message) => message.type === 'DRAWING' && message.mine)
        )
          throw new Error('지금은 그림을 공유할 수 없는 단계예요.')
        if (
          !controller.signal.aborted &&
          current() &&
          !navigation.leaving.current &&
          before === routeKey.current
        )
          goChat()
        return
      }
      const drawing = {
        id: next.id,
        title: next.fields.title,
        description: next.fields.note,
        imageUrl: `meeting-draft:${next.id}`,
        revision: next.revision,
      }
      const latest = readMeetingChat(context)
      if (!latest || latest.endedAt !== null || latest.phase !== 'DRAWING')
        throw new Error('지금은 그림을 공유할 수 없는 단계예요.')
      await updateMeetingChat(
        context,
        {
          type: 'draft',
          text: latest.draft.text,
          previousText: latest.draft.text,
          previousDrawingId: latest.draft.drawing?.id ?? null,
          drawing,
        },
        async () => {
          await assertCurrentDrawing(context, drawing)
          if (!current() || navigation.leaving.current || before !== routeKey.current) return false
          const meeting = getMockMeetingFixture(context.meetingId)
          if (!meeting) return false
          const room = readWaitingRoom(
            meeting,
            context.scope,
            context.scenario ?? null,
            Date.now(),
            openedAt,
          )
          return room.entered && room.phase === 'IN_PROGRESS'
        },
        controller.signal,
      )
      if (
        current() &&
        !controller.signal.aborted &&
        !navigation.leaving.current &&
        before === routeKey.current
      )
        goChat()
    } catch (cause) {
      if (controller.signal.aborted || !current()) return
      if (cause instanceof DrawingDraftConflict) {
        setError({ message: cause.message, retryDraft: true })
        return
      }
      throw new Error(getMeetingChatError(cause, '공유를 준비하지 못했어요. 다시 시도해 주세요.'), {
        cause,
      })
    } finally {
      if (preparation.current === controller) preparation.current = null
      completing.current = false
    }
  }

  if (missing) return <Navigate to="/meetings" replace state={{ meetingNotice: 'missing' }} />
  if (lookupError)
    return (
      <Modal
        isOpen
        title="모임 정보를 확인하지 못했어요"
        onClose={goChat}
        actions={[
          {
            label: '다시 확인하기',
            onClick: context.server ? wire.refresh : () => setNow(Date.now()),
          },
          { label: '모임으로 돌아가기', color: 'gray', onClick: goChat },
        ]}
      >
        <p role="alert">{lookupError}</p>
      </Modal>
    )
  if (context.server && !wire.chat) return <p role="status">모임 상태를 확인하고 있어요.</p>
  if (!permitted)
    return (
      <Navigate
        to={`/meetings/${encodeURIComponent(context.meetingId)}/waiting${location.search}`}
        replace
        state={location.state}
      />
    )
  if (!chat) return <Navigate to={chatPath} replace state={location.state} />
  if (chat.endedAt !== null || chat.phase !== 'DRAWING' || alreadyShared)
    return (
      <Modal
        isOpen
        title={
          chat.endedAt !== null
            ? '모임이 종료됐어요'
            : alreadyShared
              ? '이미 그림을 공유했어요'
              : '그림 그리기 단계가 끝났어요'
        }
        onClose={goChat}
        actions={[{ label: '모임으로 돌아가기', onClick: goChat }]}
      >
        <p>그림 초안은 이 모임에 보관돼요.</p>
      </Modal>
    )
  if (!draft)
    return (
      <section className={styles.notice}>
        {error ? (
          <Modal
            isOpen
            title="그림 초안을 불러오지 못했어요"
            onClose={goChat}
            actions={[
              {
                label: '다시 불러오기',
                onClick: () => {
                  setError(null)
                  setAttempt((value) => value + 1)
                },
              },
              { label: '모임으로 돌아가기', color: 'gray', onClick: goChat },
            ]}
          >
            <p role="alert">{error.message}</p>
          </Modal>
        ) : (
          <p role="status">그림 초안을 불러오고 있어요.</p>
        )}
      </section>
    )
  if (!['choose', 'canvas', 'upload', 'camera', 'details'].includes(step))
    return <Navigate to={pathFor('choose')} replace state={location.state} />
  if (step === 'details' && !draft.photo)
    return <Navigate to={pathFor('choose')} replace state={location.state} />
  const back = () => setConfirmation(true)
  const continueDrawing = () => {
    returnRequest.current = null
    setConfirmation(false)
  }

  return (
    <>
      {error && (
        <div className={styles.error} role="alert">
          <p>{error.message}</p>
          {error.retryDraft && (
            <button type="button" onClick={() => void persist({}, true).catch(() => {})}>
              초안 다시 저장하기
            </button>
          )}
        </div>
      )}
      {step === 'choose' && (
        <>
          <PageHeader title="모임 그림 그리기" action="back" onNavigate={back} />
          <section className={styles.notice}>
            <h2>{maskMeetingText(chat.topic)}</h2>
            <p>이번 모임에서 나눌 새 그림을 그려 주세요.</p>
            <Button onClick={() => void move('canvas')}>웹에서 그리기</Button>
            <Button color="gray" onClick={() => void move('upload')}>
              종이에 그린 그림 올리기
            </Button>
            {draft.photo && (
              <Button color="gray" onClick={() => void move('details')}>
                작성하던 그림 확인하기
              </Button>
            )}
          </section>
        </>
      )}
      {step === 'canvas' && (
        <DrawingCanvas
          key={draft.id}
          flow={{
            topic: {
              title: maskMeetingText(chat.topic),
              description: '이번 모임의 주제를 자유롭게 표현해 주세요.',
            },
            paths: draft.paths,
            onChange: (paths) => {
              void persist({ paths, inputType: 'CANVAS' }).catch(() => {})
            },
            onBack: back,
            onComplete: async (photo, paths) => {
              const before = location.key
              const version = pageVersion.current
              await persist({ photo, paths, inputType: 'CANVAS' })
              if (current() && before === routeKey.current && version === pageVersion.current)
                await move('details')
            },
          }}
        />
      )}
      {step === 'upload' && (
        <DrawingUpload
          flow={{
            onBack: back,
            onCamera: () => void move('camera'),
            onSelect: (photo) => void selectPhoto(photo, 'UPLOAD'),
          }}
        />
      )}
      {step === 'camera' && (
        <DrawingCamera
          flow={{
            onBack: () => {
              if (location.state?.meetingCameraFromUpload === true) navigate(-1)
              else void move('upload', true)
            },
            onCapture: (photo) => void selectPhoto(photo, 'PHOTO'),
          }}
        />
      )}
      {step === 'details' && draft.photo && (
        <DrawingDetails
          key={`${draft.id}:${formVersion}`}
          flow={{
            photo: draft.photo,
            inputType: draft.inputType,
            draft: draft.fields,
            onChange: (fields) => {
              void persist({ fields: editFields(fields) }).catch(() => {})
            },
            onBack: back,
            onComplete: complete,
          }}
        />
      )}
      <Modal
        isOpen={confirmation}
        title="모임으로 돌아갈까요?"
        onClose={continueDrawing}
        actions={[
          { label: '계속 그리기', color: 'gray', onClick: continueDrawing },
          {
            label: '모임으로 돌아가기',
            onClick: () => {
              const id = Symbol()
              returnRequest.current = id
              const key = location.key
              const version = pageVersion.current
              void queue.current.then(() => {
                if (returnRequest.current !== id) return
                returnRequest.current = null
                if (
                  current() &&
                  key === routeKey.current &&
                  version === pageVersion.current &&
                  !saveFailure.current
                )
                  goChat()
              })
            },
          },
        ]}
      >
        <p>
          {error?.retryDraft
            ? '초안 저장 상태를 확인한 뒤 돌아가 주세요.'
            : '그림과 입력한 내용은 이 모임의 초안으로 보관돼요.'}
        </p>
        {error?.retryDraft && <p role="alert">{error.message}</p>}
      </Modal>
      {navigation.prompt}
    </>
  )
}
