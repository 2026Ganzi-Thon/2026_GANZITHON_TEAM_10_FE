import { useEffect, useRef, useState } from 'react'
import { MoyangApiError } from '@/lib/moyang-api'
import {
  enterServerMeeting,
  getServerMeeting,
  getServerMeetingChat,
} from '@/features/meeting-list/meetingApi'
import type { MeetingChatData, MeetingDetail } from '@/features/meeting-list/meetingApi'
import { rememberServerPastMeeting } from '@/features/meeting-list/serverMeetingHistory'

export const useServerMeetingChat = (id: string, scope: string, enabled = true) => {
  const [chat, setChat] = useState<MeetingChatData>()
  const [skipPhase, setSkipPhase] = useState<MeetingChatData['phase']>(null)
  const [error, setError] = useState<unknown>()
  const [attempt, setAttempt] = useState(0)
  const latest = useRef<MeetingChatData | undefined>(undefined)
  const meeting = useRef<MeetingDetail | undefined>(undefined)
  const refresh = () => setAttempt((value) => value + 1)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      try {
        const previous = latest.current
        if (!previous) {
          const room = await getServerMeeting(id, controller.signal)
          meeting.current = room
          if (room.type === 'SCHEDULED' && room.status === 'IN_PROGRESS') {
            await enterServerMeeting(id, controller.signal)
          }
        }
        const afterId = previous?.messages.at(-1)?.messageId
        const next = await getServerMeetingChat(id, controller.signal, afterId)
        if (controller.signal.aborted) return
        const messages = new Map(previous?.messages.map((message) => [message.messageId, message]))
        next.messages.forEach((message) => messages.set(message.messageId, message))
        const merged = {
          ...next,
          messages: [...messages.values()].sort((a, b) => a.messageId - b.messageId),
        }
        if (merged.status === 'ENDED' && previous?.status !== 'ENDED' && meeting.current) {
          rememberServerPastMeeting(scope, id, meeting.current, merged)
        }
        latest.current = merged
        setChat(merged)
        setError(undefined)
        if (merged.status === 'IN_PROGRESS') {
          const detail = await getServerMeeting(id, controller.signal).catch(() => null)
          if (!controller.signal.aborted) {
            setSkipPhase(
              detail?.canSkip && detail.status === 'IN_PROGRESS' && detail.phase === merged.phase
                ? merged.phase
                : null,
            )
          }
        } else setSkipPhase(null)
      } catch (cause) {
        if (controller.signal.aborted) return
        setSkipPhase(null)
        setError(cause)
        if (
          cause instanceof MoyangApiError &&
          (cause.status === 401 ||
            cause.status === 403 ||
            cause.status === 404 ||
            cause.code === 'MEETING_NOT_JOINABLE')
        ) {
          latest.current = undefined
          setChat(undefined)
          return
        }
      }
      if (!controller.signal.aborted) timer = window.setTimeout(poll, 3000)
    }
    void poll()

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [id, scope, enabled, attempt])

  const canSkip = chat?.status === 'IN_PROGRESS' && skipPhase !== null && chat.phase === skipPhase
  return { chat, error, canSkip, refresh }
}
