import { moyangRequest } from '@/lib/moyang-api'

export const weekdayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
type Weekday = (typeof weekdayCodes)[number]

export type ServerShape = {
  themeCode: string
  themeName: string
  completedRounds: number
  totalRounds: number
  nextRound: number | null
  weekdays: Weekday[]
  nextActivityDate: string | null
}

export const loadServerShape = (signal: AbortSignal) =>
  moyangRequest(signal).json<ServerShape | null>('/api/shapes/me')

/** 기록이 하나뿐일 때만 해당 그림의 실제 주제를 확인한다. */
export const loadOnlyRecordTopic = async (signal: AbortSignal) => {
  const api = moyangRequest(signal)
  const records = await api.json<{
    items: { recordId: number; imageUrl: string | null }[]
    hasNext: boolean
  }>('/api/records', { params: { size: 2 } })
  if (
    !records ||
    !Array.isArray(records.items) ||
    records.items.length !== 1 ||
    records.hasNext !== false
  )
    return null
  const record = records.items[0]
  const drawingId = /^\/api\/drawings\/(\d+)\/image$/.exec(record.imageUrl ?? '')?.[1]
  if (!drawingId) return null
  const drawing = await api.json<{
    recordId: number
    topic: { title: string } | null
  }>(`/api/drawings/${drawingId}`)
  return drawing?.recordId === record.recordId ? drawing.topic?.title?.trim() || null : null
}
