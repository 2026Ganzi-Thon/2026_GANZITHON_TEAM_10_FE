import { HomeLayout } from '@/components'
import { MeetingList } from '@/features/meeting-list/MeetingList'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'

export const MeetingsPage = ({ getCreatePath }: { getCreatePath: () => string | undefined }) => {
  const scope = useMockStorageScope()
  return (
    <HomeLayout>
      <MeetingList key={scope} getCreatePath={getCreatePath} />
    </HomeLayout>
  )
}
