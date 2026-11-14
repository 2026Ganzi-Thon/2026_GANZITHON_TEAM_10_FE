import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from 'react-router-dom'
import { Button, Modal } from '@/components'
import arrowIcon from '@/assets/meetings/arrow.svg'
import attendeesIcon from '@/assets/meetings/attendees.svg'
import attendeesSmallIcon from '@/assets/meetings/attendees-small.svg'
import calendarIcon from '@/assets/meetings/calendar.svg'
import chevronIcon from '@/assets/meetings/chevron.svg'
import divider from '@/assets/meetings/divider.svg'
import notificationIcon from '@/assets/meetings/notification.svg'
import pastChevron from '@/assets/meetings/past-chevron.svg'
import plusIcon from '@/assets/meetings/plus.svg'
import reenterIcon from '@/assets/meetings/reenter.svg'
import scheduledTimeIcon from '@/assets/meetings/scheduled-time.svg'
import { loadMeetings, meetingConcerns, pastConversationDuration } from './meetingMock'
import { getMeetingEntry, getMeetingPath, meetingNotices } from './meetingEntry'
import type { MeetingNotice } from './meetingEntry'
import type {
  LiveMeeting,
  Meeting,
  MeetingConcern,
  MeetingListData,
  PastMeeting,
  ScheduledMeeting,
} from './meetingMock'
import styles from './MeetingList.module.css'

const tabs = [
  { id: 'mine', label: '나의 모임' },
  { id: 'find', label: '모임 찾기' },
] as const

const returnPositionKey = 'moyang:meeting-list-return'
const visibleMeetingCount = 3

type SectionName = 'live' | 'scheduled' | 'past' | 'guide'
type ExpandedSections = Partial<Record<SectionName, boolean>>
type ShowNotice = (notice: MeetingNotice) => void

type ReturnPosition = {
  key: string
  search: string
  meetingId?: string
  scrollTop: number
  pastExpanded?: boolean
  expandedSections?: ExpandedSections
}

const readReturnPosition = (key: string, search: string) => {
  try {
    const saved = sessionStorage.getItem(`${returnPositionKey}:${key}`)
    const position = saved ? (JSON.parse(saved) as Partial<ReturnPosition> | null) : null
    if (
      position?.key !== key ||
      position.search !== search ||
      (position.meetingId !== undefined && typeof position.meetingId !== 'string') ||
      typeof position.scrollTop !== 'number' ||
      !Number.isFinite(position.scrollTop) ||
      position.scrollTop < 0
    ) {
      return undefined
    }
    return position as ReturnPosition
  } catch {
    return undefined
  }
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})
const scheduledTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const pastDateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
})
const getConcernLabel = (concern: MeetingConcern) =>
  meetingConcerns.find(({ id }) => id === concern)?.label

const ReentryLink = ({ meeting, label }: { meeting: Meeting; label: string }) => (
  <Link
    to={getMeetingPath(meeting)}
    state={{ fromMeetingList: true }}
    aria-label={`${meeting.title} ${label}`}
    data-meeting-id={meeting.id}
    className={styles.reentry}
  >
    <img src={reenterIcon} alt="" />
    {label}
  </Link>
)

const ScheduledMeetingCard = ({
  meeting,
  onNotice,
}: {
  meeting: ScheduledMeeting
  onNotice: ShowNotice
}) => {
  const entry = getMeetingEntry(meeting)
  const canReenter = meeting.status === 'in-progress' && entry.canEnter

  return (
    <article className={styles.scheduledCard}>
      <div className={styles.cardHeading}>
        <h3>{meeting.title}</h3>
        <img src={arrowIcon} alt="" />
        <p className={styles.description}>{meeting.description}</p>
      </div>
      <div className={styles.divider}>
        <img src={divider} alt="" />
      </div>
      <div className={styles.scheduledMeta}>
        <span>
          <img src={calendarIcon} alt="" />
          <time dateTime={new Date(meeting.startAt).toISOString()}>
            {dateFormat.format(meeting.startAt)}
          </time>
        </span>
        <span>
          <img src={scheduledTimeIcon} alt="" />
          <time dateTime={new Date(meeting.startAt).toISOString()}>
            {scheduledTimeFormat.format(meeting.startAt)}
          </time>
        </span>
      </div>
      <div className={styles.scheduledBottom}>
        <span className={styles.participants}>
          <img src={attendeesIcon} alt="" />
          {meeting.participants}/{meeting.capacity}명
        </span>
        <span className={styles.concern}>{getConcernLabel(meeting.concern)}</span>
      </div>
      {canReenter && <ReentryLink meeting={meeting} label={entry.label} />}
      {entry.canEnter && !canReenter && (
        <Link
          to={getMeetingPath(meeting)}
          state={{ fromMeetingList: true }}
          aria-label={`${meeting.title} 상세 보기`}
          data-meeting-id={meeting.id}
          className={styles.scheduledAction}
        />
      )}
      {entry.canEnter === false && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={`${meeting.title} · ${entry.label}`}
          className={styles.scheduledAction}
          onClick={() => onNotice(entry.notice)}
        />
      )}
    </article>
  )
}

const LiveMeetingCard = ({ meeting, onNotice }: { meeting: LiveMeeting; onNotice: ShowNotice }) => {
  const entry = getMeetingEntry(meeting)
  const canReenter = meeting.status === 'in-progress' && entry.canEnter

  return (
    <article className={styles.liveCard}>
      <h3>{meeting.title}</h3>
      <p className={styles.description}>{meeting.description}</p>
      <div className={styles.liveBottom}>
        <div className={styles.liveMeta}>
          <span className={styles.concern}>{getConcernLabel(meeting.concern)}</span>
          <span>
            <img src={attendeesSmallIcon} alt="" />
            {meeting.participants}/{meeting.capacity}명
          </span>
        </div>
        {entry.canEnter === true && !canReenter && (
          <Link
            to={getMeetingPath(meeting)}
            state={{ fromMeetingList: true }}
            aria-label={`${meeting.title} ${entry.label}`}
            data-meeting-id={meeting.id}
            className={styles.enter}
          >
            {entry.label}
            <img src={chevronIcon} alt="" />
          </Link>
        )}
        {entry.canEnter === false && (
          <button
            type="button"
            className={`${styles.enter} ${styles.unavailable}`}
            aria-haspopup="dialog"
            aria-label={`${meeting.title} · ${entry.label}`}
            onClick={() => onNotice(entry.notice)}
          >
            {entry.label}
          </button>
        )}
      </div>
      {canReenter && <ReentryLink meeting={meeting} label={entry.label} />}
    </article>
  )
}

const SectionToggle = ({
  title,
  controls,
  expanded,
  onToggle,
  showLabel = false,
}: {
  title: string
  controls: string
  expanded: boolean
  onToggle: () => void
  showLabel?: boolean
}) => (
  <button
    type="button"
    className={
      showLabel ? `${styles.sectionToggle} ${styles.sectionToggleWithLabel}` : styles.sectionToggle
    }
    aria-label={`${title} ${expanded ? '접기' : '더 보기'}`}
    aria-expanded={expanded}
    aria-controls={controls}
    onClick={onToggle}
  >
    {showLabel && (expanded ? '접기' : '더 보기')}
    <img src={pastChevron} alt="" />
  </button>
)

type MeetingSectionProps = {
  title: string
  description?: string
  meetings: Meeting[]
  concern?: MeetingConcern
  role?: '방장' | '참여자'
  emptyMessage?: string
  expanded?: boolean
  onToggle?: () => void
  onNotice: ShowNotice
}

const MeetingSection = ({
  title,
  description,
  meetings,
  concern,
  role,
  emptyMessage,
  expanded = false,
  onToggle,
  onNotice,
}: MeetingSectionProps) => {
  const listId = useId()
  const matching = concern ? meetings.filter((meeting) => meeting.concern === concern) : meetings
  const canToggle = onToggle && matching.length > visibleMeetingCount
  const visible = canToggle && !expanded ? matching.slice(0, visibleMeetingCount) : matching

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2 className={description ? styles.withDescription : undefined}>{title}</h2>
        {role && <span className={styles.role}>{role}</span>}
        {canToggle && (
          <SectionToggle
            title={title}
            controls={listId}
            expanded={expanded}
            onToggle={onToggle}
            showLabel
          />
        )}
      </div>
      {description && <p className={styles.sectionDescription}>{description}</p>}
      {visible.length ? (
        <ul id={listId} className={styles.cards}>
          {visible.map((meeting) => (
            <li key={meeting.id}>
              {meeting.kind === 'live' ? (
                <LiveMeetingCard meeting={meeting} onNotice={onNotice} />
              ) : (
                <ScheduledMeetingCard meeting={meeting} onNotice={onNotice} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {meetings.length
            ? '선택한 고민의 모임이 아직 없어요.'
            : (emptyMessage ?? `${title}이 아직 없어요.`)}
        </p>
      )}
    </section>
  )
}

const PastMeetingsSection = ({
  meetings,
  concern,
  expanded,
  onToggle,
}: {
  meetings: PastMeeting[]
  concern?: MeetingConcern
  expanded: boolean
  onToggle: () => void
}) => {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const nextExpiry = meetings
      .map(({ endAt }) => endAt + pastConversationDuration)
      .filter((expiry) => expiry > now)
      .sort((a, b) => a - b)[0]
    if (!nextExpiry) return
    const refresh = () => setNow(Date.now())
    const timer = window.setTimeout(refresh, Math.max(0, nextExpiry - Date.now()))
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [meetings, now])

  const matching = concern ? meetings.filter((meeting) => meeting.concern === concern) : meetings
  const visible = expanded ? matching : matching.slice(0, 1)

  return (
    <section className={styles.section} aria-labelledby="past-meetings-heading">
      <div className={styles.pastHeading}>
        <h2 id="past-meetings-heading">지난 모임</h2>
        {matching.length > 1 && (
          <SectionToggle
            title="지난 모임"
            controls="past-meetings"
            expanded={expanded}
            onToggle={onToggle}
          />
        )}
      </div>
      {visible.length > 0 && (
        <p className={styles.pastDescription}>
          모임 종료 후 24시간 이내에 대화를 열람할 수 있어요.
        </p>
      )}
      {visible.length > 0 ? (
        <ul id="past-meetings" className={styles.cards}>
          {visible.map((meeting) => (
            <li key={meeting.id}>
              <article className={styles.pastCard}>
                <h3>{meeting.title}</h3>
                <p>
                  <time dateTime={new Date(meeting.startAt).toISOString()}>
                    {pastDateFormat.format(meeting.startAt)}
                  </time>
                  {' · '}
                  {getConcernLabel(meeting.concern)}
                </p>
                <div className={styles.pastActions}>
                  <button type="button" disabled>
                    <span>내가 그린 그림 확인하기</span>
                  </button>
                  {now < meeting.endAt + pastConversationDuration && (
                    <button type="button" disabled>
                      <span>지난 대화 보기</span>
                    </button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {meetings.length ? '선택한 고민의 지난 모임이 없어요.' : '지난 모임이 아직 없어요.'}
        </p>
      )}
    </section>
  )
}

export const MeetingList = () => {
  const pageRef = useRef<HTMLDivElement>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const returnMeetingRef = useRef<string | undefined>(undefined)
  const { key, search, state } = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'mine' ? 'mine' : 'find'
  const concern = meetingConcerns.find(({ id }) => id === searchParams.get('concern'))?.id
  const scenario = import.meta.env.DEV ? searchParams.get('mock') : null
  const [attempt, setAttempt] = useState(0)
  const [list, setList] = useState<MeetingListData | 'error' | null>(null)
  const availableMeetings =
    list && list !== 'error' ? list.meetings.filter(({ status }) => status !== 'cancelled') : []
  const discoverableMeetings = availableMeetings.filter(({ status }) => status === 'waiting')
  const joinedLiveMeetings = availableMeetings.filter(
    ({ kind, membership, hasEntered }) =>
      kind === 'live' && membership === 'participant' && hasEntered,
  )
  const [expandedSections, setExpandedSections] = useState<ExpandedSections>(() => {
    const position = navigationType === 'POP' ? readReturnPosition(key, search) : undefined
    return { past: position?.pastExpanded, ...position?.expandedSections }
  })
  const [activeNotice, setActiveNotice] = useState<MeetingNotice | null>(null)
  const routeNotice = state?.meetingNotice
  const noticeKey = activeNotice ?? routeNotice
  const notice =
    typeof noticeKey === 'string' && Object.hasOwn(meetingNotices, noticeKey)
      ? meetingNotices[noticeKey as MeetingNotice]
      : undefined

  const closeNotice = () => {
    setActiveNotice(null)
    if (routeNotice) navigate({ search }, { replace: true, state: null })
  }

  const toggleSection = (name: SectionName) => {
    setExpandedSections((current) => ({ ...current, [name]: !current[name] }))
  }

  useEffect(() => {
    let active = true

    loadMeetings({
      empty: scenario === 'empty',
      fail: scenario === 'error',
      states: scenario === 'meeting-states',
      many: scenario === 'many',
      expiringPast: scenario === 'past-expiring',
      delay: scenario === 'loading' ? 5000 : undefined,
    }).then(
      (data) => {
        if (active) setList(data)
      },
      () => {
        if (active) setList('error')
      },
    )

    return () => {
      active = false
    }
  }, [scenario, attempt])

  useLayoutEffect(() => {
    if (!list || list === 'error' || navigationType !== 'POP') return
    const position = readReturnPosition(key, search)
    if (!position) return
    const scroller = pageRef.current?.parentElement
    const link = position.meetingId
      ? pageRef.current?.querySelector<HTMLAnchorElement>(
          `a[data-meeting-id="${CSS.escape(position.meetingId)}"]`,
        )
      : undefined
    if (scroller) scroller.scrollTop = position.scrollTop
    link?.focus({ preventScroll: true })
  }, [key, list, navigationType, search])

  useLayoutEffect(() => {
    if (!list || list === 'error') return
    const scroller = pageRef.current?.parentElement
    returnMeetingRef.current = undefined
    return () => {
      const position: ReturnPosition = {
        key,
        search,
        meetingId: returnMeetingRef.current,
        scrollTop: scroller?.scrollTop ?? 0,
        expandedSections,
      }
      try {
        sessionStorage.setItem(`${returnPositionKey}:${key}`, JSON.stringify(position))
      } catch {
        return
      }
    }
  }, [key, search, expandedSections, list])

  useLayoutEffect(() => {
    const filters = filtersRef.current
    if (!filters) return
    if (!concern) {
      filters.scrollLeft = 0
      return
    }
    const selected = filters.querySelector('button[aria-pressed="true"]')
    if (!selected) return
    const bounds = filters.getBoundingClientRect()
    const chip = selected.getBoundingClientRect()
    const { paddingLeft, paddingRight } = getComputedStyle(filters)
    const left = bounds.left + Number.parseFloat(paddingLeft)
    const right = bounds.right - Number.parseFloat(paddingRight)
    if (chip.left < left) filters.scrollLeft += Math.floor(chip.left - left)
    else if (chip.right > right) filters.scrollLeft += Math.ceil(chip.right - right)
  }, [concern])

  const rememberMeeting = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !(event.target instanceof Element)
    ) {
      return
    }
    returnMeetingRef.current =
      event.target.closest<HTMLAnchorElement>('a[data-meeting-id]')?.dataset.meetingId
  }

  const changeConcern = (id?: MeetingConcern) => {
    const next = new URLSearchParams(searchParams)
    if (id && id !== concern) next.set('concern', id)
    else next.delete('concern')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className={styles.page} data-tab={tab} ref={pageRef} onClickCapture={rememberMeeting}>
      <header className={styles.header}>
        <div className={styles.headerAction}>
          <button type="button" disabled aria-label="알림 준비 중" className={styles.notification}>
            <img src={notificationIcon} alt="" />
          </button>
        </div>
        <h1>
          비슷한 고민을 가진
          <br />
          사람들과 나눠볼까요?
        </h1>
        <div className={styles.headerDescriptions}>
          <p aria-hidden={tab !== 'mine'}>
            나와 비슷한 고민을 가진 사람들과 그림을 그리고,
            <br />
            이야기를 나눠보세요. 지금 바로 참여할 수 있는 모임부터,
            <br />
            미리 약속한 모임까지 한눈에 확인할 수 있어요.
          </p>
          <p aria-hidden={tab !== 'find'}>
            오늘 나눈 그림 이야기를 바탕으로,
            <br />
            함께 그림을 그리고 이야기를 나눌 모임을 찾아봤어요.
          </p>
        </div>
        <nav aria-label="모임 메뉴" className={styles.tabs}>
          {tabs.map(({ id, label }) => {
            const next = new URLSearchParams(searchParams)
            if (id === 'mine') next.set('tab', id)
            else next.delete('tab')

            return (
              <Link
                key={id}
                to={{ search: next.toString() }}
                aria-current={id === tab ? 'page' : undefined}
                replace
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </header>
      <div className={styles.filters} ref={filtersRef} role="group" aria-label="고민 주제 필터">
        <button type="button" aria-pressed={!concern} onClick={() => changeConcern()}>
          <span>전체</span>
        </button>
        {meetingConcerns.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={concern === id}
            onClick={() => changeConcern(id)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className={styles.content}>
        <div className={styles.sections}>
          {list === null ? (
            <p className={styles.empty} role="status">
              모임을 불러오고 있어요.
            </p>
          ) : list === 'error' ? (
            <div className={styles.error}>
              <p role="alert">모임을 불러오지 못했어요.</p>
              <Button
                color="gray"
                onClick={() => {
                  setList(null)
                  if (scenario === 'error') {
                    const next = new URLSearchParams(searchParams)
                    next.delete('mock')
                    setSearchParams(next, { replace: true })
                  } else {
                    setAttempt((current) => current + 1)
                  }
                }}
              >
                다시 시도
              </Button>
            </div>
          ) : tab === 'find' ? (
            <>
              <MeetingSection
                title="지금 모이는 모양"
                description="실시간 모임으로 곧 시작해요!"
                meetings={discoverableMeetings.filter(({ kind }) => kind === 'live')}
                concern={concern}
                expanded={expandedSections.live === true}
                onToggle={() => toggleSection('live')}
                onNotice={setActiveNotice}
              />
              <MeetingSection
                title="미리 약속한 모양"
                description="다가오는 모임으로 예약해서 만나요!"
                meetings={discoverableMeetings.filter(({ kind }) => kind === 'scheduled')}
                concern={concern}
                expanded={expandedSections.scheduled === true}
                onToggle={() => toggleSection('scheduled')}
                onNotice={setActiveNotice}
              />
              <section className={styles.guide}>
                <div className={styles.sectionHeading}>
                  <h2>모임 이용 안내</h2>
                  <SectionToggle
                    title="모임 이용 안내"
                    controls="meeting-guide-details"
                    expanded={expandedSections.guide === true}
                    onToggle={() => toggleSection('guide')}
                  />
                </div>
                <ul>
                  <li>
                    실시간 모임은 대기실에 처음 입장할 때, 예약 모임은 참여 신청을 완료할 때 양털
                    1개가 사용돼요.
                  </li>
                  <li>
                    실시간 모임의 일반 참여자는 시작 전 나가거나 방이 닫히면 양털을 돌려받아요. 예약
                    모임은 시작 10분 전까지 신청을 취소하면 돌려받아요.
                  </li>
                </ul>
                <ul id="meeting-guide-details" hidden={!expandedSections.guide}>
                  <li>참여 상태를 유지한 채 다시 입장하면 양털이 추가로 사용되지 않아요.</li>
                  <li>이미 시작한 모임에는 새로 참여할 수 없어요.</li>
                  <li>
                    내가 직접 공유한 그림과 설명만 다른 참여자에게 공개돼요. 개인 AI 대화와 분석
                    결과는 공개되지 않아요.
                  </li>
                  <li>
                    서로의 그림과 이야기를 존중하며, 모임에서 나눈 내용은 외부에 공유하지 말아
                    주세요.
                  </li>
                  <li>
                    모임 종료 24시간 뒤 채팅방과 대화 기록은 사라지고, 내가 그린 그림은 기록에
                    남아요.
                  </li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <MeetingSection
                title="내가 만든 모임"
                role="방장"
                emptyMessage="만든 모임이 아직 없어요"
                meetings={availableMeetings.filter(({ membership }) => membership === 'host')}
                concern={concern}
                onNotice={setActiveNotice}
              />
              <MeetingSection
                title="예약한 모임"
                role="참여자"
                emptyMessage="예약한 모임이 아직 없어요"
                meetings={availableMeetings.filter(
                  ({ kind, membership }) => kind === 'scheduled' && membership === 'participant',
                )}
                concern={concern}
                onNotice={setActiveNotice}
              />
              {joinedLiveMeetings.length > 0 && (
                <MeetingSection
                  title="참여 중인 실시간 모임"
                  role="참여자"
                  meetings={joinedLiveMeetings}
                  concern={concern}
                  onNotice={setActiveNotice}
                />
              )}
              {list.pastMeetings.length > 0 && (
                <PastMeetingsSection
                  meetings={list.pastMeetings}
                  concern={concern}
                  expanded={expandedSections.past === true}
                  onToggle={() => toggleSection('past')}
                />
              )}
            </>
          )}
        </div>
        <div className={styles.create}>
          <Button disabled>
            <img src={plusIcon} alt="" />
            모임 만들기
          </Button>
        </div>
      </div>
      <Modal
        isOpen={Boolean(notice)}
        title={notice?.title}
        onClose={closeNotice}
        actions={[{ label: '확인', onClick: closeNotice }]}
      >
        {notice?.message}
      </Modal>
    </div>
  )
}
