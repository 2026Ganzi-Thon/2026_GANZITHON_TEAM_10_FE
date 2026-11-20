import { getMockStorageScope } from '@/lib/mock-storage'
import { meetingConcerns, pastConversationDuration } from './meetingMock'
import type { PastMeeting } from './meetingMock'
import type { MeetingChatData, MeetingDetail } from './meetingApi'

const historyPrefix = 'moyang:server-meeting-history:'
const trackedPrefix = 'moyang:server-meeting-tracked:'
const accountPrefix = (prefix: string, scope: string) => `${prefix}${encodeURIComponent(scope)}:`

type TrackedMeeting = Pick<PastMeeting, 'id' | 'title' | 'concern' | 'startAt'>
type ServerPastMeeting = PastMeeting & { deleteAt: number; server: true }
type ServerMeetingIdentity = Pick<MeetingDetail, 'meetingId' | 'title' | 'category' | 'startAt'>

const readMeeting = (key: string, id: string) => {
  if (!/^\d+$/.test(id)) return
  try {
    const raw = localStorage.getItem(key)
    const saved = raw ? (JSON.parse(raw) as Partial<ServerPastMeeting> | null) : null
    if (
      saved?.id === id &&
      typeof saved.title === 'string' &&
      meetingConcerns.some(({ id }) => id === saved.concern) &&
      typeof saved.startAt === 'number' &&
      Number.isFinite(new Date(saved.startAt).getTime())
    )
      return saved as TrackedMeeting & Partial<ServerPastMeeting>
  } catch {
    return undefined
  }
}

export const readServerPastMeeting = (scope: string, id: string): ServerPastMeeting | undefined => {
  const saved = readMeeting(accountPrefix(historyPrefix, scope) + id, id)
  if (
    !saved ||
    typeof saved.endAt !== 'number' ||
    !Number.isFinite(new Date(saved.endAt).getTime()) ||
    typeof saved.deleteAt !== 'number' ||
    !Number.isFinite(new Date(saved.deleteAt).getTime()) ||
    saved.startAt > saved.endAt ||
    saved.endAt > saved.deleteAt
  )
    return undefined

  return {
    ...saved,
    endAt: saved.endAt,
    deleteAt: saved.deleteAt,
    server: true,
    hasChatHistory: true,
    hasDrawing: saved.hasDrawing === true,
  }
}

const readAccountMeetings = <T>(prefix: string, read: (id: string) => T | undefined) => {
  const meetings: T[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(prefix)) continue
      const meeting = read(key.slice(prefix.length))
      if (meeting) meetings.push(meeting)
    }
  } catch {
    return meetings
  }
  return meetings
}

export const readServerPastMeetings = (scope: string) =>
  readAccountMeetings(accountPrefix(historyPrefix, scope), (id) => readServerPastMeeting(scope, id))

export const readTrackedServerMeetings = (scope: string) => {
  const prefix = accountPrefix(trackedPrefix, scope)
  return readAccountMeetings<TrackedMeeting>(prefix, (id) => readMeeting(prefix + id, id))
}

const identifyMeeting = (room: ServerMeetingIdentity, observedAt: number): TrackedMeeting => {
  const startAt = Date.parse(room.startAt ?? '')
  return {
    id: String(room.meetingId),
    title: room.title,
    concern: room.category,
    startAt: Number.isFinite(startAt) ? startAt : observedAt,
  }
}

export const trackServerMeeting = (scope: string, room: ServerMeetingIdentity) => {
  if (scope !== getMockStorageScope()) return
  const item = identifyMeeting(room, Date.now())
  const key = accountPrefix(trackedPrefix, scope) + item.id
  if (readMeeting(key, item.id)) return
  try {
    localStorage.setItem(key, JSON.stringify(item))
  } catch {
    return
  }
}

export const forgetTrackedServerMeeting = (scope: string, id: string) => {
  if (scope !== getMockStorageScope()) return
  try {
    localStorage.removeItem(accountPrefix(trackedPrefix, scope) + id)
  } catch {
    return
  }
}

const storePastMeeting = (scope: string, item: ServerPastMeeting) => {
  if (scope !== getMockStorageScope()) return undefined
  try {
    localStorage.setItem(accountPrefix(historyPrefix, scope) + item.id, JSON.stringify(item))
    forgetTrackedServerMeeting(scope, item.id)
  } catch {
    return item
  }
  return item
}

export const rememberServerPastMeeting = (
  scope: string,
  room: ServerMeetingIdentity | TrackedMeeting,
  chat: MeetingChatData,
) => {
  const deleteAt = Date.parse(chat.deleteAt ?? '')
  const endAt = Number.isFinite(deleteAt)
    ? deleteAt - pastConversationDuration
    : Date.parse(chat.messages.at(-1)?.createdAt ?? chat.endAt ?? '')
  if (chat.status !== 'ENDED' || !Number.isFinite(endAt)) return

  const firstMessageAt = Date.parse(chat.messages[0]?.createdAt ?? '')
  const meeting =
    'id' in room
      ? room
      : identifyMeeting(room, Number.isFinite(firstMessageAt) ? firstMessageAt : endAt)
  return storePastMeeting(scope, {
    ...meeting,
    startAt: Math.min(meeting.startAt, endAt),
    endAt,
    deleteAt: Number.isFinite(deleteAt) ? deleteAt : endAt + pastConversationDuration,
    server: true,
    hasChatHistory: true,
    hasDrawing: chat.messages.some(({ mine, type }) => mine && type === 'DRAWING'),
  })
}

export const rememberExpiredServerMeeting = (scope: string, room: TrackedMeeting) =>
  storePastMeeting(scope, {
    ...room,
    // 만료된 방은 실제 종료 시간을 조회할 수 없어 목록 정렬에는 남아 있는 시작 시간을 쓴다.
    endAt: room.startAt,
    deleteAt: Math.max(room.startAt, Date.now()),
    server: true,
    hasChatHistory: true,
    hasDrawing: true,
  })

export const isServerPastMeetingStorageKey = (key: string | null) =>
  key?.startsWith(historyPrefix) === true
