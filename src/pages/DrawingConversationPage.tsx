import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DrawingConversation } from '@/features/drawing-conversation/DrawingConversation'
import { exampleDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ConversationDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ProgramActivityHandoff } from '@/features/personal-program/programMock'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'

export const DrawingConversationPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const storageScope = useMockStorageScope()
  const state = location.state as {
    drawing?: ConversationDrawing
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
  const drawingKey = `${storageScope}:mock-conversation:${drawing.drawingId}:${scenario ?? 'default'}`
  const storageKey = activity
    ? `${drawingKey}:${activity.mock ?? 'program'}:${activity.programId}:${activity.round}:${activity.date}`
    : drawingKey

  return (
    <DrawingConversation
      key={storageKey}
      drawing={drawing}
      activityId={state?.activityId}
      resultState={state ?? undefined}
      storageKey={storageKey}
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
