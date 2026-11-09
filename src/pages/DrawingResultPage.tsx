import { useLocation, useNavigate } from 'react-router-dom'
import { DrawingResult } from '@/features/drawing-result/DrawingResult'
import { exampleResultSource } from '@/features/drawing-result/resultMock'
import type { DrawingResultSource } from '@/features/drawing-result/resultMock'

type ResultLocationState = DrawingResultSource & { resultKey?: string }

export const DrawingResultPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as ResultLocationState | null
  const finishedResult = state?.drawing && state.conversation?.status === 'ended' ? state : null
  const scenario = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null
  const source =
    finishedResult ??
    (import.meta.env.DEV && scenario !== 'missing-result' ? exampleResultSource : null)

  const showConversation = location.hash === '#conversation'

  return (
    <DrawingResult
      key={state?.resultKey ?? location.key}
      source={source}
      rewardDrawingId={finishedResult?.drawing.drawingId}
      scenario={scenario}
      showConversation={showConversation}
      onOpenConversation={() =>
        navigate(
          { search: location.search, hash: '#conversation' },
          { state: { ...state, resultKey: location.key } },
        )
      }
      onCloseConversation={() => {
        if (state?.resultKey) navigate(-1)
        else navigate({ search: location.search }, { replace: true, state })
      }}
    />
  )
}
