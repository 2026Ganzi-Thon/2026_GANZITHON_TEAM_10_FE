const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const startedAt = Date.parse('2026-11-17T10:00:00+09:00')
const drawing = {
  id: 'new-meeting-drawing',
  title: '오늘의 마음',
  description: '비가 그친 하늘이에요.',
  imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
}
const participants = Array.from({ length: 4 }, (_, i) => ({
  id: i === 0 ? 'me' : `peer-${i}`,
  nickname: `양 ${i + 1}`,
  color: i === 0 ? 'purple' : 'white',
  enteredAt: startedAt - i,
}))

function environment() {
  const values = new Map()
  let account = 'moyang:user:a'
  let now = startedAt
  let canParticipate = true
  let failWrites = false
  let failReads = false
  let switchOnRead = false
  let queue = Promise.resolve()
  class Clock extends Date {
    static now() {
      return now
    }
  }
  const context = vm.createContext({
    Date: Clock,
    localStorage: {
      get length() {
        return values.size
      },
      key(index) {
        return [...values.keys()][index] ?? null
      },
      getItem(key) {
        if (failReads) throw new Error('blocked')
        const saved = values.get(key) ?? null
        if (switchOnRead) account = 'moyang:user:b'
        return saved
      },
      setItem(key, saved) {
        if (failWrites) throw new Error('quota')
        values.set(key, saved)
      },
    },
    navigator: {
      locks: {
        request(_key, options, update) {
          const pending = queue.then(() => {
            options.signal.throwIfAborted()
            return update()
          })
          queue = pending.catch(() => {})
          return pending
        },
      },
    },
  })
  const file = path.join(__dirname, '../src/features/meeting-chat/chatMock.ts')
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} }
  vm.runInContext(`(function(exports, require) { ${source}\n })`, context)(module.exports, () => ({
    getMockStorageScope: () => account,
    mockStorageLock: 'moyang:mock-storage',
  }))
  const mock = module.exports
  const contentSource = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/features/meeting-chat/chatContent.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText
  const contentModule = { exports: {} }
  vm.runInContext(`(function(exports, require) { ${contentSource}\n })`, context)(
    contentModule.exports,
    require,
  )
  const historySource = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/features/meeting-chat/chatHistory.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText
  const timingSource = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/features/meeting-chat/chatTiming.ts'), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
  ).outputText
  const timingModule = { exports: {} }
  vm.runInContext(`(function(exports) { ${timingSource}\n })`, context)(timingModule.exports)
  const historyModule = { exports: {} }
  vm.runInContext(`(function(exports, require) { ${historySource}\n })`, context)(
    historyModule.exports,
    (name) => {
      if (name === './chatMock') return mock
      if (name === '@/lib/mock-storage') return { getMockStorageScope: () => account }
      return {
        getMockMeetingFixture: (id) =>
          ['106', '205'].includes(id)
            ? { id, title: `모임 ${id}`, concern: 'SELF_HEALTH' }
            : undefined,
      }
    },
  )
  const storage = { scope: account, meetingId: '106' }
  return {
    mock,
    maskText: contentModule.exports.maskMeetingText,
    timing: timingModule.exports,
    applyHistory: historyModule.exports.applyMeetingChatHistory,
    values,
    storage,
    start(initial = {}, target = storage) {
      return mock.initializeMeetingChat(
        target,
        { participants, moderatorId: 'me', topic: '내 마음의 날씨', ...initial },
        () => canParticipate,
        new AbortController().signal,
      )
    },
    update(command, options = {}) {
      return mock.updateMeetingChat(
        options.storage ?? storage,
        command,
        options.canParticipate ?? (() => canParticipate),
        options.signal ?? new AbortController().signal,
      )
    },
    read(target = storage) {
      return mock.readMeetingChat(target, now)
    },
    raw() {
      return JSON.parse(values.get([...values.keys()][0]))
    },
    corrupt(change) {
      const key = [...values.keys()][0]
      values.set(key, JSON.stringify(change(JSON.parse(values.get(key)))))
    },
    account(value) {
      account = value
    },
    time(value) {
      now = value
    },
    access(value) {
      canParticipate = value
    },
    blockWrites(value) {
      failWrites = value
    },
    blockReads(value) {
      failReads = value
    },
    switchOnRead() {
      switchOnRead = true
    },
    disableLocks() {
      context.navigator.locks = undefined
    },
  }
}

const send = (id, content = '안녕하세요', participantId = 'me') => ({
  type: 'send',
  requestId: id,
  content,
  participantId,
})
const share = (participantId = 'me', id = participantId) => ({
  type: 'share',
  requestId: id,
  participantId,
  drawing: { ...drawing, id },
})
const advance = (from = 'INTRO', participantId = 'me') => ({
  type: 'advance',
  from,
  participantId,
})

test('Korean profanity masks matching fragments and preserves ordinary text and line breaks', () => {
  const env = environment()
  assert.equal(
    env.maskText('오늘은 씨발 너무 힘들었어요.\n개새끼라는 말을 들었어요.'),
    '오늘은 ** 너무 힘들었어요.\n***라는 말을 들었어요.',
  )
  assert.equal(
    env.maskText('그림 속 아기 양이 산책해요.\n별표 **와 공백은 그대로'),
    '그림 속 아기 양이 산책해요.\n별표 **와 공백은 그대로',
  )
  assert.equal(env.maskText('씨발 씨발'), '** **')
})

test('the Korean dictionary covers additional profanity without censoring ordinary or support words', () => {
  const env = environment()
  assert.equal(env.maskText('ㅅㅂ ㅆㅂ 개자식 지랄'), '** ** *** **')
  const ordinary = '시발점과 시바견, 아기 양의 이야기\n자살·자해 생각에 도움을 받고 싶어요.'
  assert.equal(env.maskText(ordinary), ordinary)
  assert.equal(env.maskText('  씨발!\t개새끼라는 말\n\n병신  '), '  **!\t***라는 말\n\n**  ')
  assert.equal(env.maskText(''), '')
})

test('common separators and invisible characters do not bypass Korean profanity display masking', () => {
  const env = environment()
  assert.equal(env.maskText('씨.발 시-발 개_새끼 ㅅ\u200Bㅂ'), '*.* *-* *_** *\u200B*')
  const ordinary = '처음 시작한 그림의 시발점이에요.\n두 줄  공백과 🎨 그림은 그대로예요.'
  assert.equal(env.maskText(ordinary), ordinary)
})

test('display masking does not change the original message or break request retries', async () => {
  const env = environment()
  await env.start()
  const content = '씨발 너무 힘들었어요.'
  await env.update(send('masked-message', content))
  const original = [...env.values.values()][0]
  const stored = env.read().messages.at(-1).content
  assert.equal(stored, content)
  assert.equal(env.maskText(stored), '** 너무 힘들었어요.')
  assert.equal([...env.values.values()][0], original)
  await env.update(send('masked-message', content))
  assert.equal(env.read().messages.filter((message) => message.type === 'TEXT').length, 1)
  await assert.rejects(env.update(send('masked-message', '다른 메시지')))
})

test('ended room summaries preserve different meetings on the same day', async () => {
  const env = environment()
  const other = { ...env.storage, meetingId: '205' }
  await env.start()
  await env.start({}, other)
  for (const participant of participants) {
    await env.update({ type: 'agree-end', participantId: participant.id })
    await env.update({ type: 'agree-end', participantId: participant.id }, { storage: other })
  }
  const summaries = env.mock.readEndedMeetingChats(env.storage.scope)
  assert.deepEqual(Array.from(summaries, ({ meetingId }) => meetingId).sort(), ['106', '205'])
  assert.equal('messages' in summaries[0], false)
  assert.equal(env.values.size, 2)
})

test('past meeting summaries exclude other accounts and preview scenarios', async () => {
  const env = environment()
  await env.start()
  for (const participant of participants)
    await env.update({ type: 'agree-end', participantId: participant.id })
  const preview = { ...env.storage, scenario: 'chat-ended' }
  await env.start({}, preview)
  for (const participant of participants)
    await env.update({ type: 'agree-end', participantId: participant.id }, { storage: preview })
  assert.equal(env.mock.readEndedMeetingChats(env.storage.scope).length, 1)
  env.account('moyang:user:b')
  assert.equal(env.mock.readEndedMeetingChats('moyang:user:b').length, 0)
  assert.equal(env.values.size, 2)
})

test('expired conversations keep past meeting summaries and original drawings', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  await env.update(share())
  for (const participant of participants)
    await env.update({ type: 'agree-end', participantId: participant.id })
  env.time(startedAt + env.mock.chatHistoryDuration)
  assert.throws(() => env.read(), /열람 기간/)
  const summaries = env.mock.readEndedMeetingChats(env.storage.scope)
  assert.equal(summaries.length, 1)
  assert.equal(summaries[0].hasDrawing, true)
  assert.equal(summaries[0].ownNickname, participants.find(({ id }) => id === 'me').nickname)
  assert.equal('messages' in summaries[0], false)
  assert.equal(env.mock.readOwnMeetingDrawing(env.storage).id, 'me')
})

test('participant colors remain the values received from the started room', async () => {
  const env = environment()
  const initial = participants.map((participant, index) => ({
    ...participant,
    color: ['green', 'pink', 'blue', 'white'][index],
  }))
  await env.start({ participants: initial })
  await env.update(send('hello'))
  await env.start()
  assert.deepEqual(
    Array.from(env.read().participants, ({ color }) => color),
    ['green', 'pink', 'blue', 'white'],
  )
})

test('a partial end agreement stays active and unanimous agreement moves only that room to history', async () => {
  const env = environment()
  await env.start()
  const data = {
    meetings: [{ id: '106' }, { id: '205' }],
    myMeetings: [{ id: '106' }, { id: '205' }],
    pastMeetings: [{ id: '301', startAt: startedAt - 2000, endAt: startedAt - 1000 }],
  }
  await env.update({ type: 'agree-end', participantId: 'me' })
  assert.equal(env.applyHistory(data).meetings.length, 2)
  for (const participant of participants.slice(1))
    await env.update({ type: 'agree-end', participantId: participant.id })
  const result = env.applyHistory(data)
  assert.deepEqual(
    Array.from(result.meetings, ({ id }) => id),
    ['205'],
  )
  assert.deepEqual(
    Array.from(result.myMeetings, ({ id }) => id),
    ['205'],
  )
  assert.deepEqual(
    Array.from(result.pastMeetings, ({ id }) => id),
    ['106', '301'],
  )
  assert.equal(result.pastMeetings[0].hasChatHistory, true)
  assert.equal(result.pastMeetings[0].hasDrawing, false)
  assert.equal(env.applyHistory(result).pastMeetings.length, 2)
  assert.equal(data.meetings.length, 2)
})

test('corrupt history is preserved and a changed account cannot receive the previous summaries', async () => {
  const env = environment()
  await env.start()
  env.corrupt((chat) => ({ ...chat, endedAt: startedAt }))
  const original = [...env.values.values()][0]
  assert.equal(env.mock.readEndedMeetingChats(env.storage.scope).length, 0)
  assert.throws(() => env.read(), /원본은 보관/)
  assert.equal([...env.values.values()][0], original)
  env.account('moyang:user:b')
  assert.equal(env.mock.readEndedMeetingChats('moyang:user:b').length, 0)
})

test('corrupt chat records do not hide healthy ended rooms or overwrite their originals', async () => {
  const env = environment()
  await env.start()
  for (const participant of participants)
    await env.update({ type: 'agree-end', participantId: participant.id })
  const original = [...env.values.entries()][0]
  const broken = 'moyang:meeting-chat:' + JSON.stringify([env.storage.scope, '205', null])
  for (const invalid of [
    '{broken',
    JSON.stringify({ ...env.raw(), meetingId: '205', endAgreedIds: [] }),
  ]) {
    env.values.set(broken, invalid)
    assert.deepEqual(
      Array.from(env.mock.readEndedMeetingChats(env.storage.scope), (chat) => chat.meetingId),
      ['106'],
    )
    assert.equal(env.values.get(broken), invalid)
    assert.equal(env.values.get(original[0]), original[1])
    assert.throws(() => env.read({ ...env.storage, meetingId: '205' }), /원본은 보관/)
  }
  env.blockReads(true)
  assert.throws(() => env.mock.readEndedMeetingChats(env.storage.scope), /blocked/)
  env.blockReads(false)
  env.switchOnRead()
  assert.throws(() => env.mock.readEndedMeetingChats(env.storage.scope), /로그인 정보/)
})

test('initialization is idempotent and freezes actual participants and progress authority', async () => {
  const env = environment()
  await Promise.all(Array.from({ length: 5 }, () => env.start()))
  await env.start({ participants: participants.slice(0, 2), moderatorId: 'peer-1' })
  assert.equal(env.values.size, 1)
  assert.equal(env.read().messages.length, 1)
  assert.equal(env.read().participants.length, 4)
  assert.equal(env.read().moderatorId, 'me')
})

test('an unadmitted user or invalid actual participant list cannot initialize a chat', async () => {
  const env = environment()
  env.access(false)
  await assert.rejects(env.start())
  env.access(true)
  await assert.rejects(env.start({ participants: participants.slice(1) }))
  await assert.rejects(env.start({ participants: participants.slice(0, 1) }))
  assert.equal(env.values.size, 0)
})

test('empty, oversized and nonparticipant messages leave existing history intact', async () => {
  const env = environment()
  await env.start()
  await env.update(send('one'))
  const original = [...env.values.values()][0]
  for (const command of [
    send('two', '  '),
    send('three', 'a'.repeat(501)),
    send('four', 'hi', 'stranger'),
  ]) {
    await assert.rejects(env.update(command))
    assert.equal([...env.values.values()][0], original)
  }
})

test('concurrent sends and retrying one request do not erase history or duplicate messages', async () => {
  const env = environment()
  await env.start()
  await Promise.all(Array.from({ length: 12 }, (_, i) => env.update(send(`message-${i}`))))
  await Promise.all(Array.from({ length: 8 }, () => env.update(send('same-request'))))
  assert.equal(env.read().messages.filter((message) => message.type === 'TEXT').length, 13)
  assert.equal(new Set(env.read().messages.map((message) => message.messageId)).size, 14)
})

test('two tabs cannot send the same saved draft twice', async () => {
  const env = environment()
  await env.start()
  const text = '두 탭에 열린 초안'
  await env.update({ type: 'draft-text', text, previousText: '' })
  const first = { ...send('first', text), expectedDraft: text }
  const second = { ...send('second', text), expectedDraft: text }
  const results = await Promise.allSettled([env.update(first), env.update(second)])
  assert.deepEqual(
    results.map(({ status }) => status),
    ['fulfilled', 'rejected'],
  )
  assert.ok(results[1].reason instanceof env.mock.ChatDraftConflict)
  await env.update(first)
  assert.equal(env.raw().messages.filter(({ type }) => type === 'TEXT').length, 1)
  assert.equal(env.read().draft.text, '')

  await env.update({ type: 'draft-text', text: '다른 탭에서 쓴 메시지', previousText: '' })
  await assert.rejects(env.update(second), env.mock.ChatDraftConflict)
  assert.equal(env.read().draft.text, '다른 탭에서 쓴 메시지')
})

test('only the designated moderator can advance and concurrent clicks cannot skip a phase', async () => {
  const env = environment()
  await env.start({ moderatorId: 'peer-1' })
  await assert.rejects(env.update(advance()))
  await Promise.all(Array.from({ length: 5 }, () => env.update(advance('INTRO', 'peer-1'))))
  assert.equal(env.read().phase, 'DRAWING')
  await assert.rejects(env.update(advance('DRAWING', 'peer-1')))
})

test('all actual participants must explicitly share before advancing, independently of capacity', async () => {
  const env = environment()
  await env.start({ participants: participants.slice(0, 2) })
  await env.update(advance())
  await env.update(share())
  assert.equal(env.read().phase, 'DRAWING')
  await env.update(share('peer-1'))
  assert.equal(env.read().phase, 'SHARING')
  await env.update(share('peer-1'))
  assert.equal(env.read().messages.filter((message) => message.type === 'DRAWING').length, 2)
  await env.update(advance('SHARING'))
  assert.equal(env.read().phase, 'CLOSING')
  await assert.rejects(env.update(advance('CLOSING')))
})

test('six actual participants need six drawings and six distinct end agreements', async () => {
  const env = environment()
  const six = [
    ...participants,
    { id: 'peer-4', nickname: '양 5', color: 'green', enteredAt: startedAt - 4 },
    { id: 'peer-5', nickname: '양 6', color: 'blue', enteredAt: startedAt - 5 },
  ]
  await env.start({ participants: six })
  await env.update(advance())
  for (const participant of six.slice(0, 5)) await env.update(share(participant.id))
  assert.equal(env.read().phase, 'DRAWING')
  await env.update(share(six[5].id))
  assert.equal(env.read().phase, 'SHARING')
  for (const participant of six.slice(0, 5))
    await env.update({ type: 'agree-end', participantId: participant.id })
  assert.equal(env.read().endedAt, null)
  await env.update({ type: 'agree-end', participantId: six[5].id })
  assert.equal(env.read().endAgreedIds.length, 6)
  assert.equal(env.read().endedAt, startedAt)
})

test('an unshared draft stays private and survives a failed share', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  await env.update({
    type: 'draft',
    previousText: '',
    previousDrawingId: null,
    text: '쓰던 메시지',
    drawing,
  })
  assert.equal(
    env.read().messages.some((message) => message.type === 'DRAWING'),
    false,
  )
  env.blockWrites(true)
  await assert.rejects(env.update(share()))
  env.blockWrites(false)
  assert.equal(env.read().draft.drawing.title, drawing.title)
  assert.equal(env.read().draft.text, '쓰던 메시지')
  assert.equal(
    env.read().messages.some((message) => message.type === 'DRAWING'),
    false,
  )
})

test('a message response only clears the matching draft and cannot erase newer text', async () => {
  const env = environment()
  await env.start()
  await env.update({
    type: 'draft',
    previousText: '',
    previousDrawingId: null,
    text: '새로 쓰는 내용',
    drawing: null,
  })
  await env.update(send('old-response', '먼저 보낸 내용'))
  assert.equal(env.read().draft.text, '새로 쓰는 내용')
  await assert.rejects(
    env.update({
      type: 'draft',
      previousText: '',
      previousDrawingId: null,
      text: '오래된 탭',
      drawing: null,
    }),
  )
  assert.equal(env.read().draft.text, '새로 쓰는 내용')
})

test('retrying a text draft preserves the drawing prepared on another tab', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  await env.update({
    type: 'draft',
    text: '다른 화면의 메시지',
    previousText: '',
    previousDrawingId: null,
    drawing,
  })
  const edit = { type: 'draft-text', text: '현재 화면의 메시지', previousText: '' }
  await assert.rejects(env.update(edit), env.mock.ChatDraftConflict)
  await env.update({ ...edit, previousText: env.read().draft.text })
  assert.equal(env.read().draft.text, edit.text)
  assert.equal(env.read().draft.drawing.id, drawing.id)
})

test('a later profile nickname changes only the current participant name', async () => {
  const env = environment()
  await env.start()
  await env.update(send('hello'))
  const before = env.raw()
  await env.update({ type: 'rename-self', nickname: '계정 이름' })
  const after = env.raw()
  assert.deepEqual(after, {
    ...before,
    participants: before.participants.map((participant) =>
      participant.id === 'me' ? { ...participant, nickname: '계정 이름' } : participant,
    ),
  })
})

test('three of four votes do not end the room; each participant counts only once', async () => {
  const env = environment()
  await env.start()
  await Promise.all(
    Array.from({ length: 5 }, () => env.update({ type: 'agree-end', participantId: 'me' })),
  )
  await env.update({ type: 'agree-end', participantId: 'peer-1' })
  await env.update({ type: 'agree-end', participantId: 'peer-2' })
  assert.equal(env.read().endedAt, null)
  assert.equal(env.read().endAgreedIds.length, 3)
  const request = env.read().messages.find((message) => message.event === 'END_REQUESTED')
  assert.equal('participantId' in request, false)
  await env.update({ type: 'agree-end', participantId: 'peer-3' })
  assert.equal(env.read().endedAt, startedAt)
  await env.update({ type: 'agree-end', participantId: 'peer-3' })
  assert.equal(env.read().messages.filter((message) => message.event === 'ENDED').length, 1)
})

test('navigation and reconnect reads preserve votes and do not shrink the voter count', async () => {
  const env = environment()
  await env.start()
  await env.update(send('before-leaving'))
  await env.update({ type: 'agree-end', participantId: 'me' })
  const original = [...env.values.values()][0]
  await env.start({ participants: participants.slice(0, 2) })
  assert.equal([...env.values.values()][0], original)
  assert.equal(env.read().participants.length, 4)
  assert.equal(env.read().endAgreedIds.length, 1)
})

test('ending blocks new messages, drawing shares and phase changes while retaining history', async () => {
  const env = environment()
  await env.start({ participants: participants.slice(0, 2) })
  await env.update(send('saved'))
  for (const participant of participants.slice(0, 2))
    await env.update({ type: 'agree-end', participantId: participant.id })
  await assert.rejects(env.update(send('after-end')))
  await assert.rejects(env.update(share()))
  await assert.rejects(env.update(advance()))
  assert.equal(
    env
      .read()
      .messages.some((message) => message.type === 'TEXT' && message.content === '안녕하세요'),
    true,
  )
})

test('24-hour expiry blocks conversation access but preserves my drawing', async () => {
  const env = environment()
  await env.start({ participants: participants.slice(0, 2) })
  await env.update(advance())
  await env.update(share())
  for (const participant of participants.slice(0, 2))
    await env.update({ type: 'agree-end', participantId: participant.id })
  env.time(startedAt + env.mock.chatHistoryDuration - 1)
  assert.ok(env.read())
  env.time(startedAt + env.mock.chatHistoryDuration)
  assert.throws(() => env.read())
  assert.equal(env.mock.readOwnMeetingDrawing(env.storage).title, drawing.title)
})

test('account changes while queued or immediately after a read cannot write another account', async () => {
  const env = environment()
  await env.start()
  const original = [...env.values.values()][0]
  const pending = env.update(send('queued'))
  env.account('moyang:user:b')
  await assert.rejects(pending)
  env.account('moyang:user:a')
  env.switchOnRead()
  await assert.rejects(env.update(send('during-read')))
  assert.equal(env.values.size, 1)
  assert.equal([...env.values.values()][0], original)
})

test('room IDs, scenarios and accounts have independent histories and drafts', async () => {
  const env = environment()
  await env.start()
  await env.update(send('one', '처음 모임'))
  for (const target of [
    { ...env.storage, meetingId: '205' },
    { ...env.storage, scenario: 'send-error' },
    { ...env.storage, scope: 'moyang:user:b' },
  ]) {
    env.account(target.scope)
    await env.start({}, target)
    assert.equal(env.read(target).messages.length, 1)
  }
  env.account(env.storage.scope)
  assert.equal(env.read().messages.length, 2)
  assert.equal(env.values.size, 4)
})

test('blocked reads, quota errors, aborted work and missing locks preserve stored data', async () => {
  const env = environment()
  await env.start()
  const original = [...env.values.values()][0]
  env.blockReads(true)
  await assert.rejects(env.update(send('blocked')))
  env.blockReads(false)
  env.blockWrites(true)
  await assert.rejects(env.update(send('quota')))
  env.blockWrites(false)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(env.update(send('aborted'), { signal: controller.signal }))
  env.disableLocks()
  await assert.rejects(env.update(send('unsafe')))
  assert.equal([...env.values.values()][0], original)
})

test('an existing chat can be opened when write locks are unavailable', async () => {
  const env = environment()
  await env.start()
  await env.update(send('saved'))
  const original = [...env.values.values()][0]
  env.disableLocks()
  assert.equal((await env.start()).messages.length, 2)
  await assert.rejects(env.start({}, { ...env.storage, meetingId: '205' }))
  env.access(false)
  await assert.rejects(env.start())
  assert.deepEqual([...env.values.values()], [original])
})

for (const [name, corrupt] of [
  ['unknown phase', (chat) => ({ ...chat, phase: 'unknown' })],
  [
    'duplicate participant',
    (chat) => ({ ...chat, participants: [...chat.participants, chat.participants[0]] }),
  ],
  ['invalid timestamp', (chat) => ({ ...chat, endedAt: 1e100 })],
  ['nonparticipant vote', (chat) => ({ ...chat, endAgreedIds: ['stranger'] })],
  ['invalid draft', (chat) => ({ ...chat, draft: { text: 123, drawing: null } })],
  ['unsubmitted sharing phase', (chat) => ({ ...chat, phase: 'SHARING' })],
]) {
  test(`preserves the original when rejecting ${name}`, async () => {
    const env = environment()
    await env.start()
    env.corrupt(corrupt)
    const original = [...env.values.values()][0]
    assert.throws(() => env.read())
    await assert.rejects(env.start())
    assert.equal([...env.values.values()][0], original)
  })
}

test('reusing a request ID with different content is rejected instead of losing the new message', async () => {
  const env = environment()
  await env.start()
  await env.update(send('same', '첫 메시지'))
  await assert.rejects(env.update(send('same', '다른 메시지')))
  assert.equal(env.read().messages.length, 2)
})

test('a stale tab cannot erase a newer private drawing when its text is unchanged', async () => {
  const env = environment()
  await env.start()
  await env.update({ type: 'draft', previousText: '', previousDrawingId: null, text: '', drawing })
  await assert.rejects(
    env.update({
      type: 'draft',
      previousText: '',
      previousDrawingId: null,
      text: '',
      drawing: null,
    }),
  )
  assert.equal(env.read().draft.drawing.id, drawing.id)
})

test('a share response preserves drawing details edited after the request began', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  const newerDrawing = { ...drawing, description: '새로 다듬은 설명' }
  await env.update({
    type: 'draft',
    previousText: '',
    previousDrawingId: null,
    text: '',
    drawing: newerDrawing,
  })
  await env.update({ type: 'share', participantId: 'me', requestId: 'share', drawing })
  assert.equal(env.read().draft.drawing.description, newerDrawing.description)
})

test('future entrants cannot be included in the starting participant snapshot', async () => {
  const env = environment()
  await assert.rejects(
    env.start({
      participants: [participants[0], { ...participants[1], enteredAt: startedAt + 1 }],
    }),
  )
  assert.equal(env.values.size, 0)
})

test('own picture metadata references the room draft without duplicating the image in chat storage', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  const stored = { ...drawing, id: 'room-draft-id', imageUrl: 'meeting-draft:room-draft-id' }
  await env.update({ type: 'share', requestId: 'reference', participantId: 'me', drawing: stored })
  assert.equal(env.mock.readOwnMeetingDrawing(env.storage).imageUrl, stored.imageUrl)
  assert.equal([...env.values.values()][0].includes('base64'), false)
})

test('retrying a shared drawing with a different revision is rejected', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  const command = { ...share(), drawing: { ...drawing, revision: 1 } }
  await env.update(command)
  await env.update(command)
  await assert.rejects(env.update({ ...command, drawing: { ...command.drawing, revision: 2 } }))
  const shared = env.read().messages.filter((message) => message.type === 'DRAWING')
  assert.equal(shared.length, 1)
  assert.equal(shared[0].drawing.revision, 1)
})

for (const revision of [-1, 1.5, '1', null]) {
  test(`an invalid drawing revision ${JSON.stringify(revision)} leaves the original intact`, async () => {
    const env = environment()
    await env.start()
    await env.update(advance())
    const original = [...env.values.values()][0]
    await assert.rejects(env.update({ ...share(), drawing: { ...drawing, revision } }))
    assert.equal([...env.values.values()][0], original)
  })
}

test('checking a drawing holds the write lock until the check completes', async () => {
  const env = environment()
  await env.start()
  let release
  const checking = new Promise((resolve) => {
    release = resolve
  })
  const pending = env.update(send('first'), { canParticipate: () => checking })
  const next = env.update(send('second'))
  await Promise.resolve()
  assert.equal(env.read().messages.length, 1)
  release(false)
  await assert.rejects(pending)
  await next
  const sent = env.read().messages.filter((message) => message.type === 'TEXT')
  assert.deepEqual(
    Array.from(sent, (message) => message.requestId),
    ['second'],
  )
})

for (const change of ['abort', 'account']) {
  test(`${change} during a drawing check prevents the pending write`, async () => {
    const env = environment()
    await env.start()
    const original = [...env.values.values()][0]
    const controller = new AbortController()
    let release
    const checking = new Promise((resolve) => {
      release = resolve
    })
    const pending = env.update(send('pending'), {
      signal: controller.signal,
      canParticipate: () => checking,
    })
    await Promise.resolve()
    if (change === 'abort') controller.abort()
    else env.account('moyang:user:b')
    release(true)
    await assert.rejects(pending)
    assert.equal(env.values.size, 1)
    assert.equal([...env.values.values()][0], original)
  })
}

test('legacy sample images use the bundled drawing while user images keep their contents', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  const preview = share('peer-1', 'peer-drawing:peer-1')
  await env.update(preview)
  assert.equal(env.raw().messages[2].drawing.imageUrl, drawing.imageUrl)

  const reference = env.mock.meetingSampleImage
  assert.equal(env.read().messages[2].drawing.imageUrl, reference)
  await env.update({ ...preview, drawing: { ...preview.drawing, imageUrl: reference } })
  await env.update(share('me'))

  const images = env.raw().messages.filter((message) => message.type === 'DRAWING')
  assert.equal(images.length, 2)
  assert.equal(images[0].drawing.imageUrl, reference)
  assert.equal(images[1].drawing.imageUrl, drawing.imageUrl)
})

test('a picture reference cannot point to a different draft ID', async () => {
  const env = environment()
  await env.start()
  await env.update(advance())
  await assert.rejects(
    env.update({
      type: 'share',
      requestId: 'reference',
      participantId: 'me',
      drawing: { ...drawing, imageUrl: 'meeting-draft:other-room-draft' },
    }),
  )
  assert.equal(
    env.read().messages.some((message) => message.type === 'DRAWING'),
    false,
  )
})

test('returning to a drawing keeps the original deadline and never advances without all pictures', async () => {
  const env = environment()
  await env.start()
  assert.equal(env.timing.getDrawingStartedAt(env.read()), null)
  await env.update(advance())
  const deadline = env.timing.getDrawingStartedAt(env.read()) + env.timing.drawingDuration
  env.time(deadline + env.timing.drawingGraceDuration + 1000)
  await env.update({
    type: 'draft',
    text: '마무리 중이에요',
    drawing: null,
    previousText: '',
    previousDrawingId: null,
  })
  const resumed = await env.start()
  assert.equal(env.timing.getDrawingStartedAt(resumed) + env.timing.drawingDuration, deadline)
  assert.equal(resumed.phase, 'DRAWING')
  assert.equal(resumed.draft.text, '마무리 중이에요')
  await assert.rejects(env.update(advance('DRAWING')))
  assert.equal(env.timing.formatRemainingTime(-1000), '00:00')
  assert.equal(env.timing.formatRemainingTime(24 * 60 * 60 * 1000, true), '24:00:00')
})
