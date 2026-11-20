import { MoyangApiError, moyangRequest } from '@/lib/moyang-api'
import { getMockStorageScope } from '@/lib/mock-storage'
import {
  forgetTrackedServerMeeting,
  readServerPastMeetings,
  readTrackedServerMeetings,
  rememberExpiredServerMeeting,
  rememberServerPastMeeting,
  trackServerMeeting,
} from './serverMeetingHistory'
import type { Meeting, MeetingConcern, MeetingListData } from './meetingMock'

export type MeetingStatus = 'RECRUITING' | 'OPEN' | 'IN_PROGRESS' | 'ENDED' | 'CANCELED'
export type MeetingPhase = 'INTRO' | 'DRAWING' | 'SHARING' | 'CLOSING'
type Summary = {
  meetingId: number
  type: 'LIVE' | 'SCHEDULED'
  title: string
  summary: string
  category: MeetingConcern
  startAt: string | null
  capacity: Meeting['capacity']
  participantCount: number
  status: MeetingStatus
  joined?: boolean
  isHost?: boolean
}

export type MeetingDetail = Omit<Summary, 'summary'> & {
  description: string
  tags: string[]
  steps: string[]
  recommendedFor: string[]
  topic: string | null
  enterOpenAt: string | null
  cancelRefundUntil: string | null
  cancelReason: string | null
  myMeetingNickname: string | null
  minParticipants: number
  canStart: boolean
  canSkip: boolean
  phase: MeetingPhase | null
}

const mapMeeting = (meeting: Summary): Meeting => {
  const common = {
    id: String(meeting.meetingId),
    title: meeting.title,
    description: meeting.summary,
    concern: meeting.category,
    capacity: meeting.capacity,
    participants: meeting.participantCount,
    status:
      meeting.status === 'IN_PROGRESS'
        ? 'in-progress'
        : meeting.status === 'CANCELED' || meeting.status === 'ENDED'
          ? 'cancelled'
          : 'waiting',
    membership: meeting.isHost ? 'host' : meeting.joined ? 'participant' : undefined,
    hasEntered:
      meeting.status === 'IN_PROGRESS' || (meeting.type === 'LIVE' && Boolean(meeting.joined)),
    server: true,
  } as const
  return meeting.type === 'LIVE'
    ? { ...common, kind: 'live' }
    : { ...common, kind: 'scheduled', startAt: Date.parse(meeting.startAt ?? '') }
}

export const loadServerMeetings = async (
  concern: MeetingConcern | undefined,
  signal: AbortSignal,
): Promise<MeetingListData> => {
  const api = moyangRequest(signal)
  const scope = getMockStorageScope()
  const [live, scheduled, mine] = await Promise.all([
    api.json<{ meetings: Summary[] }>('/api/meetings', {
      params: { type: 'LIVE', category: concern },
    }),
    api.json<{ meetings: Summary[] }>('/api/meetings', {
      params: { type: 'SCHEDULED', category: concern },
    }),
    api.json<{ meetings: Summary[] }>('/api/meetings/me'),
  ])
  const meetings = [...live.meetings, ...scheduled.meetings].map(mapMeeting)
  const activeMine = mine.meetings.filter(
    ({ status }) => status !== 'ENDED' && status !== 'CANCELED',
  )
  const myMeetings = activeMine.map((meeting) => mapMeeting({ ...meeting, joined: true }))
  const activeIds = new Set([...meetings, ...myMeetings].map(({ id }) => id))
  const history = scope ? readServerPastMeetings(scope) : []
  const pastMeetings = new Map(history.map((meeting) => [meeting.id, meeting]))
  let recheckHistory = false
  if (scope) {
    activeMine.forEach((meeting) => trackServerMeeting(scope, meeting))
    const pending = readTrackedServerMeetings(scope).filter(
      ({ id }) => !activeIds.has(id) && !pastMeetings.has(id),
    )
    for (let index = 0; index < pending.length; index += 4) {
      signal.throwIfAborted()
      const batch = await Promise.all(
        pending.slice(index, index + 4).map(async (meeting) => {
          try {
            const chat = await getServerMeetingChat(meeting.id, signal)
            if (chat.status === 'CANCELED') {
              forgetTrackedServerMeeting(scope, meeting.id)
              return
            }
            const restored = rememberServerPastMeeting(scope, meeting, chat)
            if (!restored) recheckHistory = true
            return restored
          } catch (error) {
            if (error instanceof MoyangApiError && error.status === 403) {
              forgetTrackedServerMeeting(scope, meeting.id)
              return
            }
            if (!(error instanceof MoyangApiError) || error.code !== 'MEETING_NOT_FOUND') {
              recheckHistory = true
              return
            }
            try {
              const reflection = await getMeetingReflection(meeting.id, signal)
              if (String(reflection.meetingId) === meeting.id && reflection.drawing?.drawingId)
                return rememberExpiredServerMeeting(scope, meeting)
            } catch (error) {
              if (error instanceof MoyangApiError && [403, 404].includes(error.status ?? 0)) {
                forgetTrackedServerMeeting(scope, meeting.id)
                return
              }
            }
            recheckHistory = true
          }
        }),
      )
      batch.forEach((meeting) => {
        if (meeting) pastMeetings.set(meeting.id, meeting)
      })
    }
  }
  signal.throwIfAborted()
  if (scope !== getMockStorageScope()) throw new DOMException('Request cancelled', 'AbortError')
  return {
    meetings,
    myMeetings,
    recheckHistory,
    pastMeetings: [...pastMeetings.values()]
      .filter(({ id }) => !activeIds.has(id))
      .sort((left, right) => right.endAt - left.endAt),
  }
}

const roomPath = (id: string) => `/api/meetings/${encodeURIComponent(id)}`
export const getServerMeeting = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json<MeetingDetail>(roomPath(id))

export const joinServerMeeting = (id: string, nickname: string, signal: AbortSignal) =>
  moyangRequest(signal).json<{ sheepUsed: number }>(`${roomPath(id)}/participants`, {
    method: 'POST',
    data: nickname ? { meetingNickname: nickname } : {},
  })

export const enterServerMeeting = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json<{ status: MeetingStatus }>(`${roomPath(id)}/enter`, { method: 'POST' })

export const startServerMeeting = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json<{ status: MeetingStatus }>(`${roomPath(id)}/start`, { method: 'POST' })

export const cancelServerMeeting = async (id: string, host: boolean, signal: AbortSignal) => {
  const api = moyangRequest(signal)
  if (host) {
    const result = await api.json<{ hostRefunded: boolean }>(roomPath(id), { method: 'DELETE' })
    return result.hostRefunded
  }
  const result = await api.json<{ refunded: boolean }>(`${roomPath(id)}/participants/me`, {
    method: 'DELETE',
  })
  return result.refunded
}

export type ServerMeetingMessage = {
  messageId: number
  type: 'TEXT' | 'DRAWING' | 'SYSTEM'
  senderNickname: string | null
  content: string | null
  imageUrl: string | null
  mine: boolean
  createdAt: string
}

export type MeetingChatData = {
  status: MeetingStatus
  phase: MeetingPhase | null
  currentStep: number | null
  topic: string | null
  submittedDrawingCount: number
  participantCount: number
  endAgreed: boolean
  endAgreedCount: number
  endAt: string | null
  deleteAt: string | null
  messages: ServerMeetingMessage[]
}

export const getServerMeetingChat = (id: string, signal: AbortSignal, afterId?: number) =>
  moyangRequest(signal).json<MeetingChatData>(`${roomPath(id)}/messages`, { params: { afterId } })

export const sendMeetingMessage = (
  id: string,
  signal: AbortSignal,
  data:
    { type: 'TEXT'; content: string } | { type: 'DRAWING'; drawingId: number; content?: string },
) =>
  moyangRequest(signal).json<{ messageId: number }>(`${roomPath(id)}/messages`, {
    method: 'POST',
    data,
  })

export const uploadMeetingDrawing = (photo: Blob, inputType: string, signal: AbortSignal) => {
  const data = new FormData()
  data.append('image', photo, photo.type === 'image/png' ? 'drawing.png' : 'drawing.jpg')
  return moyangRequest(signal).json<{ drawingId: number }>('/api/drawings', {
    method: 'POST',
    params: { inputType },
    data,
  })
}

export const advanceMeeting = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json(`${roomPath(id)}/phase/next`, { method: 'POST' })

export const endMeeting = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json(`${roomPath(id)}/end`, { method: 'POST' })

export type MeetingReflection = {
  meetingId: number
  recordId: number
  drawing: { drawingId: number; imageUrl: string; topicTitle: string }
  card: { todaysStory: string; whatISaid?: string; thoughts?: string }
}
export const getMeetingReflection = (id: string, signal: AbortSignal) =>
  moyangRequest(signal).json<MeetingReflection>(`${roomPath(id)}/reflection`)

export const meetingApiMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof MoyangApiError)) return fallback
  switch (error.code) {
    case 'NOT_ENOUGH_WOOL':
      return '양털이 부족해요.'
    case 'MEETING_FULL':
      return '정원이 찬 모임이에요.'
    case 'MEETING_NOT_JOINABLE':
      return '지금은 이 모임에 입장할 수 없어요.'
    case 'ENTER_NOT_OPEN':
      return '아직 대기실 입장 시간이 아니에요.'
    case 'ALREADY_JOINED':
      return '이미 신청한 모임이에요. 모임 상태를 다시 확인해 주세요.'
    case 'ALREADY_CANCELED':
      return '신청을 취소한 모임에는 다시 신청할 수 없어요.'
    case 'INVALID_NICKNAME':
      return '닉네임을 2~15자로 입력해 주세요.'
    case 'MEETING_NOT_FOUND':
      return '모임을 찾을 수 없어요.'
    case 'NOT_PARTICIPANT':
    case 'NOT_JOINED':
      return '참여 중인 모임에서만 이용할 수 있어요.'
    case 'ALREADY_STARTED':
      return '이미 시작했거나 마감된 모임이에요.'
    default:
      return fallback
  }
}
