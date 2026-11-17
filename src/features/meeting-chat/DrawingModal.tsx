import { Modal } from '@/components'
import type { ChatStorageContext, SharedDrawing } from './chatMock'
import { maskMeetingText } from './chatContent'
import { SavedDrawingImage } from './SavedDrawingImage'
import styles from './MeetingChat.module.css'

export const DrawingModal = ({
  isOpen,
  context,
  nickname,
  drawing,
  error,
  onClose,
  closeLabel = '대화로 돌아가기',
}: {
  isOpen: boolean
  context: ChatStorageContext
  nickname: string
  drawing: SharedDrawing | null
  error?: string
  onClose: () => void
  closeLabel?: string
}) => (
  <Modal
    isOpen={isOpen}
    ariaLabel={maskMeetingText(nickname)}
    onClose={onClose}
    actions={[{ label: closeLabel, onClick: onClose }]}
  >
    <div className={styles.drawingProfile}>
      <h2 className={styles.drawingOwner}>{maskMeetingText(nickname)}</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : drawing ? (
        <div className={styles.picture}>
          <SavedDrawingImage context={context} drawing={drawing} retryable />
          <h3 className={styles.pictureTitle}>{maskMeetingText(drawing.title)}</h3>
          <p>{maskMeetingText(drawing.description)}</p>
        </div>
      ) : (
        <p>
          아직 공유한 그림이 없어요.
          <br />
          그림을 공유하면 여기에서 확인할 수 있어요.
        </p>
      )}
    </div>
  </Modal>
)
