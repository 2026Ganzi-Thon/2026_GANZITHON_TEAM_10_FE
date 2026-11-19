import { getMockStorageScope } from '@/lib/mock-storage'
import { meetingConcerns, pastConversationDuration } from './meetingMock'
import type { PastMeeting } from './meetingMock'
import type { MeetingChatData, MeetingDetail } from './meetingApi'

const prefix = 'moyang:server-meeting-history:'
const accountPrefix = (scope: string) => `${prefix}${encodeURIComponent(scope)}:`
const keyForMeeting = (scope: string, id: string) => accountPrefix(scope) + id

type ServerPastMeeting = PastMeeting & { deleteAt: number; server: true }

export const readServerPastMeeting = (scope: string, id: string): ServerPastMeeting | undefined => {
  if (!/^\d+$/.test(id)) return undefined
  try {
    const raw = localStorage.getItem(keyForMeeting(scope, id))
    const saved = raw ? (JSON.parse(raw) as Partial<ServerPastMeeting> | null) : null
    if (
      !saved ||
      saved.id !== id ||
      typeof saved.title !== 'string' ||
      !meetingConcerns.some(({ id }) => id === saved.concern) ||
      typeof saved.startAt !== 'number' ||
      !Number.isFinite(new Date(saved.startAt).getTime()) ||
      typeof saved.endAt !== 'number' ||
      !Number.isFinite(new Date(saved.endAt).getTime()) ||
      typeof saved.deleteAt !== 'number' ||
      !Number.isFinite(new Date(saved.deleteAt).getTime()) ||
      saved.startAt > saved.endAt ||
      saved.endAt > saved.deleteAt
    )
      return undefined

    return {
      ...(saved as ServerPastMeeting),
      server: true,
      hasChatHistory: true,
      hasDrawing: saved.hasDrawing === true,
    }
  } catch {
    return undefined
  }
}

export const readServerPastMeetings = (scope: string) => {
  const account = accountPrefix(scope)
  const meetings: ServerPastMeeting[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith(account)) continue
      const meeting = readServerPastMeeting(scope, key.slice(account.length))
      if (meeting) meetings.push(meeting)
    }
  } catch {
    return []
  }
  return meetings.sort((left, right) => right.endAt - left.endAt)
}

export const rememberServerPastMeeting = (
  scope: string,
  id: string,
  room: MeetingDetail,
  chat: MeetingChatData,
) => {
  const deleteAt = Date.parse(chat.deleteAt ?? '')
  const endAt = Number.isFinite(deleteAt)
    ? deleteAt - pastConversationDuration
    : Date.parse(chat.messages.at(-1)?.createdAt ?? chat.endAt ?? '')
  if (
    chat.status !== 'ENDED' ||
    !Number.isFinite(endAt) ||
    String(room.meetingId) !== id ||
    scope !== getMockStorageScope()
  )
    return

  const firstMessageAt = Date.parse(chat.messages[0]?.createdAt ?? '')
  const startAt = Date.parse(room.startAt ?? '')
  const item: ServerPastMeeting = {
    id,
    title: room.title,
    concern: room.category,
    startAt: Math.min(
      endAt,
      Number.isFinite(startAt) ? startAt : Number.isFinite(firstMessageAt) ? firstMessageAt : endAt,
    ),
    endAt,
    deleteAt: Number.isFinite(deleteAt) ? deleteAt : endAt + pastConversationDuration,
    server: true,
    hasChatHistory: true,
    hasDrawing: chat.messages.some(({ mine, type }) => mine && type === 'DRAWING'),
  }
  try {
    localStorage.setItem(keyForMeeting(scope, id), JSON.stringify(item))
  } catch {
    return
  }
}

export const isServerPastMeetingStorageKey = (key: string | null) =>
  key?.startsWith(prefix) === true
