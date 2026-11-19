import { useEffect, useState } from 'react'
import { Button } from '@/components'
import { hasMoyangApi } from '@/lib/moyang-api'
import {
  openDrawingConversation,
  rememberServerDrawingTitle,
} from '@/features/drawing-conversation/conversationApi'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DrawingConversation } from '@/features/drawing-conversation/DrawingConversation'
import { exampleDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ConversationDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ProgramActivityHandoff } from '@/features/personal-program/programMock'
import {
  readDrawingActivity,
  rememberDrawingActivity,
} from '@/features/personal-program/programSchedule'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { getMockRecordId, isRecordId } from '@/lib/mock-reflections'
import type { RecordId } from '@/lib/mock-reflections'

type ConversationHandoff = {
  drawing?: ConversationDrawing
  recordId?: RecordId
  activityId?: number
  programActivity?: ProgramActivityHandoff
  storageScope?: string
}

export const DrawingConversationPage = () => {
  const location = useLocation()
  const scope = useMockStorageScope()
  const params = new URLSearchParams(location.search)
  const handoff = location.state as ConversationHandoff | null
  const preview =
    import.meta.env.DEV &&
    (params.has('preview') || params.has('mock') || Boolean(handoff?.programActivity?.mock))
  if (hasMoyangApi && !preview) {
    return <ServerConversationPage key={`${scope}:${location.key}`} scope={scope} />
  }
  return <MockConversationPage />
}

const ServerConversationPage = ({ scope }: { scope: string | null }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const handoff = location.state as ConversationHandoff | null
  const requestedDrawingId = Number(new URLSearchParams(location.search).get('drawingId'))
  const drawingId =
    handoff?.drawing?.drawingId ??
    (Number.isSafeInteger(requestedDrawingId) && requestedDrawingId > 0
      ? requestedDrawingId
      : undefined)
  const handoffRecordId = handoff?.recordId
  const handoffScope = handoff?.storageScope
  const handoffTitle = handoff?.drawing?.title
  const authorized = Boolean(scope && (!handoffScope || handoffScope === scope))
  const activity = handoffScope === scope ? handoff?.programActivity : undefined
  const [data, setData] = useState<Awaited<ReturnType<typeof openDrawingConversation>> | 'error'>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!authorized) return
    const controller = new AbortController()
    openDrawingConversation(drawingId, controller.signal).then(
      (opened) => {
        if (controller.signal.aborted) return
        if (opened && typeof handoffRecordId === 'number' && opened.recordId !== handoffRecordId) {
          setData('error')
          return
        }
        if (
          opened &&
          scope &&
          handoffScope === scope &&
          handoffRecordId === opened.recordId &&
          handoffTitle
        ) {
          rememberServerDrawingTitle(scope, opened.recordId, handoffTitle)
        }
        if (opened && activity && scope)
          rememberDrawingActivity(scope, opened.drawing.drawingId, activity)
        setData(opened)
      },
      () => {
        if (!controller.signal.aborted) setData('error')
      },
    )
    return () => controller.abort()
  }, [drawingId, handoffRecordId, handoffScope, handoffTitle, authorized, attempt, activity, scope])

  if (!scope || !authorized) return <Navigate replace to="/drawing" />
  if (data === 'error')
    return (
      <div role="alert">
        대화 정보를 불러오지 못했어요.
        <Button
          onClick={() => {
            setData(undefined)
            setAttempt(attempt + 1)
          }}
        >
          다시 시도
        </Button>
      </div>
    )
  if (data === null) return <Navigate replace to="/drawing" />
  if (!data) return <p role="status">그림 정보를 불러오고 있어요.</p>

  return (
    <DrawingConversation
      server
      serverConversationId={data.conversationId}
      drawing={{
        ...data.drawing,
        title: handoffTitle || data.drawing.title,
        concern: handoff?.drawing?.concern,
      }}
      recordId={data.recordId}
      storageKey={`${scope}:drawing:${data.drawing.drawingId}`}
      storageScope={scope}
      programActivity={activity ?? readDrawingActivity(scope, data.drawing.drawingId)}
      isPreview={false}
      scenario={null}
      onBack={() =>
        handoff?.drawing && location.key !== 'default' ? navigate(-1) : navigate('/drawing')
      }
    />
  )
}

const MockConversationPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const storageScope = useMockStorageScope()
  const state = location.state as ConversationHandoff | null
  const scenario = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null
  const previewDrawing =
    scenario === 'wool' ? { ...exampleDrawing, drawingId: -10 } : exampleDrawing
  const drawing = state?.drawing ?? (import.meta.env.DEV ? previewDrawing : null)

  if (!drawing || !storageScope || (state?.storageScope && state.storageScope !== storageScope)) {
    return <Navigate replace to="/drawing" />
  }

  const activity = state?.programActivity
  const fallbackRecordId = getMockRecordId(drawing.drawingId)
  const handoffRecordId = state?.recordId ?? state?.activityId
  const recordId = isRecordId(handoffRecordId) ? handoffRecordId : fallbackRecordId
  const drawingKey = `${storageScope}:mock-conversation:${drawing.drawingId}:${scenario ?? 'default'}`
  const activityKey = activity
    ? `${drawingKey}:${activity.mock ?? 'program'}:${activity.programId}:${activity.round}:${activity.date}`
    : drawingKey
  const storageKey =
    recordId === fallbackRecordId
      ? activityKey
      : `${activityKey}:record:${JSON.stringify(recordId)}`

  return (
    <DrawingConversation
      key={storageKey}
      drawing={drawing}
      recordId={recordId}
      storageKey={storageKey}
      legacyStorageKey={
        drawing.drawingId > 0 && storageKey !== activityKey ? activityKey : undefined
      }
      storageScope={storageScope}
      programActivity={activity}
      isPreview={!state?.drawing}
      scenario={scenario}
      onBack={() => {
        if (state?.drawing && location.key !== 'default') navigate(-1)
        else navigate('/drawing')
      }}
    />
  )
}
