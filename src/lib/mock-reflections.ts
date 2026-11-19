import {
  getMockStorageKey,
  migrateLegacyMockKey,
  MockStorageUnavailableError,
  readMockStorage,
  withMockStorageLock,
  writeMockStorage,
} from './mock-storage'

export type ReflectionCard = {
  todaysStory: string
  whatISaid?: string
  thoughts?: string
}

export type RecordId = number | string

export const isRecordId = (id: unknown): id is RecordId =>
  typeof id === 'number'
    ? Number.isSafeInteger(id) && id >= 0
    : typeof id === 'string' && !!id.trim()

export const getMockRecordId = (drawingId: number): RecordId => `mock-drawing:${drawingId}`

const previewRecordPrefix = 'mock-preview:'

export const getMockPreviewRecordId = (draftId: string): RecordId =>
  `${previewRecordPrefix}${draftId}`

const canMatchLegacyDrawing = (recordId: RecordId) =>
  typeof recordId === 'number' || !recordId.startsWith(previewRecordPrefix)

export type MockRecord = {
  recordId?: RecordId
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
  bookingId?: string
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

const normalizeRecordDate = (value: string) => {
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  const date = legacy
    ? `${legacy[3]}-${legacy[1].padStart(2, '0')}-${legacy[2].padStart(2, '0')}`
    : value
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new MockStorageUnavailableError()
  }
  return date
}

const parseReflections = (saved: string): MockReflectionStore => {
  let data: MockReflectionStore | MockRecord[] | null
  try {
    data = JSON.parse(saved) as MockReflectionStore | MockRecord[] | null
  } catch {
    throw new MockStorageUnavailableError()
  }
  const rawRecords = Array.isArray(data) ? data : data?.records
  if (
    !Array.isArray(rawRecords) ||
    rawRecords.some(
      (record) =>
        !record ||
        !Number.isInteger(record.drawingId) ||
        (record.recordId !== undefined && !isRecordId(record.recordId)) ||
        (record.activityKey !== undefined && typeof record.activityKey !== 'string') ||
        typeof record.recordDate !== 'string' ||
        !record.recordDate ||
        (record.sheepReward !== undefined && record.sheepReward !== 1),
    )
  ) {
    throw new MockStorageUnavailableError()
  }
  const records = rawRecords.map((record) => ({
    ...record,
    recordDate: normalizeRecordDate(record.recordDate),
  }))
  if (Array.isArray(data))
    return { records, completedDrawingIds: records.map(({ drawingId }) => drawingId) }
  if (
    !data ||
    !Array.isArray(data.completedDrawingIds) ||
    !data.completedDrawingIds.every(Number.isInteger) ||
    (data.paidQuestions !== undefined &&
      (!Array.isArray(data.paidQuestions) ||
        data.paidQuestions.some((question) => typeof question !== 'string' || !question)))
  ) {
    throw new MockStorageUnavailableError()
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
          (reservation.bookingId !== undefined &&
            (typeof reservation.bookingId !== 'string' || !reservation.bookingId.trim())) ||
          ![-1, 0, 1].includes(reservation.participantDelta) ||
          !Number.isSafeInteger(reservation.woolChange) ||
          typeof reservation.startAt !== 'number' ||
          !Number.isFinite(new Date(reservation.startAt).getTime()),
      ))
  ) {
    throw new Error('저장된 모임 신청 정보를 확인할 수 없어요')
  }
  if (!reservations) return { ...data, records }
  return {
    ...data,
    records,
    meetingReservations: Object.fromEntries(
      Object.entries(reservations).map(([id, reservation]) => [
        id,
        { ...reservation, woolChange: Math.min(0, reservation.woolChange) },
      ]),
    ),
  }
}

const mergeReflections = (
  current: MockReflectionStore,
  legacy: MockReflectionStore,
): MockReflectionStore => {
  const records = new Map(
    [...legacy.records, ...current.records].map((record) => [
      record.recordId ?? getMockRecordId(record.drawingId),
      record,
    ]),
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

export const readReflectionStore = (key: string, forWrite = false): MockReflectionStore =>
  readMockStorage(key, parseReflections, forWrite) ?? {
    records: [],
    completedDrawingIds: [],
  }

export const readReflections = (preview = false): MockReflectionStore =>
  readReflectionStore(getReflectionStorageKey(preview))

export const writeReflections = (store: MockReflectionStore, preview = false) =>
  writeMockStorage(getReflectionStorageKey(preview), store)

export const findSavedReflection = (
  store: MockReflectionStore,
  recordId: RecordId,
  drawingId: number,
) =>
  store.records.find((record) => record.recordId === recordId) ??
  (canMatchLegacyDrawing(recordId)
    ? store.records.find(
        (record) => record.recordId === undefined && record.drawingId === drawingId,
      )
    : undefined)

export const hasSavedReflection = (
  store: MockReflectionStore,
  recordId: RecordId,
  drawingId: number,
) =>
  Boolean(findSavedReflection(store, recordId, drawingId)) ||
  (canMatchLegacyDrawing(recordId) &&
    store.completedDrawingIds.includes(drawingId) &&
    !store.records.some((record) => record.drawingId === drawingId))

export const getWoolBalance = (store = readReflections()) => {
  const earned = new Set(
    store.records
      .filter(({ sheepReward }) => sheepReward === 1)
      .map(({ recordDate }) => recordDate),
  ).size
  const meetingChange = Object.values(store.meetingReservations ?? {}).reduce(
    (total, reservation) => total + Math.min(0, reservation.woolChange),
    0,
  )
  return Math.max(0, earned - (store.paidQuestions?.length ?? 0) + meetingChange)
}

export const withReflectionLock = async <T>(signal: AbortSignal, update: () => T) => {
  signal.throwIfAborted()
  if (!navigator.locks)
    throw new Error('이 브라우저에서는 회고와 양털을 안전하게 저장할 수 없어요.')
  return withMockStorageLock(recordsKey, update, signal)
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
    const store = readReflectionStore(key, true)
    const { result, reservation } = update(store)
    if (key !== getReflectionStorageKey()) throw new Error('로그인 정보가 변경됐어요.')
    if (reservation) {
      if (session !== null && session === local) sessionStorage.removeItem(key)
      writeMockStorage(key, {
        ...store,
        meetingReservations: { ...store.meetingReservations, [id]: reservation },
      })
    }
    return result
  })
}

export const spendWoolForQuestion = async (
  questionId: string,
  signal: AbortSignal,
  preview = false,
) => {
  const key = getReflectionStorageKey(preview)
  return withReflectionLock(signal, () => {
    if (key !== getReflectionStorageKey(preview)) throw new Error('로그인 정보가 변경됐어요')
    const store = readReflectionStore(key, true)
    if (key !== getReflectionStorageKey(preview)) throw new Error('로그인 정보가 변경됐어요')
    const paidQuestions = store.paidQuestions ?? []
    if (paidQuestions.includes(questionId)) return true
    if (getWoolBalance(store) === 0) return false

    writeMockStorage(key, { ...store, paidQuestions: [...paidQuestions, questionId] })
    return true
  })
}
