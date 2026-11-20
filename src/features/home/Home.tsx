import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faBell,
  faCalendarDays,
  faChevronDown,
  faChevronRight,
  faUsers,
} from '@fortawesome/free-solid-svg-icons'
import { apiClient } from '@/lib/api-client'
import { HomeLayout } from '@/components'
import {
  PersonalProgramHomeSection,
  ServerShapeHomeSection,
} from '@/features/personal-program/ProgramOverview'
import type { ServerShape } from '@/features/personal-program/ProgramOverview'
import { readPrograms } from '@/features/personal-program/programMock'
import { rounds } from '@/features/personal-program/programSchedule'
import banner1 from '@/assets/home/home-banner-1.png'
import banner2 from '@/assets/home/home-banner-2.png'
import banner3 from '@/assets/home/home-banner-3.png'
import cardSheep from '@/assets/home/home-card.png'
import previewDrawing from '@/assets/drawing/drawing-2.png'
import styles from './Home.module.css'

type Response<T> = { success: boolean; data: T | null }
type RecordItem = { recordId: number; imageUrl: string | null }
type Meeting = {
  meetingId: number
  title: string
  startAt: string | null
  participantCount: number
  capacity: number
}
type Meetings = { count: number; nextMeeting: { startAt: string } | null; meetings: Meeting[] }
type Loadable<T> = { status: 'loading' | 'ready' | 'error'; data: T | null }
const loading = <T,>(): Loadable<T> => ({ status: 'loading', data: null })
const banners = [banner1, banner2, banner3]
const previewMeetings: Meetings = {
  count: 3,
  nextMeeting: { startAt: '2026-11-25T20:00:00+09:00' },
  meetings: [1, 2, 3].map((id) => ({
    meetingId: id,
    title: '나와 너 사이',
    startAt: '2026-11-25T20:00:00+09:00',
    participantCount: 2,
    capacity: 6,
  })),
}

/** 홈에서 사용하는 각 API를 독립적으로 조회해 부분 실패를 구분한다. */
const useHomeData = (preview: boolean) => {
  const [user, setUser] = useState<Loadable<{ nickname: string }>>(loading)
  const [sheep, setSheep] = useState<Loadable<{ balance: number }>>(loading)
  const [record, setRecord] = useState<Loadable<RecordItem>>(loading)
  const [meetings, setMeetings] = useState<Loadable<Meetings>>(loading)
  const [shape, setShape] = useState<Loadable<ServerShape>>(loading)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    const get = async <T,>(
      url: string,
      set: (value: Loadable<T>) => void,
      select: (data: unknown) => T | null,
    ) => {
      set(loading())
      try {
        const { data } = await apiClient.get<Response<unknown>>(url, { signal: controller.signal })
        if (!data.success || !data.data) throw new Error('Invalid response')
        set({ status: 'ready', data: select(data.data) })
      } catch {
        if (!controller.signal.aborted) set({ status: 'error', data: null })
      }
    }
    const getShape = async () => {
      setShape(loading())
      try {
        const { data } = await apiClient.get<Response<ServerShape>>('/api/shapes/me', {
          signal: controller.signal,
        })
        if (!data.success) throw new Error('Invalid response')
        setShape({ status: 'ready', data: data.data })
      } catch {
        if (!controller.signal.aborted) setShape({ status: 'error', data: null })
      }
    }
    void getShape()
    void get('/api/users/me', setUser, (data) => data as { nickname: string })
    void get('/api/sheep', setSheep, (data) => data as { balance: number })
    void get(
      '/api/records?size=1',
      setRecord,
      (data) => (data as { items: RecordItem[] }).items[0] ?? null,
    )
    void get('/api/meetings/me', setMeetings, (data) => {
      const items = (data as { meetings: Meeting[] }).meetings
      if (!Array.isArray(items)) throw new Error('Invalid response')
      const now = Date.now()
      const dates = items.filter((item) => item.startAt && Date.parse(item.startAt) > now)
      dates.sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!))
      return {
        meetings: items,
        count: items.length,
        nextMeeting: dates[0]?.startAt ? { startAt: dates[0].startAt } : null,
      }
    })
    return () => controller.abort()
  }, [preview, retry])
  return preview
    ? {
        user: { status: 'ready' as const, data: { nickname: '딸기를 좋아하는 양' } },
        sheep: { status: 'ready' as const, data: { balance: 2 } },
        record: { status: 'ready' as const, data: { recordId: 1, imageUrl: previewDrawing } },
        meetings: { status: 'ready' as const, data: previewMeetings },
        shape: { status: 'ready' as const, data: null },
        retry: () => setRetry((v) => v + 1),
      }
    : { user, sheep, record, meetings, shape, retry: () => setRetry((v) => v + 1) }
}

/** 인증이 필요한 같은 서버의 그림은 공통 클라이언트로 받아 표시한다. */
const RecordImage = ({ url, preview }: { url: string; preview: boolean }) => {
  const [image, setImage] = useState<string | null>(preview ? url : null)
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    const load = async () => {
      try {
        const resolved = new URL(url, window.location.origin)
        const apiOrigin = apiClient.defaults.baseURL
          ? new URL(apiClient.defaults.baseURL, window.location.origin).origin
          : window.location.origin
        if (resolved.origin !== apiOrigin && resolved.origin !== window.location.origin) {
          setImage(url)
          return
        }
        const response = await apiClient.get<Blob>(url, {
          responseType: 'blob',
          signal: controller.signal,
        })
        objectUrl = URL.createObjectURL(response.data)
        setImage(objectUrl)
      } catch {
        if (!controller.signal.aborted) setImage(null)
      }
    }
    void load()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, preview])
  return image ? (
    <img className={styles.drawing} src={image} alt="최근 저장한 그림" />
  ) : (
    <span className={styles.drawingPlaceholder}>그림을 불러올 수 없어요</span>
  )
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '일정 확인 중'
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/** 홈 배너와 사용자별 활동 요약을 표시한다. */
export const Home = () => {
  const { search } = useLocation()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const params = new URLSearchParams(search)
  const emptyPreview = preview && params.get('preview') === 'empty'
  const { user, sheep, record, meetings, shape, retry } = useHomeData(preview)
  const [slide, setSlide] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const programs = preview && !emptyPreview ? readPrograms('home-list') : []
  const hasActivePrograms = preview
    ? programs.some((program) => !program.cancelled && program.completed < rounds.length)
    : shape.data !== null && shape.data.completedRounds < shape.data.totalRounds
  const noActivity =
    emptyPreview ||
    (record.status === 'ready' &&
      !record.data &&
      meetings.status === 'ready' &&
      !meetings.data?.count &&
      shape.status === 'ready' &&
      !hasActivePrograms)
  useEffect(() => {
    const timer = window.setInterval(
      () => setSlide((current) => (current + 1) % banners.length),
      5000,
    )
    return () => window.clearInterval(timer)
  }, [])
  const hasError = [user, sheep, record, meetings, shape].some((item) => item.status === 'error')
  return (
    <HomeLayout>
      <div className={styles.page}>
        <header className={styles.hero}>
          <img className={styles.bannerImage} src={banners[slide]} alt="" />
          <div className={styles.heroTop}>
            <span>
              {user.data?.nickname ?? (user.status === 'loading' ? '불러오는 중' : '나의 모양')}
            </span>
            <Link to={preview ? '/notifications?preview' : '/notifications'} aria-label="알림">
              <FontAwesomeIcon icon={faBell} />
            </Link>
          </div>
          <div className={styles.heroText}>
            <p>
              그림으로 나를 들여다보고,
              <br />
              오늘의 마음을 조금 더 가볍게 해보세요.
            </p>
            <h1>모양</h1>
            <Link to={preview ? '/about?preview' : '/about'}>
              모양 알아보기 <FontAwesomeIcon icon={faArrowRight} />
            </Link>
          </div>
          <div className={styles.dots} aria-label="배너 선택">
            {banners.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`${index + 1}번 배너`}
                aria-current={slide === index ? 'true' : undefined}
                onClick={() => setSlide(index)}
              />
            ))}
          </div>
        </header>
        <div className={styles.content}>
          {hasError && (
            <div className={styles.error} role="status">
              일부 정보를 불러오지 못했어요.{' '}
              <button type="button" onClick={retry}>
                다시 시도
              </button>
            </div>
          )}
          {sheep.data && (
            <section className={`${styles.card} ${styles.sheep}`}>
              <img src={cardSheep} alt="" />
              <div>
                <h2>나의 양털</h2>
                <p>
                  <strong>{sheep.data.balance}개</strong> 모았어요
                </p>
                <small>하루 첫 회고를 저장하면 양털 1개를 받아요.</small>
              </div>
            </section>
          )}
          {noActivity ? (
            <Link
              to={preview ? '/drawing?preview' : '/drawing'}
              className={`${styles.card} ${styles.empty}`}
            >
              <div>
                <h2>아직 예정된 활동이 없어요</h2>
                <p>
                  첫 그림 이야기를 시작해 보세요.
                  <br />
                  그릴수록 나를 더 잘 이해할 수 있어요.
                </p>
              </div>
              <FontAwesomeIcon icon={faChevronRight} />
            </Link>
          ) : (
            <>
              {record.data && (
                <section className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h2>최근 나의 그림</h2>
                    <Link
                      to={`/records/${record.data.recordId}${preview ? '?preview' : ''}`}
                      state={{ from: 'home' }}
                    >
                      다시 살펴보기 <FontAwesomeIcon icon={faChevronRight} />
                    </Link>
                  </div>
                  {record.data.imageUrl && (
                    <RecordImage url={record.data.imageUrl} preview={preview} />
                  )}
                </section>
              )}
              {preview && hasActivePrograms && (
                <PersonalProgramHomeSection
                  programs={programs}
                  getProgramLink={(id) =>
                    `/sessions?programId=${encodeURIComponent(id)}&mock=home-list`
                  }
                />
              )}
              {!preview && shape.data && hasActivePrograms && (
                <ServerShapeHomeSection shape={shape.data} />
              )}
              {meetings.data && meetings.data.count > 0 && (
                <section className={styles.card}>
                  <h2>
                    <button
                      className={styles.toggle}
                      type="button"
                      aria-expanded={expanded}
                      aria-controls="home-meetings-list"
                      onClick={() => setExpanded((value) => !value)}
                    >
                      참여 중인 모임{' '}
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={expanded ? styles.rotated : ''}
                      />
                    </button>
                  </h2>
                  <div className={styles.summary}>
                    <span className={styles.icon}>
                      <FontAwesomeIcon icon={faUsers} />
                    </span>
                    <div>
                      <p>총 {meetings.data.count}개의 모임에 참여 중이에요</p>
                      {meetings.data.nextMeeting && (
                        <small>
                          가장 가까운 모임 · {formatDate(meetings.data.nextMeeting.startAt)}
                        </small>
                      )}
                    </div>
                  </div>
                  <div
                    id="home-meetings-list"
                    className={styles.expandable}
                    data-expanded={expanded}
                    inert={!expanded}
                  >
                    <div>
                      <ul className={styles.meetings}>
                        {meetings.data.meetings.map((meeting) => (
                          <li key={meeting.meetingId}>
                            <div>
                              <strong>{meeting.title}</strong>
                              <span className={styles.meetingDetails}>
                                <span>
                                  <FontAwesomeIcon icon={faCalendarDays} />
                                  {meeting.startAt
                                    ? formatDate(meeting.startAt)
                                    : '지금 모이는 모양'}
                                </span>
                                <span>
                                  <FontAwesomeIcon icon={faUsers} />
                                  예약 {meeting.participantCount}/{meeting.capacity}명
                                </span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </HomeLayout>
  )
}
