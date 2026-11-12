import type { Meeting } from './meetingMock'

export const meetingNotices = {
  full: { title: '정원이 찬 모임이에요', message: '다른 모임을 찾아볼까요?' },
  started: {
    title: '이미 시작한 모임이에요',
    message: '모임이 시작된 뒤에는 새로 입장할 수 없어요.',
  },
  cancelled: { title: '취소된 모임이에요', message: '다른 모임을 찾아볼까요?' },
  missing: {
    title: '모임을 찾을 수 없어요',
    message: '모임 목록에서 다시 확인해 주세요.',
  },
}

export type MeetingNotice = keyof typeof meetingNotices

type MeetingEntry =
  { canEnter: true; label: string } | { canEnter: false; label: string; notice: MeetingNotice }

export const getMeetingPath = ({ id, kind, status }: Meeting) => {
  const path = `/meetings/${encodeURIComponent(id)}`
  if (status === 'in-progress') return `${path}/chat`
  return kind === 'live' ? `${path}/waiting` : path
}

export const getMeetingEntry = (meeting: Meeting): MeetingEntry => {
  if (meeting.status === 'cancelled') {
    return { canEnter: false, label: '취소된 모임', notice: 'cancelled' }
  }
  if (meeting.status === 'in-progress') {
    if (meeting.membership && meeting.hasEntered) {
      return { canEnter: true, label: '다시 입장하기' }
    }
    return {
      canEnter: false,
      label: '진행 중인 모임',
      notice: 'started',
    }
  }
  if (meeting.membership) {
    return {
      canEnter: true,
      label: meeting.hasEntered ? '대기실로 돌아가기' : '대기실 입장하기',
    }
  }
  if (meeting.participants >= meeting.capacity) {
    return { canEnter: false, label: '정원이 찼어요', notice: 'full' }
  }
  return { canEnter: true, label: '대기실 입장하기' }
}
