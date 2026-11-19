import { useEffect, useRef } from 'react'
import type { ComponentProps } from 'react'
import type { ConversationDrawing } from './conversationMock'

type DrawingImageProps = ComponentProps<'img'> & {
  previewPhoto?: ConversationDrawing['previewPhoto']
}

export const DrawingImage = ({ previewPhoto, src, ...props }: DrawingImageProps) => {
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!previewPhoto) return
    const photo = new Blob([previewPhoto.bytes], { type: previewPhoto.type })
    const url = URL.createObjectURL(photo)
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [previewPhoto])

  return <img ref={imageRef} src={previewPhoto ? undefined : src} {...props} />
}
