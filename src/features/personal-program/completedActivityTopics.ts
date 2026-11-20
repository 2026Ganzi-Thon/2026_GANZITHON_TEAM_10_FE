import { moyangRequest } from '@/lib/moyang-api'
import type { RecordItem } from '@/features/records/types'
import type { ServerShape } from './shapeApi'

type ScheduledActivityTopics = { titles: (string | null)[] } | { updatedShape: ServerShape | null }
type TopicRecord = Pick<RecordItem, 'recordId' | 'imageUrl'>

export type SavedProgramActivity = { recordId: number; themeCode: string }

const loadDrawingTopic = async (
  api: ReturnType<typeof moyangRequest>,
  { recordId, imageUrl }: TopicRecord,
) => {
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
}

export const loadSavedActivityRecord = async (recordId: number, signal: AbortSignal) => {
  const api = moyangRequest(signal)
  const record = await api.json<TopicRecord>(`/api/records/${recordId}`)
  if (record?.recordId !== recordId) return null
  return { recordId, topic: await loadDrawingTopic(api, record) }
}

export const loadScheduledActivityTopics = async (
  { themeCode, completedRounds, totalRounds }: ServerShape,
  signal: AbortSignal,
): Promise<ScheduledActivityTopics> => {
  const api = moyangRequest(signal)
  const { items, hasNext } = await api.json<{
    items: TopicRecord[]
    hasNext: boolean
  }>('/api/records', { params: { size: completedRounds } })

  // 다른 탭에서 회고가 저장됐다면 이전 진행도에 새 기록을 연결하지 않는다.
  const updatedShape = await api.json<ServerShape | null>('/api/shapes/me')
  if (
    !updatedShape ||
    updatedShape.themeCode !== themeCode ||
    updatedShape.completedRounds !== completedRounds ||
    updatedShape.totalRounds !== totalRounds
  )
    return { updatedShape }

  // 상한에 도달한 뒤 기록이 더 있으면 서버 진행도만으로 어떤 기록이 회차에 포함됐는지 결정할 수 없다.
  if (items.length !== completedRounds || (completedRounds === totalRounds && hasNext))
    return { titles: [] }

  const titles = await Promise.all(
    items
      .slice()
      .reverse()
      .map((item) => loadDrawingTopic(api, item)),
  )
  return { titles }
}
