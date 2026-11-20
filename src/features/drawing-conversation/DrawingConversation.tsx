import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowLeft,
  faArrowUp,
  faChevronDown,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { faClipboard, faCommentDots } from '@fortawesome/free-regular-svg-icons'
import { Button, Modal } from '@/components'
import { MoyangApiError } from '@/lib/moyang-api'
import {
  loadWoolBalance,
  rememberServerSupportNotice,
  restoreServerSupportNotice,
  startServerConversation,
  updateServerConversation,
} from './conversationApi'
import { useModal } from '@/hooks/useModal'
import { getWoolBalance, readReflections, spendWoolForQuestion } from '@/lib/mock-reflections'
import type { RecordId } from '@/lib/mock-reflections'
import { getMockStorageScope } from '@/lib/mock-storage'
import type { ProgramActivityHandoff } from '@/features/personal-program/programMock'
import { ConversationLoading } from './ConversationLoading'
import { DrawingImage } from './DrawingImage'
import { ConversationBubble, ConversationMessages } from './ConversationMessages'
import {
  getReplyText,
  readConversation,
  saveConversation,
  startConversation,
  supportMessage,
  updateConversation,
} from './conversationMock'
import type { ConversationAction, ConversationDrawing } from './conversationMock'
import styles from './DrawingConversation.module.css'

type DrawingConversationProps = {
  drawing: ConversationDrawing
  server?: boolean
  serverConversationId?: number | null
  recordId: RecordId
  storageKey: string
  legacyStorageKey?: string
  storageScope: string
  programActivity?: ProgramActivityHandoff
  isPreview: boolean
  scenario: string | null
  onBack: () => void
}

const readWoolBalance = (isProgramPreview: boolean, previewWallet: boolean) => {
  if (isProgramPreview) return 0
  try {
    return getWoolBalance(readReflections(previewWallet))
  } catch {
    return null
  }
}

const isDialogBackdrop = ({ target, clientX, clientY }: MouseEvent<HTMLDivElement>) => {
  if (!(target instanceof HTMLDialogElement)) return false
  const { left, top, right, bottom } = target.getBoundingClientRect()
  return clientX < left || clientX >= right || clientY < top || clientY >= bottom
}

export const DrawingConversation = ({
  drawing,
  server = false,
  serverConversationId,
  recordId,
  storageKey,
  legacyStorageKey,
  storageScope,
  programActivity,
  isPreview,
  scenario,
  onBack,
}: DrawingConversationProps) => {
  const isProgramPreview = Boolean(programActivity?.mock)
  const previewWallet = scenario === 'wool'
  const [conversation, setConversation] = useState(() => {
    if (server) return null
    const saved =
      readConversation(storageKey) ?? (legacyStorageKey ? readConversation(legacyStorageKey) : null)
    return isPreview && saved?.status === 'ended' ? null : saved
  })
  const [startAttempt, setStartAttempt] = useState(0)
  const [startFailed, setStartFailed] = useState(false)
  const [input, setInput] = useState('')
  const [showReplies, setShowReplies] = useState(false)
  const [confirmation, setConfirmation] = useState<'end' | 'leave' | null>(null)
  const { isOpen: isDrawingOpen, openModal: openDrawing, closeModal: closeDrawing } = useModal()
  const [pending, setPending] = useState<ConversationAction | null>(null)
  const [retry, setRetry] = useState<ConversationAction | null>(null)
  const [busyError, setBusyError] = useState(false)
  const [woolBalance, setWoolBalance] = useState(() =>
    server ? null : readWoolBalance(isProgramPreview, previewWallet),
  )
  const [woolShortage, setWoolShortage] = useState(false)
  const request = useRef<AbortController | null>(null)
  const startedOnBackdrop = useRef(false)
  const mockFailed = useRef(false)
  const messageList = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLDivElement>(null)
  const replyToggle = useRef<HTMLButtonElement>(null)
  const firstReply = useRef<HTMLButtonElement>(null)
  const restoreReplyFocus = useRef(false)
  const isAsking = conversation?.status === 'asking'
  const isPending = pending !== null
  const mustRetryServerAction = server && retry !== null
  const closeConfirmation = () => setConfirmation(null)

  useEffect(() => {
    if (
      !conversation ||
      !legacyStorageKey ||
      storageScope !== getMockStorageScope() ||
      readConversation(storageKey)
    )
      return
    saveConversation(storageKey, conversation)
    const restored = readConversation(storageKey)
    if (restored && restored.id === conversation.id) saveConversation(legacyStorageKey, null)
  }, [conversation, legacyStorageKey, storageKey, storageScope])

  useEffect(() => {
    if (conversation || scenario === 'loading') return

    const controller = new AbortController()
    const opening = server
      ? startServerConversation(drawing.drawingId, serverConversationId, controller.signal)
      : startConversation(scenario === 'start-error' && startAttempt === 0)
    opening.then(
      (started) => {
        if (controller.signal.aborted || storageScope !== getMockStorageScope()) return
        if (!server) saveConversation(storageKey, started)
        else if (started.status === 'support') rememberServerSupportNotice(storageScope, started)
        setConversation(server ? restoreServerSupportNotice(storageScope, started) : started)
      },
      () => {
        if (!controller.signal.aborted) setStartFailed(true)
      },
    )

    return () => controller.abort()
  }, [
    conversation,
    drawing.drawingId,
    scenario,
    server,
    serverConversationId,
    startAttempt,
    storageKey,
    storageScope,
  ])

  useEffect(() => () => request.current?.abort(), [])

  useEffect(() => {
    if (server) {
      const controller = new AbortController()
      loadWoolBalance(controller.signal).then(
        (balance) => {
          if (!controller.signal.aborted) setWoolBalance(balance)
        },
        () => {},
      )
      return () => controller.abort()
    }
    const syncBalance = () => setWoolBalance(readWoolBalance(isProgramPreview, previewWallet))
    window.addEventListener('storage', syncBalance)
    return () => window.removeEventListener('storage', syncBalance)
  }, [isProgramPreview, previewWallet, server])

  useLayoutEffect(() => {
    const list = messageList.current
    if (list) list.scrollTop = list.scrollHeight
  }, [conversation, pending, retry, showReplies, woolShortage])

  useLayoutEffect(() => {
    if (showReplies) {
      firstReply.current?.focus({ preventScroll: true })
    } else if (restoreReplyFocus.current) {
      restoreReplyFocus.current = false
      replyToggle.current?.focus({ preventScroll: true })
    }
  }, [showReplies])

  useEffect(() => {
    if (!showReplies) return

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!composer.current?.contains(event.target as Node)) setShowReplies(false)
    }

    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [showReplies])

  const runAction = async (action: ConversationAction) => {
    if (!conversation || request.current || storageScope !== getMockStorageScope()) return
    if (mustRetryServerAction && action !== retry) return

    const controller = new AbortController()
    const { signal } = controller
    request.current = controller
    setPending(action)
    setRetry(null)
    setBusyError(false)
    setWoolShortage(false)
    setShowReplies(false)

    const isEnd = action.type === 'END'
    const fail = !mockFailed.current && scenario === (isEnd ? 'end-error' : 'reply-error')

    try {
      const updated = server
        ? await updateServerConversation(conversation, action, signal, mustRetryServerAction)
        : await updateConversation(conversation, action, fail, scenario === 'support')
      if (signal.aborted || storageScope !== getMockStorageScope()) return

      if (server && action.type === 'CONTINUE') {
        loadWoolBalance(signal).then(
          (balance) => {
            if (!signal.aborted && storageScope === getMockStorageScope()) setWoolBalance(balance)
          },
          () => {},
        )
      } else if (action.type === 'CONTINUE') {
        const questionId = `${conversation.id ?? drawing.drawingId}:${updated.questionIndex}`
        const paid =
          !isProgramPreview && (await spendWoolForQuestion(questionId, signal, previewWallet))
        if (signal.aborted || storageScope !== getMockStorageScope()) return
        setWoolBalance(readWoolBalance(isProgramPreview, previewWallet))
        if (!paid) {
          setWoolShortage(true)
          return
        }
      }

      if (server) {
        const restored = restoreServerSupportNotice(storageScope, updated)
        rememberServerSupportNotice(storageScope, restored)
        setConversation(restored)
      } else {
        saveConversation(storageKey, isPreview && isEnd ? null : updated)
        setConversation(updated)
      }
      const replyText = getReplyText(action)
      const nextUserMessage = updated.messages
        .slice(conversation.messages.length)
        .find(({ role }) => role === 'user')
      if (replyText && (!server || nextUserMessage?.text === replyText)) setInput('')
    } catch (error) {
      if (signal.aborted || storageScope !== getMockStorageScope()) return
      if (server && error instanceof MoyangApiError && error.code === 'NOT_ENOUGH_WOOL') {
        setWoolShortage(true)
        return
      }
      setBusyError(server && error instanceof MoyangApiError && error.code === 'CONCURRENT_REQUEST')
      mockFailed.current = true
      setRetry(action)
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(null)
      }
    }
  }

  if (conversation?.status === 'ended') {
    return (
      <Navigate
        replace
        to={
          server
            ? `/drawing/result?conversationId=${conversation.id}`
            : previewWallet
              ? '/drawing/result?mock=wool-session'
              : '/drawing/result'
        }
        state={{
          drawing,
          conversation,
          programActivity,
          storageScope,
          conversationStorageKey: server ? undefined : storageKey,
          serverConversationId: server ? Number(conversation.id) : undefined,
          recordId,
        }}
      />
    )
  }

  const pendingReply = pending ? getReplyText(pending) : ''
  const drawingNote = drawing.note?.trim()
  const image =
    drawing.imageUrl || drawing.previewPhoto ? (
      <DrawingImage
        className={styles.drawingImage}
        src={drawing.imageUrl}
        previewPhoto={drawing.previewPhoto}
        alt={drawing.title}
      />
    ) : (
      <span className={styles.drawingPlaceholder} aria-hidden="true">
        그림
      </span>
    )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.back}
          type="button"
          disabled={pending?.type === 'END'}
          aria-label="뒤로 가기"
          aria-haspopup="dialog"
          onClick={() => setConfirmation('leave')}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        {conversation && (
          <button
            className={styles.end}
            type="button"
            disabled={isPending || mustRetryServerAction}
            aria-haspopup="dialog"
            onClick={() => setConfirmation('end')}
          >
            대화 종료
          </button>
        )}
      </header>

      <Modal
        isOpen={confirmation !== null}
        onClose={closeConfirmation}
        title={confirmation === 'end' ? '대화를 여기까지 할까요?' : '대화에서 나갈까요?'}
        actions={[
          { label: '계속 대화하기', color: 'gray', onClick: closeConfirmation },
          {
            label: confirmation === 'end' ? '종료하고 결과 보기' : '나가기',
            onClick: () => {
              closeConfirmation()
              if (confirmation === 'end') void runAction({ type: 'END' })
              else if (confirmation === 'leave') onBack()
            },
          },
        ]}
      >
        {confirmation === 'leave' && input.trim() && '작성 중인 답변은 전송되지 않아요.'}
      </Modal>

      {conversation ? (
        <>
          <h1 className={styles.drawingHeading}>
            <button
              className={styles.drawingCard}
              type="button"
              aria-haspopup="dialog"
              aria-label={`오늘의 그림 ${drawing.title} 크게 보기`}
              onClick={openDrawing}
            >
              {image}
              <span className={styles.drawingTitle}>
                <span className="text-caption">오늘의 그림</span>
                <span className={`text-body ${styles.drawingName}`}>{drawing.title}</span>
              </span>
              <FontAwesomeIcon
                icon={faChevronRight}
                className={styles.drawingChevron}
                aria-hidden="true"
              />
            </button>
          </h1>
          <div
            onPointerDown={(event) => {
              startedOnBackdrop.current = isDialogBackdrop(event)
            }}
            onClick={(event) => {
              if (startedOnBackdrop.current && isDialogBackdrop(event)) closeDrawing()
              startedOnBackdrop.current = false
            }}
          >
            <Modal isOpen={isDrawingOpen} onClose={closeDrawing} ariaLabel="오늘의 그림">
              <div className={styles.drawingPreview}>
                <h2 className="text-choice">오늘의 그림</h2>
                <div className={styles.previewImage}>{image}</div>
                <h3 className="text-choice">{drawing.title}</h3>
                {drawingNote && (
                  <div className={styles.drawingNote}>
                    <p className="text-caption-medium">그림을 그리며 떠오른 생각</p>
                    <p>{drawingNote}</p>
                  </div>
                )}
              </div>
            </Modal>
          </div>

          <ConversationMessages messages={conversation.messages} ref={messageList}>
            {conversation.status === 'support' && (
              <ConversationBubble
                role="support"
                text={conversation.supportNotice?.message ?? supportMessage}
              />
            )}
            {conversation.supportNotice && /^\+?[\d-]+$/.test(conversation.supportNotice.phone) && (
              <a className={styles.feedback} href={`tel:${conversation.supportNotice.phone}`}>
                {conversation.supportNotice.actionLabel}
              </a>
            )}
            {pendingReply && <ConversationBubble role="user" text={pendingReply} />}
            {pending && (
              <p className={styles.feedback} role="status">
                {pending.type === 'END'
                  ? '그림 이야기를 정리하고 있어요.'
                  : '답변을 기다리고 있어요.'}
              </p>
            )}
            {retry && (
              <div className={styles.feedback}>
                <p role="alert">
                  {busyError
                    ? '이전 요청을 처리 중이에요. 잠시 후 다시 시도해 주세요.'
                    : retry.type === 'END'
                      ? '대화를 마치지 못했어요.'
                      : '응답을 불러오지 못했어요.'}
                </p>
                <button type="button" onClick={() => void runAction(retry)}>
                  다시 시도
                </button>
              </div>
            )}

            {conversation.status === 'review' && (
              <div className={styles.review}>
                <Button
                  color="gray"
                  disabled={isPending || mustRetryServerAction}
                  onClick={() => void runAction({ type: 'END' })}
                >
                  <FontAwesomeIcon icon={faClipboard} />
                  내 그림 정리하기
                  <FontAwesomeIcon icon={faChevronRight} />
                </Button>
                {conversation.canExtend !== false && (
                  <Button
                    color="gray"
                    disabled={isPending || mustRetryServerAction}
                    onClick={() => void runAction({ type: 'CONTINUE' })}
                  >
                    <FontAwesomeIcon icon={faCommentDots} />
                    <span>
                      조금 더 이야기하고 싶어요
                      <small>양털 1개가 소모돼요.</small>
                    </span>
                    <FontAwesomeIcon icon={faChevronRight} />
                  </Button>
                )}
                <p className={styles.woolBalance} aria-live="polite">
                  {woolBalance === null
                    ? '보유 양털을 확인할 수 없어요.'
                    : `보유 양털 ${woolBalance}개`}
                </p>
                {woolShortage && (
                  <p className={styles.woolShortage} role="status">
                    양털이 부족해요. ‘내 그림 정리하기’로 대화를 마칠 수 있어요.
                  </p>
                )}
              </div>
            )}
          </ConversationMessages>

          {conversation.status !== 'support' && (
            <div
              className={styles.composer}
              ref={composer}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && showReplies) {
                  restoreReplyFocus.current = true
                  setShowReplies(false)
                }
              }}
              onBlur={(event) => {
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                  setShowReplies(false)
                }
              }}
            >
              {isAsking && !showReplies && (
                <button
                  type="button"
                  className={styles.replyToggle}
                  ref={replyToggle}
                  disabled={isPending || mustRetryServerAction}
                  onClick={() => setShowReplies(true)}
                >
                  답하기 어려워요
                  <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                </button>
              )}
              {showReplies && (
                <div className={styles.quickReplies} role="group" aria-label="빠른 답변">
                  <button
                    type="button"
                    ref={firstReply}
                    onClick={() => void runAction({ type: 'DONT_KNOW' })}
                  >
                    {getReplyText({ type: 'DONT_KNOW' })}
                    <span>답하고 싶은데 말이 잘 안 떠오를 때</span>
                  </button>
                  <button type="button" onClick={() => void runAction({ type: 'SKIP' })}>
                    {getReplyText({ type: 'SKIP' })}
                    <span>이 질문에 답하고 싶지 않을 때</span>
                  </button>
                </div>
              )}
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault()
                  const text = input.trim()
                  if (text && isAsking) {
                    void runAction({ type: 'ANSWER', text })
                  }
                }}
              >
                <input
                  aria-label="답변 입력"
                  maxLength={server ? 1000 : undefined}
                  placeholder="그림에 담긴 이야기를 적어 주세요"
                  value={input}
                  readOnly={isPending || mustRetryServerAction}
                  disabled={!isAsking}
                  onFocus={() => setShowReplies(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
                      event.preventDefault()
                    }
                  }}
                  onChange={(event) => {
                    setInput(event.target.value)
                    if (retry?.type === 'ANSWER') setRetry(null)
                  }}
                />
                <button
                  type="submit"
                  className={styles.send}
                  aria-label="전송"
                  disabled={!input.trim() || isPending || mustRetryServerAction || !isAsking}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
              </form>
            </div>
          )}
        </>
      ) : (
        <ConversationLoading
          image={image}
          failed={startFailed}
          onRetry={() => {
            setStartFailed(false)
            setStartAttempt((attempt) => attempt + 1)
          }}
        />
      )}
    </div>
  )
}
