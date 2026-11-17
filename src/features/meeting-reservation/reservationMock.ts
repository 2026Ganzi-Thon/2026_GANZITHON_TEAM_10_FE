import {
  getReflectionStorageKey,
  getWoolBalance,
  updateMeetingReservation,
} from '@/lib/mock-reflections'
import type { MockMeetingReservation } from '@/lib/mock-reflections'
import { getMockStorageScope } from '@/lib/mock-storage'
import { getMockMeeting } from '@/features/meeting-list/meetingMock'
import type { MeetingConcern, ScheduledMeeting } from '@/features/meeting-list/meetingMock'

export const refundDeadline = 10 * 60 * 1000
export const waitingRoomLeadTime = 5 * 60 * 1000
export const scheduledStartGrace = 2 * 60 * 1000

export const meetingSteps = [
  '가볍게 자기소개하기',
  '오늘의 주제로 그림 그리기',
  '그림으로 이야기 나누기',
  '오늘의 이야기 마무리하기',
]

const recommendationByConcern: Record<MeetingConcern, string> = {
  STUDY_CAREER: '학업이나 진로, 일에서 느낀 마음을 정리하고 싶은 분',
  LOVE: '연애나 이별에서 느낀 감정을 돌아보고 싶은 분',
  RELATION_FAMILY: '대인관계에서 고민이 있거나, 감정을 정리하고 싶은 분',
  SELF_HEALTH: '나의 감정과 건강을 돌아보며 마음을 정리하고 싶은 분',
  DAILY_FUTURE: '일상과 미래에 대한 생각을 그림으로 표현하고 싶은 분',
  MONEY: '경제적인 고민에서 느낀 마음을 나누고 싶은 분',
}

export const getMeetingRecommendations = (concern: MeetingConcern) => [
  recommendationByConcern[concern],
  '비슷한 경험을 가진 사람들과 이야기를 나누고 싶은 분',
  '그림을 통해 나를 표현하는 시간을 가져보고 싶은 분',
]

type ReservationErrorCode = 'full' | 'started' | 'cancelled' | 'missing' | 'wool'

export class ReservationError extends Error {
  readonly code: ReservationErrorCode

  constructor(code: ReservationErrorCode) {
    super(code)
    this.code = code
  }
}

export class ReservationChangedError extends Error {}

const waitForResponse = (signal: AbortSignal, delay = 400) => {
  signal.throwIfAborted()
  const scope = getMockStorageScope()
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      if (getMockStorageScope() !== scope) reject(new Error('로그인 정보가 변경됐어요.'))
      else resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const requireMeeting = (
  id: string,
  reservations?: Record<string, MockMeetingReservation>,
): ScheduledMeeting => {
  const meeting = getMockMeeting(id, reservations)
  if (!meeting || meeting.kind !== 'scheduled') throw new ReservationError('missing')
  if (meeting.status === 'cancelled') throw new ReservationError('cancelled')
  return meeting
}

export const loadReservation = async (
  id: string,
  signal: AbortSignal,
  { fail = false, delay = 400 } = {},
) => {
  await waitForResponse(signal, delay)
  if (fail) throw new Error('모임 정보를 불러오지 못했어요.')
  return requireMeeting(id)
}

export const canRefundReservation = (meeting: ScheduledMeeting, now = Date.now()) =>
  meeting.status === 'waiting' &&
  meeting.startAt - now >= refundDeadline &&
  (!meeting.membership || meeting.woolPaid === true)

export const canEnterWaitingRoom = (meeting: ScheduledMeeting, now = Date.now()) =>
  Boolean(meeting.membership) &&
  meeting.status === 'waiting' &&
  now >= meeting.startAt - waitingRoomLeadTime &&
  now < meeting.startAt + scheduledStartGrace

export const isReservationStatusPending = (meeting: ScheduledMeeting, now = Date.now()) =>
  meeting.status === 'waiting' && now >= meeting.startAt + scheduledStartGrace

const getReservation = (meeting: ScheduledMeeting): MockMeetingReservation => ({
  joined: Boolean(meeting.membership),
  isHost: meeting.membership === 'host',
  cancelled: false,
  participantDelta: 0,
  woolChange: 0,
  startAt: meeting.startAt,
})

type ApplicationResult = { meeting: ScheduledMeeting; applied: boolean }

export const applyForMeeting = async (
  id: string,
  signal: AbortSignal,
  {
    fail = false,
    full = false,
    delay = 400,
    expectedStartAt,
  }: { fail?: boolean; full?: boolean; delay?: number; expectedStartAt?: number } = {},
) => {
  const key = getReflectionStorageKey()
  await waitForResponse(signal, delay)
  if (fail) throw new Error('모임을 신청하지 못했어요. 다시 시도해 주세요.')
  return updateMeetingReservation<ApplicationResult>(key, id, signal, (store) => {
    const reservations = store.meetingReservations ?? {}
    const meeting = requireMeeting(id, reservations)
    if (expectedStartAt !== undefined && meeting.startAt !== expectedStartAt) {
      throw new ReservationChangedError(
        '모임 일정이 변경됐어요. 새 일정을 확인한 뒤 다시 신청해 주세요.',
      )
    }
    if (meeting.membership) return { result: { meeting, applied: false } }
    if (meeting.status !== 'waiting' || Date.now() >= meeting.startAt) {
      throw new ReservationError('started')
    }
    if (full || meeting.participants >= meeting.capacity) throw new ReservationError('full')
    if (getWoolBalance(store) < 1) throw new ReservationError('wool')
    const current = reservations[id] ?? getReservation(meeting)
    return {
      reservation: {
        ...current,
        joined: true,
        isHost: false,
        participantDelta: current.participantDelta + 1,
        woolChange: current.woolChange - 1,
        startAt: meeting.startAt,
      },
      result: {
        meeting: {
          ...meeting,
          membership: 'participant',
          participants: meeting.participants + 1,
          woolPaid: true,
        },
        applied: true,
      },
    }
  })
}

type CancellationResult = { refunded: boolean; cancelled: boolean; alreadyCancelled: boolean }

export const cancelReservation = async (
  id: string,
  signal: AbortSignal,
  { fail = false, delay = 400 } = {},
) => {
  const key = getReflectionStorageKey()
  await waitForResponse(signal, delay)
  if (fail) throw new Error('모임을 취소하지 못했어요. 다시 시도해 주세요.')
  return updateMeetingReservation<CancellationResult>(key, id, signal, (store) => {
    const reservations = store.meetingReservations ?? {}
    const meeting = requireMeeting(id, reservations)
    if (meeting.status !== 'waiting') throw new ReservationError('started')
    if (!meeting.membership) {
      return { result: { refunded: false, cancelled: false, alreadyCancelled: true } }
    }
    const now = Date.now()
    if (isReservationStatusPending(meeting, now)) {
      throw new Error('모임 시작 상태를 확인한 뒤 다시 시도해 주세요.')
    }
    const current = reservations[id] ?? getReservation(meeting)
    const refunded = canRefundReservation(meeting, now) && current.woolChange < 0
    const cancelled = meeting.membership === 'host'
    return {
      reservation: {
        ...current,
        joined: false,
        cancelled,
        participantDelta: current.participantDelta - 1,
        woolChange: current.woolChange + Number(refunded),
      },
      result: { refunded, cancelled, alreadyCancelled: false },
    }
  })
}
