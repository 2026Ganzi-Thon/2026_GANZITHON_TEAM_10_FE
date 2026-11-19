import { getMockStorageScope, mockStorageLock } from '@/lib/mock-storage'
import type { RoomParticipant } from '@/features/meeting-waiting-room/waitingRoomMock'

export const chatPhases = ['INTRO', 'DRAWING', 'SHARING', 'CLOSING'] as const
export type ChatPhase = (typeof chatPhases)[number]
export const chatHistoryDuration = 24 * 60 * 60 * 1000
export const meetingSampleImage = 'meeting-sample:drawing'

export type SharedDrawing = {
  id: string
  title: string
  description: string
  imageUrl: string
  revision?: number
}

type MessageBase = { messageId: number; createdAt: number }
type SystemMessage = MessageBase & {
  type: 'SYSTEM'
  event: 'STARTED' | 'PHASE_CHANGED' | 'END_REQUESTED' | 'ENDED'
  phase: ChatPhase
}
type ParticipantMessage = MessageBase & {
  requestId: string
  participantId: string
} & ({ type: 'TEXT'; content: string } | { type: 'DRAWING'; drawing: SharedDrawing })
export type ChatMessage = SystemMessage | ParticipantMessage

export type MeetingChat = {
  version: 1
  meetingId: string
  topic: string
  participants: RoomParticipant[]
  moderatorId: string
  phase: ChatPhase
  endedAt: number | null
  endAgreedIds: string[]
  messages: ChatMessage[]
  draft: { text: string; drawing: SharedDrawing | null }
}

export type ChatStorageContext = {
  scope: string
  meetingId: string
  scenario?: string | null
}

export type ChatCommand =
  | {
      type: 'send'
      requestId: string
      participantId: string
      content: string
      expectedDraft?: string
      phase?: ChatPhase
    }
  | { type: 'share'; requestId: string; participantId: string; drawing: SharedDrawing }
  | { type: 'advance'; participantId: string; from: ChatPhase }
  | { type: 'agree-end'; participantId: string }
  | { type: 'rename-self'; nickname: string }
  | { type: 'draft-text'; text: string; previousText: string }
  | {
      type: 'draft'
      text: string
      drawing: SharedDrawing | null
      previousText: string
      previousDrawingId: string | null
    }

const storagePrefix = 'moyang:meeting-chat:'
const colors = ['white', 'pink', 'purple', 'blue', 'green']
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isId = (value: unknown): value is string => isText(value) && value.trim().length > 0
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
const isPhase = (value: unknown): value is ChatPhase => chatPhases.some((phase) => phase === value)

const isDrawing = (value: unknown): value is SharedDrawing =>
  isObject(value) &&
  isId(value.id) &&
  isText(value.title) &&
  value.title.trim().length > 0 &&
  value.title.length <= 100 &&
  isText(value.description) &&
  value.description.length <= 500 &&
  (value.revision === undefined ||
    (typeof value.revision === 'number' &&
      Number.isSafeInteger(value.revision) &&
      value.revision >= 0)) &&
  isText(value.imageUrl) &&
  (value.imageUrl === meetingSampleImage ||
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageUrl) ||
    (/^meeting-draft:[A-Za-z0-9_-]{1,100}$/.test(value.imageUrl) &&
      value.imageUrl === `meeting-draft:${value.id}`)) &&
  value.imageUrl.length <= 14 * 1024 * 1024

const sameDrawing = (first: SharedDrawing, second: SharedDrawing) =>
  first.id === second.id &&
  first.title === second.title &&
  first.description === second.description &&
  first.imageUrl === second.imageUrl &&
  first.revision === second.revision

class InvalidMeetingChat extends Error {
  constructor() {
    super('저장된 모임 대화를 확인할 수 없어요. 원본은 보관했어요.')
  }
}

const invalidData = () => new InvalidMeetingChat()
const assertScope = (scope: string) => {
  if (!scope || getMockStorageScope() !== scope) throw new Error('로그인 정보가 변경됐어요.')
}
const storageKey = ({ scope, meetingId, scenario = null }: ChatStorageContext) =>
  `${storagePrefix}${JSON.stringify([scope, meetingId, scenario])}`

export const getMeetingChatError = (cause: unknown, fallback: string) => {
  if (!(cause instanceof Error)) return fallback
  if (cause.name === 'QuotaExceededError')
    return '기기의 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.'
  if (cause.name === 'SecurityError')
    return '브라우저 저장 공간을 사용할 수 없어요. 브라우저 설정을 확인한 뒤 다시 시도해 주세요.'
  return cause.name === 'Error' ? cause.message : fallback
}

const restoreSampleImageReferences = (chat: MeetingChat) => {
  for (const message of chat.messages) {
    if (message.type !== 'DRAWING' || !message.drawing.imageUrl.startsWith('data:image/png;'))
      continue
    const previewId = `preview-drawing:${message.participantId}`
    const peerId = `peer-drawing:${message.participantId}`
    if (
      message.drawing.id === message.requestId &&
      (message.requestId === previewId ||
        (message.participantId !== 'me' && message.requestId === peerId))
    )
      message.drawing.imageUrl = meetingSampleImage
  }
  return chat
}

export const isMeetingChatStorageEvent = (key: string | null) =>
  key === null || key.startsWith(storagePrefix)

export class ChatDraftConflict extends Error {}

const validateChat = (value: unknown, meetingId: string): MeetingChat => {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    value.meetingId !== meetingId ||
    !isText(value.topic) ||
    !value.topic.trim() ||
    !isPhase(value.phase) ||
    !(value.endedAt === null || isTime(value.endedAt)) ||
    !Array.isArray(value.participants) ||
    value.participants.length < 2 ||
    value.participants.length > 6
  ) {
    throw invalidData()
  }
  const participantIds = new Set<string>()
  for (const participant of value.participants) {
    if (
      !isObject(participant) ||
      !isId(participant.id) ||
      participantIds.has(participant.id) ||
      !isText(participant.nickname) ||
      !participant.nickname.trim() ||
      !colors.includes(String(participant.color)) ||
      !isTime(participant.enteredAt)
    ) {
      throw invalidData()
    }
    participantIds.add(participant.id)
  }
  if (
    !participantIds.has('me') ||
    !isId(value.moderatorId) ||
    !participantIds.has(value.moderatorId) ||
    !Array.isArray(value.endAgreedIds) ||
    !value.endAgreedIds.every((id) => isId(id) && participantIds.has(id)) ||
    new Set(value.endAgreedIds).size !== value.endAgreedIds.length ||
    (value.endedAt !== null && value.endAgreedIds.length !== participantIds.size) ||
    (value.endedAt === null && value.endAgreedIds.length === participantIds.size) ||
    !isObject(value.draft) ||
    !isText(value.draft.text) ||
    value.draft.text.length > 500 ||
    !(value.draft.drawing === null || isDrawing(value.draft.drawing)) ||
    !Array.isArray(value.messages) ||
    value.messages.length === 0
  ) {
    throw invalidData()
  }
  let lastId = 0
  let lastTime = -Infinity
  let started = 0
  let ended = 0
  let endRequested = 0
  const requestIds = new Set<string>()
  const drawingOwners = new Set<string>()
  for (const message of value.messages) {
    if (
      !isObject(message) ||
      typeof message.messageId !== 'number' ||
      !Number.isSafeInteger(message.messageId) ||
      message.messageId <= lastId ||
      !isTime(message.createdAt) ||
      message.createdAt < lastTime
    ) {
      throw invalidData()
    }
    lastId = message.messageId
    lastTime = message.createdAt
    if (message.type === 'SYSTEM') {
      if (
        !isPhase(message.phase) ||
        !['STARTED', 'PHASE_CHANGED', 'END_REQUESTED', 'ENDED'].includes(String(message.event)) ||
        'participantId' in message
      ) {
        throw invalidData()
      }
      if (message.event === 'STARTED') started += 1
      if (message.event === 'ENDED') ended += 1
      if (message.event === 'END_REQUESTED') endRequested += 1
    } else {
      if (
        !isId(message.requestId) ||
        requestIds.has(message.requestId) ||
        !isId(message.participantId) ||
        !participantIds.has(message.participantId)
      ) {
        throw invalidData()
      }
      requestIds.add(message.requestId)
      if (message.type === 'TEXT') {
        if (!isText(message.content) || !message.content.trim() || message.content.length > 500) {
          throw invalidData()
        }
      } else if (message.type === 'DRAWING') {
        if (!isDrawing(message.drawing) || drawingOwners.has(message.participantId)) {
          throw invalidData()
        }
        drawingOwners.add(message.participantId)
      } else {
        throw invalidData()
      }
    }
  }
  const first = value.messages[0]
  const last = value.messages.at(-1)
  if (
    started !== 1 ||
    first.type !== 'SYSTEM' ||
    first.event !== 'STARTED' ||
    value.participants.some((participant) => participant.enteredAt > first.createdAt) ||
    ended !== Number(value.endedAt !== null) ||
    (ended === 1 && (last.type !== 'SYSTEM' || last.event !== 'ENDED')) ||
    endRequested !== Number(value.endAgreedIds.length > 0) ||
    (['SHARING', 'CLOSING'].includes(value.phase) && drawingOwners.size !== participantIds.size)
  ) {
    throw invalidData()
  }
  if (isTime(value.endedAt) && value.endedAt < lastTime) throw invalidData()
  return value as MeetingChat
}

const readStoredChat = (context: ChatStorageContext) => {
  assertScope(context.scope)
  const saved = localStorage.getItem(storageKey(context))
  assertScope(context.scope)
  if (saved === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    throw invalidData()
  }
  return restoreSampleImageReferences(validateChat(parsed, context.meetingId))
}

export const canReadMeetingChat = (chat: MeetingChat, now = Date.now()) =>
  chat.endedAt === null || now < chat.endedAt + chatHistoryDuration

export const readMeetingChat = (context: ChatStorageContext, now = Date.now()) => {
  const chat = readStoredChat(context)
  if (chat && !canReadMeetingChat(chat, now)) throw new Error('대화 열람 기간이 지났어요.')
  return chat
}

export const readOwnMeetingDrawing = (context: ChatStorageContext) => {
  const chat = readStoredChat(context)
  const message = chat?.messages.find(
    (item) => item.type === 'DRAWING' && item.participantId === 'me',
  )
  return message?.type === 'DRAWING' ? message.drawing : null
}

export const readMeetingChatSummary = (context: ChatStorageContext) => {
  const chat = readStoredChat(context)
  return chat
    ? {
        meetingId: chat.meetingId,
        ownNickname: chat.participants.find(({ id }) => id === 'me')!.nickname,
        startedAt: chat.messages[0].createdAt,
        endedAt: chat.endedAt,
        hasDrawing: chat.messages.some(
          (message) => message.type === 'DRAWING' && message.participantId === 'me',
        ),
      }
    : null
}

export const readEndedMeetingChats = (scope: string) => {
  assertScope(scope)
  const result = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(storagePrefix)) continue
    let context: ChatStorageContext
    try {
      const fields: unknown = JSON.parse(key.slice(storagePrefix.length))
      if (
        !Array.isArray(fields) ||
        fields.length !== 3 ||
        fields[0] !== scope ||
        !isId(fields[1]) ||
        fields[2] !== null
      )
        continue
      context = { scope, meetingId: fields[1] }
    } catch {
      continue
    }
    if (key !== storageKey(context)) continue
    try {
      const summary = readMeetingChatSummary(context)
      if (summary && summary.endedAt !== null) result.push({ ...summary, endedAt: summary.endedAt })
    } catch (cause) {
      if (!(cause instanceof InvalidMeetingChat)) throw cause
    }
  }
  assertScope(scope)
  return result.sort((a, b) => b.endedAt - a.endedAt)
}

const appendSystemMessage = (chat: MeetingChat, event: SystemMessage['event'], now: number) => {
  const last = chat.messages.at(-1)
  chat.messages.push({
    messageId: (last?.messageId ?? 0) + 1,
    createdAt: Math.max(last?.createdAt ?? now, now),
    type: 'SYSTEM',
    event,
    phase: chat.phase,
  })
}

const withChatLock = async <T>(
  context: ChatStorageContext,
  signal: AbortSignal,
  action: () => T,
) => {
  signal.throwIfAborted()
  if (!navigator.locks)
    throw new Error('대화를 안전하게 저장할 수 없어요. 다른 브라우저에서 다시 시도해 주세요.')
  return navigator.locks.request(mockStorageLock, { signal }, () => {
    signal.throwIfAborted()
    assertScope(context.scope)
    return action()
  })
}

export const initializeMeetingChat = async (
  context: ChatStorageContext,
  initial: Pick<MeetingChat, 'participants' | 'moderatorId' | 'topic'>,
  canEnter: () => boolean,
  signal: AbortSignal,
) => {
  signal.throwIfAborted()
  if (!canEnter()) throw new Error('모임 참여 상태를 확인해 주세요.')
  const existing = readMeetingChat(context)
  if (existing) return existing

  return withChatLock(context, signal, () => {
    if (!canEnter()) throw new Error('모임 참여 상태를 확인해 주세요.')
    const saved = readMeetingChat(context)
    if (saved) return saved
    const chat: MeetingChat = {
      version: 1,
      meetingId: context.meetingId,
      ...initial,
      phase: 'INTRO',
      endedAt: null,
      endAgreedIds: [],
      messages: [],
      draft: { text: '', drawing: null },
    }
    appendSystemMessage(chat, 'STARTED', Date.now())
    validateChat(chat, context.meetingId)
    assertScope(context.scope)
    localStorage.setItem(storageKey(context), JSON.stringify(chat))
    return chat
  })
}

export const updateMeetingChat = async (
  context: ChatStorageContext,
  command: ChatCommand,
  canParticipate: () => boolean | Promise<boolean>,
  signal: AbortSignal,
) =>
  withChatLock(context, signal, async () => {
    if (!(await canParticipate())) throw new Error('모임 참여 상태를 확인해 주세요.')
    signal.throwIfAborted()
    assertScope(context.scope)
    const chat = readMeetingChat(context)
    if (!chat) throw new Error('모임 대화를 불러오지 못했어요.')
    if ('requestId' in command) {
      if (!isId(command.requestId)) throw new Error('전송 정보를 확인해 주세요.')
      const previous = chat.messages.find(
        (item) => item.type !== 'SYSTEM' && item.requestId === command.requestId,
      )
      if (previous) {
        const sameRequest =
          previous.type !== 'SYSTEM' &&
          previous.participantId === command.participantId &&
          (command.type === 'send'
            ? previous.type === 'TEXT' && previous.content === command.content.trim()
            : previous.type === 'DRAWING' && sameDrawing(previous.drawing, command.drawing))
        if (!sameRequest) {
          throw new Error('전송 정보를 확인해 주세요.')
        }
        return chat
      }
    }
    if (command.type === 'agree-end' && chat.endAgreedIds.includes(command.participantId))
      return chat
    if (
      command.type === 'send' &&
      command.phase &&
      (chat.phase !== command.phase || chat.endedAt !== null || chat.endAgreedIds.length > 0)
    )
      return chat
    if (chat.endedAt !== null)
      throw new Error('종료된 모임에서는 대화하거나 그림을 공유할 수 없어요.')
    if (
      'participantId' in command &&
      !chat.participants.some(({ id }) => id === command.participantId)
    ) {
      throw new Error('이 모임의 참여자가 아니에요.')
    }
    const now = Math.max(Date.now(), chat.messages.at(-1)?.createdAt ?? 0)
    if (command.type === 'rename-self') {
      const own = chat.participants.find(({ id }) => id === 'me')!
      if (own.nickname === command.nickname) return chat
      own.nickname = command.nickname
    } else if (command.type === 'draft-text') {
      if (chat.draft.text !== command.previousText)
        throw new ChatDraftConflict('다른 화면에서 입력 내용이 변경됐어요.')
      if (command.text.length > 500) throw new Error('입력 내용을 확인해 주세요.')
      if (chat.draft.text === command.text) return chat
      chat.draft.text = command.text
    } else if (command.type === 'draft') {
      if (
        chat.draft.text !== command.previousText ||
        (chat.draft.drawing?.id ?? null) !== command.previousDrawingId
      ) {
        throw new Error('다른 화면에서 입력 내용이 변경됐어요.')
      }
      if (command.text.length > 500 || !(command.drawing === null || isDrawing(command.drawing))) {
        throw new Error('입력 내용을 확인해 주세요.')
      }
      chat.draft = { text: command.text, drawing: command.drawing }
    } else if (command.type === 'send' || command.type === 'share') {
      const base = {
        messageId: (chat.messages.at(-1)?.messageId ?? 0) + 1,
        requestId: command.requestId,
        participantId: command.participantId,
        createdAt: now,
      }
      if (command.type === 'send') {
        const content = command.content.trim()
        if (!content || command.content.length > 500)
          throw new Error('메시지는 1~500자로 입력해 주세요.')
        if (command.expectedDraft !== undefined && chat.draft.text !== command.expectedDraft)
          throw new ChatDraftConflict('다른 화면에서 초안이 변경됐어요. 입력 내용을 확인해 주세요.')
        chat.messages.push({ ...base, type: 'TEXT', content })
        if (command.participantId === 'me' && chat.draft.text.trim() === content)
          chat.draft.text = ''
      } else {
        if (chat.phase !== 'DRAWING') throw new Error('그림 그리기 단계에서 공유해 주세요.')
        if (!isDrawing(command.drawing)) throw new Error('공유할 그림과 설명을 확인해 주세요.')
        if (
          chat.messages.some(
            (item) => item.type === 'DRAWING' && item.participantId === command.participantId,
          )
        ) {
          throw new Error('이미 그림을 공유했어요.')
        }
        chat.messages.push({ ...base, type: 'DRAWING', drawing: command.drawing })
        if (
          command.participantId === 'me' &&
          chat.draft.drawing &&
          sameDrawing(chat.draft.drawing, command.drawing)
        ) {
          chat.draft.drawing = null
        }
        const submitted = chat.messages.filter((item) => item.type === 'DRAWING').length
        if (submitted === chat.participants.length) {
          chat.phase = 'SHARING'
          appendSystemMessage(chat, 'PHASE_CHANGED', now)
        }
      }
    } else if (command.type === 'advance') {
      if (command.participantId !== chat.moderatorId)
        throw new Error('진행 권한이 있는 참여자만 넘길 수 있어요.')
      if (chat.phase !== command.from) return chat
      if (chat.phase === 'DRAWING')
        throw new Error('모든 참여자가 그림을 제출하면 다음 단계로 넘어가요.')
      if (chat.phase === 'CLOSING') throw new Error('이미 마무리 단계예요.')
      chat.phase = chat.phase === 'INTRO' ? 'DRAWING' : 'CLOSING'
      appendSystemMessage(chat, 'PHASE_CHANGED', now)
    } else {
      if (chat.endAgreedIds.length === 0) appendSystemMessage(chat, 'END_REQUESTED', now)
      chat.endAgreedIds.push(command.participantId)
      if (chat.endAgreedIds.length === chat.participants.length) {
        chat.endedAt = now
        appendSystemMessage(chat, 'ENDED', now)
      }
    }
    validateChat(chat, context.meetingId)
    signal.throwIfAborted()
    assertScope(context.scope)
    localStorage.setItem(storageKey(context), JSON.stringify(chat))
    return chat
  })
