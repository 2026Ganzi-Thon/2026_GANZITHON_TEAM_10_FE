import type { MeetingChat } from './chatMock'

export const drawingDuration = 10 * 60 * 1000
export const drawingGraceDuration = 60 * 1000

export const getDrawingStartedAt = (chat: MeetingChat) =>
  chat.messages.find(
    (message) =>
      message.type === 'SYSTEM' && message.event === 'PHASE_CHANGED' && message.phase === 'DRAWING',
  )?.createdAt ?? null

export const formatRemainingTime = (milliseconds: number, hours = false) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const parts = [Math.floor(seconds / 60) % 60, seconds % 60]
  if (hours) parts.unshift(Math.floor(seconds / 3600))
  return parts.map((part) => String(part).padStart(2, '0')).join(':')
}
