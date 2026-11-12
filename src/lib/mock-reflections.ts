import {
  getMockStorageKey,
  migrateLegacyMockKey,
  mockStorageLock,
  readMockStorage,
  writeMockStorage,
} from './mock-storage'

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

const parseReflections = (saved: string): MockReflectionStore => {
  const data = JSON.parse(saved) as MockReflectionStore | MockRecord[] | null
  if (Array.isArray(data)) {
    return { records: data, completedDrawingIds: data.map(({ drawingId }) => drawingId) }
  }
  if (!Array.isArray(data?.records) || !Array.isArray(data.completedDrawingIds)) {
    throw new Error('저장된 회고 형식을 확인할 수 없어요')
  }
  return data
}

const mergeReflections = (
  current: MockReflectionStore,
  legacy: MockReflectionStore,
): MockReflectionStore => {
  const records = new Map(
    [...legacy.records, ...current.records].map((record) => [record.recordDate, record]),
  )
  return {
    records: [...records.values()],
    completedDrawingIds: [
      ...new Set([...legacy.completedDrawingIds, ...current.completedDrawingIds]),
    ],
    paidQuestions: [
      ...new Set([...(legacy.paidQuestions ?? []), ...(current.paidQuestions ?? [])]),
    ],
  }
}

export const migrateLegacyReflections = (accountSuffix: string) => {
  migrateLegacyMockKey(recordsKey, accountSuffix, parseReflections, mergeReflections)
  migrateLegacyMockKey(previewRecordsKey, accountSuffix, parseReflections, mergeReflections)
}

export const readReflections = (preview = false): MockReflectionStore =>
  readMockStorage(
    getMockStorageKey(preview ? previewRecordsKey : recordsKey),
    parseReflections,
  ) ?? {
    records: [],
    completedDrawingIds: [],
  }

export const writeReflections = (store: MockReflectionStore, preview = false) =>
  writeMockStorage(getMockStorageKey(preview ? previewRecordsKey : recordsKey), store)

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
  return window.navigator.locks.request(mockStorageLock, { signal }, applyUpdate)
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
