import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { DrawingConversation } from '@/features/drawing-conversation/DrawingConversation'
import { exampleDrawing } from '@/features/drawing-conversation/conversationMock'
import type { ConversationDrawing } from '@/features/drawing-conversation/conversationMock'

export const DrawingConversationPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { drawing?: ConversationDrawing } | null
  const drawing = state?.drawing ?? (import.meta.env.DEV ? exampleDrawing : null)
  const scenario = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null

  if (!drawing) return <Navigate replace to="/drawing" />

  return (
    <DrawingConversation
      key={`${drawing.drawingId}:${scenario}`}
      drawing={drawing}
      isPreview={!state?.drawing}
      scenario={scenario}
      onBack={() => {
        if (state?.drawing && location.key !== 'default') navigate(-1)
        else navigate('/drawing')
      }}
    />
  )
}
