import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { Button, HomeLayout, Modal, SheepProfile } from '@/components'
import { exampleDrawing } from '@/features/drawing-conversation/conversationMock'
import { useModal } from '@/hooks/useModal'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import {
  PersonalProgramHomeSection,
  ProgramProgress,
  ProgramSchedule,
  ProgramTimeline,
} from './ProgramOverview'
import { ProgramScheduleForm } from './ProgramScheduleForm'
import {
  cancelProgramSchedule,
  exampleReflection,
  getProgramScenario,
  readPrograms,
  saveProgramSchedule,
} from './programMock'
import type { ProgramActivityHandoff } from './programMock'
import {
  getActivitySchedule,
  getProgramActivity,
  getProgramForReflection,
  getToday,
  rounds,
} from './programSchedule'
import type { FirstReflection } from './programSchedule'
import { useProgramToday } from './useProgramToday'
import styles from './PersonalProgram.module.css'

type SessionLocation = {
  firstReflection?: FirstReflection
  programActivity?: ProgramActivityHandoff
  completedRound?: number
  storageScope?: string
}

export const PersonalProgramPage = () => {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const storageScope = useMockStorageScope()
  const handoff = location.state as SessionLocation | null
  const state = storageScope && handoff?.storageScope === storageScope ? handoff : null
  const mockScenario = import.meta.env.DEV ? getProgramScenario(params.get('mock')) : undefined
  const id = params.get('programId')
  const view = params.get('view')
  const isHomePreview = import.meta.env.DEV && view === 'home'
  const isPreview =
    import.meta.env.DEV &&
    Boolean(
      mockScenario || isHomePreview || params.has('preview') || (!state?.firstReflection && !id),
    )
  const scenario = mockScenario ?? (isPreview ? 'setup' : undefined)
  const reflection = state?.firstReflection ?? (isPreview ? exampleReflection : undefined)
  const programs = readPrograms(scenario)
  const program = id
    ? programs.find((item) => item.id === id)
    : reflection && getProgramForReflection(programs, reflection)
  const [today, setToday] = useProgramToday()
  const [editing, setEditing] = useState(false)
  const { isOpen: showCancel, openModal: openCancel, closeModal: closeCancel } = useModal()
  const [cancelFailed, setCancelFailed] = useState(false)
  const failedOnce = useRef(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)

  useEffect(() => {
    if (wasEditing.current && !editing) editButton.current?.focus()
    wasEditing.current = editing
  }, [editing])

  const sessionsUrl = (values: Record<string, string> = {}) => {
    const query = new URLSearchParams(values)
    if (isPreview) query.set('preview', '1')
    if (scenario) query.set('mock', scenario)
    const search = query.toString()
    return search ? `/sessions?${search}` : '/sessions'
  }

  const home = isPreview ? sessionsUrl({ view: 'home' }) : '/home'
  const activity = program && getProgramActivity(program, today)
  const currentSchedule = program && getActivitySchedule(program, today)
  const completed = program?.completed ?? 1
  const isComplete = completed === rounds.length
  const justCompleted =
    program && !program.cancelled && state?.completedRound === completed
      ? rounds[completed - 1]
      : undefined
  const title = program ? '나의 모양 이어가기' : '나만의 모양 만들기'

  const saveSchedule = async (days: number[], signal: AbortSignal) => {
    const firstReflection = program?.firstReflection ?? reflection
    if (!firstReflection) return

    const fail = scenario === 'save-error' && !failedOnce.current
    failedOnce.current = true
    await saveProgramSchedule({
      reflection: firstReflection,
      programId: program?.id,
      days,
      fail,
      signal,
      scenario,
    })
    if (signal.aborted) return

    if (program) setEditing(false)
    else navigate(home, { replace: true })
  }

  const startActivity = () => {
    if (!program) return
    const programActivity = getProgramActivity(program, getToday())
    if (!programActivity) {
      setToday(getToday())
      return
    }
    navigate(sessionsUrl({ view: 'activity', programId: programActivity.programId }), {
      state: { programActivity, storageScope },
    })
  }

  const cancelSchedule = () => {
    if (!program) return
    try {
      cancelProgramSchedule(program.id, scenario)
      navigate(home, { replace: true })
    } catch {
      setCancelFailed(true)
    }
  }

  if (isHomePreview) {
    return (
      <HomeLayout>
        <div className={styles.previewHome}>
          <PersonalProgramHomeSection
            programs={programs}
            getProgramLink={(programId) => sessionsUrl({ programId })}
          />
        </div>
      </HomeLayout>
    )
  }

  if (view === 'activity' && program) {
    const started = state?.programActivity
    const back = sessionsUrl({ programId: program.id })
    if (
      !activity ||
      started?.programId !== activity.programId ||
      started.round !== activity.round ||
      started.date !== activity.date
    ) {
      return (
        <section className={styles.content}>
          <h1 className={styles.headline}>지금 시작할 수 있는 활동이 아니에요</h1>
          <Link className={styles.textLink} to={back}>
            모양으로 돌아가기
          </Link>
        </section>
      )
    }

    return (
      <div className={`${styles.page} ${styles.activityPage}`}>
        <header className={styles.header}>
          <Link to={back} aria-label="모양으로 돌아가기">
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </Link>
          <span>{rounds[activity.round - 1]?.name}</span>
        </header>
        <div className={`${styles.content} ${styles.activityContent}`}>
          <div className={styles.activityIntro}>
            <h1 className={styles.headline}>
              오늘은 어떤 마음을
              <br />
              그려볼까요?
            </h1>
            <p className={styles.description}>이어가고 있는 모양의 오늘 그림 주제를 준비했어요.</p>
          </div>
          <div className={styles.activityIllustration}>
            <SheepProfile color="white" size={160} alt="" />
          </div>
          <section className={styles.activityPrompt} aria-labelledby="activity-topic">
            <p className={styles.activityLabel}>
              <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
              오늘의 그림 주제
            </p>
            <h2 id="activity-topic">{activity.topic}</h2>
            <p className={styles.activityDescription}>{activity.description}</p>
            <span className={styles.activityTag}>{activity.concern.label}</span>
          </section>
          <div className={styles.activityActions}>
            <p className={styles.description}>잘 그리려 하지 않아도 괜찮아요.</p>
            {scenario ? (
              <Link
                className={styles.textLink}
                to="/drawing/conversation"
                state={{
                  drawing: {
                    ...exampleDrawing,
                    drawingId: -activity.round,
                    title: activity.topic,
                    concern: activity.concern,
                  },
                  programActivity: { ...activity, mock: scenario },
                  storageScope,
                }}
              >
                예시 그림으로 대화하기
              </Link>
            ) : (
              <Button
                onClick={() =>
                  navigate('/drawing', { state: { programActivity: activity, storageScope } })
                }
              >
                이 주제로 그림 그리기
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if ((!program && (id || !reflection)) || view === 'activity') {
    return (
      <div className={styles.page}>
        <section className={styles.content}>
          <h1 className={styles.headline}>모양을 찾을 수 없어요</h1>
          <Link className={styles.textLink} to={home}>
            홈으로 돌아가기
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to={home} aria-label="홈으로 돌아가기">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
        </Link>
        <span>{title}</span>
      </header>
      <div className={styles.content}>
        <section className={styles.intro}>
          <h1 className={styles.headline}>
            그림으로 이어가는
            <br />
            나의 이야기
          </h1>
          <p className={styles.description}>
            오늘 나눈 그림 이야기를 바탕으로, 선택한 고민을 여러 번의 그림과 대화로 더 깊이 살펴볼
            수 있어요.
          </p>
        </section>

        {program && currentSchedule?.date && (
          <ProgramSchedule days={program.days} date={currentSchedule.date} />
        )}

        <section className={styles.overview} aria-label="모양 진행 현황">
          <div className={styles.concern}>
            <h2>{(program?.firstReflection ?? reflection)?.concern.label}</h2>
            <span>총 {rounds.length}회</span>
          </div>
          <ProgramProgress completed={completed} />
          {!program && <p className={styles.status}>첫 번째 모양을 마쳤어요.</p>}
          {program && (
            <p className={styles.status} role={justCompleted ? 'status' : undefined}>
              {isComplete
                ? `${rounds[rounds.length - 1].name}까지 마쳤어요.`
                : program.cancelled
                  ? '앞으로의 일정이 취소됐어요. 이미 남긴 기록은 그대로 볼 수 있어요.'
                  : justCompleted
                    ? `${justCompleted.name}을 마쳤어요.`
                    : currentSchedule?.rescheduled
                      ? `지난 활동을 놓쳐 ${rounds[completed].name}을 다음 선택 요일로 옮겼어요.`
                      : activity
                        ? `오늘은 ${rounds[completed].name}을 시작할 수 있어요.`
                        : `${rounds[completed].name}의 그림 주제는 활동 당일에 열려요.`}
            </p>
          )}
        </section>

        <ProgramTimeline
          completed={completed}
          activity={activity ?? null}
          isSetup={!program}
          firstReflection={program?.firstReflection ?? reflection}
        />

        {(!program || editing) && (
          <ProgramScheduleForm
            initialDays={program?.days ?? []}
            today={today}
            includeToday={currentSchedule?.date === today}
            onSave={saveSchedule}
            onClose={editing ? () => setEditing(false) : undefined}
          />
        )}

        {program && !program.cancelled && !isComplete && !editing && (
          <>
            <section className={styles.guide}>
              <h2>활동 전 확인해 주세요</h2>
              <ul>
                <li>활동하는 날에는 새로운 그림 주제를 볼 수 있어요.</li>
                <li>예정일을 놓쳐도 다음에 선택한 요일에 같은 활동을 이어갈 수 있어요.</li>
                <li>회고를 기록하면 다음 모양으로 넘어가요.</li>
              </ul>
            </section>
            <div className={styles.actions}>
              <Button ref={editButton} onClick={() => setEditing(true)}>
                일정 변경
              </Button>
              <Button
                onClick={() => {
                  setCancelFailed(false)
                  openCancel()
                }}
              >
                활동 취소
              </Button>
              <Button onClick={startActivity} disabled={!activity}>
                지금 시작하기
              </Button>
            </div>
          </>
        )}
        {program && (isComplete || program.cancelled) && (
          <Button onClick={() => navigate(home, { replace: true })}>홈으로 돌아가기</Button>
        )}
      </div>
      <Modal
        isOpen={showCancel}
        onClose={closeCancel}
        title="활동을 취소하시겠습니까?"
        actions={[
          { label: '활동 취소', onClick: cancelSchedule },
          { label: '돌아가기', color: 'gray', onClick: closeCancel },
        ]}
      >
        앞으로의 일정이 취소돼요. 이미 완료한 활동과 기록은 그대로 남아요.
        {cancelFailed && (
          <p role="alert" className={styles.error}>
            일정을 취소하지 못했어요. 다시 시도해 주세요.
          </p>
        )}
      </Modal>
    </div>
  )
}
