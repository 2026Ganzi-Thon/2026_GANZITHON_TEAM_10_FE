import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import backArrow from '@/assets/drawing-result/back-arrow.svg'
import chevronDown from '@/assets/drawing-result/chevron-down.svg'
import conversationChevron from '@/assets/drawing-result/conversation-chevron.svg'
import detailMeaning from '@/assets/drawing-result/detail-meaning.svg'
import detailThoughts from '@/assets/drawing-result/detail-thoughts.svg'
import nextArrow from '@/assets/drawing-result/next-arrow.svg'
import woolReward from '@/assets/drawing-result/wool-reward.png'
import { Button, Modal } from '@/components'
import { ConversationMessages } from '@/features/drawing-conversation/ConversationMessages'
import {
  confirmDrawingReward,
  hasPendingDrawingReward,
} from '@/features/drawing-conversation/conversationMock'
import chatStyles from '@/features/drawing-conversation/DrawingConversation.module.css'
import { useModal } from '@/hooks/useModal'
import { completeProgramActivity } from '@/features/personal-program/programMock'
import type { ProgramStartReflection } from '@/features/personal-program/programSchedule'
import { loadProgramConcern } from './programConcern'
import { ReflectionSavedToastContext } from './reflectionSavedToast'
import { createReflectionPreview, loadDrawingResult, saveDrawingResult } from './resultMock'
import type { DrawingResultData, DrawingResultSource, MockRecord } from './resultMock'
import styles from './DrawingResult.module.css'

type DrawingResultProps = {
  source: DrawingResultSource | null
  rewardDrawingId?: number
  scenario: string | null
  showConversation: boolean
  onOpenConversation: () => void
  onCloseConversation: () => void
}

type Destination = '/home' | '/sessions' | '/meetings'
type SaveRequest = { destination: Destination; replaces?: MockRecord }
type SaveConflict = { destination: Destination; record: MockRecord }

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
  rewardDrawingId,
  scenario,
  showConversation,
  onOpenConversation,
  onCloseConversation,
}: DrawingResultProps) => {
  const navigate = useNavigate()
  const showSavedToast = useContext(ReflectionSavedToastContext)
  const [result, setResult] = useState<DrawingResultData | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [imageFailed, setImageFailed] = useState(false)
  const [recordSaved, setRecordSaved] = useState(false)
  const [savingDestination, setSavingDestination] = useState<Destination | null>(null)
  const [concernFailed, setConcernFailed] = useState(false)
  const [failedSave, setFailedSave] = useState<SaveRequest | null>(null)
  const [saveConflict, setSaveConflict] = useState<SaveConflict | null>(null)
  const [showReward, setShowReward] = useState(
    () =>
      scenario === 'reward' ||
      (rewardDrawingId !== undefined && hasPendingDrawingReward(rewardDrawingId)),
  )
  const { isOpen: showLeave, openModal: openLeave, closeModal: closeLeave } = useModal()
  const activeSave = useRef<SaveRequest | null>(null)
  const resolvedConcern = useRef<ProgramStartReflection['concern'] | undefined>(undefined)
  const mockSaveFailed = useRef(false)
  const preview = useRef(createReflectionPreview(scenario))
  const conversationButton = useRef<HTMLButtonElement>(null)
  const closeConversationButton = useRef<HTMLButtonElement>(null)
  const openedConversation = useRef(false)
  const isSaving = savingDestination !== null
  const programActivity = source?.programActivity
  const programScenario = import.meta.env.DEV ? programActivity?.mock : undefined

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

  useEffect(
    () => () => {
      activeSave.current = null
    },
    [],
  )

  useLayoutEffect(() => {
    if (showConversation && result) {
      closeConversationButton.current?.focus({ preventScroll: true })
      openedConversation.current = true
    } else if (!showConversation && openedConversation.current) {
      conversationButton.current?.focus({ preventScroll: true })
      openedConversation.current = false
    }
  }, [showConversation, result])

  const goHome = () => navigate('/home', { replace: true })
  const goToDrawing = () => navigate('/drawing', { replace: true })
  const confirmReward = () => {
    if (rewardDrawingId !== undefined) confirmDrawingReward(rewardDrawingId)
    setShowReward(false)
  }

  const keepExistingRecord = ({ destination }: SaveConflict) => {
    setSaveConflict(null)
    if (destination !== '/sessions') navigate(destination, { replace: true })
  }

  const saveRecord = async (request: SaveRequest) => {
    if (!result || activeSave.current || showReward) return
    const { destination, replaces } = request

    activeSave.current = request
    setSavingDestination(destination)
    setConcernFailed(false)

    try {
      let firstReflection: ProgramStartReflection | undefined
      if (destination === '/sessions' && !programActivity) {
        const concern =
          result.drawing.concern ??
          resolvedConcern.current ??
          (await loadProgramConcern().catch(() => undefined))
        if (activeSave.current !== request) return
        if (!concern) {
          setConcernFailed(true)
          return
        }
        resolvedConcern.current = concern
        firstReflection = {
          id: result.drawing.drawingId,
          concern,
          title: result.drawing.title,
          story: result.card.todaysStory,
        }
      }
      const continueActivity = () => {
        if (destination === '/sessions' && programActivity) {
          const search = new URLSearchParams({ programId: programActivity.programId })
          if (programScenario) search.set('mock', programScenario)
          navigate({ pathname: destination, search: `?${search}` }, { replace: true })
          return
        }
        navigate(destination, {
          replace: true,
          state: firstReflection ? { firstReflection } : undefined,
        })
      }

      if (recordSaved) {
        continueActivity()
        return
      }

      const fail =
        scenario === (replaces ? 'replace-error' : 'save-error') && !mockSaveFailed.current
      const saved = await saveDrawingResult(result.drawing, {
        preview: preview.current,
        fail,
        replaces,
      })
      if (activeSave.current !== request) return
      setFailedSave(null)

      if (saved.status === 'daily-limit') {
        setSaveConflict({ destination, record: saved.record })
        return
      }

      if (programActivity) completeProgramActivity(programActivity, programScenario)
      setSaveConflict(null)
      setRecordSaved(true)
      if (saved.status === 'saved') showSavedToast?.()
      continueActivity()
    } catch {
      if (activeSave.current !== request) return
      mockSaveFailed.current = true
      setSaveConflict(null)
      setFailedSave(request)
    } finally {
      if (activeSave.current === request) {
        activeSave.current = null
        setSavingDestination(null)
      }
    }
  }

  const detailItems = [
    { label: '내가 말한 내용', icon: detailMeaning, text: result?.card.whatISaid?.trim() },
    { label: '대화에서 떠올린 생각', icon: detailThoughts, text: result?.card.thoughts?.trim() },
  ].filter(({ text }) => text)
  const imageUrl = imageFailed ? undefined : result?.drawing.imageUrl
  const isReadingConversation = showConversation && result !== null

  return (
    <>
      <div className={styles.page} hidden={isReadingConversation}>
        <header className={chatStyles.header}>
          <button
            type="button"
            className={chatStyles.back}
            aria-label="그리기로 돌아가기"
            aria-haspopup={source ? 'dialog' : undefined}
            onClick={source ? openLeave : goToDrawing}
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

              <section className={styles.next} aria-labelledby="result-next">
                <h2 id="result-next" className="text-choice">
                  오늘의 마음을 이어가 볼까요?
                </h2>
                <p className="text-caption">
                  {recordSaved
                    ? '이번 회고를 개인 기록에 저장했어요.'
                    : '활동을 마치거나 이어가면 이번 회고를 개인 기록에 저장해요.'}
                </p>
                {nextActivities.map(({ destination, title, description }) => (
                  <Button
                    key={destination}
                    className={styles.nextButton}
                    color="gray"
                    disabled={isSaving}
                    aria-busy={savingDestination === destination}
                    onClick={() => void saveRecord({ destination })}
                  >
                    <span>{title}</span>
                    <span>{savingDestination === destination ? '기록 저장 중…' : description}</span>
                    <img src={nextArrow} alt="" />
                  </Button>
                ))}
                {concernFailed && (
                  <p className="text-caption" role="alert">
                    선택한 고민을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.
                  </p>
                )}
              </section>

              {isSaving && !failedSave && !saveConflict && (
                <p className={styles.saveStatus} role="status">
                  기록을 저장하고 있어요.
                </p>
              )}
              <Button
                className={styles.finish}
                onClick={() => void saveRecord({ destination: '/home' })}
                disabled={isSaving}
                aria-busy={savingDestination === '/home'}
              >
                {savingDestination === '/home' ? '기록 저장 중…' : '오늘의 활동 마치기'}
              </Button>
            </>
          )}
        </div>

        <Modal
          isOpen={showLeave}
          onClose={closeLeave}
          title="결과 화면을 나갈까요?"
          actions={[
            { label: '결과 계속 보기', color: 'gray', onClick: closeLeave },
            { label: recordSaved ? '그리기로 돌아가기' : '저장 없이 나가기', onClick: goToDrawing },
          ]}
        >
          {recordSaved
            ? '이번 회고는 개인 기록에 남아 있어요.'
            : '회고를 저장하려면 결과 화면 아래의 버튼을 눌러 주세요.'}
        </Modal>

        {failedSave && (
          <div className={styles.saveErrorDialog}>
            <Modal
              isOpen
              onClose={() => {
                if (!isSaving) setFailedSave(null)
              }}
              title="기록을 저장하지 못했어요."
              actions={[
                {
                  label: isSaving ? '저장 중…' : '다시 시도',
                  onClick: () => void saveRecord(failedSave),
                  disabled: isSaving,
                },
                { label: '저장 없이 홈으로', color: 'gray', onClick: goHome, disabled: isSaving },
              ]}
            >
              {isSaving ? (
                <p role="status">기록을 다시 저장하고 있어요.</p>
              ) : (
                '다시 시도하거나 홈으로 돌아갈 수 있어요.'
              )}
            </Modal>
          </div>
        )}

        {saveConflict && (
          <Modal
            isOpen
            onClose={() => {
              if (!isSaving) setSaveConflict(null)
            }}
            title="오늘의 기록을 바꿀까요?"
            actions={[
              {
                label: '기존 기록 유지',
                color: 'gray',
                disabled: isSaving,
                onClick: () => keepExistingRecord(saveConflict),
              },
              {
                label: isSaving ? '저장 중…' : '이번 회고로 교체',
                disabled: isSaving,
                onClick: () =>
                  void saveRecord({
                    destination: saveConflict.destination,
                    replaces: saveConflict.record,
                  }),
              },
            ]}
          >
            <div className={styles.conflictContent}>
              <p>하루에 한 건을 기록할 수 있어요. 교체하면 오늘 기록에 이번 회고가 남아요.</p>
              {saveConflict.record.title && <p>기존 기록 · {saveConflict.record.title}</p>}
              <p>이번 회고 · {result?.drawing.title}</p>
              {isSaving && <p role="status">오늘의 기록을 바꾸고 있어요.</p>}
            </div>
          </Modal>
        )}

        {result && showReward && !isReadingConversation && (
          <div className={styles.rewardDialog}>
            <Modal isOpen onClose={confirmReward} ariaLabel="양털 1개를 획득했어요!">
              <div className={styles.reward}>
                <div className={styles.rewardGraphic} tabIndex={-1} autoFocus>
                  <img src={woolReward} alt="" />
                  <h2 className="text-heading">
                    <strong>양털 1개</strong>를
                    <br />
                    획득했어요!
                  </h2>
                </div>
                <p>
                  그림을 한 번 완성할 때마다
                  <br />
                  양털을 모을 수 있어요.
                </p>
                <Button className={styles.rewardConfirm} onClick={confirmReward}>
                  확인
                </Button>
              </div>
            </Modal>
          </div>
        )}
      </div>

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
