import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import type { To } from 'react-router-dom'
import backArrow from '@/assets/drawing-result/back-arrow.svg'
import chevronDown from '@/assets/drawing-result/chevron-down.svg'
import conversationChevron from '@/assets/drawing-result/conversation-chevron.svg'
import detailMeaning from '@/assets/drawing-result/detail-meaning.svg'
import detailThoughts from '@/assets/drawing-result/detail-thoughts.svg'
import nextArrow from '@/assets/drawing-result/next-arrow.svg'
import woolReward from '@/assets/drawing-result/wool-reward.png'
import { Button, Modal } from '@/components'
import { ConversationMessages } from '@/features/drawing-conversation/ConversationMessages'
import { discardConversation } from '@/features/drawing-conversation/conversationMock'
import chatStyles from '@/features/drawing-conversation/DrawingConversation.module.css'
import { useModal } from '@/hooks/useModal'
import { readReflections } from '@/lib/mock-reflections'
import type { MockRecord } from '@/lib/mock-reflections'
import { completeProgramActivity } from '@/features/personal-program/programMock'
import type { FirstReflection } from '@/features/personal-program/programSchedule'
import { loadProgramConcern } from './programConcern'
import {
  createReflectionPreview,
  getReflectionSaveStatus,
  loadDrawingResult,
  saveDrawingResult,
} from './resultMock'
import type { DrawingResultData, DrawingResultSource } from './resultMock'
import styles from './DrawingResult.module.css'

type DrawingResultProps = {
  source: DrawingResultSource | null
  scenario: string | null
  showConversation: boolean
  onOpenConversation: () => void
  onCloseConversation: () => void
  onDiscard: () => void
}

type ExitDestination = '/home' | '/drawing' | '/sessions'
type Destination = ExitDestination | '/meetings'
type SaveFailure = { destination: Destination; recordSaved: boolean }

const nextActivities = [
  {
    destination: '/meetings',
    title: '함께 그림 나누기',
    description: '비슷한 고민을 가진 사람과 그림을 나눠요.',
  },
  {
    destination: '/sessions',
    title: '나만의 모양 만들기',
    description: '하나의 고민을 그림과 대화로 더 깊이 알아가요.',
  },
] as const

export const DrawingResult = ({
  source,
  scenario,
  showConversation,
  onOpenConversation,
  onCloseConversation,
  onDiscard,
}: DrawingResultProps) => {
  const navigate = useNavigate()
  const [result, setResult] = useState<DrawingResultData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const [savingDestination, setSavingDestination] = useState<Destination | null>(null)
  const [concernFailed, setConcernFailed] = useState(false)
  const [failedSave, setFailedSave] = useState<SaveFailure | null>(null)
  const [dailyLimitExit, setDailyLimitExit] = useState<ExitDestination | null>(null)
  const [activityUnavailable, setActivityUnavailable] = useState(false)
  const [reward, setReward] = useState<{ destination: Destination; amount: number } | null>(null)
  const { isOpen: showLeave, openModal: openLeave, closeModal: closeLeave } = useModal()
  const activeSave = useRef<AbortController | null>(null)
  const saveHandled = useRef(false)
  const savedReflection = useRef<MockRecord | undefined>(undefined)
  const pendingReward = useRef<number | null>(null)
  const mockSaveFailed = useRef(false)
  const conversationButton = useRef<HTMLButtonElement>(null)
  const closeConversationButton = useRef<HTMLButtonElement>(null)
  const openedConversation = useRef(false)
  const isSaving = savingDestination !== null
  const programActivity = source?.programActivity
  const programScenario = import.meta.env.DEV ? programActivity?.mock : undefined
  const previewWallet = scenario === 'wool' || scenario === 'wool-session'
  const [preview] = useState(() => createReflectionPreview(scenario, source))
  const readSaveStatus = () => {
    if (!source) return null
    try {
      return getReflectionSaveStatus(
        preview ?? readReflections(previewWallet),
        source.drawing.drawingId,
      )
    } catch {
      return null
    }
  }
  const [recordSaved, setRecordSaved] = useState(() => readSaveStatus() === 'already-saved')
  const savingLabel = recordSaved ? '이동 중…' : '기록 저장 중…'

  const programUrl = programActivity
    ? {
        pathname: '/sessions',
        search: new URLSearchParams({
          programId: programActivity.programId,
          ...(programScenario && { mock: programScenario }),
        }).toString(),
      }
    : null
  const backLabel = !source
    ? '홈으로 돌아가기'
    : programUrl
      ? '모양으로 돌아가기'
      : '그리기로 돌아가기'
  const finishDestination = programActivity ? '/sessions' : '/home'
  const backDestination = programActivity ? '/sessions' : '/drawing'

  useEffect(() => {
    if (!source || result) return

    let active = true
    loadDrawingResult(source, scenario === 'load-error' && loadAttempt === 0).then(
      (data) => {
        if (active) setResult(data)
      },
      () => {
        if (active) setLoadFailed(true)
      },
    )

    return () => {
      active = false
    }
  }, [source, scenario, loadAttempt, result])

  useEffect(() => () => activeSave.current?.abort(), [])

  useLayoutEffect(() => {
    if (showConversation && result) {
      closeConversationButton.current?.focus({ preventScroll: true })
      openedConversation.current = true
    } else if (!showConversation && openedConversation.current) {
      conversationButton.current?.focus({ preventScroll: true })
      openedConversation.current = false
    }
  }, [showConversation, result])

  const discardResult = () => {
    onDiscard()
    if (source?.conversationStorageKey) {
      discardConversation(source.conversationStorageKey, source.conversation.id)
    }
  }
  const exitResult = (destination: To) => {
    if (!recordSaved && readSaveStatus() !== 'already-saved') discardResult()
    navigate(destination, { replace: true })
  }
  const goHome = () => exitResult('/home')
  const leaveResult = () => exitResult(programUrl ?? backDestination)
  const handleBack = () => {
    const status = readSaveStatus()
    if (!recordSaved && status === 'daily-limit') {
      setDailyLimitExit(backDestination)
      return
    }
    if (status === 'already-saved') setRecordSaved(true)
    openLeave()
  }
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => {
    const sameResult =
      currentLocation.pathname === nextLocation.pathname &&
      (currentLocation.state?.resultKey ?? currentLocation.key) ===
        (nextLocation.state?.resultKey ?? nextLocation.key)
    if (!source || historyAction !== 'POP' || sameResult || (recordSaved && !isSaving && !reward)) {
      return false
    }
    if (!isSaving && !reward && !failedSave && !dailyLimitExit && !activityUnavailable) {
      handleBack()
    }
    return true
  })

  useEffect(() => {
    if (blocker.state === 'blocked') blocker.reset()
  }, [blocker])

  const saveRecord = async (destination: Destination) => {
    if (!result || activeSave.current) return

    const controller = new AbortController()
    const { signal } = controller
    activeSave.current = controller
    setSavingDestination(destination)
    setConcernFailed(false)
    let savedBeforeFailure = recordSaved

    try {
      if (!saveHandled.current) {
        const saved = await saveDrawingResult(result, {
          preview,
          previewWallet,
          fail: scenario === 'save-error' && !mockSaveFailed.current,
          signal,
          activity: programActivity,
        })
        if (signal.aborted) return
        setFailedSave(null)

        if (saved.status === 'daily-limit') {
          setDailyLimitExit(destination === '/drawing' ? '/drawing' : finishDestination)
          return
        }
        if (saved.status === 'activity-unavailable') {
          setActivityUnavailable(true)
          return
        }

        savedBeforeFailure = true
        const otherDrawingSaved =
          saved.status === 'already-saved' &&
          saved.record !== undefined &&
          saved.record.drawingId !== result.drawing.drawingId
        if (!otherDrawingSaved) setRecordSaved(true)
        if (saved.status === 'saved') pendingReward.current = saved.sheepReward
        else savedReflection.current = saved.record
        if (programActivity) {
          const canApplyProgress = saved.status === 'saved' || saved.record || preview
          if (!canApplyProgress || !completeProgramActivity(programActivity, programScenario)) {
            setActivityUnavailable(true)
            return
          }
          if (otherDrawingSaved) discardResult()
        }
        saveHandled.current = true

        if (pendingReward.current !== null) {
          setReward({ destination, amount: pendingReward.current })
          pendingReward.current = null
          return
        }
      }

      if (destination === '/sessions') {
        if (programUrl && programActivity) {
          navigate(programUrl, { replace: true, state: { completedRound: programActivity.round } })
          return
        }

        const concern =
          result.drawing.concern ?? (await loadProgramConcern(signal).catch(() => undefined))
        if (signal.aborted) return
        if (!concern) {
          setConcernFailed(true)
          return
        }

        const firstReflection: FirstReflection = {
          id: result.drawing.drawingId,
          concern,
          title: savedReflection.current?.title ?? result.drawing.title,
          story: savedReflection.current?.card?.todaysStory ?? result.card.todaysStory,
        }
        navigate(
          preview || previewWallet ? { pathname: destination, search: '?mock=setup' } : destination,
          { replace: true, state: { firstReflection } },
        )
        return
      }

      navigate(destination, { replace: true })
    } catch {
      if (signal.aborted) return
      mockSaveFailed.current = true
      setFailedSave({ destination, recordSaved: savedBeforeFailure })
    } finally {
      activeSave.current = null
      if (!signal.aborted) setSavingDestination(null)
    }
  }

  const confirmReward = () => {
    if (!reward) return
    setReward(null)
    void saveRecord(reward.destination)
  }

  const detailItems = [
    { label: '내가 말한 내용', icon: detailMeaning, text: result?.card.whatISaid?.trim() },
    { label: '대화에서 떠올린 생각', icon: detailThoughts, text: result?.card.thoughts?.trim() },
  ].filter(({ text }) => text)
  const imageUrl = imageFailed ? undefined : result?.drawing.imageUrl
  const isReadingConversation = showConversation && result !== null
  const canSaveOnLeave = !recordSaved && result !== null
  const failedLeavingForDrawing = failedSave?.destination === '/drawing'

  return (
    <>
      <div className={styles.page} hidden={isReadingConversation}>
        <header className={chatStyles.header}>
          <button
            type="button"
            className={chatStyles.back}
            aria-label={backLabel}
            aria-haspopup={source ? 'dialog' : undefined}
            onClick={source ? handleBack : goHome}
            disabled={isSaving}
          >
            <img src={backArrow} alt="" />
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.intro}>
            <h1 className="text-heading">오늘의 마음을 살펴볼까요?</h1>
            <p className={styles.notice}>
              ‘모양’은 미술 활동과 AI 대화를 통해 감정을 표현하고 자신을 이해할 수 있도록 돕는
              서비스입니다.
              <br />
              전문적인 심리상담이나 의학적·심리학적 진단 및 치료를 대체하지 않습니다.
              <br />
              정서적 어려움이 지속되거나 심각한 경우 전문가와 상담하시기 바랍니다.
            </p>
          </div>

          {!source ? (
            <div className={styles.state}>
              <p role="status">그림 대화 결과를 찾을 수 없어요.</p>
              <Button color="gray" onClick={goHome}>
                홈으로
              </Button>
            </div>
          ) : loadFailed ? (
            <div className={styles.state}>
              <p role="alert">결과를 불러오지 못했어요.</p>
              <Button
                color="gray"
                onClick={() => {
                  setLoadFailed(false)
                  setLoadAttempt((attempt) => attempt + 1)
                }}
              >
                다시 시도
              </Button>
            </div>
          ) : !result ? (
            <div className={styles.state} role="status">
              그림 이야기를 불러오고 있어요.
            </div>
          ) : (
            <>
              <figure className={styles.drawing}>
                <div className={styles.imageFrame}>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={result.drawing.title}
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    <span>그림을 불러올 수 없어요</span>
                  )}
                </div>
                <figcaption className="text-choice">{result.drawing.title}</figcaption>
              </figure>

              <Button
                className={styles.conversationButton}
                ref={conversationButton}
                onClick={onOpenConversation}
                disabled={isSaving}
              >
                대화 내용 보기
                <img src={conversationChevron} alt="" />
              </Button>

              <section className={styles.story} aria-labelledby="result-story">
                <h2 id="result-story" className="text-choice">
                  종합 이야기
                </h2>
                <p className="text-caption">
                  오늘의 그림과 대화에서 나눈 마음을 하나의 이야기로 정리해 드려요.
                </p>
                <p className={styles.reflection}>{result.card.todaysStory}</p>
              </section>

              {detailItems.length > 0 && (
                <section className={styles.details} aria-labelledby="result-details">
                  <h2 id="result-details" className="text-body">
                    그림 자세히 살펴보기
                  </h2>
                  <p className="text-caption">그림을 보며 나눈 이야기를 다시 살펴봐요.</p>
                  <div className={styles.detailItems}>
                    {detailItems.map(({ label, icon, text }) => (
                      <details key={label}>
                        <summary>
                          <img src={icon} alt="" />
                          <span>{label}</span>
                          <img className={styles.detailChevron} src={chevronDown} alt="" />
                        </summary>
                        <p className={styles.reflection}>{text}</p>
                      </details>
                    ))}
                  </div>
                </section>
              )}

              {!programActivity && (
                <section className={styles.next} aria-labelledby="result-next">
                  <h2 id="result-next" className="text-choice">
                    오늘의 마음을 이어가 볼까요?
                  </h2>
                  <p className="text-caption">
                    {recordSaved
                      ? '이미 저장한 회고예요. 양털은 처음 저장할 때 받아요.'
                      : '하루 첫 회고만 개인 기록에 저장해요.'}
                  </p>
                  {nextActivities.map(({ destination, title, description }) => (
                    <Button
                      key={destination}
                      className={styles.nextButton}
                      color="gray"
                      disabled={isSaving}
                      aria-busy={savingDestination === destination}
                      onClick={() => void saveRecord(destination)}
                    >
                      <span>{title}</span>
                      <span>{savingDestination === destination ? savingLabel : description}</span>
                      <img src={nextArrow} alt="" />
                    </Button>
                  ))}
                  {concernFailed && (
                    <p className="text-caption" role="alert">
                      선택한 고민을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.
                    </p>
                  )}
                </section>
              )}

              {isSaving && !failedSave && !dailyLimitExit && (
                <p className={styles.saveStatus} role="status">
                  {recordSaved ? '다음 화면으로 이동하고 있어요.' : '기록을 저장하고 있어요.'}
                </p>
              )}
              <Button
                className={styles.finish}
                onClick={() => void saveRecord(finishDestination)}
                disabled={isSaving}
                aria-busy={savingDestination === finishDestination}
              >
                {savingDestination === finishDestination ? savingLabel : '오늘의 활동 마치기'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showLeave}
        onClose={closeLeave}
        title={programActivity ? '모양으로 돌아갈까요?' : '결과 화면을 나갈까요?'}
        actions={[
          canSaveOnLeave
            ? {
                label: '저장하기',
                onClick: () => {
                  closeLeave()
                  void saveRecord(backDestination)
                },
              }
            : { label: '결과 계속 보기', color: 'gray', onClick: closeLeave },
          {
            label: recordSaved ? backLabel : '저장하지 않고 나가기',
            color: canSaveOnLeave ? 'gray' : 'green',
            onClick: leaveResult,
          },
        ]}
      >
        {recordSaved
          ? '이번 회고는 개인 기록에 남아 있어요.'
          : canSaveOnLeave
            ? '회고를 저장하실 건가요?'
            : '결과를 불러온 뒤에 회고를 저장할 수 있어요.'}
      </Modal>

      {failedSave && (
        <div className={styles.saveErrorDialog}>
          <Modal
            isOpen
            onClose={() => {
              if (!isSaving) setFailedSave(null)
            }}
            title={
              failedSave.recordSaved
                ? '활동 진행률을 반영하지 못했어요.'
                : '기록을 저장하지 못했어요.'
            }
            actions={[
              {
                label: isSaving ? '처리 중…' : '다시 시도',
                onClick: () => void saveRecord(failedSave.destination),
                disabled: isSaving,
              },
              {
                label: programActivity
                  ? '모양으로 돌아가기'
                  : failedLeavingForDrawing
                    ? '저장 없이 나가기'
                    : failedSave.recordSaved
                      ? '홈으로'
                      : '저장 없이 홈으로',
                color: 'gray',
                onClick: programActivity || failedLeavingForDrawing ? leaveResult : goHome,
                disabled: isSaving,
              },
            ]}
          >
            {isSaving ? (
              <p role="status">
                {failedSave.recordSaved
                  ? '활동 진행률을 다시 반영하고 있어요.'
                  : '기록을 다시 저장하고 있어요.'}
              </p>
            ) : failedSave.recordSaved ? (
              '회고는 저장했어요. 다시 시도하면 활동 진행률을 반영할 수 있어요.'
            ) : programActivity ? (
              '다시 시도하거나 모양 화면으로 돌아갈 수 있어요.'
            ) : failedLeavingForDrawing ? (
              '다시 시도하거나 그리기 화면으로 돌아갈 수 있어요.'
            ) : (
              '다시 시도하거나 홈으로 돌아갈 수 있어요.'
            )}
          </Modal>
        </div>
      )}

      {dailyLimitExit && (
        <Modal
          isOpen
          onClose={() => setDailyLimitExit(null)}
          title="오늘의 회고는 이미 저장했어요."
          actions={[
            { label: '결과로 돌아가기', onClick: () => setDailyLimitExit(null) },
            {
              label: '저장 없이 나가기',
              color: 'gray',
              onClick: dailyLimitExit === '/home' ? goHome : leaveResult,
            },
          ]}
        >
          회고 저장과 양털 받기는 하루에 한 번만 가능해요.
          <br />이 화면을 나가면 다시 볼 수 없어요.
        </Modal>
      )}

      {activityUnavailable && (
        <Modal
          isOpen
          onClose={() => setActivityUnavailable(false)}
          title="이 회차를 완료할 수 없어요."
          actions={[{ label: '모양으로 돌아가기', onClick: leaveResult }]}
        >
          모양 화면에서 현재 일정을 확인해 주세요.
        </Modal>
      )}

      {reward && (
        <div className={styles.rewardDialog}>
          <Modal isOpen onClose={confirmReward} ariaLabel="회고 저장 및 양털 획득">
            <div className={styles.reward}>
              <div className={styles.rewardGraphic} tabIndex={-1} autoFocus>
                <img src={woolReward} alt="" />
                <h2 className={styles.rewardMessage}>
                  <strong>양털 {reward.amount}개</strong>를
                  <br />
                  받았어요.
                </h2>
              </div>
              <p className={styles.rewardNote}>오늘의 회고를 저장했어요.</p>
              <Button className={styles.rewardConfirm} onClick={confirmReward}>
                확인
              </Button>
            </div>
          </Modal>
        </div>
      )}
      {isReadingConversation && (
        <div className={chatStyles.page}>
          <header className={`${chatStyles.header} ${styles.historyHeader}`}>
            <button
              type="button"
              className={chatStyles.back}
              ref={closeConversationButton}
              aria-label="결과로 돌아가기"
              onClick={onCloseConversation}
            >
              <img src={backArrow} alt="" />
            </button>
            <h1 className="text-choice">대화 내용</h1>
          </header>
          <div className={chatStyles.drawingHeading}>
            <div className={chatStyles.drawingCard}>
              {imageUrl ? (
                <img className={chatStyles.drawingImage} src={imageUrl} alt="" />
              ) : (
                <span className={chatStyles.drawingPlaceholder} aria-hidden="true">
                  그림
                </span>
              )}
              <span className={chatStyles.drawingTitle}>
                <span className="text-caption">오늘의 그림</span>
                <span className={`text-body ${chatStyles.drawingName}`}>
                  {result.drawing.title}
                </span>
              </span>
            </div>
          </div>
          <ConversationMessages messages={result.messages} readOnly>
            {!result.messages.length && <p className="text-body">남아 있는 대화가 없어요.</p>}
          </ConversationMessages>
        </div>
      )}
    </>
  )
}
