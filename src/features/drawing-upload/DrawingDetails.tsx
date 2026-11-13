import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, Input, PageHeader } from '@/components'
import { apiClient } from '@/lib/api-client'
import previewImage from '@/assets/drawing/drawing-2.png'
import styles from './DrawingDetails.module.css'

const isValidId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

type UploadedDrawing = { drawingId?: number; activityId?: number; title: string; note: string }

// 화면을 떠난 뒤 완료된 업로드도 같은 그림으로 돌아오면 재사용한다.
const completedUploads = new Map<string, UploadedDrawing>()
const pendingUploads = new Map<string, Promise<UploadedDrawing>>()

/** 선택한 그림을 확인하고 제목과 떠오른 생각을 입력한다. */
export const DrawingDetails = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const data = location.state as {
    photo?: Blob
    inputType?: 'PHOTO' | 'UPLOAD' | 'CANVAS'
    topic?: { topicId: number }
    uploaded?: UploadedDrawing
    draft?: { title: string; note: string }
    draftId?: string
  } | null
  const photo = data?.photo
  const uploaded =
    data?.uploaded ?? (data?.draftId ? completedUploads.get(data.draftId) : undefined)
  const isPreview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview')
  const imageRef = useRef<HTMLImageElement>(null)
  const [title, setTitle] = useState(data?.draft?.title ?? uploaded?.title ?? '')
  const [thought, setThought] = useState(data?.draft?.note ?? uploaded?.note ?? '')
  const [error, setError] = useState('')
  const invalidUpload =
    !!uploaded && (!isValidId(uploaded.drawingId) || !isValidId(uploaded.activityId))
  const [notice, setNotice] = useState(
    invalidUpload
      ? '그림은 업로드되었지만 저장 정보를 확인하지 못했어요. 다시 업로드하지 말고 관리자에게 문의해 주세요.'
      : '',
  )
  const [pending, setPending] = useState(false)
  const submitting = useRef(false)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

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
    const currentUpload =
      uploaded ?? (data?.draftId ? completedUploads.get(data.draftId) : undefined)
    if (
      currentUpload &&
      (!isValidId(currentUpload.drawingId) || !isValidId(currentUpload.activityId))
    ) {
      setNotice(
        '그림은 업로드되었지만 저장 정보를 확인하지 못했어요. 다시 업로드하지 말고 관리자에게 문의해 주세요.',
      )
      return
    }
    if (!title.trim()) {
      setError('그림 제목을 입력해 주세요.')
      return
    }
    if (thought.length > 200) {
      setNotice('떠오른 생각은 200자 이내로 입력해 주세요.')
      return
    }
    if (!isPreview && !currentUpload && (!data?.topic?.topicId || !data.inputType)) {
      setNotice('그림 주제 정보를 찾을 수 없어요. 이전 화면에서 다시 시작해 주세요.')
      return
    }
    submitting.current = true
    setPending(true)
    setNotice('')
    try {
      const draft = { title: title.trim(), note: currentUpload?.note ?? thought.trim() }
      const draftId = data?.draftId ?? crypto.randomUUID()
      await navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: { ...data, draft, draftId, uploaded: currentUpload },
      })
      if (!active.current) return
      let drawingId = currentUpload?.drawingId ?? 0
      let activityId: number | undefined = currentUpload?.activityId
      if (!isPreview && !currentUpload && data?.topic && data.inputType && photo instanceof Blob) {
        const body = new FormData()
        body.append('image', photo, photo instanceof File ? photo.name : 'drawing.jpg')
        body.append('inputType', data.inputType)
        body.append('topicId', String(data.topic.topicId))
        if (thought.trim()) body.append('note', thought.trim())
        let upload = pendingUploads.get(draftId)
        if (!upload) {
          upload = apiClient
            .post<{ success: boolean; data: { drawingId: number; activityId: number } }>(
              '/api/drawings',
              body,
            )
            .then((response) => {
              if (!response.data.success) throw new Error('upload failed')
              const result = response.data.data
              const saved = {
                drawingId: isValidId(result?.drawingId) ? result.drawingId : undefined,
                activityId: isValidId(result?.activityId) ? result.activityId : undefined,
                ...draft,
              }
              completedUploads.set(draftId, saved)
              return saved
            })
            .finally(() => pendingUploads.delete(draftId))
          pendingUploads.set(draftId, upload)
        }
        const saved = await upload
        draft.note = saved.note
        const validDrawingId = saved.drawingId
        const validActivityId = saved.activityId
        if (!active.current) return
        await navigate(`${location.pathname}${location.search}`, {
          replace: true,
          state: {
            ...data,
            draft,
            draftId,
            uploaded: saved,
          },
        })
        if (!validDrawingId || !validActivityId) {
          setNotice(
            '그림은 업로드되었지만 저장 정보를 확인하지 못했어요. 다시 업로드하지 말고 관리자에게 문의해 주세요.',
          )
          return
        }
        drawingId = validDrawingId
        activityId = validActivityId
      }
      if (!active.current) return
      navigate(`/drawing/conversation${isPreview ? '?preview' : ''}`, {
        state: {
          ...data,
          drawing: {
            drawingId,
            title: title.trim(),
            note: draft.note,
            imageUrl: photo instanceof Blob ? URL.createObjectURL(photo) : previewImage,
          },
          activityId,
        },
      })
    } catch {
      if (active.current)
        setNotice('그림을 업로드하지 못했어요. 연결 상태와 입력 내용을 확인해 주세요.')
    } finally {
      submitting.current = false
      if (active.current) setPending(false)
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
              if (!invalidUpload) setNotice('')
            }}
          />
          <Input
            id="drawing-thought"
            label="그림을 그리며 떠오른 생각 (선택)"
            value={thought}
            readOnly={Boolean(uploaded)}
            onChange={(event) => setThought(event.target.value)}
          />
          {uploaded && (
            <p className={styles.uploadedNote}>업로드한 그림의 생각은 수정할 수 없어요.</p>
          )}
        </div>
        <div className={styles.actions}>
          {notice && <p role="status">{notice}</p>}
          <Button type="submit" disabled={pending || invalidUpload}>
            {pending ? '그림을 올리고 있어요' : '그림 이야기 시작하기'}
          </Button>
        </div>
      </form>
    </div>
  )
}
