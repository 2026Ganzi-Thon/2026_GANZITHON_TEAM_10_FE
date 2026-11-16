import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faArrowUp, faLock } from '@fortawesome/free-solid-svg-icons'
import { Button, Input, Modal, PageHeader, SheepProfile } from '@/components'
import { getMeetingEntry, getMeetingListPath } from '@/features/meeting-list/meetingEntry'
import {
  getMockMeetingFixture,
  isMeetingStorageEvent,
  meetingConcerns,
} from '@/features/meeting-list/meetingMock'
import type { Meeting } from '@/features/meeting-list/meetingMock'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { autoAdmissionLead, readWaitingRoom, updateWaitingRoom } from './waitingRoomMock'
import type { RoomAction, WaitingRoom } from './waitingRoomMock'
import clockIcon from '@/assets/meeting-waiting-room/clock.svg'
import smallClockIcon from '@/assets/meeting-waiting-room/clock-small.svg'
import participantsIcon from '@/assets/meeting-waiting-room/participants.svg'
import editIcon from '@/assets/meeting-waiting-room/edit.svg'
import emptySlotIcon from '@/assets/meeting-waiting-room/empty-slot.svg'
import plusIcon from '@/assets/meeting-waiting-room/plus.svg'
import styles from './MeetingWaitingRoom.module.css'

const activitySteps = [
  '가볍게 자기소개하기',
  '오늘의 주제로 그림 그리기',
  '그림으로 이야기 나누기',
  '오늘의 이야기 마무리하기',
]

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const formatCountdown = (remaining: number) => {
  const seconds = Math.max(0, Math.ceil(remaining / 1000))
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

type RouteState = {
  fromMeetingList?: boolean
  fromReservation?: boolean
  meetingListSearch?: string
  meetingListKey?: string
} | null

type RoomView = 'waiting' | 'chat'

export const MeetingWaitingRoom = ({ view }: { view: RoomView }) => {
  const { meetingId } = useParams<'meetingId'>()
  const { search, state } = useLocation()
  const scope = useMockStorageScope()
  const [, setAttempt] = useState(0)
  const scenario = import.meta.env.DEV ? new URLSearchParams(search).get('mock') : null

  return (
    <WaitingRoomScreen
      key={JSON.stringify([scope, meetingId, scenario])}
      view={view}
      meetingId={meetingId}
      scope={scope}
      scenario={scenario}
      search={search}
      origin={state as RouteState}
      onRetry={() => setAttempt((attempt) => attempt + 1)}
    />
  )
}

const WaitingRoomScreen = ({
  view,
  meetingId,
  scope,
  scenario,
  search,
  origin,
  onRetry,
}: {
  view: RoomView
  meetingId?: string
  scope: string | null
  scenario: string | null
  search: string
  origin: RouteState
  onRetry: () => void
}) => {
  const navigate = useNavigate()
  const [openedAt] = useState(Date.now)
  const [now, setNow] = useState(openedAt)
  const [visibleSince, setVisibleSince] = useState(() =>
    document.visibilityState === 'visible' ? openedAt : null,
  )
  const [modal, setModal] = useState<'nickname' | 'leave' | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<RoomAction | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const entryFailure = useRef(false)
  const wasEntered = useRef(false)
  const listPath = getMeetingListPath(origin?.meetingListSearch)
  const listState = { meetingListKey: origin?.meetingListKey }
  const detailPath = `/meetings/${encodeURIComponent(meetingId ?? '')}`

  let meeting: Meeting | undefined
  let room: WaitingRoom | undefined
  let loadError = false
  try {
    meeting = getMockMeetingFixture(meetingId)
    if (meeting && !scope) throw new Error('로그인 정보를 확인할 수 없어요.')
    if (meeting && scope) room = readWaitingRoom(meeting, scope, scenario, now, openedAt)
  } catch {
    loadError = true
  }

  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const refreshVisibility = () => {
      setVisibleSince(document.visibilityState === 'visible' ? Date.now() : null)
      refresh()
    }
    const onStorage = (event: StorageEvent) => {
      if (isMeetingStorageEvent(event)) refresh()
    }
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', refreshVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', refreshVisibility)
      request.current?.abort()
      request.current = null
    }
  }, [])

  const returnToList = () => {
    if (origin?.fromMeetingList && !origin.fromReservation && window.history.state?.idx > 0) {
      navigate(-1)
    } else {
      navigate(listPath, { replace: true, state: listState })
    }
  }

  const returnToDetail = () => {
    if (origin?.fromReservation && window.history.state?.idx > 0) navigate(-1)
    else navigate(`${detailPath}${search}`, { replace: true, state: origin })
  }

  const run = useCallback(
    async (action: RoomAction, nickname?: string) => {
      if (request.current || !scope) return false
      const controller = new AbortController()
      request.current = controller
      setPending(action)
      setError('')
      const fail = scenario === 'entry-error' && action === 'join' && !entryFailure.current
      if (fail) entryFailure.current = true
      try {
        await updateWaitingRoom({
          loadMeeting: () => getMockMeetingFixture(meetingId),
          scope,
          scenario,
          openedAt,
          action,
          signal: controller.signal,
          nickname,
          fail,
        })
        if (controller.signal.aborted) return false
        setNow(Date.now())
        return true
      } catch (cause) {
        if (!controller.signal.aborted) {
          const message = cause instanceof Error && cause.name === 'Error' ? cause.message : null
          setError(message || '요청을 처리하지 못했어요. 다시 시도해 주세요.')
          setNow(Date.now())
        }
        return false
      } finally {
        if (request.current === controller) {
          request.current = null
          setPending(null)
        }
      }
    },
    [meetingId, openedAt, scenario, scope],
  )

  const live = meeting?.kind === 'live'
  const autoJoin =
    view === 'waiting' &&
    visibleSince !== null &&
    room?.canJoin &&
    (live ||
      (room.startAt !== null &&
        visibleSince <= room.startAt - autoAdmissionLead &&
        now >= room.startAt - autoAdmissionLead &&
        now < room.startAt))

  const entered = Boolean(room?.entered)
  const phase = room?.phase
  const meetingListKey = origin?.meetingListKey

  useEffect(() => {
    if (entered) {
      wasEntered.current = true
      return
    }
    if (live && wasEntered.current && phase === 'OPEN') {
      navigate(listPath, { replace: true, state: { meetingListKey } })
      return
    }
    if (!autoJoin || error || pending) return
    const timer = window.setTimeout(() => void run('join'), 0)
    return () => window.clearTimeout(timer)
  }, [autoJoin, entered, error, listPath, live, meetingListKey, navigate, pending, phase, run])

  if (loadError) {
    return (
      <>
        <PageHeader title="모임 대기하기" action="back" onNavigate={returnToList} />
        <section className={styles.notice}>
          <h2>모임 상태를 불러오지 못했어요</h2>
          <Button
            onClick={() => {
              setNow(Date.now())
              onRetry()
            }}
          >
            다시 시도하기
          </Button>
        </section>
      </>
    )
  }

  const closeModal = () => {
    if (!pending) {
      setModal(null)
      setError('')
    }
  }

  if (!meeting || !room) {
    return <Navigate to={listPath} replace state={{ ...listState, meetingNotice: 'missing' }} />
  }

  const entry = getMeetingEntry(meeting)
  if (entry.canEnter === false && entry.notice === 'full' && !room.entered) {
    return <Navigate to={listPath} replace state={{ ...listState, meetingNotice: entry.notice }} />
  }
  if (room.phase === 'CANCELED') {
    return (
      <>
        <PageHeader title="모임 대기하기" action="back" onNavigate={returnToList} />
        <section className={styles.notice}>
          <h2>{meeting.title}</h2>
        </section>
        <Modal
          isOpen
          title="모임이 취소됐어요"
          onClose={returnToList}
          actions={[{ label: '모임 목록으로 돌아가기', onClick: returnToList }]}
        >
          <p className={styles.modalText}>
            {room.autoCancelled
              ? '2분 동안 참여자가 2명 이상 모이지 않았어요.'
              : room.closedByHost
                ? '방장이 모임을 닫았어요.'
                : '모임이 취소되어 더 이상 참여할 수 없어요.'}
            {room.refundableWool > 0 && (
              <>
                <br />
                사용한 양털 {room.refundableWool}개는 환급 대상이에요.
              </>
            )}
          </p>
        </Modal>
      </>
    )
  }

  if (room.phase === 'IN_PROGRESS' && !room.entered) {
    return <Navigate to={listPath} replace state={{ ...listState, meetingNotice: 'started' }} />
  }
  if (meeting.kind === 'scheduled' && !meeting.membership) {
    return <Navigate to={`${detailPath}${search}`} replace state={origin} />
  }

  const chatPath = `${detailPath}/chat${search}`
  if (
    view === 'waiting' &&
    room.entered &&
    modal !== 'nickname' &&
    (!live || room.phase === 'IN_PROGRESS')
  ) {
    return <Navigate to={chatPath} replace state={origin} />
  }
  if (view === 'chat' && (!room.entered || (live && room.phase !== 'IN_PROGRESS'))) {
    return <Navigate to={`${detailPath}/waiting${search}`} replace state={origin} />
  }

  const back = () => {
    if (pending) return
    if (live && room.entered && room.phase === 'OPEN') setModal('leave')
    else if (meeting.kind === 'scheduled' && room.phase !== 'IN_PROGRESS') returnToDetail()
    else returnToList()
  }

  const leaveModal = (
    <Modal
      isOpen={modal === 'leave'}
      onClose={closeModal}
      title="모임에서 나가시겠어요?"
      actions={[
        {
          label:
            pending === 'leave' ? '처리 중…' : room.isHost && live ? '모임 삭제하기' : '나가기',
          color: 'gray',
          disabled: Boolean(pending),
          onClick: () => {
            void run('leave').then((left) => {
              if (left) {
                if (live) returnToList()
                else returnToDetail()
              }
            })
          },
        },
        { label: '계속 참여하기', onClick: closeModal, disabled: Boolean(pending) },
      ]}
    >
      <p className={styles.modalText}>
        {live
          ? room.isHost
            ? '방장이 나가면 모임이 닫혀요.'
            : room.refundableWool > 0
              ? '시작 전에 나가면 사용한 양털 1개를 돌려드려요.'
              : '참여를 종료하고 모임 목록으로 돌아가요.'
          : '대기를 나가도 모임 예약은 유지돼요.'}
      </p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  )

  if (view === 'chat') {
    return (
      <>
        <WaitingChat
          meeting={meeting}
          room={room}
          now={now}
          onBack={back}
          onLeave={() => setModal('leave')}
        />
        {leaveModal}
      </>
    )
  }

  const concern = meetingConcerns.find(({ id }) => id === meeting.concern)?.label
  const beforeEntry = room.phase === 'RECRUITING'
  const inGrace = room.startAt !== null && now >= room.startAt
  const showJoinError = Boolean(error && modal === null)
  const insufficientWool = live && scenario === 'insufficient-wool' && showJoinError

  return (
    <>
      <PageHeader title={live ? '모임 대기하기' : '예약한 모임'} action="back" onNavigate={back} />
      <div className={styles.room}>
        <section className={styles.intro} aria-label="모임 정보">
          <p className={styles.starting}>
            <img src={clockIcon} alt="" /> {beforeEntry ? '시작 예정' : '곧 시작합니다'}
          </p>
          <h2>{meeting.title}</h2>
          <div className={styles.metadata}>
            <span className={styles.concern}>{concern}</span>
            <span>
              <img src={participantsIcon} alt="" /> {room.participants.length}/{meeting.capacity}명
            </span>
            {room.startAt !== null && (
              <span>
                <img src={smallClockIcon} alt="" /> {timeFormatter.format(room.startAt)} 시작
              </span>
            )}
          </div>
          <p className={styles.description}>
            {live ? (
              room.isHost ? (
                <>
                  모임을 시작할 준비가 되셨나요?
                  <br />
                  참여 인원을 확인하고 원하는 시점에 시작해 주세요.
                </>
              ) : (
                <>
                  모임은 방장이 시작하면 진행돼요.
                  <br />
                  미리 입장해 다른 참여자들과 함께 기다려 주세요.
                </>
              )
            ) : (
              <>
                모임 시작 5분 전부터 입장할 수 있어요.
                <br />이 화면을 열어두면 시작 1분 전에 자동으로 입장해요.
              </>
            )}
          </p>
          {room.startAt !== null && (
            <div className={styles.countdown}>
              <span>시작까지 남은 시간</span>
              <time role="timer">{formatCountdown(room.startAt - now)}</time>
              {inGrace && <p role="status">참여자가 2명 모일 때까지 최대 2분 기다려요.</p>}
            </div>
          )}
        </section>

        <section>
          <h3>이런 활동을 진행할 예정이에요</h3>
          <ol className={styles.steps}>
            {activitySteps.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h3>모임에서 사용할 프로필이에요</h3>
          <p className={styles.profileHint}>
            모임에서 사용할 이름을 입력해 주세요.
            <br />
            다른 참여자에게 개인 정보가 공개되지 않아요.
          </p>
          <div className={styles.profile}>
            <SheepProfile color="purple" size={40} alt="" />
            <strong>{room.nickname}</strong>
            <button
              type="button"
              aria-label="닉네임 수정"
              disabled={Boolean(pending)}
              onClick={() => {
                setDraft(room.nickname)
                setError('')
                setModal('nickname')
              }}
            >
              <img src={editIcon} alt="" />
            </button>
          </div>
        </section>

        <section>
          <h3>
            참여자{' '}
            <span className={styles.participantCount}>
              {room.participants.length}/{meeting.capacity}명
            </span>
          </h3>
          <ul className={styles.participants}>
            {room.participants.map(({ id, color, nickname }) => (
              <li key={id}>
                <SheepProfile color={color} size={40} alt="" />
                <span>{nickname}</span>
              </li>
            ))}
            {Array.from(
              { length: Math.max(0, meeting.capacity - room.participants.length) },
              (_, index) => (
                <li key={`empty-${index}`} aria-hidden="true">
                  <span className={styles.emptySlot}>
                    <img src={emptySlotIcon} alt="" />
                    <img src={plusIcon} alt="" />
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>

        <section className={styles.guide}>
          <h3>시작 전 확인해 주세요</h3>
          <ul>
            <li>
              {live
                ? '모임에 참여할 때 양털 1개가 사용돼요.'
                : '시작 10분 전까지 신청을 취소하면 양털을 돌려드려요.'}
            </li>
            <li>종이나 앱 중 편한 방법을 선택해 자유롭게 그림을 그려요.</li>
            <li>그림을 잘 그리지 않아도 괜찮아요. 편안하게 마음을 표현해 주세요.</li>
            <li>모두 같은 주제로 정해진 시간 동안 자유롭게 그림을 그려요.</li>
            <li>완성한 그림을 공유하고 채팅으로 서로의 이야기를 나눠요.</li>
            <li>서로의 그림과 감정을 존중하고, 모임에서 나눈 이야기는 외부에 공유하지 않아요.</li>
            <li>
              욕설, 비방, 차별적 발언, 성희롱은 금지되며, 다른 참여자의 그림을 함부로 평가하거나
              심리 상태를 단정하지 말아 주세요.
            </li>
            <li>
              지난 대화는 모임 종료 후 24시간 동안 확인할 수 있어요. 내가 그린 그림은 개인 기록에
              남아요.
            </li>
          </ul>
        </section>

        <div className={styles.actions}>
          {showJoinError && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {live && !room.isHost && !showJoinError && (
            <div className={styles.waiting} role="status">
              <strong>
                {pending === 'join' ? '대기실에 입장하고 있어요' : '모임 시작 대기중'}
              </strong>
              <p>방장이 시작하면 자동으로 이동해요.</p>
            </div>
          )}
          {live && room.isHost && (
            <>
              <Button
                disabled={!room.canStart || !room.entered || Boolean(pending)}
                onClick={() => void run('start')}
              >
                {pending === 'start' ? '시작 중…' : '모임 시작하기'}
              </Button>
              <p className={styles.buttonHint}>
                {!room.canStart && '2명 이상 대기하면 시작할 수 있어요.'}
              </p>
            </>
          )}
          {(meeting.kind === 'scheduled' || (live && !room.entered && showJoinError)) && (
            <Button disabled={!room.canJoin || Boolean(pending)} onClick={() => void run('join')}>
              {pending === 'join' ? '입장 중…' : showJoinError ? '다시 입장하기' : '모임 입장하기'}
            </Button>
          )}
          {meeting.kind === 'scheduled' && !inGrace && (
            <button
              type="button"
              className={styles.secondaryAction}
              onClick={returnToDetail}
              disabled={Boolean(pending)}
            >
              모임 취소하기
            </button>
          )}
        </div>
      </div>
      <Modal
        isOpen={insufficientWool}
        title="양털이 부족해요"
        onClose={returnToList}
        actions={[{ label: '확인', onClick: returnToList }]}
      >
        <p className={styles.modalText}>모임에 참여하려면 양털 1개가 필요해요.</p>
      </Modal>
      <Modal
        isOpen={modal === 'nickname'}
        onClose={closeModal}
        title="닉네임 수정"
        actions={[
          { label: '취소', color: 'gray', onClick: closeModal, disabled: Boolean(pending) },
          {
            label: '저장하기',
            disabled: !draft.trim() || Boolean(pending),
            onClick: () => {
              void run('rename', draft).then((saved) => {
                if (saved) setModal(null)
              })
            },
          },
        ]}
      >
        <div className={styles.nicknameField}>
          <Input
            id="meeting-nickname"
            label="닉네임"
            className={styles.nicknameInput}
            value={draft}
            disabled={Boolean(pending)}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <p className={styles.nicknameHint}>실명보다 편하게 불리고 싶은 이름을 권해요.</p>
        {error && <p role="alert">{error}</p>}
      </Modal>
      {leaveModal}
    </>
  )
}

const WaitingChat = ({
  meeting,
  room,
  now,
  onBack,
  onLeave,
}: {
  meeting: Meeting
  room: WaitingRoom
  now: number
  onBack: () => void
  onLeave: () => void
}) => {
  if (room.phase === 'IN_PROGRESS') {
    return (
      <>
        <PageHeader title={meeting.title} action="back" onNavigate={onBack} />
        <section className={styles.notice}>
          <h2>모임이 시작됐어요</h2>
          <p>모임 채팅 화면은 준비 중이에요.</p>
          <Button onClick={onBack}>모임 목록으로 돌아가기</Button>
        </section>
      </>
    )
  }
  const inGrace = room.startAt !== null && now >= room.startAt
  return (
    <div className={styles.chat}>
      <header className={styles.chatHeader}>
        <button type="button" onClick={onBack} aria-label="뒤로 가기">
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <button type="button" disabled>
          다음 단계
        </button>
        <button type="button" onClick={onLeave}>
          대화 종료
        </button>
      </header>
      <h1 className={styles.visuallyHidden}>{meeting.title} 채팅 대기</h1>
      <div className={styles.chatContent}>
        <SheepProfile color="white" size={40} alt="모양" />
        <div className={styles.bubbles}>
          <p>
            안녕하세요! 모양의 그림 나눔 모임에 오신 걸 환영해요. 모임이 곧 시작될 예정이에요. 다른
            참여자들이 들어올 때까지 편안하게 기다려 주세요!
          </p>
          {room.isHost && (
            <p>
              방장님, 반가워요! 모두가 이야기를 충분히 나누었다면 ‘다음 단계로’ 버튼을 눌러 주세요.
            </p>
          )}
          {inGrace && (
            <p role="status">
              아직 모임 시작에 필요한 인원이 모이지 않았어요. 모임은 2명 이상 모이면 자동으로
              시작돼요. 예정 시각부터 최대 2분 동안 다른 참여자를 기다릴게요.
            </p>
          )}
        </div>
      </div>
      <div className={styles.lockedComposer} aria-label="모임이 시작되면 대화할 수 있어요">
        <FontAwesomeIcon icon={faLock} />
        <FontAwesomeIcon icon={faArrowUp} />
      </div>
    </div>
  )
}
