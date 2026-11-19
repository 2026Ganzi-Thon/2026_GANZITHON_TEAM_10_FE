import { SheepProfile } from '@/components'
import type { RoomParticipant } from '@/features/meeting-waiting-room/waitingRoomMock'
import type { ChatMessage as Message, ChatStorageContext } from './chatMock'
import { maskMeetingText } from './chatContent'
import { SavedDrawingImage } from './SavedDrawingImage'
import styles from './MeetingChat.module.css'

export const ChatMessage = ({
  message,
  member,
  context,
  onOpenDrawing,
}: {
  message: Exclude<Message, { type: 'SYSTEM' }>
  member: RoomParticipant
  context: ChatStorageContext
  onOpenDrawing?: () => void
}) => {
  const mine = member.id === 'me'
  const drawing = message.type === 'DRAWING' && (
    <>
      <span className={styles.drawingPreview}>
        <SavedDrawingImage context={context} drawing={message.drawing} />
      </span>
      <strong>{maskMeetingText(message.drawing.title)}</strong>
      <span>{maskMeetingText(message.drawing.description)}</span>
    </>
  )
  return (
    <div className={`${styles.message} ${mine ? styles.mine : ''}`}>
      {!mine &&
        (onOpenDrawing ? (
          <button
            className={styles.avatar}
            type="button"
            aria-label={`${maskMeetingText(member.nickname)} 그림 확인`}
            onClick={onOpenDrawing}
          >
            <SheepProfile color={member.color} size={42} alt="" />
          </button>
        ) : (
          <SheepProfile color={member.color} size={42} alt="" />
        ))}
      <div className={styles.messageBody}>
        {!mine &&
          (onOpenDrawing ? (
            <button
              className={`${styles.nickname} ${styles.nicknameButton}`}
              type="button"
              aria-label={`${maskMeetingText(member.nickname)} 닉네임으로 그림 확인`}
              onClick={onOpenDrawing}
            >
              {maskMeetingText(member.nickname)}
            </button>
          ) : (
            <span className={styles.nickname}>{maskMeetingText(member.nickname)}</span>
          ))}
        {message.type === 'TEXT' ? (
          <p className={styles.bubble}>{maskMeetingText(message.content)}</p>
        ) : onOpenDrawing ? (
          <button className={styles.drawingMessage} type="button" onClick={onOpenDrawing}>
            {drawing}
          </button>
        ) : (
          <div className={styles.drawingMessage}>{drawing}</div>
        )}
        <time className={styles.messageTime} dateTime={new Date(message.createdAt).toISOString()}>
          {new Date(message.createdAt).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
        </time>
      </div>
    </div>
  )
}
