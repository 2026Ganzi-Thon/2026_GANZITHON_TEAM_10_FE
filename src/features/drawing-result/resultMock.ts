import {
  findSavedReflection,
  getMockRecordId,
  getReflectionStorageKey,
  hasSavedReflection,
  readReflectionStore,
  withReflectionLock,
} from '@/lib/mock-reflections'
import type {
  MockRecord,
  MockReflectionStore,
  RecordId,
  ReflectionCard,
} from '@/lib/mock-reflections'
import { writeMockStorage } from '@/lib/mock-storage'
import { exampleDrawing, getReplyText } from '@/features/drawing-conversation/conversationMock'
import type {
  Conversation,
  ConversationDrawing,
} from '@/features/drawing-conversation/conversationMock'
import type { ProgramActivityHandoff } from '@/features/personal-program/programMock'
import { getToday } from '@/features/personal-program/programSchedule'
import {
  applyProgramActivityCompletion,
  canCompleteProgramActivity,
  getProgramStorageKey,
  readPrograms,
} from '@/features/personal-program/programMock'

export type DrawingResultSource = {
  drawing: ConversationDrawing
  conversation: Conversation
  recordId?: RecordId
  programActivity?: ProgramActivityHandoff
  conversationStorageKey?: string
}

export type DrawingResultData = {
  recordId: RecordId
  drawing: ConversationDrawing
  messages: Conversation['messages']
  card: ReflectionCard
}

type SaveOutcome =
  | { status: 'saved'; sheepEarned: 0 | 1; record: MockRecord }
  | { status: 'already-saved'; record?: MockRecord }
  | { status: 'progress-pending'; sheepEarned: 0 | 1; record: MockRecord }
  | { status: 'activity-unavailable' }

const skippedReplies = [getReplyText({ type: 'DONT_KNOW' }), getReplyText({ type: 'SKIP' })]

const getActivityKey = ({ programId, round }: ProgramActivityHandoff) => `${programId}:${round}`

const hasCompletedPreviewActivity = ({ programId, round, mock }: ProgramActivityHandoff) =>
  readPrograms(mock).some((program) => program.id === programId && program.completed >= round)

const isActivityRecord = (record: MockRecord, activity: ProgramActivityHandoff) => {
  const key = getActivityKey(activity)
  return record.activityKey === key || record.activityKey?.startsWith(`${key}:`) === true
}

export const getReflectionSaveStatus = (
  store: MockReflectionStore,
  drawingId: number,
  activity?: ProgramActivityHandoff,
  recordId = getMockRecordId(drawingId),
) => {
  if (hasSavedReflection(store, recordId, drawingId)) return 'already-saved'
  if (activity && store.records.some((record) => isActivityRecord(record, activity))) {
    return 'already-saved'
  }

  return 'available'
}

export const createReflectionPreview = (
  scenario: string | null,
  source: DrawingResultSource | null,
): MockReflectionStore | null => {
  if (scenario === 'reward' || scenario === 'save-success' || scenario === 'save-error') {
    return { records: [], completedDrawingIds: [] }
  }

  if (scenario === 'additional-save' || scenario === 'already-saved') {
    const drawingId = scenario === 'already-saved' ? exampleDrawing.drawingId : -1
    return {
      records: [{ drawingId, recordDate: getToday(), sheepReward: 1 }],
      completedDrawingIds: [drawingId],
    }
  }

  const activity = source?.programActivity
  if (import.meta.env.DEV && source && activity?.mock) {
    try {
      const completed = hasCompletedPreviewActivity(activity)
      return { records: [], completedDrawingIds: completed ? [source.drawing.drawingId] : [] }
    } catch {
      return { records: [], completedDrawingIds: [] }
    }
  }

  return null
}

export const exampleResultSource: DrawingResultSource = {
  drawing: { ...exampleDrawing, note: '요즘 서두르지 않고 내 속도로 걷고 싶었어요.' },
  conversation: {
    status: 'ended',
    questionIndex: 6,
    messages: [
      { role: 'assistant', text: '이 그림에서 가장 먼저 이야기하고 싶은 부분이 있나요?' },
      { role: 'user', text: '햇빛이 비치는 길이요. 걷다 보면 마음이 조금 가벼워져요.' },
      { role: 'assistant', text: '그 길은 어떤 곳이라고 생각하면서 그렸나요?' },
      {
        role: 'user',
        text: '집 근처 산책로가 떠올랐어요. 조금 돌아가는 길인데, 그쪽으로 가면 발걸음이 느려져요.',
      },
      { role: 'assistant', text: '그 길을 걸을 때와 평소 하루는 어떤 점이 달라요?' },
      {
        role: 'user',
        text: '평소엔 한 가지를 끝내기도 전에 다음 할 일을 생각해요. 산책할 땐 발밑만 보고 걸을 수 있어서 좋아요.',
      },
      { role: 'assistant', text: '그림 속 길에 잠깐 멈춰 선다면 어디쯤이고 싶나요?' },
      { role: 'user', text: '길이 구부러지는 곳이요. 거기서 햇빛을 좀 쬐고 싶어요.' },
      { role: 'assistant', text: '요즘에도 그렇게 잠깐 멈췄던 때가 있었나요?' },
      {
        role: 'user',
        text: '어제 집에 오다가 벤치에 잠깐 앉았어요. 처음엔 시간이 아깝다고 생각했는데, 앉아 보니 그냥 좋더라고요.',
      },
      { role: 'assistant', text: '오늘도 그때처럼 잠깐 쉬어 간다면 뭘 하고 싶어요?' },
      { role: 'user', text: '따뜻한 차 한 잔 마시고 싶어요. 마시는 동안엔 휴대폰도 내려놓고요.' },
      { role: 'assistant', text: '오늘 그림과 대화에서 어떤 생각을 남기고 싶어요?' },
      { role: 'user', text: '잠깐 멈춰 쉬어도 괜찮겠다는 생각이 들었어요.' },
    ],
  },
}

export const loadDrawingResult = async (
  { drawing, conversation, recordId = getMockRecordId(drawing.drawingId) }: DrawingResultSource,
  fail: boolean,
): Promise<DrawingResultData> => {
  await new Promise((resolve) => window.setTimeout(resolve, 400))
  if (fail) throw new Error('Mock result unavailable')

  const answers = conversation.messages
    .filter(({ role }) => role === 'user')
    .map(({ text }) => text.trim())
    .filter((text) => text && !skippedReplies.includes(text))
  const whatISaid = drawing.note?.trim() || answers[0]
  const thoughts = answers.length > 1 ? answers.slice(1).join('\n\n') : undefined
  const reflection = answers.at(-1) || whatISaid

  return {
    recordId,
    drawing,
    messages: conversation.messages,
    card: {
      todaysStory: reflection
        ? `‘${drawing.title}’에 담긴 이야기를 돌아봤어요.\n\n“${reflection}”`
        : `오늘 남긴 ‘${drawing.title}’을 다시 바라봤어요. 이 그림을 보며 떠오르는 마음은 언제든 천천히 살펴봐도 괜찮아요.`,
      whatISaid,
      thoughts,
    },
  }
}

export const saveDrawingResult = async (
  { drawing: { drawingId, title }, card, recordId = getMockRecordId(drawingId) }: DrawingResultData,
  {
    preview,
    previewWallet,
    fail,
    signal,
    activity,
  }: {
    preview: MockReflectionStore | null
    previewWallet: boolean
    fail: boolean
    signal: AbortSignal
    activity?: ProgramActivityHandoff
  },
): Promise<SaveOutcome> => {
  const accountKey = getReflectionStorageKey(previewWallet)
  const programKey = getProgramStorageKey(activity?.mock)
  const assertAccount = () => {
    if (accountKey !== getReflectionStorageKey(previewWallet))
      throw new Error('로그인 정보가 변경됐어요')
  }
  const readStore = (forWrite = false) => {
    const store = preview ?? readReflectionStore(accountKey, forWrite)
    assertAccount()
    return store
  }
  await new Promise((resolve) => window.setTimeout(resolve, 500))
  signal.throwIfAborted()
  assertAccount()
  if (fail) throw new Error('Mock record save failed')

  if (!activity) {
    const store = readStore()
    if (hasSavedReflection(store, recordId, drawingId)) {
      return { status: 'already-saved', record: findSavedReflection(store, recordId, drawingId) }
    }
  }

  const save = (): SaveOutcome => {
    signal.throwIfAborted()
    if (import.meta.env.DEV && preview && activity?.mock && hasCompletedPreviewActivity(activity)) {
      return { status: 'already-saved' }
    }
    const store = readStore(true)
    const { records, completedDrawingIds } = store
    const today = getToday()
    const existing = activity
      ? records.find((record) => isActivityRecord(record, activity))
      : findSavedReflection(store, recordId, drawingId)

    const applyProgress = (record: MockRecord, sheepEarned: 0 | 1): SaveOutcome | null => {
      if (!activity) return null
      try {
        signal.throwIfAborted()
        assertAccount()
        const completionDate = activity.date === record.recordDate ? record.recordDate : today
        if (
          record.recordDate > activity.date ||
          !applyProgramActivityCompletion(activity, activity.mock, completionDate, programKey)
        )
          return { status: 'activity-unavailable' }
        return null
      } catch {
        return { status: 'progress-pending', record, sheepEarned }
      }
    }

    if (existing) {
      return applyProgress(existing, 0) ?? { status: 'already-saved', record: existing }
    }
    if (hasSavedReflection(store, recordId, drawingId)) {
      return activity ? { status: 'activity-unavailable' } : { status: 'already-saved' }
    }
    if (activity && !canCompleteProgramActivity(activity, activity.mock, programKey)) {
      return { status: 'activity-unavailable' }
    }

    const sheepEarned = records.some((record) => record.recordDate === today) ? 0 : 1
    const record: MockRecord = {
      recordId,
      drawingId,
      recordDate: today,
      ...(sheepEarned === 1 && { sheepReward: 1 as const }),
      title,
      card,
      ...(activity && { activityKey: `${getActivityKey(activity)}:${activity.date}` }),
    }
    const next: MockReflectionStore = {
      ...store,
      records: [...records, record],
      completedDrawingIds: [...new Set([...completedDrawingIds, drawingId])],
    }
    signal.throwIfAborted()
    assertAccount()
    if (preview) Object.assign(preview, next)
    else writeMockStorage(accountKey, next)
    return applyProgress(record, sheepEarned) ?? { status: 'saved', record, sheepEarned }
  }

  return withReflectionLock(signal, save)
}
