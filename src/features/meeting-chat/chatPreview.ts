import {
  chatHistoryDuration,
  meetingSampleImage,
  readMeetingChat,
  updateMeetingChat,
} from './chatMock'
import type { ChatCommand, ChatStorageContext, MeetingChat } from './chatMock'

const peerMessages = {
  INTRO: '안녕하세요! 저는 산책을 좋아해서 강아지가 떠올랐어요.',
  DRAWING: null,
  SHARING: '저는 그림에 오늘 산책하면서 본 하늘을 담았어요.',
  CLOSING: '오늘 그림이랑 이야기 나눌 수 있어서 좋았어요.',
}

export const getNextMockPeerMessage = (
  scenario: ChatStorageContext['scenario'],
  chat: MeetingChat,
  now: number,
): Extract<ChatCommand, { type: 'send' }> | null => {
  const { phase, messages } = chat
  if (scenario?.startsWith('chat-') || chat.endedAt !== null || chat.endAgreedIds.length > 0)
    return null

  const peer = chat.participants.find(({ id }) => id !== 'me')
  const phaseStart = messages.find(
    (message) =>
      message.type === 'SYSTEM' &&
      (message.event === 'STARTED' || message.event === 'PHASE_CHANGED') &&
      message.phase === phase,
  )
  if (!peer || !phaseStart) return null

  const hasMessage = (requestId: string) =>
    messages.some((message) => message.type !== 'SYSTEM' && message.requestId === requestId)
  const send = (requestId: string, content: string) =>
    ({ type: 'send', phase, requestId, participantId: peer.id, content }) as const
  const phaseMessageId = `mock-peer-text:${phase}`
  const phaseMessage = peerMessages[phase]
  if (phaseMessage && !hasMessage(phaseMessageId)) return send(phaseMessageId, phaseMessage)

  const replyId = `${phaseMessageId}:reply`
  const ownMessage = messages.find(
    (message) =>
      message.type === 'TEXT' &&
      message.participantId === 'me' &&
      message.messageId > phaseStart.messageId,
  )
  if (ownMessage && now >= ownMessage.createdAt + 1500 && !hasMessage(replyId))
    return send(replyId, '얘기 들려줘서 고마워요.')
  return null
}

export const getChatReadTime = (context: ChatStorageContext, now: number) => {
  if (context.scenario === 'chat-expired') return now + chatHistoryDuration + 1
  if (context.scenario === 'chat-expiring') return now + chatHistoryDuration - 5000
  return now
}

export const prepareChatPreview = async (
  context: ChatStorageContext,
  chat: MeetingChat,
  canParticipate: () => boolean,
  signal: AbortSignal,
) => {
  let next = chat
  if (
    [
      'chat-drawing',
      'chat-drawing-expiring',
      'chat-drawing-late',
      'chat-share-error',
      'chat-sharing',
      'chat-closing',
      'chat-end-voting',
      'chat-ended-shared',
      'chat-expired',
      'chat-expiring',
    ].includes(context.scenario ?? '')
  ) {
    if (next.phase === 'INTRO' && next.endedAt === null)
      next = await updateMeetingChat(
        context,
        { type: 'advance', from: 'INTRO', participantId: next.moderatorId },
        canParticipate,
        signal,
      )
  }
  if (
    ['chat-sharing', 'chat-closing', 'chat-ended-shared', 'chat-expired', 'chat-expiring'].includes(
      context.scenario ?? '',
    ) &&
    next.phase === 'DRAWING' &&
    next.endedAt === null
  ) {
    for (const member of next.participants) {
      if (
        next.messages.some(
          (message) => message.type === 'DRAWING' && message.participantId === member.id,
        )
      )
        continue
      next = await updateMeetingChat(
        context,
        {
          type: 'share',
          requestId: `preview-drawing:${member.id}`,
          participantId: member.id,
          drawing: {
            id: `preview-drawing:${member.id}`,
            title: member.id === 'me' ? '내가 공유한 그림 예시' : '함께 나눈 그림 예시',
            description: '상태 확인을 위한 목업 그림이에요.',
            imageUrl: meetingSampleImage,
          },
        },
        canParticipate,
        signal,
      )
    }
  }
  if (
    ['chat-closing', 'chat-ended-shared', 'chat-expired', 'chat-expiring'].includes(
      context.scenario ?? '',
    ) &&
    next.phase === 'SHARING' &&
    next.endedAt === null
  )
    next = await updateMeetingChat(
      context,
      { type: 'advance', participantId: next.moderatorId, from: 'SHARING' },
      canParticipate,
      signal,
    )
  if (context.scenario === 'chat-end-voting' && next.endAgreedIds.length === 0) {
    const requester = next.participants.find(({ id }) => id !== 'me')!
    next = await updateMeetingChat(
      context,
      { type: 'agree-end', participantId: requester.id },
      canParticipate,
      signal,
    )
  }
  if (
    ['chat-ended', 'chat-ended-shared', 'chat-expired', 'chat-expiring'].includes(
      context.scenario ?? '',
    ) &&
    next.endedAt === null
  ) {
    for (const member of next.participants)
      next = await updateMeetingChat(
        context,
        { type: 'agree-end', participantId: member.id },
        canParticipate,
        signal,
      )
  }
  if (
    ['chat-messages', 'chat-six', 'chat-filter'].includes(context.scenario ?? '') &&
    next.endedAt === null
  ) {
    for (const member of next.participants.filter(({ id }) => id !== 'me'))
      next = await updateMeetingChat(
        context,
        {
          type: 'send',
          requestId: `mock-introduction:${member.id}`,
          participantId: member.id,
          content:
            context.scenario === 'chat-filter'
              ? '필터 확인: 씨발 · ㅅㅂ · 개자식\n시발점과 시바견, 줄바꿈은 그대로 보여요.'
              : '반가워요. 오늘은 차분하게 이야기해 보고 싶어요.',
        },
        canParticipate,
        signal,
      )
  }
  if (context.scenario === 'chat-expired' || context.scenario === 'chat-expiring')
    return readMeetingChat(context, getChatReadTime(context, Date.now())) ?? next
  return next
}
