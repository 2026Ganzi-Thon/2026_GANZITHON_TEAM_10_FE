import { useEffect, useState } from 'react'
import { moyangRequest } from '@/lib/moyang-api'
import { useMockStorageScope } from './useMockStorageScope'

export const useMoyangImage = (path: string | undefined) => {
  const scope = useMockStorageScope()
  const [image, setImage] = useState<{ path: string; scope: string | null; url: string | null }>()
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    let url: string | undefined
    moyangRequest(controller.signal)
      .image(path)
      .then(
        (blob) => {
          if (controller.signal.aborted) return
          url = URL.createObjectURL(blob)
          setImage({ path, scope, url })
        },
        () => {
          if (!controller.signal.aborted) setImage({ path, scope, url: null })
        },
      )
    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [path, scope])

  return image && image.path === path && image.scope === scope ? image.url : undefined
}
