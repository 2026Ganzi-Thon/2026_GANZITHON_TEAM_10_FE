import type { CanvasPath } from 'react-sketch-canvas'
import { getMockStorageScope, mockStorageLock } from '@/lib/mock-storage'
import type { ChatStorageContext, SharedDrawing } from './chatMock'
import { readMeetingChat } from './chatMock'

export type MeetingDrawingDraft = {
  version: 1
  id: string
  revision: number
  photo: Blob | null
  paths: CanvasPath[]
  inputType: 'PHOTO' | 'UPLOAD' | 'CANVAS'
  fields: { title: string; note: string }
  methodSelected?: boolean
}
export type DrawingDraftPatch = Partial<
  Pick<MeetingDrawingDraft, 'photo' | 'paths' | 'inputType' | 'methodSelected'>
> & { fields?: Partial<MeetingDrawingDraft['fields']> }

const databaseName = 'moyang:meeting-drawings'
const storeName = 'drafts'
const keyFor = ({ scope, meetingId, scenario = null }: ChatStorageContext) =>
  JSON.stringify([scope, meetingId, scenario])

export const openDrawingDraftChannel = (context: ChatStorageContext) => {
  if (typeof BroadcastChannel === 'undefined') return null
  try {
    return new BroadcastChannel(`moyang:meeting-drawing:${keyFor(context)}`)
  } catch {
    return null
  }
}

const assertScope = (scope: string) => {
  if (!scope || scope !== getMockStorageScope()) throw new Error('로그인 정보가 변경됐어요.')
}

const validateDraft = (value: MeetingDrawingDraft) => {
  if (
    !value ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !value.id ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !(value.methodSelected === undefined || typeof value.methodSelected === 'boolean') ||
    !(
      value.photo === null ||
      (value.photo instanceof Blob &&
        ['image/png', 'image/jpeg'].includes(value.photo.type) &&
        value.photo.size > 0 &&
        value.photo.size <= 10 * 1024 * 1024)
    ) ||
    !['PHOTO', 'UPLOAD', 'CANVAS'].includes(value.inputType) ||
    !value.fields ||
    typeof value.fields.title !== 'string' ||
    typeof value.fields.note !== 'string' ||
    value.fields.title.length > 100 ||
    value.fields.note.length > 200 ||
    !Array.isArray(value.paths) ||
    !value.paths.every(
      (item) =>
        item &&
        typeof item.drawMode === 'boolean' &&
        typeof item.strokeColor === 'string' &&
        Number.isFinite(item.strokeWidth) &&
        item.strokeWidth > 0 &&
        Array.isArray(item.paths) &&
        item.paths.every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)),
    )
  )
    throw new Error('그림 초안을 확인할 수 없어요. 기존 자료는 보관했어요.')
  return value
}

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onerror = () => {
      failed = true
      reject(new Error('그림 초안 저장소를 열지 못했어요.'))
    }
    request.onblocked = () => {
      failed = true
      reject(new Error('다른 화면에서 그림 저장소를 사용 중이에요.'))
    }
    request.onsuccess = () => {
      if (failed) request.result.close()
      else resolve(request.result)
    }
  })

export const readDrawingDraft = async (context: ChatStorageContext) => {
  assertScope(context.scope)
  const database = await openDatabase()
  try {
    assertScope(context.scope)
    const saved = await new Promise<MeetingDrawingDraft | null>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(keyFor(context))
      transaction.oncomplete = () => resolve(request.result ?? null)
      transaction.onabort = () => reject(new Error('그림 초안을 불러오지 못했어요.'))
      transaction.onerror = () => reject(new Error('그림 초안을 불러오지 못했어요.'))
    })
    assertScope(context.scope)
    return saved === null ? null : validateDraft(saved)
  } finally {
    database.close()
  }
}

export class DrawingDraftConflict extends Error {
  constructor() {
    super('그림이 변경됐어요. 작성하던 그림에서 다시 공유 준비해 주세요.')
  }
}

export const assertCurrentDrawing = async (
  context: ChatStorageContext,
  { id, revision }: SharedDrawing,
) => {
  const draft = await readDrawingDraft(context)
  if (!draft?.photo || draft.id !== id || draft.revision !== revision)
    throw new DrawingDraftConflict()
}

const saveDraft = async (
  context: ChatStorageContext,
  patch: DrawingDraftPatch,
  expectedRevision: number | null,
) => {
  assertScope(context.scope)
  const database = await openDatabase()
  try {
    assertScope(context.scope)
    const saved = await new Promise<MeetingDrawingDraft>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.get(keyFor(context))
      let result: MeetingDrawingDraft
      let failure = '그림 초안을 저장하지 못했어요. 현재 화면에서 다시 시도해 주세요.'
      request.onsuccess = () => {
        try {
          assertScope(context.scope)
          const previous: MeetingDrawingDraft | null = request.result
            ? validateDraft(request.result)
            : null
          if ((previous?.revision ?? null) !== expectedRevision)
            throw new Error('다른 화면에서 이 그림이 변경됐어요. 현재 입력 내용을 확인해 주세요.')
          result = validateDraft({
            version: 1,
            id: previous?.id ?? crypto.randomUUID(),
            photo: null,
            paths: [],
            inputType: 'UPLOAD',
            ...previous,
            ...patch,
            fields: { title: '', note: '', ...previous?.fields, ...patch.fields },
            revision: (previous?.revision ?? -1) + 1,
          })
          store.put(result, keyFor(context))
        } catch (error) {
          if (error instanceof DOMException && error.name === 'QuotaExceededError')
            failure = '그림 저장 공간이 부족해요. 입력 내용은 현재 화면에 남아 있어요.'
          else if (error instanceof Error && error.name === 'Error') failure = error.message
          transaction.abort()
        }
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(new Error(failure))
      transaction.onerror = () =>
        reject(
          new Error(
            transaction.error?.name === 'QuotaExceededError'
              ? '그림 저장 공간이 부족해요. 입력 내용은 현재 화면에 남아 있어요.'
              : failure,
          ),
        )
    })
    assertScope(context.scope)
    return saved
  } finally {
    database.close()
  }
}

export const saveDrawingDraft = async (
  context: ChatStorageContext,
  patch: DrawingDraftPatch,
  expectedRevision: number | null,
) => {
  if (!navigator.locks)
    throw new Error('그림을 안전하게 저장할 수 없어요. 다른 브라우저에서 다시 시도해 주세요.')
  const saved = await navigator.locks.request(mockStorageLock, async () => {
    assertScope(context.scope)
    const chat = readMeetingChat(context)
    if (
      !chat ||
      chat.endedAt !== null ||
      chat.phase !== 'DRAWING' ||
      chat.messages.some((message) => message.type === 'DRAWING' && message.participantId === 'me')
    ) {
      throw new Error('이미 공유했거나 그림 그리기 단계가 끝났어요. 원본 그림은 보관돼요.')
    }
    return saveDraft(context, patch, expectedRevision)
  })
  if (patch.methodSelected || Object.hasOwn(patch, 'photo')) {
    const channel = openDrawingDraftChannel(context)
    channel?.postMessage('changed')
    channel?.close()
  }
  return saved
}

export const validateDrawingPhoto = async (photo: Blob) => {
  if (!['image/png', 'image/jpeg'].includes(photo.type) || photo.size > 10 * 1024 * 1024) {
    throw new Error('10MB 이하의 JPG 또는 PNG 그림을 선택해 주세요.')
  }
  if (typeof createImageBitmap === 'function') {
    try {
      const image = await createImageBitmap(photo)
      image.close()
      return
    } catch {
      throw new Error('이미지를 읽을 수 없어요. 다른 JPG 또는 PNG 그림을 선택해 주세요.')
    }
  }
  const url = URL.createObjectURL(photo)
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('이미지를 읽을 수 없어요. 다른 그림을 선택해 주세요.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
