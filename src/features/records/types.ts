export type RecordItem = {
  recordId: number
  recordDate: string
  imageUrl: string | null
  title?: string
  completedAt?: string
}
export type RecordDetail = RecordItem & {
  drawingDescription: string | null
  todaysStory?: string | null
  whatISaid?: string | null
  thoughts?: string | null
  analysis: {
    mainElements: string
    spatialComposition: string
    lineExpression: string
    emotionMeaning: string
  } | null
  messages: { sequenceNo: number; role: string; content: string }[]
}
export type Response<T> = { success: boolean; data: T | null }
