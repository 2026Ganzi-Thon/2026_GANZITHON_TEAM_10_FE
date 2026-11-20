import { MoyangApiError, moyangRequest } from '@/lib/moyang-api'
import { getMockStorageScope } from '@/lib/mock-storage'
import type { DrawingResultData } from '@/features/drawing-result/resultMock'
import { getReplyText } from './conversationMock'
import type { Conversation, ConversationAction, ConversationDrawing } from './conversationMock'

type Question = { messageId: number; content: string; order: number }
type Notice = { message: string; actionLabel: string; phone: string }
type Drawing = {
  drawingId: number
  imageUrl: string
  topicTitle: string | null
  note: string | null
}
type Detail = {
  conversationId: number
  drawingId: number
  recordId: number
  status: 'IN_PROGRESS' | 'ENDED'
  messages: {
    messageId: number
    role: 'USER' | 'AI'
    content: string | null
    type: 'QUESTION' | 'ANSWER' | 'DONT_KNOW' | 'SKIP'
    order: number
  }[]
  canExtend: boolean
  drawing: Drawing
  card: DrawingResultData['card'] | null
}
type Start = {
  conversationId: number
  question: Question | null
  supportNotice: Notice | null
}
type Reply = {
  question: Question | null
  canExtend: boolean
  supportNotice: Notice | null
}

const aiQuestionTimeout = 40_000
const aiResultTimeout = 80_000
const path = (id: number | string) => `/api/conversations/${id}`
const supportKey = (scope: string, id: string) => JSON.stringify(['moyang:support', scope, id])
const drawingTitleKey = (scope: string, recordId: number) =>
  JSON.stringify(['moyang:drawing-title', scope, recordId])

export const rememberServerDrawingTitle = (scope: string, recordId: number, title: string) => {
  if (!title.trim() || scope !== getMockStorageScope()) return
  try {
    localStorage.setItem(drawingTitleKey(scope, recordId), title)
  } catch {
    return
  }
}

const readServerDrawingTitle = (scope: string | null, recordId: number) => {
  if (!scope) return undefined
  try {
    return localStorage.getItem(drawingTitleKey(scope, recordId)) || undefined
  } catch {
    return undefined
  }
}

export const rememberServerSupportNotice = (scope: string, conversation: Conversation) => {
  if (!conversation.id) return
  const key = supportKey(scope, conversation.id)
  try {
    if (conversation.status === 'support' && conversation.supportNotice) {
      sessionStorage.setItem(
        key,
        JSON.stringify({
          messageCount: conversation.messages.length,
          notice: conversation.supportNotice,
        }),
      )
    } else {
      sessionStorage.removeItem(key)
    }
  } catch {
    return
  }
}

export const restoreServerSupportNotice = (scope: string, conversation: Conversation) => {
  if (
    !conversation.id ||
    (conversation.status !== 'review' &&
      (conversation.status !== 'asking' || conversation.messages.length !== 0))
  )
    return conversation
  try {
    const raw = sessionStorage.getItem(supportKey(scope, conversation.id))
    const saved = raw
      ? (JSON.parse(raw) as { messageCount?: number; notice?: Partial<Notice> } | null)
      : null
    const notice = saved?.notice
    if (
      saved?.messageCount === conversation.messages.length &&
      typeof notice?.message === 'string' &&
      typeof notice.actionLabel === 'string' &&
      typeof notice.phone === 'string'
    ) {
      return {
        ...conversation,
        status: 'support' as const,
        supportNotice: {
          message: notice.message,
          actionLabel: notice.actionLabel,
          phone: notice.phone,
        },
      }
    }
  } catch {
    return conversation
  }
  return conversation
}

const toConversation = (detail: Detail): Conversation => {
  const last = detail.messages.at(-1)
  const question = detail.messages.findLast(({ role }) => role === 'AI')
  return {
    id: String(detail.conversationId),
    messages: detail.messages.map(({ role, content, type }) => ({
      role: role === 'USER' ? 'user' : 'assistant',
      text: type === 'DONT_KNOW' || type === 'SKIP' ? getReplyText({ type }) : (content ?? ''),
    })),
    questionIndex: Math.max(0, (question?.order ?? 1) - 1),
    status: detail.status === 'ENDED' ? 'ended' : last?.role === 'USER' ? 'review' : 'asking',
    canExtend: detail.canExtend,
  }
}

export const openDrawingConversation = async (
  drawingId: number | undefined,
  signal: AbortSignal,
) => {
  const scope = getMockStorageScope()
  const api = moyangRequest(signal)
  if (!drawingId) {
    const { conversation } = await api.json<{ conversation: { drawingId: number } | null }>(
      '/api/conversations',
      { params: { status: 'IN_PROGRESS' } },
    )
    if (!conversation) return null
    drawingId = conversation.drawingId
  }
  const drawing = await api.json<{
    drawingId: number
    conversationId: number | null
    recordId: number
    imageUrl: string
    note: string | null
    topic: { topicId: number; title: string } | null
  }>(`/api/drawings/${drawingId}`)
  return {
    recordId: drawing.recordId,
    drawing: {
      drawingId,
      title:
        readServerDrawingTitle(scope, drawing.recordId) ?? drawing.topic?.title ?? '오늘의 그림',
      topicId: drawing.topic?.topicId,
      imageUrl: drawing.imageUrl,
      note: drawing.note,
    },
    conversationId: drawing.conversationId,
  }
}

export const loadWoolBalance = async (signal?: AbortSignal) =>
  (await moyangRequest(signal).json<{ balance: number }>('/api/sheep')).balance

export const startServerConversation = async (
  drawingId: number,
  conversationId: number | null | undefined,
  signal: AbortSignal,
): Promise<Conversation> => {
  const api = moyangRequest(signal)
  const drawingPath = `/api/drawings/${drawingId}`
  const existing = async () =>
    (await api.json<{ conversationId: number | null }>(drawingPath)).conversationId
  if (conversationId) return toConversation(await api.json<Detail>(path(conversationId)))

  try {
    const data = await api.json<Start>('/api/conversations', {
      method: 'POST',
      data: { drawingId },
      timeout: aiQuestionTimeout,
    })
    return {
      id: String(data.conversationId),
      messages: data.question ? [{ role: 'assistant', text: data.question.content }] : [],
      questionIndex: Math.max(0, (data.question?.order ?? 1) - 1),
      status: data.supportNotice ? 'support' : data.question ? 'asking' : 'review',
      supportNotice: data.supportNotice ?? undefined,
      canExtend: false,
    }
  } catch (error) {
    if (
      !(error instanceof MoyangApiError) ||
      (error.status && error.code !== 'CONVERSATION_ALREADY_EXISTS')
    )
      throw error
    const conversationId = await existing()
    if (!conversationId) throw error
    return toConversation(await api.json<Detail>(path(conversationId)))
  }
}

export const updateServerConversation = async (
  current: Conversation,
  action: ConversationAction,
  signal: AbortSignal,
  reconcile: boolean,
): Promise<Conversation> => {
  if (!current.id) throw new Error('Missing conversation')
  const api = moyangRequest(signal)
  const url = path(current.id)
  const reloaded = async () => toConversation(await api.json<Detail>(url))
  if (reconcile) {
    const latest = await reloaded()
    if (latest.status === 'ended') return latest
    if (action.type !== 'END' && latest.messages.length > current.messages.length) return latest
    current = latest
  }
  if (action.type === 'END') {
    try {
      await api.json(url, {
        method: 'PUT',
        data: { status: 'ENDED' },
        timeout: aiResultTimeout,
      })
      return { ...current, status: 'ended' }
    } catch (error) {
      if (!(error instanceof MoyangApiError) || error.code !== 'CONVERSATION_ALREADY_ENDED')
        throw error
      return reloaded()
    }
  }
  const body =
    action.type === 'CONTINUE'
      ? { useWool: true }
      : action.type === 'ANSWER'
        ? { type: action.type, content: action.text }
        : { type: action.type }
  const reply = await api.json<Reply>(`${url}/messages`, {
    method: 'POST',
    data: body,
    timeout: aiQuestionTimeout,
  })
  const text = getReplyText(action)
  const messages = current.messages.slice()
  if (text) messages.push({ role: 'user', text })
  if (reply.question) messages.push({ role: 'assistant', text: reply.question.content })
  return {
    ...current,
    messages,
    questionIndex: reply.question ? Math.max(0, reply.question.order - 1) : current.questionIndex,
    canExtend: reply.canExtend,
    status: reply.supportNotice ? 'support' : reply.question ? 'asking' : 'review',
    supportNotice: reply.supportNotice ?? undefined,
  }
}

export const loadServerDrawingResult = async (
  id: number,
  drawing: ConversationDrawing,
  signal: AbortSignal,
): Promise<DrawingResultData> => {
  const scope = getMockStorageScope()
  const detail = await moyangRequest(signal).json<Detail>(path(id))
  if (detail.status !== 'ENDED' || !detail.card) throw new Error('Result is not ready')
  return {
    recordId: detail.recordId,
    drawing: {
      ...drawing,
      drawingId: detail.drawingId,
      title:
        readServerDrawingTitle(scope, detail.recordId) ??
        (drawing.drawingId === detail.drawingId
          ? drawing.title
          : (detail.drawing.topicTitle ?? drawing.title)),
      imageUrl: detail.drawing.imageUrl,
      note: detail.drawing.note,
      previewPhoto: undefined,
    },
    messages: toConversation(detail).messages,
    card: detail.card,
  }
}

export const saveServerReflection = (recordId: number, title: string, signal: AbortSignal) =>
  moyangRequest(signal).json<{ recordId: number; sheepEarned: 0 | 1; sheepBalance: number }>(
    '/api/records',
    { method: 'POST', data: { recordId, title: title.slice(0, 500) } },
  )
