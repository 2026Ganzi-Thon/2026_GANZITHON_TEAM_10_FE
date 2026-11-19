import { useEffect, useState } from 'react'
import sampleDrawing from '@/assets/drawing/drawing-1.png'
import { meetingSampleImage } from './chatMock'
import type { ChatStorageContext, SharedDrawing } from './chatMock'
import { readDrawingDraft } from './drawingDraft'
import { getMockStorageScope } from '@/lib/mock-storage'
import { maskMeetingText } from './chatContent'
import styles from './MeetingChat.module.css'

export const SavedDrawingImage = ({
  context,
  drawing,
  retryable = false,
}: {
  context: ChatStorageContext
  drawing: SharedDrawing
  retryable?: boolean
}) => {
  if (!drawing.imageUrl.startsWith('meeting-draft:'))
    return (
      <DrawingImage
        key={drawing.imageUrl}
        src={drawing.imageUrl === meetingSampleImage ? sampleDrawing : drawing.imageUrl}
        title={drawing.title}
        retryable={retryable}
      />
    )
  return (
    <DraftImage
      key={JSON.stringify([
        context.scope,
        context.meetingId,
        context.scenario,
        drawing.id,
        drawing.revision,
      ])}
      context={context}
      drawing={drawing}
      retryable={retryable}
    />
  )
}

const DraftImage = ({
  context,
  drawing,
  retryable,
}: {
  context: ChatStorageContext
  drawing: SharedDrawing
  retryable: boolean
}) => {
  const [image, setImage] = useState('')
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let url = ''
    readDrawingDraft(context)
      .then((draft) => {
        if (!active || getMockStorageScope() !== context.scope) return
        if (
          !draft?.photo ||
          draft.id !== drawing.id ||
          drawing.imageUrl !== `meeting-draft:${draft.id}` ||
          (drawing.revision !== undefined && draft.revision !== drawing.revision)
        )
          throw new Error('missing')
        url = URL.createObjectURL(draft.photo)
        setImage(url)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [context, drawing.id, drawing.imageUrl, drawing.revision, attempt])
  if (error)
    return (
      <DrawingImageError
        onRetry={
          retryable
            ? () => {
                setError(false)
                setImage('')
                setAttempt((value) => value + 1)
              }
            : undefined
        }
      />
    )
  return image ? (
    <img src={image} alt={maskMeetingText(drawing.title)} onError={() => setError(true)} />
  ) : (
    <span role="status">그림을 불러오고 있어요.</span>
  )
}

const DrawingImage = ({
  src,
  title,
  retryable,
}: {
  src: string
  title: string
  retryable: boolean
}) => {
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (error)
    return (
      <DrawingImageError
        onRetry={
          retryable
            ? () => {
                setError(false)
                setAttempt((value) => value + 1)
              }
            : undefined
        }
      />
    )
  return <img key={attempt} src={src} alt={maskMeetingText(title)} onError={() => setError(true)} />
}

const DrawingImageError = ({ onRetry }: { onRetry?: () => void }) => (
  <span className={styles.imageError}>
    <span role="alert">
      이 모임의 그림을 불러오지 못했어요.
      {!onRetry && ' 눌러서 다시 확인해 주세요.'}
    </span>
    {onRetry && (
      <button type="button" onClick={onRetry}>
        그림 다시 불러오기
      </button>
    )}
  </span>
)
