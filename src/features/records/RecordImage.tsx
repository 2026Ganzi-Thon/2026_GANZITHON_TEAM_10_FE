import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import styles from './Records.module.css'

/** 인증이 필요한 서버 이미지를 공통 클라이언트로 불러온다. */
export const RecordImage = ({ url, preview }: { url: string | null; preview: boolean }) => {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    const load = async () => {
      try {
        const resolved = new URL(url, window.location.origin)
        const apiOrigin = apiClient.defaults.baseURL
          ? new URL(apiClient.defaults.baseURL, window.location.origin).origin
          : window.location.origin
        if (
          preview ||
          (resolved.origin !== apiOrigin && resolved.origin !== window.location.origin)
        ) {
          setImage(url)
        } else {
          const response = await apiClient.get<Blob>(url, {
            responseType: 'blob',
            signal: controller.signal,
          })
          objectUrl = URL.createObjectURL(response.data)
          if (!controller.signal.aborted) setImage(objectUrl)
        }
      } catch {
        if (!controller.signal.aborted) setImage(null)
      }
    }
    void load()
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, preview])
  return image ? (
    <img className={styles.image} src={image} alt="" onError={() => setImage(null)} />
  ) : (
    <span className={styles.imagePlaceholder} aria-hidden="true" />
  )
}
