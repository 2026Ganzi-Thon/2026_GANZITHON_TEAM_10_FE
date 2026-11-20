import { useEffect, useRef } from 'react'
import { useMoyangImage } from '@/hooks/useMoyangImage'
import type { ComponentProps } from 'react'
import type { ConversationDrawing } from './conversationMock'

type DrawingImageProps = ComponentProps<'img'> & {
  previewPhoto?: ConversationDrawing['previewPhoto']
}

export const DrawingImage = ({ previewPhoto, src, ...props }: DrawingImageProps) => {
  const protectedPath = src?.startsWith('/api/drawings/') ? src : undefined
  const image = useMoyangImage(protectedPath)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    if (!previewPhoto) return
    const photo = new Blob([previewPhoto.bytes], { type: previewPhoto.type })
    const url = URL.createObjectURL(photo)
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [previewPhoto])

  if (protectedPath && image === null) return <span>그림을 불러올 수 없어요</span>

  return (
    <img
      ref={imageRef}
      src={previewPhoto ? undefined : protectedPath ? (image ?? undefined) : src}
      {...props}
    />
  )
}
