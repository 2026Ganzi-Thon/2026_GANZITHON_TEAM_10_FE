import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Modal, PageHeader } from '@/components'
import { formatRemainingTime } from '@/features/meeting-chat/chatTiming'
import { scheduledStartGrace } from '@/features/meeting-reservation/reservationMock'
import { getMeetingListPath } from '@/features/meeting-list/meetingEntry'
import { meetingConcerns } from '@/features/meeting-list/meetingMock'
import {
  cancelServerMeeting,
  enterServerMeeting,
  getServerMeeting,
  joinServerMeeting,
  meetingApiMessage,
  startServerMeeting,
} from '@/features/meeting-list/meetingApi'
import type { MeetingDetail } from '@/features/meeting-list/meetingApi'
import { trackServerMeeting } from '@/features/meeting-list/serverMeetingHistory'
import { MoyangApiError } from '@/lib/moyang-api'
import applicationComplete from '@/assets/meeting-reservation/application-complete.png'
import detail from '@/features/meeting-reservation/MeetingReservation.module.css'
import room from './MeetingWaitingRoom.module.css'

type Action = 'join' | 'enter' | 'start' | 'cancel'
const autoEnterRetryDelay = 3000
const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'Asia/Seoul',
})

export const ServerMeetingRoom = ({
  id,
  scope,
  view,
}: {
  id: string
  scope: string | null
  view: 'detail' | 'waiting'
}) => {
  const location = useLocation()
  const navigate = useNavigate()
  const listPath = getMeetingListPath(location.state?.meetingListSearch)
  const cancellationKey = JSON.stringify(['moyang:meeting-cancelled', scope, id])
  const [meeting, setMeeting] = useState<MeetingDetail>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [actionError, setActionError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [checkedAttempt, setCheckedAttempt] = useState(-1)
  const [action, setAction] = useState<Action>()
  const [dialog, setDialog] = useState<'applied' | 'cancel' | 'refunded' | 'cancelled'>()
  const [nickname, setNickname] = useState('')
  const [entered, setEntered] = useState(false)
  const [entryDenied, setEntryDenied] = useState(false)
  const [autoEnterRetryAt, setAutoEnterRetryAt] = useState<number | null>(0)
  const [applicationCancelled, setApplicationCancelled] = useState(() => {
    try {
      return sessionStorage.getItem(cancellationKey) === '1'
    } catch {
      return false
    }
  })
  const [now, setNow] = useState(Date.now)
  const request = useRef<AbortController | null>(null)
  const path = `/meetings/${encodeURIComponent(id)}`
  const inWaiting = view === 'waiting'
  const joined = Boolean(meeting?.joined || meeting?.isHost)
  const scheduled = meeting?.type === 'SCHEDULED'
  const open = meeting?.status === 'RECRUITING' || meeting?.status === 'OPEN'
  const startAt = meeting?.startAt ? Date.parse(meeting.startAt) : null
  const enterAt = meeting?.enterOpenAt ? Date.parse(meeting.enterOpenAt) : Infinity
  const refundAt = meeting?.cancelRefundUntil ? Date.parse(meeting.cancelRefundUntil) : -Infinity
  const started = meeting?.status === 'IN_PROGRESS'
  const graceEnds = startAt === null ? Infinity : startAt + scheduledStartGrace
  const graceExpired = scheduled && open && now >= graceEnds
  const canEnter =
    scheduled &&
    joined &&
    !entered &&
    !entryDenied &&
    (started || (open && now >= enterAt && !graceExpired))
  const delay = scheduled && open && startAt !== null && now >= startAt
  const canAct = !loadFailed && attempt === checkedAttempt
  const canCancel = open && joined && !graceExpired
  const rememberCancellation = () => {
    setApplicationCancelled(true)
    try {
      sessionStorage.setItem(cancellationKey, '1')
    } catch {
      return
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    const refresh = async () => {
      try {
        const current = await getServerMeeting(id, controller.signal)
        if (controller.signal.aborted) return
        if (scope && current.joined && current.status === 'IN_PROGRESS') {
          trackServerMeeting(scope, current)
        }
        setMeeting(current)
        setCheckedAttempt(attempt)
        setNow(Date.now())
        setLoadFailed(false)
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error instanceof MoyangApiError && [401, 403, 404].includes(error.status ?? 0)) {
            setMeeting(undefined)
          }
          setLoadFailed(true)
        }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(refresh, 3000)
      }
    }
    void refresh()
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [id, attempt, scope])

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!scheduled || !open) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [scheduled, open])

  const run = async (next: Action) => {
    if (!meeting || request.current || !canAct) return
    if (
      (next === 'cancel' && (!canCancel || (scheduled && Date.now() >= graceEnds))) ||
      (next === 'enter' && (!canEnter || (open && Date.now() >= graceEnds)))
    ) {
      setNow(Date.now())
      setAttempt((value) => value + 1)
      return
    }
    const controller = new AbortController()
    const { signal } = controller
    request.current = controller
    setAction(next)
    setActionError('')
    try {
      switch (next) {
        case 'join': {
          const enteredNickname = nickname.trim()
          if (enteredNickname.length === 1) {
            setActionError('닉네임을 2~15자로 입력해 주세요.')
            return
          }
          const { sheepUsed } = await joinServerMeeting(id, enteredNickname, signal)
          if (signal.aborted) return
          if (scope) trackServerMeeting(scope, meeting)
          if (scheduled && sheepUsed > 0) setDialog('applied')
          break
        }
        case 'enter':
          await enterServerMeeting(id, signal)
          if (signal.aborted) return
          if (scope) trackServerMeeting(scope, meeting)
          setEntered(true)
          break
        case 'start':
          await startServerMeeting(id, signal)
          if (scope && !signal.aborted) trackServerMeeting(scope, meeting)
          break
        case 'cancel': {
          const refunded = await cancelServerMeeting(id, Boolean(meeting.isHost), signal)
          if (signal.aborted) return
          setEntered(false)
          if (!meeting.isHost) rememberCancellation()
          setDialog(refunded ? 'refunded' : 'cancelled')
          break
        }
      }
      if (!signal.aborted) setAttempt((value) => value + 1)
    } catch (error) {
      if (signal.aborted) return
      if (next === 'enter') {
        const retryable =
          error instanceof MoyangApiError &&
          (error.status === undefined || error.status === 408 || error.status >= 500)
        setAutoEnterRetryAt(retryable ? Date.now() + autoEnterRetryDelay : null)
      }
      if (error instanceof MoyangApiError) {
        if (next === 'enter' && started && error.code === 'MEETING_NOT_JOINABLE')
          setEntryDenied(true)
        if (next === 'join' && error.code === 'ALREADY_CANCELED') rememberCancellation()
      }
      setActionError(meetingApiMessage(error, '처리하지 못했어요. 모임 상태를 다시 확인해 주세요.'))
      setAttempt((value) => value + 1)
    } finally {
      request.current = null
      if (!signal.aborted) setAction(undefined)
    }
  }

  const autoDue =
    inWaiting &&
    canEnter &&
    !action &&
    !dialog &&
    canAct &&
    (started || (startAt !== null && now >= startAt - 60_000))
  const enterAutomatically = useEffectEvent(() => void run('enter'))

  useEffect(() => {
    if (!autoDue || autoEnterRetryAt === null) return
    const timer = window.setTimeout(
      () => enterAutomatically(),
      Math.max(0, autoEnterRetryAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [autoDue, autoEnterRetryAt])

  if (joined && started && (!scheduled || entered) && !dialog)
    return <Navigate replace to={`${path}/chat`} state={location.state} />
  if (joined && started && scheduled && !inWaiting && !dialog)
    return <Navigate replace to={`${path}/waiting`} state={location.state} />

  const returnToList = (replace = false) =>
    navigate(listPath, { replace, state: { meetingListKey: location.state?.meetingListKey } })
  const done = dialog === 'cancelled' || dialog === 'refunded'
  const closeDialog = () => {
    if (action) return
    if (done) returnToList(true)
    else setDialog(undefined)
  }
  return (
    <div className={inWaiting ? room.shell : detail.page}>
      <PageHeader
        title={inWaiting ? '모임 대기실' : '미리 약속한 모양'}
        action="back"
        onNavigate={() => returnToList()}
      />
      <div className={inWaiting ? room.room : detail.body}>
        {!meeting ? (
          <div className={detail.loadState}>
            <p role={loadFailed ? 'alert' : 'status'}>
              {loadFailed ? '모임 정보를 불러오지 못했어요.' : '모임 정보를 불러오고 있어요.'}
            </p>
            {loadFailed && (
              <Button onClick={() => setAttempt((value) => value + 1)}>다시 시도</Button>
            )}
          </div>
        ) : (
          <>
            <h2 className={detail.title}>{meeting.title}</h2>
            <div className={detail.tags}>
              {[
                meetingConcerns.find(({ id: code }) => code === meeting.category)?.label,
                ...(meeting.tags ?? []),
              ]
                .filter(Boolean)
                .map((tag, index) => (
                  <span key={`${tag}:${index}`}>{tag}</span>
                ))}
            </div>
            <p className={detail.description}>{meeting.description}</p>
            <p className={room.participantCount}>
              참여 {meeting.participantCount}/{meeting.capacity}명
            </p>
            {startAt !== null && Number.isFinite(startAt) && <p>{dateFormat.format(startAt)}</p>}
            {meeting.myMeetingNickname && <p>내 모임 닉네임 · {meeting.myMeetingNickname}</p>}
            {!inWaiting && Boolean(meeting.recommendedFor?.length) && (
              <section className={detail.section}>
                <h3>이런 분께 추천해요</h3>
                <ul className={detail.recommendations}>
                  {meeting.recommendedFor.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>
            )}
            {Boolean(meeting.steps?.length) && (
              <section className={detail.section}>
                <h3>이런 활동을 진행할 예정이에요</h3>
                <ol className={detail.steps}>
                  {meeting.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            )}
            <div className={inWaiting ? room.actions : detail.footer}>
              {loadFailed && (
                <p role="alert">
                  모임 상태를 다시 확인하지 못했어요.{' '}
                  <button
                    className={detail.retryLink}
                    type="button"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    다시 조회하기
                  </button>
                </p>
              )}
              {actionError && (
                <p className={detail.error} role="alert">
                  {actionError}
                </p>
              )}
              {meeting.status === 'CANCELED' && <p role="status">취소된 모임이에요.</p>}
              {meeting.status === 'ENDED' && (
                <Link to={`${path}/chat`} state={location.state}>
                  지난 대화 보기
                </Link>
              )}
              {delay && (
                <p role="status">
                  {graceExpired
                    ? '입장 유예 시간이 지났어요. 모임 상태를 다시 확인하고 있어요.'
                    : '서버에서 모임 시작 상태를 확인하고 있어요.'}
                </p>
              )}
              {applicationCancelled && !joined && !done && (
                <p role="status">신청을 취소한 모임에는 다시 신청할 수 없어요.</p>
              )}
              {open && !joined && !done && !applicationCancelled && (
                <>
                  <label className={room.nicknameField}>
                    모임에서 사용할 닉네임
                    <input
                      className={room.nicknameInput}
                      value={nickname}
                      maxLength={15}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder="비워 두면 내 양 닉네임을 사용해요"
                    />
                  </label>
                  <Button
                    disabled={
                      Boolean(action) ||
                      loadFailed ||
                      meeting.participantCount >= meeting.capacity ||
                      delay
                    }
                    onClick={() => void run('join')}
                  >
                    {scheduled ? '이 모임 신청하기' : '대기실 입장하기'}
                  </Button>
                  <p className={detail.caption}>참여하면 양털 1개가 사용돼요.</p>
                </>
              )}
              {(open || started) &&
                joined &&
                scheduled &&
                (inWaiting ? (
                  <>
                    {open && startAt !== null && now < startAt && (
                      <div className={room.countdown}>
                        <span>시작까지</span>
                        <time>
                          {formatRemainingTime(startAt - now, startAt - now >= 3_600_000)}
                        </time>
                      </div>
                    )}
                    <Button
                      disabled={!canEnter || Boolean(action) || !canAct}
                      onClick={() => void run('enter')}
                    >
                      {entered
                        ? '모임 시작을 기다리고 있어요'
                        : started
                          ? '다시 입장하기'
                          : '대기실 입장하기'}
                    </Button>
                    {now < enterAt && (
                      <p className={detail.caption}>모임 시작 5분 전부터 입장할 수 있어요.</p>
                    )}
                  </>
                ) : (
                  <Link
                    className={detail.reservationAction}
                    to={`${path}/waiting`}
                    state={location.state}
                  >
                    대기실로 이동
                  </Link>
                ))}
              {open &&
                joined &&
                !scheduled &&
                (meeting.isHost ? (
                  <Button
                    disabled={!meeting.canStart || Boolean(action) || !canAct}
                    onClick={() => void run('start')}
                  >
                    모임 시작하기
                  </Button>
                ) : (
                  <p role="status">방장이 모임을 시작하면 채팅으로 이동해요.</p>
                ))}
              {canCancel && (
                <Button
                  className={detail.outline}
                  disabled={Boolean(action) || !canAct}
                  onClick={() => setDialog('cancel')}
                >
                  {meeting.isHost || scheduled ? '모임 취소하기' : '대기실 나가기'}
                </Button>
              )}
              <Link to={listPath} state={{ meetingListKey: location.state?.meetingListKey }}>
                모임 목록으로 돌아가기
              </Link>
            </div>
          </>
        )}
      </div>
      <Modal isOpen={dialog === 'applied'} onClose={closeDialog} ariaLabel="모임 신청이 완료됐어요">
        <div className={detail.success}>
          <img src={applicationComplete} alt="" width={183} height={168} />
          <h2>모임 신청이 완료됐어요!</h2>
          <p>양털 1개를 사용했어요.</p>
          <Button onClick={closeDialog}>확인</Button>
        </div>
      </Modal>
      <Modal
        isOpen={dialog === 'cancel'}
        onClose={closeDialog}
        title={
          meeting?.isHost
            ? '모임을 취소하시겠어요?'
            : scheduled
              ? '모임 신청을 취소하시겠어요?'
              : '대기실에서 나가시겠어요?'
        }
        actions={[
          { label: '돌아가기', color: 'gray', onClick: closeDialog, disabled: Boolean(action) },
          {
            label: '확인',
            onClick: () => void run('cancel'),
            disabled: !canCancel || Boolean(action) || !canAct,
          },
        ]}
      >
        {meeting?.isHost && <p>참여자에게는 신청에 사용한 양털이 돌아가요.</p>}
        {(scheduled && now > refundAt) || (meeting?.isHost && !scheduled)
          ? '지금 취소하면 내가 사용한 양털은 반환되지 않아요.'
          : '취소 후 내 양털 환급 결과를 확인할 수 있어요.'}
        {actionError && <p role="alert">{actionError}</p>}
      </Modal>
      <Modal
        isOpen={done}
        onClose={closeDialog}
        title="취소가 완료됐어요."
        actions={[{ label: '확인', onClick: closeDialog }]}
      >
        {dialog === 'refunded' ? '내 양털 1개가 돌아왔어요.' : '내 양털은 반환되지 않았어요.'}
      </Modal>
    </div>
  )
}
