import { ServerMeetingRoom } from '@/features/meeting-waiting-room/ServerMeetingRoom'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { hasMoyangApi } from '@/lib/moyang-api'
import { MeetingWaitingRoom } from '@/features/meeting-waiting-room/MeetingWaitingRoom'
import { isMeetingPreview } from '@/features/meeting-list/meetingEntry'

export const MeetingWaitingPage = () => {
  const { search } = useLocation()
  const { meetingId } = useParams<'meetingId'>()
  const scope = useMockStorageScope()
  if (!hasMoyangApi || isMeetingPreview(search, meetingId))
    return <MeetingWaitingRoom view="waiting" />
  if (!meetingId || !scope) return <Navigate to="/meetings" replace />
  const key = JSON.stringify([scope, meetingId])
  return <ServerMeetingRoom key={key} id={meetingId} scope={scope} view="waiting" />
}
