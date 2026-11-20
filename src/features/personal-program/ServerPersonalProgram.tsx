import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { Button, SheepProfile } from '@/components'
import { moyangRequest } from '@/lib/moyang-api'
import { loadSavedActivityRecord, loadScheduledActivityTopics } from './completedActivityTopics'
import type { SavedProgramActivity } from './completedActivityTopics'
import { ProgramProgress, ProgramSchedule, ProgramTimeline } from './ProgramOverview'
import { ProgramScheduleForm } from './ProgramScheduleForm'
import { getToday, rounds } from './programSchedule'
import type { FirstReflection, ProgramActivity } from './programSchedule'
import { useProgramToday } from './useProgramToday'
import { loadOnlyRecordTopic, loadServerShape, weekdayCodes } from './shapeApi'
import type { ServerShape } from './shapeApi'
import styles from './PersonalProgram.module.css'

type Topic = { topicId: number; title: string; description: string }
type Activity = ProgramActivity & { topicId: number }

const CompletedActivityRecordLink = ({ recordId }: { recordId?: number }) => {
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof loadSavedActivityRecord>>>(null)
  useEffect(() => {
    if (recordId === undefined) return
    const controller = new AbortController()
    void loadSavedActivityRecord(recordId, controller.signal).then(
      (record) => {
        if (!controller.signal.aborted) setSaved(record)
      },
      () => {},
    )
    return () => controller.abort()
  }, [recordId])

  return (
    <div className={styles.topic}>
      {saved?.topic && <p>저장한 그림 주제 · {saved.topic}</p>}
      <Link className={styles.textLink} to={saved ? `/records/${saved.recordId}` : '/records'}>
        기록에서 그림 보기
      </Link>
    </div>
  )
}

export const ServerPersonalProgram = ({
  reflection,
  savedActivity,
  scope,
}: {
  reflection?: FirstReflection
  savedActivity?: SavedProgramActivity
  scope: string | null
}) => {
  const navigate = useNavigate()
  const [shape, setShape] = useState<ServerShape | null>()
  const [completedTopics, setCompletedTopics] = useState<{
    shape: ServerShape
    titles: (string | null)[]
  }>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState(false)
  const [activity, setActivity] = useState<Activity>()
  const [firstTopic, setFirstTopic] = useState<{ shape: ServerShape; title: string | null }>()
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityError, setActivityError] = useState('')
  const activityRequest = useRef<AbortController | null>(null)
  const [today] = useProgramToday()

  useEffect(() => {
    if (
      !shape ||
      shape.completedRounds <= 0 ||
      (!shape.weekdays.length && shape.completedRounds < shape.totalRounds)
    )
      return
    const controller = new AbortController()
    void loadScheduledActivityTopics(shape, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return
        if ('updatedShape' in result) {
          setShape((current) => (current === shape ? result.updatedShape : current))
        } else {
          setCompletedTopics({ shape, titles: result.titles })
        }
      },
      () => {
        if (!controller.signal.aborted) setCompletedTopics({ shape, titles: [] })
      },
    )
    return () => controller.abort()
  }, [shape])

  useEffect(() => {
    const controller = new AbortController()
    loadServerShape(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setShape(value)
          setFailed(false)
        }
      },
      () => {
        if (!controller.signal.aborted) setFailed(true)
      },
    )
    return () => controller.abort()
  }, [attempt, today])

  useEffect(() => () => activityRequest.current?.abort(), [])

  useEffect(() => {
    if (!shape || shape.completedRounds !== 1 || shape.weekdays.length > 0) return
    const controller = new AbortController()
    loadOnlyRecordTopic(controller.signal)
      .then((topic) => {
        if (!controller.signal.aborted) setFirstTopic({ shape, title: topic })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFirstTopic({ shape, title: null })
      })
    return () => controller.abort()
  }, [shape])

  const startActivity = async () => {
    if (!scope || activityRequest.current) return
    const controller = new AbortController()
    const { signal } = controller
    activityRequest.current = controller
    setLoadingActivity(true)
    setActivityError('')
    const api = moyangRequest(signal)
    try {
      const current = await api.json<ServerShape | null>('/api/shapes/me')
      setShape(current)
      const date = getToday()
      if (
        !current?.nextRound ||
        current.nextRound > current.totalRounds ||
        !current.weekdays.length ||
        current.nextActivityDate !== date
      ) {
        setActivityError('아직 시작할 수 있는 활동이 없어요.')
        return
      }
      const { topics } = await api.json<{ topics: Topic[] }>('/api/topics/recommended', {
        params: { themeCode: current.themeCode },
      })
      const topic = topics.find(
        ({ topicId, title }) => Number.isSafeInteger(topicId) && topicId > 0 && title.trim(),
      )
      if (!topic) throw new Error('추천 주제가 없어요')
      setActivity({
        programId: current.themeCode,
        round: current.nextRound,
        date,
        concern: { id: current.themeCode, label: current.themeName },
        topicId: topic.topicId,
        topic: topic.title,
        description: topic.description,
      })
    } catch {
      if (!signal.aborted) setActivityError('오늘의 주제를 불러오지 못했어요. 다시 시도해 주세요.')
    } finally {
      activityRequest.current = null
      if (!signal.aborted) setLoadingActivity(false)
    }
  }

  const saveSchedule = async (days: number[], signal: AbortSignal) => {
    const updated = await moyangRequest(signal).json<ServerShape>('/api/shapes/me/schedule', {
      method: 'PUT',
      data: { weekdays: days.map((day) => weekdayCodes[day]) },
    })
    if (signal.aborted) return
    setShape(updated)
    setEditing(false)
  }
  const days = shape?.weekdays.map((day) => weekdayCodes.indexOf(day)) ?? []
  const completed = Math.min(shape?.completedRounds ?? 0, shape?.totalRounds ?? 0)
  const titles = completedTopics?.shape === shape ? completedTopics?.titles : undefined
  const lastSaved = savedActivity ?? {
    recordId: reflection?.recordId,
    themeCode: reflection?.concern.id,
  }
  const savedRecordId =
    lastSaved.themeCode === shape?.themeCode &&
    typeof lastSaved.recordId === 'number' &&
    Number.isSafeInteger(lastSaved.recordId) &&
    lastSaved.recordId > 0
      ? lastSaved.recordId
      : undefined
  const scheduleComplete = shape?.nextRound === null
  const selectingSchedule = shape && !scheduleComplete && (editing || days.length === 0)
  const canStartToday =
    !failed && !editing && days.length > 0 && !scheduleComplete && shape?.nextActivityDate === today
  const todayActivity =
    canStartToday &&
    activity?.date === today &&
    activity.round === shape?.nextRound &&
    activity.concern.id === shape.themeCode
      ? activity
      : null

  if (todayActivity)
    return (
      <div className={`${styles.page} ${styles.activityPage}`}>
        <header className={styles.header}>
          <button
            type="button"
            aria-label="모양으로 돌아가기"
            onClick={() => setActivity(undefined)}
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          </button>
          <span>{rounds[todayActivity.round - 1]?.name}</span>
        </header>
        <div className={`${styles.content} ${styles.activityContent}`}>
          <div className={styles.activityIntro}>
            <h1 className={styles.headline}>오늘은 어떤 마음을 그려볼까요?</h1>
          </div>
          <div className={styles.activityIllustration}>
            <SheepProfile color="white" size={160} alt="" />
          </div>
          <section className={styles.activityPrompt} aria-labelledby="activity-topic">
            <p className={styles.activityLabel}>오늘의 그림 주제</p>
            <h2 id="activity-topic">{todayActivity.topic}</h2>
            <p className={styles.activityDescription}>{todayActivity.description}</p>
            <span className={styles.activityTag}>{todayActivity.concern.label}</span>
          </section>
          <div className={styles.activityActions}>
            <Button
              onClick={() =>
                navigate('/drawing', {
                  state: { programActivity: todayActivity, storageScope: scope },
                })
              }
            >
              이 주제로 그림 그리기
            </Button>
          </div>
        </div>
      </div>
    )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/home" aria-label="홈으로 돌아가기">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
        </Link>
        <span>
          {scheduleComplete
            ? '나의 모양'
            : days.length
              ? '나의 모양 이어가기'
              : '나만의 모양 만들기'}
        </span>
      </header>
      <div className={styles.content}>
        <h1 className={styles.headline}>그림으로 이어가는 나의 이야기</h1>
        {failed ? (
          <>
            <p className={styles.error} role="alert">
              저장된 일정을 불러오지 못했어요.
            </p>
            <Button
              onClick={() => {
                setFailed(false)
                setAttempt(attempt + 1)
              }}
            >
              다시 시도
            </Button>
          </>
        ) : shape === undefined ? (
          <p role="status">나의 모양을 불러오고 있어요.</p>
        ) : shape === null ? (
          <p role="status">고민을 먼저 선택하면 나의 모양 일정을 정할 수 있어요.</p>
        ) : (
          <>
            {days.length > 0 && (shape.nextActivityDate || scheduleComplete) && (
              <ProgramSchedule days={days} date={shape.nextActivityDate} />
            )}
            <section className={styles.overview} aria-label="모양 진행 현황">
              <div className={styles.concern}>
                <h2>{shape.themeName}</h2>
                <span>총 {rounds.length}회</span>
              </div>
              <ProgramProgress completed={completed} />
              <p className={styles.status}>
                {scheduleComplete
                  ? `현재 제공되는 활동 ${shape.totalRounds}회를 모두 마쳤어요. 예정된 다음 활동이 없어요.`
                  : shape.nextActivityDate
                    ? '예정일을 놓쳐도 다음 선택 요일에 이어갈 수 있어요.'
                    : '활동할 요일을 선택해 주세요.'}
              </p>
            </section>
            <ProgramTimeline
              completedTopics={days.length > 0 ? titles : undefined}
              completed={completed}
              activity={null}
              availableRounds={shape.totalRounds}
              isSetup={!scheduleComplete && days.length === 0}
              firstReflection={reflection}
              concernId={shape.themeCode}
              showFirstTopic={false}
              firstTopic={firstTopic?.shape === shape ? firstTopic.title : null}
            />
            {titles !== undefined &&
              (days.length === 0 || titles.filter(Boolean).length < completed) && (
                <CompletedActivityRecordLink key={savedRecordId} recordId={savedRecordId} />
              )}
            {activityError && (
              <p role="alert" className={styles.error}>
                {activityError}
              </p>
            )}
            {canStartToday && (
              <Button disabled={loadingActivity} onClick={() => void startActivity()}>
                {loadingActivity
                  ? '주제를 불러오고 있어요'
                  : activityError
                    ? '주제 다시 불러오기'
                    : '지금 시작하기'}
              </Button>
            )}
            {selectingSchedule && (
              <ProgramScheduleForm
                initialDays={days}
                today={today}
                includeToday={shape.nextActivityDate === today}
                onSave={saveSchedule}
                onClose={editing ? () => setEditing(false) : undefined}
              />
            )}
            {!selectingSchedule && !scheduleComplete && (
              <Button
                disabled={loadingActivity}
                onClick={() => {
                  setActivityError('')
                  setEditing(true)
                }}
              >
                일정 변경
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
