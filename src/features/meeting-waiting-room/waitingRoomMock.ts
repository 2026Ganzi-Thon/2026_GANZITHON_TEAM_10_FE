import type { Meeting } from '@/features/meeting-list/meetingMock'
import { getMockStorageScope, mockStorageLock } from '@/lib/mock-storage'

const admissionLead = 5 * 60_000
export const autoAdmissionLead = 60_000
const startGrace = 2 * 60_000
const storagePrefix = 'moyang:meeting-waiting-room:'
const sheepColors = ['purple', 'white', 'pink', 'green', 'blue', 'white'] as const
const nicknames = [
  '딸기를 좋아하는 양',
  '산책을 좋아하는 양',
  '꽃을 좋아하는 양',
  '숲을 좋아하는 양',
  '하늘을 좋아하는 양',
  '별을 좋아하는 양',
]

export type RoomParticipant = {
  id: string
  nickname: string
  color: (typeof sheepColors)[number]
  enteredAt: number
}

type RoomRecord = {
  createdAt: number
  startAt: number | null
  bookingId?: string
  nickname: string | null
  nicknameEdited?: true
  enteredAt: number | null
  liveStarted: boolean
  closed: boolean
}

export type RoomAction = 'join' | 'start' | 'leave' | 'rename'

export const isWaitingRoomStorageEvent = (key: string | null) =>
  key === null || key.startsWith(storagePrefix)

const roomKey = (scope: string, id: string, scenario: string | null) =>
  `${storagePrefix}${scope}:${id}${scenario ? `:${scenario}` : ''}`

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())

const readRecord = (key: string, kind: Meeting['kind']) => {
  const saved = localStorage.getItem(key)
  if (saved === null) return null
  const record = JSON.parse(saved) as RoomRecord | null
  if (
    !record ||
    !isTimestamp(record.createdAt) ||
    (kind === 'live' ? record.startAt !== null : !isTimestamp(record.startAt)) ||
    (record.bookingId !== undefined &&
      (typeof record.bookingId !== 'string' || !record.bookingId.trim())) ||
    !(
      record.nickname === null ||
      (typeof record.nickname === 'string' && record.nickname.trim())
    ) ||
    (record.nicknameEdited !== undefined && record.nicknameEdited !== true) ||
    !(record.enteredAt === null || isTimestamp(record.enteredAt)) ||
    typeof record.liveStarted !== 'boolean' ||
    typeof record.closed !== 'boolean'
  ) {
    throw new Error('모임 상태를 불러오지 못했어요.')
  }
  return record
}

const readCurrentRecord = (key: string, meeting: Meeting) => {
  if (meeting.kind === 'scheduled' && !meeting.membership) return null
  const record = readRecord(key, meeting.kind)
  if (meeting.kind === 'scheduled' && record?.bookingId !== meeting.bookingId) return null
  return record
}

const makeRecord = (meeting: Meeting, now: number, scenario: string | null): RoomRecord => {
  let startAt = meeting.kind === 'scheduled' ? meeting.startAt : null
  if (startAt !== null) {
    if (scenario === 'before-entry') startAt = now + admissionLead + 5000
    if (scenario === 'manual-entry' || scenario === 'entry-error') startAt = now + 2 * 60_000
    if (scenario === 'auto-entry') startAt = now + autoAdmissionLead + 5000
    if (scenario === 'scheduled-start' || scenario === 'host-absent') startAt = now + 5000
    if (scenario === 'grace' || scenario === 'grace-start') startAt = now - 5000
    if (scenario === 'auto-cancel') startAt = now - startGrace + 10_000
  }
  return {
    createdAt: now,
    startAt,
    bookingId: meeting.kind === 'scheduled' ? meeting.bookingId : undefined,
    nickname: null,
    enteredAt: meeting.hasEntered ? now : null,
    liveStarted: false,
    closed: false,
  }
}

const peerCount = (meeting: Meeting, scenario: string | null) => {
  if (meeting.kind === 'scheduled') {
    if (scenario === 'host-absent') return 2
    if (scenario === 'scheduled-start' || scenario === 'grace-start') return 1
    return meeting.status === 'in-progress'
      ? meeting.participants - Number(Boolean(meeting.hasEntered))
      : 0
  }
  if (
    scenario === 'host-alone' ||
    scenario === 'host-arrival' ||
    scenario === 'participant-left' ||
    scenario === 'participant-rename'
  ) {
    return Number(scenario !== 'host-alone')
  }
  return Math.max(0, meeting.participants - Number(Boolean(meeting.hasEntered)))
}

const getRoom = (
  meeting: Meeting,
  record: RoomRecord,
  now: number,
  scenario: string | null,
  profileNickname?: string,
) => {
  const { startAt, enteredAt } = record
  const savedNickname =
    !record.nicknameEdited && record.nickname === nicknames[0] ? null : record.nickname
  const nickname = savedNickname ?? (profileNickname?.trim() || nicknames[0])
  const isHost = meeting.membership === 'host'
  const peers = Array.from({ length: peerCount(meeting, scenario) }, (_, index) => ({
    id: `participant-${index + 1}`,
    nickname:
      scenario === 'participant-rename' && now >= record.createdAt + 10_000
        ? '새 이름으로 인사하는 양'
        : nicknames[index + 1],
    color: sheepColors[index + 1],
    enteredAt:
      scenario === 'grace-start' || scenario === 'host-arrival'
        ? record.createdAt + 10_000
        : startAt === null
          ? record.createdAt
          : startAt - 2 * 60_000 + index,
  }))
  const participants: RoomParticipant[] =
    scenario === 'participant-left' && now >= record.createdAt + 10_000 ? [] : [...peers]
  if (enteredAt !== null) {
    participants.push({ id: 'me', nickname, color: 'purple', enteredAt })
  }
  participants.sort((a, b) => a.enteredAt - b.enteredAt)

  const secondEntry = participants[1]?.enteredAt
  const deadline = startAt === null ? null : startAt + startGrace
  const startsAt =
    startAt !== null && deadline !== null && secondEntry !== undefined && secondEntry < deadline
      ? Math.max(startAt, secondEntry)
      : null
  const present = participants.filter((participant) => participant.enteredAt <= now)
  const started =
    meeting.status === 'in-progress' || record.liveStarted || (startsAt !== null && now >= startsAt)
  const autoCancelled =
    meeting.status !== 'cancelled' &&
    !record.closed &&
    !started &&
    deadline !== null &&
    now >= deadline
  const cancelled = autoCancelled || record.closed || meeting.status === 'cancelled'
  const phase = cancelled
    ? 'CANCELED'
    : started
      ? 'IN_PROGRESS'
      : startAt !== null && now < startAt - admissionLead
        ? 'RECRUITING'
        : 'OPEN'
  const canJoin =
    phase === 'OPEN' &&
    enteredAt === null &&
    (meeting.kind === 'live' || Boolean(meeting.membership)) &&
    present.length < meeting.capacity
  const canStart =
    phase === 'OPEN' &&
    meeting.kind === 'live' &&
    isHost &&
    enteredAt !== null &&
    present.length >= 2
  const refundableWool =
    meeting.woolPaid === true &&
    (meeting.kind === 'live'
      ? !isHost && (phase === 'CANCELED' || (phase === 'OPEN' && enteredAt !== null))
      : phase === 'CANCELED' && Boolean(meeting.membership) && (autoCancelled || !isHost))
      ? 1
      : 0

  return {
    phase,
    startAt,
    participants: present,
    entered: enteredAt !== null,
    nickname,
    isHost,
    canJoin,
    canStart,
    autoCancelled,
    closedByHost: record.closed,
    refundableWool,
  } as const
}

export const readWaitingRoom = (
  meeting: Meeting,
  scope: string,
  scenario: string | null,
  now: number,
  openedAt: number,
  profileNickname?: string,
) => {
  const record =
    readCurrentRecord(roomKey(scope, meeting.id, scenario), meeting) ??
    makeRecord(meeting, openedAt, scenario)
  return getRoom(meeting, record, now, scenario, profileNickname)
}

export type WaitingRoom = ReturnType<typeof readWaitingRoom>

export const applyWaitingRoomStatus = (meeting: Meeting, now: number): Meeting => {
  const scope = getMockStorageScope()
  if (!scope || (meeting.kind === 'scheduled' && !meeting.membership)) return meeting
  const stored = readCurrentRecord(roomKey(scope, meeting.id, null), meeting)
  if (!stored && (meeting.kind === 'live' || meeting.status !== 'waiting')) return meeting
  const room = getRoom(meeting, stored ?? makeRecord(meeting, now, null), now, null)
  const status =
    room.phase === 'CANCELED'
      ? 'cancelled'
      : room.phase === 'IN_PROGRESS'
        ? 'in-progress'
        : 'waiting'
  return {
    ...meeting,
    ...(meeting.kind === 'scheduled' ? { startAt: room.startAt ?? meeting.startAt } : {}),
    status,
    participants: meeting.kind === 'live' ? room.participants.length : meeting.participants,
    membership: meeting.membership ?? (room.entered ? 'participant' : undefined),
    hasEntered: room.entered,
  }
}

export const applyWaitingRoomStatuses = <T extends { meetings: Meeting[]; myMeetings?: Meeting[] }>(
  data: T,
): T => {
  const now = Date.now()
  const meetings = data.meetings.map((meeting) => applyWaitingRoomStatus(meeting, now))
  if (!data.myMeetings) return { ...data, meetings }

  const mine = new Map(
    meetings.filter(({ membership }) => membership).map((meeting) => [meeting.id, meeting]),
  )
  for (const meeting of data.myMeetings) {
    if (!mine.has(meeting.id)) mine.set(meeting.id, applyWaitingRoomStatus(meeting, now))
  }
  return {
    ...data,
    meetings,
    myMeetings: [...mine.values()].filter(({ status }) => status !== 'cancelled'),
  }
}

const waitForResponse = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 300)
    signal.addEventListener('abort', abort, { once: true })
  })

export const updateWaitingRoom = async ({
  loadMeeting,
  scope,
  scenario,
  openedAt,
  action,
  signal,
  nickname,
  fail,
  expectedBookingId,
}: {
  loadMeeting: () => Meeting | undefined
  scope: string
  scenario: string | null
  openedAt: number
  action: RoomAction
  signal: AbortSignal
  nickname?: string
  fail?: boolean
  expectedBookingId?: string
}) => {
  const locks = navigator.locks
  if (!locks) {
    throw new Error('모임 상태를 안전하게 저장할 수 없어요. 다른 브라우저에서 다시 시도해 주세요.')
  }
  await waitForResponse(signal)
  if (fail) throw new Error('입장하지 못했어요. 다시 시도해 주세요.')

  const update = () => {
    signal.throwIfAborted()
    if (getMockStorageScope() !== scope) throw new Error('로그인 정보가 변경됐어요.')
    const meeting = loadMeeting()
    if (getMockStorageScope() !== scope) throw new Error('로그인 정보가 변경됐어요.')
    if (!meeting) throw new Error('모임을 찾을 수 없어요.')
    if (meeting.kind === 'scheduled' && meeting.bookingId !== expectedBookingId) {
      throw new Error('예약이 변경됐어요. 현재 예약을 확인한 뒤 다시 시도해 주세요.')
    }
    const key = roomKey(scope, meeting.id, scenario)
    const record = readCurrentRecord(key, meeting) ?? makeRecord(meeting, openedAt, scenario)
    const now = Date.now()
    const room = getRoom(meeting, record, now, scenario)
    if (room.phase === 'CANCELED') throw new Error('취소된 모임이에요.')
    switch (action) {
      case 'join':
        if (room.entered) return
        if (!room.canJoin) throw new Error('지금은 모임에 입장할 수 없어요.')
        if (
          meeting.kind === 'live' &&
          !room.isHost &&
          !meeting.woolPaid &&
          scenario === 'insufficient-wool'
        ) {
          throw new Error('모임에 참여하려면 양털 1개가 필요해요.')
        }
        record.enteredAt = now
        break
      case 'start':
        if (room.phase === 'IN_PROGRESS' && room.isHost && room.entered) return
        if (!room.canStart || !room.entered) throw new Error('지금은 모임을 시작할 수 없어요.')
        record.liveStarted = true
        break
      case 'leave':
        if (room.phase === 'IN_PROGRESS') throw new Error('이미 시작한 모임이에요.')
        record.enteredAt = null
        record.closed = meeting.kind === 'live' && room.isHost
        break
      case 'rename':
        if (room.phase === 'IN_PROGRESS') {
          throw new Error('모임이 시작되어 닉네임을 바꿀 수 없어요.')
        }
        if (!nickname?.trim()) throw new Error('닉네임을 입력해 주세요.')
        record.nickname = nickname.trim()
        record.nicknameEdited = true
        break
    }
    signal.throwIfAborted()
    if (getMockStorageScope() !== scope) throw new Error('로그인 정보가 변경됐어요.')
    localStorage.setItem(key, JSON.stringify(record))
  }

  await locks.request(mockStorageLock, { signal }, update)
}
