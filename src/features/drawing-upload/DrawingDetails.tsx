import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, PageHeader } from '@/components'
import { apiClient } from '@/lib/api-client'
import previewImage from '@/assets/drawing/drawing-2.png'
import styles from './DrawingDetails.module.css'

/** 선택한 그림을 확인하고 제목과 떠오른 생각을 입력한다. */
export const DrawingDetails = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const data = location.state as {
    photo?: Blob
    inputType?: 'PHOTO' | 'UPLOAD' | 'CANVAS'
    topic?: { topicId: number }
  } | null
  const photo = data?.photo
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')
  const imageRef = useRef<HTMLImageElement>(null)
  const [title, setTitle] = useState('')
  const [thought, setThought] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)

  useEffect(() => {
    if (!(photo instanceof Blob)) return
    const url = URL.createObjectURL(photo)
    if (imageRef.current) imageRef.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [photo])

  if (!(photo instanceof Blob) && !isPreview) return <Navigate to="/drawing/upload" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    if (!title.trim()) {
      setError('그림 제목을 입력해 주세요.')
      return
    }
    if (thought.length > 200) {
      setNotice('떠오른 생각은 200자 이내로 입력해 주세요.')
      return
    }
    if (!isPreview && (!data?.topic?.topicId || !data.inputType)) {
      setNotice('그림 주제 정보를 찾을 수 없어요. 이전 화면에서 다시 시작해 주세요.')
      return
    }
    submitting.current = true
    setPending(true)
    setNotice('')
    try {
      let drawingId = 0
      let activityId: number | undefined
      if (!isPreview && data?.topic && data.inputType && photo instanceof Blob) {
        const body = new FormData()
        body.append('image', photo, photo instanceof File ? photo.name : 'drawing.jpg')
        body.append('inputType', data.inputType)
        body.append('topicId', String(data.topic.topicId))
        if (thought.trim()) body.append('note', thought.trim())
        const response = await apiClient.post<{
          success: boolean
          data: { drawingId: number; activityId: number }
        }>('/api/drawings', body)
        if (!response.data.success || !Number.isInteger(response.data.data?.drawingId))
          throw new Error('upload failed')
        drawingId = response.data.data.drawingId
        activityId = response.data.data.activityId
      }
      navigate(`/drawing/conversation${isPreview ? '?preview' : ''}`, {
        state: {
          drawing: {
            drawingId,
            title: title.trim(),
            note: thought.trim(),
            imageUrl: photo instanceof Blob ? URL.createObjectURL(photo) : previewImage,
          },
          activityId,
        },
      })
    } catch {
      setNotice('그림을 업로드하지 못했어요. 연결 상태와 입력 내용을 확인해 주세요.')
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title=""
        action="back"
        onNavigate={() =>
          navigate(
            `${data?.inputType === 'CANVAS' ? '/drawing/canvas' : '/drawing/upload'}${location.search}`,
            { state: data },
          )
        }
      />
      <form className={styles.form} onSubmit={submit} noValidate>
        <img
          ref={imageRef}
          src={isPreview && !(photo instanceof Blob) ? previewImage : undefined}
          className={`${styles.preview} ${data?.inputType === 'CANVAS' ? styles.canvasPreview : ''}`}
          alt="선택한 그림 미리보기"
        />
        <div className={styles.fields}>
          <Input
            id="drawing-title"
            label="오늘의 그림 제목"
            value={title}
            error={error}
            onChange={(event) => {
              setTitle(event.target.value)
              setError('')
              setNotice('')
            }}
          />
          <Input
            id="drawing-thought"
            label="그림을 그리며 떠오른 생각 (선택)"
            value={thought}
            onChange={(event) => setThought(event.target.value)}
          />
        </div>
        <div className={styles.actions}>
          {notice && <p role="status">{notice}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? '그림을 올리고 있어요' : '그림 이야기 시작하기'}
          </Button>
        </div>
      </form>
    </div>
  )
}
