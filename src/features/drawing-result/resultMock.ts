import { exampleDrawing, getReplyText } from '@/features/drawing-conversation/conversationMock'
import type {
  Conversation,
  ConversationDrawing,
} from '@/features/drawing-conversation/conversationMock'

export type DrawingResultSource = {
  drawing: ConversationDrawing
  conversation: Conversation
  activityId?: number
}

export type DrawingResultData = {
  drawing: ConversationDrawing
  messages: Conversation['messages']
  card: {
    todaysStory: string
    whatISaid?: string
    thoughts?: string
  }
}

type SaveOutcome =
  { status: 'saved' | 'already-saved' } | { status: 'daily-limit'; record: MockRecord }

export type MockRecord = { drawingId: number; recordDate: string; title?: string }

type MockReflectionStore = {
  records: MockRecord[]
  completedDrawingIds: number[]
}

const recordsKey = 'moyang:mock-reflection-records'
const recordDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
const skippedReplies = [getReplyText({ type: 'DONT_KNOW' }), getReplyText({ type: 'SKIP' })]

export const createReflectionPreview = (scenario: string | null): MockReflectionStore | null => {
  if (scenario === 'save-success' || scenario === 'save-error') {
    return { records: [], completedDrawingIds: [] }
  }

  if (scenario === 'daily-limit' || scenario === 'replace-error' || scenario === 'already-saved') {
    const drawingId = scenario === 'already-saved' ? exampleDrawing.drawingId : -1
    const title = scenario === 'already-saved' ? exampleDrawing.title : '오전에 남긴 마음'
    return {
      records: [{ drawingId, title, recordDate: recordDate.format(new Date()) }],
      completedDrawingIds: [drawingId],
    }
  }

  return null
}

const readReflections = (): MockReflectionStore => {
  const saved = sessionStorage.getItem(recordsKey)
  const data: MockReflectionStore | MockRecord[] = saved ? JSON.parse(saved) : []
  if (!Array.isArray(data)) return data
  return { records: data, completedDrawingIds: data.map(({ drawingId }) => drawingId) }
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
  { drawing, conversation }: DrawingResultSource,
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
  { drawingId, title }: ConversationDrawing,
  {
    preview,
    fail,
    replaces,
  }: { preview: MockReflectionStore | null; fail: boolean; replaces?: MockRecord },
): Promise<SaveOutcome> => {
  await new Promise((resolve) => window.setTimeout(resolve, 500))
  if (fail) throw new Error('Mock record save failed')

  const { records, completedDrawingIds } = preview ?? readReflections()
  if (completedDrawingIds.includes(drawingId)) return { status: 'already-saved' }

  const today = recordDate.format(new Date())
  const existing = records.find((record) => record.recordDate === today)

  if (existing && (replaces?.recordDate !== today || replaces.drawingId !== existing.drawingId)) {
    return { status: 'daily-limit', record: existing }
  }

  const next = {
    records: [
      ...records.filter((record) => record.recordDate !== today),
      { drawingId, title, recordDate: today },
    ],
    completedDrawingIds: [...completedDrawingIds, drawingId],
  }
  if (preview) Object.assign(preview, next)
  else sessionStorage.setItem(recordsKey, JSON.stringify(next))
  return { status: 'saved' }
}
