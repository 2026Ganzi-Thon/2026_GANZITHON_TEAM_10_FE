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
  meetingReservations?: Record<string, MockMeetingReservation>
}

export type MockMeetingReservation = {
  joined: boolean
  isHost: boolean
  cancelled: boolean
  participantDelta: number
  woolChange: number
  startAt: number
}

const recordsKey = 'moyang:mock-reflection-records'
const previewRecordsKey = `${recordsKey}:wool-preview`

export const getReflectionStorageKey = (preview = false) =>
  getMockStorageKey(preview ? previewRecordsKey : recordsKey)

const parseReflections = (saved: string): MockReflectionStore => {
  const data = JSON.parse(saved) as MockReflectionStore | MockRecord[] | null
  if (Array.isArray(data)) {
    return { records: data, completedDrawingIds: data.map(({ drawingId }) => drawingId) }
  }
  if (!Array.isArray(data?.records) || !Array.isArray(data.completedDrawingIds)) {
    throw new Error('저장된 회고 형식을 확인할 수 없어요')
  }
  const reservations = data.meetingReservations
  if (
    reservations !== undefined &&
    (reservations === null ||
      typeof reservations !== 'object' ||
      Array.isArray(reservations) ||
      Object.values(reservations).some(
        (reservation) =>
          !reservation ||
          typeof reservation.joined !== 'boolean' ||
          typeof reservation.isHost !== 'boolean' ||
          typeof reservation.cancelled !== 'boolean' ||
          ![-1, 0, 1].includes(reservation.participantDelta) ||
          !Number.isSafeInteger(reservation.woolChange) ||
          typeof reservation.startAt !== 'number' ||
          !Number.isFinite(new Date(reservation.startAt).getTime()),
      ))
  ) {
    throw new Error('저장된 모임 신청 정보를 확인할 수 없어요')
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
    meetingReservations: { ...legacy.meetingReservations, ...current.meetingReservations },
  }
}

export const migrateLegacyReflections = (accountSuffix: string) => {
  migrateLegacyMockKey(recordsKey, accountSuffix, parseReflections, mergeReflections)
  migrateLegacyMockKey(previewRecordsKey, accountSuffix, parseReflections, mergeReflections)
}

const readReflectionStore = (key: string): MockReflectionStore =>
  readMockStorage(key, parseReflections) ?? {
    records: [],
    completedDrawingIds: [],
  }

export const readReflections = (preview = false): MockReflectionStore =>
  readReflectionStore(getReflectionStorageKey(preview))

export const writeReflections = (store: MockReflectionStore, preview = false) =>
  writeMockStorage(getReflectionStorageKey(preview), store)

export const hasSavedReflection = (store: MockReflectionStore, drawingId: number) =>
  store.completedDrawingIds.includes(drawingId) ||
  store.records.some((record) => record.drawingId === drawingId)

export const getWoolBalance = (store = readReflections()) => {
  const earned = store.records.reduce((total, record) => total + (record.sheepReward ?? 0), 0)
  const meetingChange = Object.values(store.meetingReservations ?? {}).reduce(
    (total, reservation) => total + reservation.woolChange,
    0,
  )
  return Math.max(0, earned - (store.paidQuestions?.length ?? 0) + meetingChange)
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

export const updateMeetingReservation = <T>(
  key: string,
  id: string,
  signal: AbortSignal,
  update: (store: MockReflectionStore) => { result: T; reservation?: MockMeetingReservation },
) => {
  if (!window.navigator.locks)
    throw new Error('이 브라우저에서는 모임을 안전하게 신청하거나 취소할 수 없어요.')

  return withReflectionLock(signal, () => {
    if (key !== getReflectionStorageKey()) throw new Error('로그인 정보가 변경됐어요.')
    const local = localStorage.getItem(key)
    const session = sessionStorage.getItem(key)
    if (local !== null && session !== null && local !== session) {
      throw new Error('저장된 모임 신청 정보를 다시 확인해 주세요.')
    }
    const store = readReflectionStore(key)
    const { result, reservation } = update(store)
    if (key !== getReflectionStorageKey()) throw new Error('로그인 정보가 변경됐어요.')
    if (reservation) {
      writeMockStorage(key, {
        ...store,
        meetingReservations: { ...store.meetingReservations, [id]: reservation },
      })
    }
    return result
  })
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
