import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck } from '@fortawesome/free-regular-svg-icons'
import { Button, Modal, PageHeader } from '@/components'
import calendarIcon from '@/assets/meetings/calendar.svg'
import attendeesIcon from '@/assets/meetings/attendees.svg'
import timeIcon from '@/assets/meetings/scheduled-time.svg'
import applicationComplete from '@/assets/meeting-reservation/application-complete.png'
import {
  getMeetingEntry,
  getMeetingListPath,
  meetingNotices,
} from '@/features/meeting-list/meetingEntry'
import { getMockStorageKey, getMockStorageScope } from '@/lib/mock-storage'
import type { MeetingNotice } from '@/features/meeting-list/meetingEntry'
import type { ScheduledMeeting } from '@/features/meeting-list/meetingMock'
import { isMeetingStorageEvent, meetingConcerns } from '@/features/meeting-list/meetingMock'
import {
  applyForMeeting,
  cancelReservation,
  canEnterWaitingRoom,
  canRefundReservation,
  isReservationStatusPending,
  isSameBooking,
  loadReservation,
  getMeetingRecommendations,
  meetingSteps,
  scheduledStartGrace,
  ReservationChangedError,
  ReservationError,
} from './reservationMock'
import styles from './MeetingReservation.module.css'

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: 'numeric',
  minute: '2-digit',
})

const MeetingSummary = ({ meeting, now }: { meeting: ScheduledMeeting; now: number }) => (
  <div className={styles.summary}>
    <div className={styles.schedule}>
      <span>
        <img src={calendarIcon} alt="" />
        <time dateTime={new Date(meeting.startAt).toISOString()}>
          {dateFormat.format(meeting.startAt)}
        </time>
      </span>
      <span>
        <img src={timeIcon} alt="" />
        {timeFormat.format(meeting.startAt)}
      </span>
      <span className={styles.recruiting}>
        {meeting.membership ? '예약 완료' : now >= meeting.startAt ? '신청 마감' : '모집 중'}
      </span>
    </div>
    <span className={styles.participants}>
      <img src={attendeesIcon} alt="" />
      현재 인원 {meeting.participants}/{meeting.capacity}명
    </span>
  </div>
)

export const MeetingReservation = ({
  meetingId,
  storageScope,
  onRetry,
}: {
  meetingId: string
  storageScope: string | null
  onRetry: () => void
}) => {
  const navigate = useNavigate()
  const { key, search, state } = useLocation()
  const navigationType = useNavigationType()
  const scenario = import.meta.env.DEV ? new URLSearchParams(search).get('mock') : null
  const waitingSearch =
    scenario === 'entry-error'
      ? '?mock=entry-error'
      : import.meta.env.DEV && new URLSearchParams(search).has('preview')
        ? '?preview'
        : ''
  const listPath = getMeetingListPath(state?.meetingListSearch)
  const [meeting, setMeeting] = useState<ScheduledMeeting | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loadedAttempt, setLoadedAttempt] = useState<number | null>(null)
  const [redirectNotice, setRedirectNotice] = useState<MeetingNotice | null>(null)
  const [pending, setPending] = useState<'join' | 'cancel' | null>(null)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState<MeetingNotice | 'wool' | null>(null)
  const [applied, setApplied] = useState<ScheduledMeeting | null>(null)
  const [cancellationTarget, setCancellationTarget] = useState<ScheduledMeeting | null>(null)
  const [cancelled, setCancelled] = useState<{
    refunded: boolean
    cancelled: boolean
    alreadyCancelled: boolean
  } | null>(null)
  const [now, setNow] = useState(Date.now)
  const actionControllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const failureUsed = useRef(false)
  const pageRef = useRef<HTMLDivElement>(null)
  const waitingButtonRef = useRef<HTMLButtonElement>(null)
  const primaryActionRef = useRef<HTMLButtonElement>(null)
  const appliedWasOpenRef = useRef(false)
  const loadedRef = useRef(false)
  const refreshedAtBoundary = useRef<number | null>(null)
  const loading = loadedAttempt !== attempt
  const confirmCancel = cancellationTarget !== null

  useLayoutEffect(() => {
    const scroller = pageRef.current?.parentElement
    let storageKey: string
    try {
      storageKey = `${getMockStorageKey('moyang:meeting-reservation-return')}:${meetingId}:${key}`
    } catch {
      return
    }
    const savePosition = () => {
      if (!loadedRef.current || !scroller) return
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ scrollTop: scroller.scrollTop }))
      } catch {
        return
      }
    }
    window.addEventListener('pagehide', savePosition)
    return () => {
      window.removeEventListener('pagehide', savePosition)
      savePosition()
    }
  }, [meetingId, key])

  useLayoutEffect(() => {
    if (!meeting || navigationType !== 'POP') return
    try {
      const storageKey = `${getMockStorageKey('moyang:meeting-reservation-return')}:${meetingId}:${key}`
      const saved = sessionStorage.getItem(storageKey)
      if (!saved) return
      const position = JSON.parse(saved) as { scrollTop?: unknown } | null
      if (typeof position?.scrollTop !== 'number' || !Number.isFinite(position.scrollTop)) return
      const scroller = pageRef.current?.parentElement
      scroller?.scrollTo({ top: Math.max(0, position.scrollTop) })
      waitingButtonRef.current?.focus({ preventScroll: true })
      sessionStorage.removeItem(storageKey)
    } catch {
      return
    }
  }, [meeting, meetingId, key, navigationType])

  useEffect(() => {
    const controller = new AbortController()
    loadReservation(meetingId, controller.signal, {
      fail:
        (scenario === 'detail-error' && attempt === 0) ||
        (scenario === 'detail-refresh-error' && attempt === 1),
      delay: scenario === 'detail-loading' ? 5000 : undefined,
    }).then(
      (data) => {
        if (controller.signal.aborted) return
        loadedRef.current = true
        setMeeting(data)
        setLoadedAttempt(attempt)
        setLoadError(false)
        setApplied((current) =>
          current && data.membership && isSameBooking(current, data) ? data : null,
        )
        setCancellationTarget((current) =>
          current && data.membership && isSameBooking(current, data) ? current : null,
        )
        setCancelled((current) => (data.membership ? null : current))
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setLoadedAttempt(attempt)
        if (error instanceof ReservationError && error.code !== 'wool') {
          setRedirectNotice(error.code)
        } else setLoadError(true)
      },
    )
    const onStorage = (event: StorageEvent) => {
      if (isMeetingStorageEvent(event)) setAttempt((value) => value + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => {
      controller.abort()
      window.removeEventListener('storage', onStorage)
    }
  }, [meetingId, scenario, attempt])

  useEffect(() => {
    const abortAction = () => actionControllerRef.current?.abort()
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      setPending(null)
      setAttempt((value) => value + 1)
    }
    window.addEventListener('pagehide', abortAction)
    window.addEventListener('pageshow', restore)
    return () => {
      window.removeEventListener('pagehide', abortAction)
      window.removeEventListener('pageshow', restore)
      abortAction()
    }
  }, [])

  useEffect(() => {
    if (!applied && appliedWasOpenRef.current) {
      primaryActionRef.current?.focus({ preventScroll: true })
    }
    appliedWasOpenRef.current = applied !== null
  }, [applied])

  useEffect(() => {
    if (confirmCancel && !loadError) {
      pageRef.current
        ?.querySelector<HTMLButtonElement>('dialog[open] button')
        ?.focus({ preventScroll: true })
    }
  }, [confirmCancel, loadError])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!meeting || meeting.status !== 'waiting' || loading || loadError) return
    const boundary = meeting.startAt + (meeting.membership ? scheduledStartGrace : 0)
    if (now < boundary || refreshedAtBoundary.current === boundary) return
    refreshedAtBoundary.current = boundary
    setAttempt((value) => value + 1)
  }, [meeting, now, loading, loadError])

  const returnToList = () => {
    actionControllerRef.current?.abort()
    if (state?.fromMeetingList && window.history.state?.idx > 0) navigate(-1)
    else navigate(listPath, { replace: true, state: { meetingListKey: state?.meetingListKey } })
  }

  const showMyMeetings = () => navigate('/meetings?tab=mine')

  const browseMeetings = () => {
    const listSearch = new URLSearchParams(listPath.slice('/meetings'.length))
    if (listSearch.get('tab') !== 'mine') {
      returnToList()
      return
    }
    listSearch.delete('tab')
    navigate({ pathname: '/meetings', search: listSearch.toString() })
  }

  const retryLoad = () => {
    onRetry()
    setAttempt((value) => value + 1)
  }

  const apply = async () => {
    if (!meeting || busyRef.current || storageScope !== getMockStorageScope()) return
    const controller = new AbortController()
    actionControllerRef.current = controller
    busyRef.current = true
    setPending('join')
    setActionError('')
    try {
      const fail = scenario === 'join-error' && !failureUsed.current
      failureUsed.current = true
      const result = await applyForMeeting(meetingId, controller.signal, {
        fail,
        full: scenario === 'join-full',
        delay: scenario === 'join-loading' ? 3000 : undefined,
        expectedStartAt: meeting.startAt,
      })
      if (!controller.signal.aborted && storageScope === getMockStorageScope()) {
        setMeeting(result.meeting)
        setLoadError(false)
        if (result.applied) setApplied(result.meeting)
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ReservationChangedError) {
        setActionError(error.message)
        retryLoad()
      } else if (error instanceof ReservationError) setNotice(error.code)
      else setActionError('모임을 신청하지 못했어요. 다시 시도해 주세요.')
    } finally {
      busyRef.current = false
      if (actionControllerRef.current === controller) actionControllerRef.current = null
      if (!controller.signal.aborted) setPending(null)
    }
  }

  const cancel = async () => {
    if (!cancellationTarget || busyRef.current || storageScope !== getMockStorageScope()) return
    const controller = new AbortController()
    actionControllerRef.current = controller
    busyRef.current = true
    setPending('cancel')
    setActionError('')
    try {
      const fail = scenario === 'cancel-error' && !failureUsed.current
      failureUsed.current = true
      const result = await cancelReservation(meetingId, controller.signal, {
        fail,
        delay: scenario === 'cancel-loading' ? 3000 : undefined,
        expectedBooking: cancellationTarget,
      })
      if (!controller.signal.aborted && storageScope === getMockStorageScope()) {
        setCancellationTarget(null)
        setLoadError(false)
        setCancelled(result)
        if (!result.cancelled) retryLoad()
      }
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ReservationChangedError) {
        setCancellationTarget(null)
        setActionError(error.message)
        retryLoad()
      } else if (error instanceof ReservationError) {
        setCancellationTarget(null)
        setNotice(error.code)
      } else {
        setNow(Date.now())
        setActionError('모임을 취소하지 못했어요. 다시 시도해 주세요.')
      }
    } finally {
      busyRef.current = false
      if (actionControllerRef.current === controller) actionControllerRef.current = null
      if (!controller.signal.aborted) setPending(null)
    }
  }

  if (redirectNotice && !cancelled) {
    return (
      <Navigate
        to={listPath}
        replace
        state={{ meetingNotice: redirectNotice, meetingListKey: state?.meetingListKey }}
      />
    )
  }

  if (meeting && !cancelled) {
    const entry = getMeetingEntry(meeting)
    if (entry.canEnter === false) {
      return (
        <Navigate
          to={listPath}
          replace
          state={{ meetingNotice: entry.notice, meetingListKey: state?.meetingListKey }}
        />
      )
    }
    if (meeting.status === 'in-progress') {
      return (
        <Navigate
          to={`/meetings/${encodeURIComponent(meetingId)}/chat${waitingSearch}`}
          replace
          state={state}
        />
      )
    }
  }

  const refundable = meeting && canRefundReservation(meeting, now)
  const canEnter = meeting && canEnterWaitingRoom(meeting, now)
  const statusPending = meeting && isReservationStatusPending(meeting, now)
  const noticeContent =
    notice === 'wool'
      ? { title: '양털이 부족해요', message: '이 모임에 신청하려면 양털 1개가 필요해요.' }
      : notice && meetingNotices[notice]

  return (
    <div className={styles.page} ref={pageRef}>
      <PageHeader title="미리 약속한 모양" action="back" onNavigate={returnToList} />
      {meeting ? (
        <div className={styles.body}>
          <div>
            <h2 className={styles.title}>{meeting.title}</h2>
            <div className={styles.tags}>
              <span>
                {meeting.concern === 'RELATION_FAMILY'
                  ? '대인관계'
                  : meetingConcerns.find(({ id }) => id === meeting.concern)?.label}
              </span>
              <span>공감·소통</span>
            </div>
            <p className={styles.description}>{meeting.description}</p>
            <MeetingSummary meeting={meeting} now={now} />
            <section className={styles.section}>
              <h3>이런 분께 추천해요</h3>
              <ul className={styles.recommendations}>
                {getMeetingRecommendations(meeting.concern).map((recommendation) => (
                  <li key={recommendation}>
                    <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />
                    {recommendation}
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.section}>
              <h3>이런 활동을 진행할 예정이에요</h3>
              <ol className={styles.steps}>
                {meetingSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            <section className={styles.guide}>
              <h3>예약 모임 이용 안내</h3>
              <ul>
                <li>
                  내가 직접 공유한 그림과 설명만 다른 참여자에게 공개돼요. 개인 AI 대화와 분석
                  결과는 공개되지 않아요.
                </li>
                <li>
                  서로의 그림과 이야기를 존중하며, 모임에서 나눈 내용은 외부에 공유하지 말아 주세요.
                </li>
                <li>
                  모임이 종료되면 24시간 뒤 채팅방과 대화 기록은 사라지고, 내가 그린 그림은 기록에
                  남아요.
                </li>
              </ul>
            </section>
          </div>
          <div className={styles.footer}>
            {loadError && !confirmCancel && (
              <div>
                <p className={styles.error} role="alert">
                  모임 정보를 다시 확인하지 못했어요.
                </p>
                <button
                  type="button"
                  className={styles.retryLink}
                  disabled={loading || pending !== null}
                  onClick={retryLoad}
                >
                  {loading ? '조회하고 있어요…' : '다시 조회하기'}
                </button>
              </div>
            )}
            {actionError && !confirmCancel && (
              <p className={styles.error} role="alert">
                {actionError}
              </p>
            )}
            {meeting.membership ? (
              <>
                {statusPending && (
                  <div>
                    <p className={styles.caption} role="status">
                      모임 시작 상태를 확인하고 있어요.
                    </p>
                    {!loadError && (
                      <button
                        type="button"
                        className={styles.retryLink}
                        disabled={loading || pending !== null}
                        onClick={retryLoad}
                      >
                        다시 조회하기
                      </button>
                    )}
                  </div>
                )}
                <Button
                  ref={waitingButtonRef}
                  className={styles.reservationAction}
                  disabled={!canEnter || loading || loadError || pending !== null}
                  onClick={() => {
                    if (storageScope !== getMockStorageScope()) return
                    if (!canEnterWaitingRoom(meeting)) {
                      setNow(Date.now())
                      return
                    }
                    navigate(`/meetings/${encodeURIComponent(meetingId)}/waiting${waitingSearch}`, {
                      state: {
                        fromReservation: true,
                        meetingListSearch: state?.meetingListSearch,
                        meetingListKey: state?.meetingListKey,
                      },
                    })
                  }}
                >
                  대기실 입장하기
                </Button>
                {!statusPending && (
                  <p className={styles.caption}>모임 시작 5분 전부터 입장할 수 있어요.</p>
                )}
                <Button
                  ref={primaryActionRef}
                  className={`${styles.outline} ${styles.reservationAction}`}
                  disabled={Boolean(statusPending) || loading || loadError || pending !== null}
                  onClick={() => {
                    setActionError('')
                    setCancellationTarget(meeting)
                  }}
                >
                  모임 취소하기
                </Button>
              </>
            ) : (
              <>
                <Button
                  ref={primaryActionRef}
                  disabled={loading || loadError || pending !== null || now >= meeting.startAt}
                  aria-busy={pending === 'join'}
                  onClick={() => void apply()}
                >
                  {pending === 'join'
                    ? '신청하고 있어요…'
                    : now >= meeting.startAt
                      ? '신청이 마감됐어요'
                      : '이 모임 신청하기'}
                </Button>
                <p className={styles.caption}>
                  {now < meeting.startAt
                    ? '모임을 신청하면 양털 1개가 사용돼요.'
                    : '모임 시작 시각이 지나 신청이 마감됐어요.'}
                  {!refundable && now < meeting.startAt && (
                    <>
                      <br />
                      시작까지 10분 미만이 남아, 신청 후 취소해도 양털은 반환되지 않아요.
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.loadState}>
          <p role={loadError && !loading ? 'alert' : 'status'}>
            {loadError && !loading
              ? '모임 정보를 불러오지 못했어요.'
              : '모임 정보를 불러오고 있어요.'}
          </p>
          {loadError && (
            <Button color="gray" disabled={loading} onClick={retryLoad}>
              {loading ? '조회하고 있어요…' : '다시 시도'}
            </Button>
          )}
        </div>
      )}
      <Modal
        isOpen={applied !== null}
        onClose={() => setApplied(null)}
        ariaLabel="모임 신청이 완료됐어요!"
      >
        {applied && (
          <div className={styles.success}>
            <img src={applicationComplete} alt="" width={183} height={168} />
            <h2>모임 신청이 완료됐어요!</h2>
            <div className={styles.successSummary}>
              <h3>{applied.title}</h3>
              <MeetingSummary meeting={applied} now={now} />
            </div>
            <p>
              양털 1개를 사용했어요.
              <br />
              {canRefundReservation(applied, now)
                ? '모임 시작 10분 전까지 취소하면 양털 1개를 돌려드려요.'
                : '지금 신청을 취소하면 양털은 반환되지 않아요.'}
            </p>
            <div className={styles.successActions}>
              <Button onClick={showMyMeetings}>신청한 모임 확인하기</Button>
              <Button className={styles.outline} onClick={browseMeetings}>
                다른 모임 둘러보기
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={confirmCancel}
        onClose={() => {
          if (!busyRef.current) setCancellationTarget(null)
        }}
        title={
          meeting?.membership === 'host' ? '모임을 취소하시겠어요?' : '모임 신청을 취소하시겠어요?'
        }
        actions={[
          {
            label: pending === 'cancel' ? '취소하고 있어요…' : '모임 취소하기',
            color: 'gray',
            disabled: Boolean(statusPending) || loading || loadError || pending !== null,
            onClick: () => void cancel(),
          },
          {
            label: '모임 유지하기',
            disabled: pending !== null,
            onClick: () => setCancellationTarget(null),
          },
        ]}
      >
        <div className={styles.cancelContent}>
          {meeting?.membership === 'host' && <p>예약 중인 참여자에게 사용한 양털을 돌려드려요.</p>}
          <p>
            {statusPending ? (
              '모임 시작 상태를 확인한 뒤 취소할 수 있어요.'
            ) : meeting?.woolPaid === false ? (
              '사용한 양털이 없어 반환되는 양털은 없어요.'
            ) : refundable ? (
              meeting?.membership === 'host' ? (
                '시작 10분 전까지는 생성비 양털 1개도 돌려드려요.'
              ) : (
                '시작 10분 전까지 취소하면 양털 1개를 돌려드려요.'
              )
            ) : (
              <>
                {meeting && now >= meeting.startAt
                  ? '시작 시각이 지나 '
                  : '시작까지 10분 미만이라 '}
                {meeting?.membership === 'host'
                  ? '생성비는 반환되지 않아요.'
                  : '양털은 반환되지 않아요.'}
              </>
            )}
          </p>
          {actionError && (
            <p className={styles.error} role="alert">
              {actionError}
            </p>
          )}
          {loadError && (
            <div className={styles.retry}>
              <p className={styles.error} role={loading ? 'status' : 'alert'}>
                {loading ? '모임 정보를 확인하고 있어요.' : '모임 정보를 다시 확인하지 못했어요.'}
              </p>
              <button
                type="button"
                className={styles.retryLink}
                disabled={loading || pending !== null}
                onClick={retryLoad}
              >
                {loading ? '조회하고 있어요…' : '다시 조회하기'}
              </button>
            </div>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={cancelled !== null}
        onClose={showMyMeetings}
        title={
          cancelled?.alreadyCancelled
            ? '이미 취소한 신청이에요'
            : cancelled?.cancelled
              ? '모임을 취소했어요'
              : '모임 신청을 취소했어요'
        }
        actions={[{ label: '나의 모임 확인하기', onClick: showMyMeetings }]}
      >
        {cancelled?.alreadyCancelled
          ? '다른 화면에서 이미 취소한 신청이에요. 나의 모임에서 현재 상태를 확인해 주세요.'
          : cancelled?.refunded
            ? '사용한 양털 1개를 돌려드렸어요.'
            : '양털은 반환되지 않아요.'}
      </Modal>
      <Modal
        isOpen={notice !== null}
        onClose={() => {
          if (notice === 'wool') setNotice(null)
          else returnToList()
        }}
        title={noticeContent ? noticeContent.title : undefined}
        actions={[
          {
            label: notice === 'wool' ? '확인' : '모임 목록으로 돌아가기',
            onClick: () => {
              if (notice === 'wool') setNotice(null)
              else returnToList()
            },
          },
        ]}
      >
        {noticeContent ? noticeContent.message : null}
      </Modal>
    </div>
  )
}
