import { useRevalidator } from 'react-router-dom'
import { Button } from '@/components'

/** 사용자 정보 확인이 실패하면 재시도할 수 있도록 안내한다. */
export const RootEntryError = () => {
  const { revalidate, state } = useRevalidator()
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p role="alert">내 정보를 확인하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <Button onClick={() => void revalidate()} disabled={state !== 'idle'}>
        다시 시도
      </Button>
    </div>
  )
}
