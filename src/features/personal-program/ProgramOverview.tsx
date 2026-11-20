import { useEffect, useId, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components'
import { readPrograms } from './programMock'
import {
  formatActivityDate,
  formatWeekdays,
  getActivitySchedule,
  getProgramRounds,
  rounds,
} from './programSchedule'
import type { FirstReflection, PersonalProgram, ProgramActivity } from './programSchedule'
import { useProgramToday } from './useProgramToday'
import styles from './PersonalProgram.module.css'

export const ProgramProgress = ({
  completed,
  label = '나의 진행 현황',
}: {
  completed: number
  label?: string
}) => (
  <div className={styles.progressCard}>
    <div className={styles.progressLabel}>
      <span>{label}</span>
      <span>
        {completed} / {rounds.length} 완료
      </span>
    </div>
    <progress aria-label={label} value={completed} max={rounds.length} />
  </div>
)

export const ProgramSchedule = ({ days, date }: { days: number[]; date: string }) => (
  <div className={styles.schedule}>
    <p className={styles.scheduleTitle}>
      <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />
      선택한 활동 일정
    </p>
    <dl>
      <div>
        <dt>활동 요일</dt>
        <dd>{formatWeekdays(days)}</dd>
      </div>
      <div>
        <dt>다음 미술 활동</dt>
        <dd>
          <time dateTime={date}>{formatActivityDate(date)}</time>
        </dd>
      </div>
    </dl>
  </div>
)

export const ProgramTimeline = ({
  completed,
  activity,
  availableRounds = rounds.length,
  isSetup,
  firstReflection,
  concernId,
  showFirstTopic = true,
  firstTopic,
}: {
  completed: number
  activity: ProgramActivity | null
  availableRounds?: number
  isSetup: boolean
  firstReflection?: FirstReflection
  concernId?: string
  showFirstTopic?: boolean
  firstTopic?: string | null
}) => (
  <section
    className={
      isSetup ? styles.timelineSection : `${styles.timelineSection} ${styles.continueTimeline}`
    }
  >
    <h2>{isSetup ? '미술 활동 단계' : '이런 활동을 진행할 예정이에요'}</h2>
    {isSetup && <p>각 미술 활동의 구체적인 그림 주제는 활동 당일에 공개돼요.</p>}
    <ol className={isSetup ? styles.setupTimeline : styles.timeline}>
      {getProgramRounds(concernId ?? firstReflection?.concern.id).map((round, index) => {
        const isComplete = index < completed
        const isNext = index === completed && index < availableRounds
        const isToday = activity?.round === index + 1
        const savedReflection = isSetup && index === 0 ? firstReflection : undefined
        return (
          <li
            key={round.name}
            className={styles.step}
            data-status={isComplete ? 'complete' : isNext ? 'next' : undefined}
            aria-current={isNext ? 'step' : undefined}
          >
            <span className={styles.stepNumber} aria-hidden="true">
              {isSetup ? '' : index + 1}
            </span>
            <div>
              <p className={styles.stepName}>
                {isSetup ? `${String(index + 1).padStart(2, '0')}. ` : ''}
                {round.label}
                <span className={styles.screenReaderOnly}>
                  {isComplete ? ' 완료' : isNext ? ' 다음 활동' : ''}
                </span>
              </p>
              {((isSetup && index === 0 && (showFirstTopic || firstTopic)) || isToday) && (
                <div className={styles.topic}>
                  <strong>{firstTopic ?? savedReflection?.title ?? round.topic}</strong>
                  {(showFirstTopic || isToday) && (
                    <p>{savedReflection?.story ?? round.description}</p>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  </section>
)

export const PersonalProgramHomeCard = ({
  program,
  today,
  to = `/sessions?programId=${encodeURIComponent(program.id)}`,
}: {
  program: PersonalProgram
  today: string
  to?: string
}) => {
  const { date } = getActivitySchedule(program, today)
  const nextRound = rounds[program.completed]

  return (
    <ProgramHomeCard
      label={program.firstReflection.concern.label}
      date={date}
      round={nextRound?.name}
      completed={program.completed}
      to={to}
    />
  )
}

export const ProgramHomeCard = ({
  label,
  date,
  round,
  completed,
  to,
}: {
  label: string
  date: string | null
  round?: string
  completed: number
  to: string
}) => (
  <Link className={styles.homeCard} to={to}>
    <div className={styles.homeCardTitle}>
      <strong>{label}</strong>
      <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
    </div>
    {round && date && (
      <p className={styles.homeCardSchedule}>
        <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />
        <time dateTime={date}>{formatActivityDate(date)}</time>
        <span>· {round}</span>
      </p>
    )}
    <ProgramProgress completed={completed} label="진행상황" />
  </Link>
)

export const PersonalProgramHomeSection = ({
  programs,
  getProgramLink,
  onRetry,
}: {
  programs?: PersonalProgram[] | null
  getProgramLink?: (programId: string) => string
  onRetry?: () => void
} = {}) => {
  const [expanded, setExpanded] = useState(false)
  const [, retryStorage] = useReducer((attempt: number) => attempt + 1, 0)
  const [today] = useProgramToday()
  const sectionId = useId()
  useEffect(() => {
    if (programs !== undefined) return
    window.addEventListener('storage', retryStorage)
    return () => window.removeEventListener('storage', retryStorage)
  }, [programs])

  let storedPrograms = programs ?? []
  let storageUnavailable = programs === null
  if (programs === undefined) {
    try {
      storedPrograms = readPrograms()
    } catch {
      storageUnavailable = true
    }
  }

  if (storageUnavailable) {
    return (
      <section className={styles.homeSection} aria-labelledby={sectionId}>
        <h2 id={sectionId}>나의 모양 이어가기</h2>
        <p className={styles.homeSummary} role="alert">
          저장된 일정을 불러오지 못했어요. 브라우저 설정을 확인한 뒤 다시 시도해 주세요.
        </p>
        <Button color="gray" onClick={onRetry ?? retryStorage}>
          다시 시도
        </Button>
      </section>
    )
  }

  const activePrograms = storedPrograms.filter(
    (program) => !program.cancelled && program.completed < rounds.length,
  )
  const canCollapse = activePrograms.length >= 3
  const nextActivity = activePrograms
    .flatMap((program) => {
      const { date } = getActivitySchedule(program, today)
      return date ? [{ date, name: rounds[program.completed].name }] : []
    })
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const listId = `${sectionId}-list`

  return (
    <section className={styles.homeSection} aria-labelledby={sectionId}>
      <h2 id={sectionId}>
        {canCollapse ? (
          <button
            className={styles.homeToggle}
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((open) => !open)}
          >
            나의 모양 이어가기
            <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
          </button>
        ) : (
          '나의 모양 이어가기'
        )}
      </h2>
      <p className={styles.homeSummary}>
        {activePrograms.length
          ? `총 ${activePrograms.length}개의 모양을 이어가고 있어요.`
          : '이어가는 모양이 아직 없어요.'}
      </p>
      {canCollapse && nextActivity && (
        <div
          className={`${styles.homeExpandable} ${styles.homeNextWrapper}`}
          data-expanded={!expanded}
          inert={expanded}
        >
          <div>
            <p className={styles.homeNext}>
              {nextActivity.name} ·{' '}
              <time dateTime={nextActivity.date}>{formatActivityDate(nextActivity.date)}</time>
            </p>
          </div>
        </div>
      )}
      {activePrograms.length > 0 && (
        <div
          id={listId}
          className={styles.homeExpandable}
          data-expanded={!canCollapse || expanded}
          inert={canCollapse && !expanded}
        >
          <div>
            <ul className={styles.homeList}>
              {activePrograms.map((program) => (
                <li key={program.id}>
                  <PersonalProgramHomeCard
                    program={program}
                    today={today}
                    to={getProgramLink?.(program.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

export type ServerShape = {
  themeCode: string
  themeName: string
  completedRounds: number
  totalRounds: number
  nextRound: number | null
  weekdays: string[]
  nextActivityDate: string | null
}

/** 서버에 저장된 모양의 일정과 진행 현황을 홈에 표시한다. */
export const ServerShapeHomeSection = ({ shape }: { shape: ServerShape }) => {
  const weekdayNames: Record<string, string> = {
    MON: '월',
    TUE: '화',
    WED: '수',
    THU: '목',
    FRI: '금',
    SAT: '토',
    SUN: '일',
  }
  const days = shape.weekdays.map((day) => weekdayNames[day] ?? day).join(' · ')

  return (
    <section className={styles.homeSection}>
      <h2>나의 모양 이어가기</h2>
      <p className={styles.homeSummary}>총 1개의 모양을 이어가고 있어요.</p>
      <Link className={styles.homeCard} to="/sessions">
        <div className={styles.homeCardTitle}>
          <strong>{shape.themeName}</strong>
          <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
        </div>
        {days && <p className={styles.homeCardSchedule}>활동 요일 · {days}</p>}
        {shape.nextActivityDate && (
          <p className={styles.homeCardSchedule}>
            <FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />
            <time dateTime={shape.nextActivityDate}>
              {formatActivityDate(shape.nextActivityDate)}
            </time>
            {shape.nextRound !== null && <span>· {shape.nextRound}번째 모양</span>}
          </p>
        )}
        <ProgramProgress completed={shape.completedRounds} label="진행상황" />
      </Link>
    </section>
  )
}
