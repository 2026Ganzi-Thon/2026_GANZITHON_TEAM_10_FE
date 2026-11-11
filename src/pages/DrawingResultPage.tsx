import { useLocation, useNavigate } from 'react-router-dom'
import { DrawingResult } from '@/features/drawing-result/DrawingResult'
import { exampleResultSource } from '@/features/drawing-result/resultMock'
import type { DrawingResultSource } from '@/features/drawing-result/resultMock'
import { useMockStorageScope } from '@/hooks/useMockStorageScope'

type ResultLocationState = DrawingResultSource & { resultKey?: string; storageScope?: string }

const discardedResultKey = (key: string) => `moyang:discarded-drawing-result:${key}`

const isDiscarded = (key: string) => {
  try {
    return sessionStorage.getItem(discardedResultKey(key)) === 'true'
  } catch {
    return false
  }
}

export const DrawingResultPage = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const storageScope = useMockStorageScope()
  const state = location.state as ResultLocationState | null
  const finishedResult =
    storageScope && state?.storageScope === storageScope && state.conversation?.status === 'ended'
      ? state
      : null
  const scenario = import.meta.env.DEV ? new URLSearchParams(location.search).get('mock') : null
  const resultKey = state?.resultKey ?? location.key
  const source = state?.drawing
    ? finishedResult && !isDiscarded(resultKey)
      ? finishedResult
      : null
    : import.meta.env.DEV && storageScope && scenario !== 'missing-result'
      ? exampleResultSource
      : null

  const showConversation = location.hash === '#conversation'

  return (
    <DrawingResult
      key={`${storageScope}:${resultKey}`}
      source={source}
      storageScope={storageScope}
      scenario={scenario}
      showConversation={showConversation}
      onOpenConversation={() =>
        navigate(
          { search: location.search, hash: '#conversation' },
          { state: { ...state, resultKey } },
        )
      }
      onCloseConversation={() => {
        if (state?.resultKey) navigate(-1)
        else
          navigate({ search: location.search }, { replace: true, state: { ...state, resultKey } })
      }}
      onDiscard={() => {
        if (!finishedResult) return
        try {
          sessionStorage.setItem(discardedResultKey(resultKey), 'true')
        } catch {
          return
        }
      }}
    />
  )
}
