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
import { useModal } from '@/hooks/useModal'
import { ConversationLoading } from './ConversationLoading'
import { ConversationBubble, ConversationMessages } from './ConversationMessages'
import {
  earnDrawingReward,
  getReplyText,
  startConversation,
  supportMessage,
  updateConversation,
} from './conversationMock'
import type { Conversation, ConversationAction, ConversationDrawing } from './conversationMock'
import styles from './DrawingConversation.module.css'

type DrawingConversationProps = {
  drawing: ConversationDrawing
  activityId?: number
  isPreview: boolean
  scenario: string | null
  onBack: () => void
}

const readConversation = (key: string): Conversation | null => {
  try {
    const saved = sessionStorage.getItem(key)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

const saveConversation = (key: string, conversation: Conversation | null) => {
  try {
    if (conversation) sessionStorage.setItem(key, JSON.stringify(conversation))
    else sessionStorage.removeItem(key)
  } catch {
    return
  }
}

const isDialogBackdrop = ({ target, clientX, clientY }: MouseEvent<HTMLDivElement>) => {
  if (!(target instanceof HTMLDialogElement)) return false
  const { left, top, right, bottom } = target.getBoundingClientRect()
  return clientX < left || clientX >= right || clientY < top || clientY >= bottom
}

export const DrawingConversation = ({
  drawing,
  activityId,
  isPreview,
  scenario,
  onBack,
}: DrawingConversationProps) => {
  const storageKey = `moyang:mock-conversation:${drawing.drawingId}:${scenario ?? 'default'}`
  const [conversation, setConversation] = useState(() => {
    const saved = readConversation(storageKey)
    return isPreview && saved?.status === 'ended' ? null : saved
  })
  const [startAttempt, setStartAttempt] = useState(0)
  const [startFailed, setStartFailed] = useState(false)
  const [input, setInput] = useState('')
  const [showReplies, setShowReplies] = useState(false)
  const { isOpen: isDrawingOpen, openModal: openDrawing, closeModal: closeDrawing } = useModal()
  const [pending, setPending] = useState<ConversationAction | null>(null)
  const [retry, setRetry] = useState<ConversationAction | null>(null)
  const request = useRef<ConversationAction | null>(null)
  const startedOnBackdrop = useRef(false)
  const mockFailed = useRef(false)
  const messageList = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLDivElement>(null)
  const replyToggle = useRef<HTMLButtonElement>(null)
  const firstReply = useRef<HTMLButtonElement>(null)
  const restoreReplyFocus = useRef(false)
  const isAsking = conversation?.status === 'asking'
  const isPending = pending !== null

  useEffect(() => {
    earnDrawingReward(drawing.drawingId)
  }, [drawing.drawingId])

  useEffect(() => {
    if (conversation || scenario === 'loading') return

    let active = true
    startConversation(scenario === 'start-error' && startAttempt === 0).then(
      (started) => {
        if (!active) return
        saveConversation(storageKey, started)
        setConversation(started)
      },
      () => {
        if (active) setStartFailed(true)
      },
    )

    return () => {
      active = false
    }
  }, [conversation, scenario, startAttempt, storageKey])

  useEffect(
    () => () => {
      request.current = null
    },
    [],
  )

  useLayoutEffect(() => {
    const list = messageList.current
    if (list) list.scrollTop = list.scrollHeight
  }, [conversation, pending, retry, showReplies])

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
    if (!conversation || request.current) return

    request.current = action
    setPending(action)
    setRetry(null)
    setShowReplies(false)

    const isEnd = action.type === 'END'
    const fail = !mockFailed.current && scenario === (isEnd ? 'end-error' : 'reply-error')

    try {
      const updated = await updateConversation(conversation, action, fail, scenario === 'support')
      if (request.current !== action) return

      saveConversation(storageKey, isPreview && isEnd ? null : updated)
      setConversation(updated)
      if (getReplyText(action)) setInput('')
    } catch {
      if (request.current !== action) return
      mockFailed.current = true
      setRetry(action)
    } finally {
      if (request.current === action) {
        request.current = null
        setPending(null)
      }
    }
  }

  if (conversation?.status === 'ended') {
    return <Navigate replace to="/drawing/result" state={{ drawing, conversation, activityId }} />
  }

  const pendingReply = pending ? getReplyText(pending) : ''
  const drawingNote = drawing.note?.trim()
  const image = drawing.imageUrl ? (
    <img className={styles.drawingImage} src={drawing.imageUrl} alt={drawing.title} />
  ) : (
    <span className={styles.drawingPlaceholder} aria-hidden="true">
      그림
    </span>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={onBack} aria-label="뒤로 가기">
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        {conversation && (
          <button
            className={styles.end}
            type="button"
            disabled={isPending}
            onClick={() => void runAction({ type: 'END' })}
          >
            대화 종료
          </button>
        )}
      </header>

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
                  {retry.type === 'END' ? '대화를 마치지 못했어요.' : '응답을 불러오지 못했어요.'}
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
                  disabled={isPending}
                  onClick={() => void runAction({ type: 'END' })}
                >
                  <FontAwesomeIcon icon={faClipboard} />
                  내 그림 정리하기
                  <FontAwesomeIcon icon={faChevronRight} />
                </Button>
                <Button
                  color="gray"
                  disabled={isPending}
                  onClick={() => void runAction({ type: 'CONTINUE' })}
                >
                  <FontAwesomeIcon icon={faCommentDots} />
                  조금 더 이야기하고 싶어요
                  <FontAwesomeIcon icon={faChevronRight} />
                </Button>
              </div>
            )}

            {conversation.status === 'support' && (
              <ConversationBubble role="assistant" text={supportMessage} />
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
                  disabled={isPending}
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
                  placeholder="그림에 담긴 이야기를 적어 주세요"
                  value={input}
                  readOnly={isPending}
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
                  disabled={!input.trim() || isPending || !isAsking}
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
