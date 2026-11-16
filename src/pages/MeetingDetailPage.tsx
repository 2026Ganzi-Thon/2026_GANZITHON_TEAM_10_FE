import { useParams } from 'react-router-dom'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { MeetingReservation } from '@/features/meeting-reservation/MeetingReservation'

export const MeetingDetailPage = () => {
  const { meetingId = '' } = useParams<'meetingId'>()
  const scope = useMockStorageScope()
  return (
    <MeetingReservation key={`${scope}:${meetingId}`} meetingId={meetingId} storageScope={scope} />
  )
}
