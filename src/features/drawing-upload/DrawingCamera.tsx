import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components'
import styles from './DrawingCamera.module.css'

/** 카메라 영상을 표시하고 촬영한 사진을 그림 확인 화면으로 전달한다. */
export const DrawingCamera = () => {
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const startCamera = useCallback(async () => {
    const request = ++requestRef.current
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    try {
      if (!window.isSecureContext) await Promise.reject(new Error('insecure'))
      if (!navigator.mediaDevices?.getUserMedia) await Promise.reject(new Error('unavailable'))
      const camera = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (request !== requestRef.current) {
        camera.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = camera
      if (videoRef.current) videoRef.current.srcObject = camera
    } catch (reason) {
      if (request !== requestRef.current) return
      setError(
        reason instanceof Error && reason.message === 'insecure'
          ? '카메라를 사용하려면 HTTPS 주소 또는 localhost로 접속해 주세요.'
          : reason instanceof Error && reason.message === 'unavailable'
            ? '이 브라우저에서 카메라를 사용할 수 없어요. 브라우저 설정을 확인해 주세요.'
            : reason instanceof DOMException && reason.name === 'NotAllowedError'
              ? '카메라 권한이 차단되어 있어요. 브라우저나 기기 설정에서 카메라를 허용해 주세요.'
              : '카메라를 사용할 수 없어요. 카메라 연결 상태를 확인하고 다시 시도해 주세요.',
      )
    }
  }, [])

  useEffect(() => {
    void startCamera()
    return () => {
      requestRef.current += 1
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [startCamera])

  const takePhoto = () => {
    const video = videoRef.current
    if (!video?.videoWidth || !video.videoHeight || !video.clientWidth || !video.clientHeight)
      return
    const frameRatio = video.clientWidth / video.clientHeight
    const videoRatio = video.videoWidth / video.videoHeight
    const cropWidth = videoRatio > frameRatio ? video.videoHeight * frameRatio : video.videoWidth
    const cropHeight = videoRatio > frameRatio ? video.videoHeight : video.videoWidth / frameRatio
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(cropWidth)
    canvas.height = Math.round(cropHeight)
    const context = canvas.getContext('2d')
    if (!context) {
      setError('사진을 만들 수 없어요. 다시 시도해 주세요.')
      return
    }
    context.drawImage(
      video,
      (video.videoWidth - cropWidth) / 2,
      (video.videoHeight - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    canvas.toBlob(
      (photo) => {
        if (photo)
          navigate(`/drawing/details${search}`, {
            replace: true,
            state: { ...state, photo, inputType: 'PHOTO' },
          })
        else setError('사진을 만들 수 없어요. 다시 시도해 주세요.')
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="사진 촬영"
        action="back"
        onNavigate={() => navigate(`/drawing/upload${search}`, { state })}
      />
      <div className={styles.content}>
        <h1>그림을 보여주세요</h1>
        <p>완성한 방향 상관 없이 촬영해주세요</p>
        <div className={styles.viewfinder}>
          <video ref={videoRef} autoPlay playsInline muted onPlaying={() => setReady(true)} />
          <p className={styles.caption}>그림 전체가 보이도록 맞춰 주세요</p>
          {error && (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              <button
                type="button"
                className={styles.retry}
                onClick={() => {
                  setError('')
                  setReady(false)
                  void startCamera()
                }}
              >
                카메라 다시 켜기
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.shutter}
          type="button"
          aria-label="사진 촬영"
          onClick={takePhoto}
          disabled={!ready}
        />
      </div>
    </div>
  )
}
