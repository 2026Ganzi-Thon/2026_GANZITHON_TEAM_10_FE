import { useState } from 'react'
import { Modal } from '@/components'
import { getMeetingChatError, readMeetingChatSummary, readOwnMeetingDrawing } from './chatMock'
import type { ChatStorageContext, SharedDrawing } from './chatMock'
import { DrawingModal } from './DrawingModal'

export const ExpiredChatNotice = ({
  context,
  onBack,
}: {
  context: ChatStorageContext
  onBack: () => void
}) => {
  const [showDrawing, setShowDrawing] = useState(false)
  let drawing: SharedDrawing | null = null
  let nickname = '내 그림'
  let error = ''
  try {
    drawing = readOwnMeetingDrawing(context)
    if (showDrawing) nickname = readMeetingChatSummary(context)?.ownNickname ?? nickname
  } catch (cause) {
    error = getMeetingChatError(cause, '그림을 불러오지 못했어요.')
  }
  return (
    <>
      <Modal
        isOpen={!showDrawing}
        title="대화 열람 기간이 지났어요"
        onClose={onBack}
        actions={
          drawing
            ? [
                { label: '내 그림 보기', onClick: () => setShowDrawing(true) },
                { label: '목록으로', color: 'gray', onClick: onBack },
              ]
            : [{ label: '목록으로', onClick: onBack }]
        }
      >
        <p>
          모임 종료 후 24시간이 지났어요.
          {drawing && (
            <>
              <br />
              공유한 내 그림은 계속 볼 수 있어요.
            </>
          )}
        </p>
        {!showDrawing && error && <p role="alert">{error}</p>}
      </Modal>
      <DrawingModal
        isOpen={showDrawing}
        context={context}
        drawing={drawing}
        nickname={nickname}
        error={error}
        onClose={() => setShowDrawing(false)}
        closeLabel="안내로 돌아가기"
      />
    </>
  )
}
