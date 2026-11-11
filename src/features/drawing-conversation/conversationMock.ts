export type ConversationDrawing = {
  drawingId: number
  title: string
  imageUrl?: string
  note?: string | null
  concern?: { id: string; label: string }
}

type Message = { role: 'assistant' | 'user' | 'support'; text: string }

export type Conversation = {
  id?: string
  messages: Message[]
  questionIndex: number
  status: 'asking' | 'review' | 'support' | 'ended'
}

export type ConversationAction =
  { type: 'ANSWER'; text: string } | { type: 'DONT_KNOW' | 'SKIP' | 'CONTINUE' | 'END' }

export const readConversation = (key: string): Conversation | null => {
  try {
    const saved = sessionStorage.getItem(key)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export const saveConversation = (key: string, conversation: Conversation | null) => {
  try {
    if (conversation) sessionStorage.setItem(key, JSON.stringify(conversation))
    else sessionStorage.removeItem(key)
  } catch {
    return
  }
}

export const discardConversation = (key: string, id?: string) => {
  const saved = readConversation(key)
  if (saved && saved.id === id) saveConversation(key, null)
}

const exampleImage = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
  <path fill="#f4ecdf" d="M0 0h240v160H0z"/>
  <path fill="#a6bd9e" d="M0 106Q63 44 132 103Q182 134 240 96V160H0z"/>
  <path fill="#e4c7a2" d="M95 160Q137 124 166 114Q136 132 129 160z"/>
  <circle cx="174" cy="48" r="17" fill="#e7b981"/>
</svg>`

export const exampleDrawing: ConversationDrawing = {
  drawingId: 0,
  title: '내가 서 있는 자리',
  imageUrl: `data:image/svg+xml,${encodeURIComponent(exampleImage)}`,
  concern: { id: 'relationships', label: '대인관계' },
}

const questions = [
  '그림을 잘 받았어요! 이 그림에서 가장 먼저 이야기하고 싶은 부분이 있나요?',
  '그림을 그리는 동안 어떤 생각이 들었나요?',
  '그림을 다시 보니 처음과 다르게 느껴지는 부분도 있나요?',
  '이 그림에 조금 더 담고 싶은 이야기가 있나요?',
  '오늘 그림에 담은 마음을 한마디로 표현한다면 어떤 말이 떠오르나요?',
]

const extraQuestions = [
  '아직 이야기하지 않은 부분 중에 더 마음이 가는 곳이 있나요?',
  '나중에 이 그림을 다시 볼 때 어떤 이야기를 기억하고 싶나요?',
]

const reviewMessage =
  '오늘 그림에 담긴 여러 이야기를 나눠봤어요.\n\n이제 오늘의 그림 이야기를 함께 정리해 볼까요?'

export const supportMessage = '지금 마음이 많이 힘들다면, 전문 상담사의 도움을 받을 수 있어요.'

export const getReplyText = (action: ConversationAction) => {
  switch (action.type) {
    case 'ANSWER':
      return action.text
    case 'DONT_KNOW':
      return '답이 잘 안 떠올라요'
    case 'SKIP':
      return '이 질문은 건너뛸래요'
    default:
      return ''
  }
}

const waitForResponse = (delay: number, fail: boolean) =>
  new Promise<void>((resolve, reject) => {
    window.setTimeout(() => {
      if (fail) reject(new Error('Mock request failed'))
      else resolve()
    }, delay)
  })

export const startConversation = async (fail: boolean): Promise<Conversation> => {
  await waitForResponse(900, fail)
  return {
    id: crypto.randomUUID(),
    messages: [{ role: 'assistant', text: questions[0] }],
    questionIndex: 0,
    status: 'asking',
  }
}

export const updateConversation = async (
  conversation: Conversation,
  action: ConversationAction,
  fail: boolean,
  showSupport: boolean,
): Promise<Conversation> => {
  await waitForResponse(500, fail)

  const { questionIndex, messages } = conversation
  if (action.type === 'END') {
    return {
      ...conversation,
      messages:
        conversation.status === 'support'
          ? [...messages, { role: 'support', text: supportMessage }]
          : messages,
      status: 'ended',
    }
  }

  if (action.type === 'CONTINUE') {
    const text = extraQuestions[(questionIndex - questions.length + 1) % extraQuestions.length]
    return {
      ...conversation,
      messages: [...messages, { role: 'assistant', text }],
      questionIndex: questionIndex + 1,
      status: 'asking',
    }
  }

  const reply: Message = { role: 'user', text: getReplyText(action) }
  if (showSupport && action.type === 'ANSWER') {
    return { ...conversation, messages: [...messages, reply], status: 'support' }
  }

  const nextQuestion = questions[questionIndex + 1]
  return {
    ...conversation,
    messages: [...messages, reply, { role: 'assistant', text: nextQuestion ?? reviewMessage }],
    questionIndex: nextQuestion ? questionIndex + 1 : questionIndex,
    status: nextQuestion ? 'asking' : 'review',
  }
}
