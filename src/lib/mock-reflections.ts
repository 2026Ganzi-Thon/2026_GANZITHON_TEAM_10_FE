export type ReflectionCard = {
  todaysStory: string
  whatISaid?: string
  thoughts?: string
}

export type MockRecord = {
  drawingId: number
  recordDate: string
  sheepReward?: 1
  title?: string
  card?: ReflectionCard
  activityKey?: string
}

export type MockReflectionStore = {
  records: MockRecord[]
  completedDrawingIds: number[]
  paidQuestions?: string[]
}

const recordsKey = 'moyang:mock-reflection-records'
const previewRecordsKey = `${recordsKey}:wool-preview`

export const readReflections = (preview = false): MockReflectionStore => {
  const saved = localStorage.getItem(preview ? previewRecordsKey : recordsKey)
  if (saved) return JSON.parse(saved)

  const legacy = preview ? null : sessionStorage.getItem(recordsKey)
  const data: MockReflectionStore | MockRecord[] = legacy ? JSON.parse(legacy) : []
  if (!Array.isArray(data)) return data

  return {
    records: data,
    completedDrawingIds: data.map(({ drawingId }) => drawingId),
  }
}

export const writeReflections = (store: MockReflectionStore, preview = false) =>
  localStorage.setItem(preview ? previewRecordsKey : recordsKey, JSON.stringify(store))

export const hasSavedReflection = (store: MockReflectionStore, drawingId: number) =>
  store.completedDrawingIds.includes(drawingId) ||
  store.records.some((record) => record.drawingId === drawingId)

export const getWoolBalance = (store = readReflections()) => {
  const earned = store.records.reduce((total, record) => total + (record.sheepReward ?? 0), 0)
  return Math.max(0, earned - (store.paidQuestions?.length ?? 0))
}

export const withReflectionLock = <T>(signal: AbortSignal, update: () => T): Promise<T> => {
  signal.throwIfAborted()
  if (!window.navigator.locks) return Promise.resolve(update())
  return window.navigator.locks.request(recordsKey, { signal }, update)
}

export const spendWoolForQuestion = (questionId: string, signal: AbortSignal, preview = false) =>
  withReflectionLock(signal, () => {
    const store = readReflections(preview)
    const paidQuestions = store.paidQuestions ?? []
    if (paidQuestions.includes(questionId)) return true

    if (getWoolBalance(store) === 0) return false

    writeReflections({ ...store, paidQuestions: [...paidQuestions, questionId] }, preview)
    return true
  })
