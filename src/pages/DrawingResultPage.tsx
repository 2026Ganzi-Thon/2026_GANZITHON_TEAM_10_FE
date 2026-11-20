import { useLocation, useNavigate } from 'react-router-dom'
import { DrawingResult } from '@/features/drawing-result/DrawingResult'
import { exampleResultSource } from '@/features/drawing-result/resultMock'
import type { DrawingResultSource } from '@/features/drawing-result/resultMock'
import { hasMoyangApi } from '@/lib/moyang-api'
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
  const serverId = Number(new URLSearchParams(location.search).get('conversationId'))
  const serverResult =
    hasMoyangApi && !!storageScope && Number.isSafeInteger(serverId) && serverId > 0
  const resultKey = state?.resultKey ?? (serverResult ? `conversation:${serverId}` : location.key)
  const source = serverResult
    ? state?.storageScope && state.storageScope !== storageScope
      ? null
      : {
          drawing: finishedResult?.drawing ?? { drawingId: 0, title: '오늘의 그림' },
          conversation: finishedResult?.conversation ?? {
            status: 'ended' as const,
            messages: [],
            questionIndex: 0,
          },
          programActivity: finishedResult?.programActivity,
          serverConversationId: serverId,
        }
    : state?.drawing
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
