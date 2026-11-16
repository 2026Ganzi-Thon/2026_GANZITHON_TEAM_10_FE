import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { MeetingReservation } from '@/features/meeting-reservation/MeetingReservation'

export const MeetingDetailPage = () => {
  const { meetingId = '' } = useParams<'meetingId'>()
  const scope = useMockStorageScope()
  const [, setAttempt] = useState(0)
  return (
    <MeetingReservation
      key={`${scope}:${meetingId}`}
      meetingId={meetingId}
      storageScope={scope}
      onRetry={() => setAttempt((attempt) => attempt + 1)}
    />
  )
}
