import { moyangRequest } from '@/lib/moyang-api'
import type { RecordItem } from '@/features/records/types'
import type { ServerShape } from './shapeApi'

export const loadScheduledActivityTopics = async (
  { completedRounds, totalRounds }: ServerShape,
  signal: AbortSignal,
) => {
  const api = moyangRequest(signal)
  const { items, hasNext } = await api.json<{
    items: Pick<RecordItem, 'recordId' | 'imageUrl'>[]
    hasNext: boolean
  }>('/api/records', { params: { size: completedRounds } })
  // 상한에 도달한 뒤 기록이 더 있으면 서버 진행도만으로 어떤 기록이 회차에 포함됐는지 결정할 수 없다.
  if (items.length !== completedRounds || (completedRounds === totalRounds && hasNext)) return []

  return Promise.all(
    items
      .slice()
      .reverse()
      .map(async ({ recordId, imageUrl }) => {
        const drawingId = /^\/api\/drawings\/(\d+)\/image$/.exec(imageUrl ?? '')?.[1]
        if (!drawingId) return null

        try {
          const drawing = await api.json<{ recordId: number; topic: { title: string } | null }>(
            `/api/drawings/${drawingId}`,
          )
          return drawing?.recordId === recordId ? drawing.topic?.title?.trim() || null : null
        } catch {
          return null
        }
      }),
  )
}
