import { getMockStorageKey } from './mock-storage'

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
  const saved = localStorage.getItem(getMockStorageKey(preview ? previewRecordsKey : recordsKey))
  if (saved) return JSON.parse(saved)

  const legacy = preview ? null : sessionStorage.getItem(getMockStorageKey(recordsKey))
  const data: MockReflectionStore | MockRecord[] = legacy ? JSON.parse(legacy) : []
  const store = Array.isArray(data)
    ? { records: data, completedDrawingIds: data.map(({ drawingId }) => drawingId) }
    : data
  if (legacy) {
    writeReflections(store)
    sessionStorage.removeItem(getMockStorageKey(recordsKey))
  }
  return store
}

export const writeReflections = (store: MockReflectionStore, preview = false) =>
  localStorage.setItem(
    getMockStorageKey(preview ? previewRecordsKey : recordsKey),
    JSON.stringify(store),
  )

export const hasSavedReflection = (store: MockReflectionStore, drawingId: number) =>
  store.completedDrawingIds.includes(drawingId) ||
  store.records.some((record) => record.drawingId === drawingId)

export const getWoolBalance = (store = readReflections()) => {
  const earned = store.records.reduce((total, record) => total + (record.sheepReward ?? 0), 0)
  return Math.max(0, earned - (store.paidQuestions?.length ?? 0))
}

export const withReflectionLock = <T>(signal: AbortSignal, update: () => T): Promise<T> => {
  signal.throwIfAborted()
  const storageKey = getMockStorageKey(recordsKey)
  const applyUpdate = () => {
    signal.throwIfAborted()
    if (storageKey !== getMockStorageKey(recordsKey)) throw new Error('로그인 정보가 변경됐어요')
    return update()
  }
  if (!window.navigator.locks) return Promise.resolve(applyUpdate())
  return window.navigator.locks.request(storageKey, { signal }, applyUpdate)
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
