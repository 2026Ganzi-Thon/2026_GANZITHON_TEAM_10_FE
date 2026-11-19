import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DrawingConversation } from '@/features/drawing-conversation/DrawingConversation'
import { exampleDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ConversationDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ProgramActivityHandoff } from '@/features/personal-program/programMock'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'
import { getMockRecordId, isRecordId } from '@/lib/mock-reflections'
import type { RecordId } from '@/lib/mock-reflections'

export const DrawingConversationPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const storageScope = useMockStorageScope()
  const state = location.state as {
    drawing?: ConversationDrawing
    recordId?: RecordId
    activityId?: number
    programActivity?: ProgramActivityHandoff
    storageScope?: string
  } | null
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
