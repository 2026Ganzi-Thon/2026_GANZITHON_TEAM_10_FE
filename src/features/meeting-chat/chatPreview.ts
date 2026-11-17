import {
  chatHistoryDuration,
  meetingSampleImage,
  readMeetingChat,
  updateMeetingChat,
} from './chatMock'
import type { ChatStorageContext, MeetingChat } from './chatMock'

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
