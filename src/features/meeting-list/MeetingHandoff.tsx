import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { HomeLayout } from '@/components'
import { getMockMeeting } from './meetingMock'
import type { Meeting } from './meetingMock'
import { getMeetingEntry, getMeetingListPath, getMeetingPath } from './meetingEntry'
import type { MeetingNotice } from './meetingEntry'
import styles from './MeetingList.module.css'

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
  const listPath = getMeetingListPath(state?.meetingListSearch)
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
  const wrongKind =
    (screen === 'waiting' && meeting?.kind !== 'live') ||
    (screen === 'detail' && meeting?.kind !== 'scheduled')
  if (!meeting || wrongKind) {
    return <Navigate to={listPath} replace state={listState('missing')} />
  }

  const entry = getMeetingEntry(meeting)
  if (entry.canEnter === false) {
    return <Navigate to={listPath} replace state={listState(entry.notice)} />
  }

  if ((screen === 'chat') !== (meeting.status === 'in-progress')) {
    return <Navigate to={getMeetingPath(meeting)} replace state={state} />
  }

  return (
    <HomeLayout>
      <section className={styles.handoff}>
        <h1>{meeting.title}</h1>
        <p>{screenMessage[screen]}</p>
        {fromList ? (
          <button className={styles.backLink} type="button" onClick={() => navigate(-1)}>
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
