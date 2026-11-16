import { useEffect, useReducer } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { HomeLayout } from '@/components'
import { getMockMeeting, isMeetingStorageEvent } from './meetingMock'
import type { Meeting } from './meetingMock'
import { getMeetingEntry, getMeetingListPath, getMeetingPath } from './meetingEntry'
import type { MeetingNotice } from './meetingEntry'
import styles from './MeetingList.module.css'
import {
  canEnterWaitingRoom,
  isReservationStatusPending,
} from '@/features/meeting-reservation/reservationMock'

type MeetingScreen = 'detail' | 'waiting' | 'chat'

const screenMessage: Record<MeetingScreen, string> = {
  detail: '모임 상세 화면은 준비 중이에요.',
  waiting: '모임 대기실은 준비 중이에요.',
  chat: '모임 채팅 화면은 준비 중이에요.',
}

export const MeetingHandoff = ({ screen = 'detail' }: { screen?: MeetingScreen }) => {
  const { meetingId } = useParams<'meetingId'>()
  const { state } = useLocation()
  const navigate = useNavigate()
  const fromList = state?.fromMeetingList === true
  const fromReservation = screen === 'waiting' && state?.fromReservation === true
  const listPath = getMeetingListPath(state?.meetingListSearch)
  const [, refresh] = useReducer((revision: number) => revision + 1, 0)

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (isMeetingStorageEvent(event)) refresh()
    }
    window.addEventListener('storage', onStorage)
    const timer = screen === 'waiting' ? window.setInterval(refresh, 1000) : undefined
    return () => {
      window.removeEventListener('storage', onStorage)
      window.clearInterval(timer)
    }
  }, [screen])

  const listState = (meetingNotice: MeetingNotice) => ({
    meetingNotice,
    meetingListKey: state?.meetingListKey,
  })
  let meeting: Meeting | undefined
  try {
    meeting = getMockMeeting(meetingId)
  } catch {
    return <Navigate to={listPath} replace state={listState('unavailable')} />
  }
  const wrongKind = screen === 'detail' && meeting?.kind !== 'scheduled'
  if (!meeting || wrongKind) {
    return <Navigate to={listPath} replace state={listState('missing')} />
  }

  const entry = getMeetingEntry(meeting)
  if (entry.canEnter === false) {
    return <Navigate to={listPath} replace state={listState(entry.notice)} />
  }

  const pendingWaitingRoom =
    fromReservation &&
    meeting.kind === 'scheduled' &&
    Boolean(meeting.membership) &&
    isReservationStatusPending(meeting)
  if (
    screen === 'waiting' &&
    meeting.kind === 'scheduled' &&
    meeting.status === 'waiting' &&
    !canEnterWaitingRoom(meeting) &&
    !pendingWaitingRoom
  ) {
    if (fromReservation && !meeting.membership) {
      return <Navigate to={listPath} replace state={listState('reservation-cancelled')} />
    }
    return <Navigate to={`/meetings/${encodeURIComponent(meeting.id)}`} replace state={state} />
  }

  if ((screen === 'chat') !== (meeting.status === 'in-progress')) {
    return <Navigate to={getMeetingPath(meeting)} replace state={state} />
  }

  return (
    <HomeLayout>
      <section className={styles.handoff}>
        <h1>{meeting.title}</h1>
        <p role="status">
          {pendingWaitingRoom ? '모임 시작 상태를 확인하고 있어요.' : screenMessage[screen]}
        </p>
        {fromReservation ? (
          <button
            className={styles.backLink}
            type="button"
            onClick={() => {
              if (window.history.state?.idx > 0) navigate(-1)
              else navigate(`/meetings/${encodeURIComponent(meeting.id)}`, { replace: true })
            }}
          >
            모임 상세로 돌아가기
          </button>
        ) : fromList ? (
          <button
            className={styles.backLink}
            type="button"
            onClick={() => {
              if (window.history.state?.idx > 0) navigate(-1)
              else navigate(listPath, { replace: true })
            }}
          >
            모임 목록으로 돌아가기
          </button>
        ) : (
          <Link
            className={styles.backLink}
            to={screen === 'chat' ? '/meetings?tab=mine' : '/meetings'}
            replace
          >
            모임 목록으로 돌아가기
          </Link>
        )}
      </section>
    </HomeLayout>
  )
}
