import { getMockMeetingFixture } from '@/features/meeting-list/meetingMock'
import type { Meeting, PastMeeting } from '@/features/meeting-list/meetingMock'
import { getMockStorageScope } from '@/lib/mock-storage'
import { readEndedMeetingChats } from './chatMock'

export const applyMeetingChatHistory = <
  T extends { meetings: Meeting[]; myMeetings?: Meeting[]; pastMeetings: PastMeeting[] },
>(
  data: T,
): T => {
  const scope = getMockStorageScope()
  if (!scope) throw new Error('로그인 정보를 확인할 수 없어요.')
  const ended = readEndedMeetingChats(scope)
  const endedIds = new Set(ended.map(({ meetingId }) => meetingId))
  const past = new Map(data.pastMeetings.map((meeting) => [meeting.id, meeting]))
  for (const summary of ended) {
    const meeting = getMockMeetingFixture(summary.meetingId)
    if (!meeting || summary.endedAt === null) continue
    past.set(meeting.id, {
      id: meeting.id,
      title: meeting.title,
      concern: meeting.concern,
      startAt: summary.startedAt,
      endAt: summary.endedAt,
      hasChatHistory: true,
      hasDrawing: summary.hasDrawing,
    })
  }
  return {
    ...data,
    meetings: data.meetings.filter(({ id }) => !endedIds.has(id)),
    ...(data.myMeetings && {
      myMeetings: data.myMeetings.filter(({ id }) => !endedIds.has(id)),
    }),
    pastMeetings: [...past.values()].sort((a, b) => b.endAt - a.endAt),
  }
}
