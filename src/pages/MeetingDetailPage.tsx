import { hasMoyangApi } from '@/lib/moyang-api'
import { ServerMeetingRoom } from '@/features/meeting-waiting-room/ServerMeetingRoom'
import { useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { MeetingReservation } from '@/features/meeting-reservation/MeetingReservation'
import { isMeetingPreview } from '@/features/meeting-list/meetingEntry'

export const MeetingDetailPage = () => {
  const { meetingId = '' } = useParams<'meetingId'>()
  const scope = useMockStorageScope()
  const { search } = useLocation()
  const [, setAttempt] = useState(0)
  if (hasMoyangApi && !isMeetingPreview(search, meetingId)) {
    return (
      <ServerMeetingRoom key={`${scope}:${meetingId}`} id={meetingId} scope={scope} view="detail" />
    )
  }
  return (
    <MeetingReservation
      key={`${scope}:${meetingId}`}
      meetingId={meetingId}
      storageScope={scope}
      onRetry={() => setAttempt((attempt) => attempt + 1)}
    />
  )
}
