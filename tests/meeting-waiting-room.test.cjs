const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const openedAt = Date.parse('2026-11-16T09:00:00Z')
const live = {
  id: '101',
  title: '지금 내 마음의 날씨는?',
  kind: 'live',
  participants: 1,
  capacity: 4,
  status: 'waiting',
}
const scheduled = {
  ...live,
  id: '202',
  kind: 'scheduled',
  startAt: openedAt + 5 * 60_000,
  membership: 'participant',
}

function environment() {
  const values = new Map()
  let now = openedAt
  let scope = 'moyang:user:a'
  let writeError = false
  let queue = Promise.resolve()
  class Clock extends Date {
    static now() {
      return now
    }
  }
  const context = vm.createContext({
    Date: Clock,
    window: { setTimeout: (fn) => setTimeout(fn, 1), clearTimeout },
    navigator: {
      locks: {
        request(_key, options, update) {
          const task = queue.then(() => {
            options.signal.throwIfAborted()
            return update()
          })
          queue = task.catch(() => {})
          return task
        },
      },
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (writeError) throw new Error('quota')
        values.set(key, value)
      },
    },
  })
  const file = path.join(__dirname, '../src/features/meeting-waiting-room/waitingRoomMock.ts')
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} }
  vm.runInContext(`(function(exports, require) { ${source}\n })`, context)(module.exports, () => ({
    getMockStorageScope: () => scope,
  }))
  const mock = module.exports
  return {
    mock,
    values,
    read(meeting = live, scenario = null, profileNickname) {
      return mock.readWaitingRoom(meeting, scope, scenario, now, openedAt, profileNickname)
    },
    update(action, meeting = live, options = {}) {
      return mock.updateWaitingRoom({
        loadMeeting: () => meeting,
        scope,
        scenario: null,
        openedAt,
        expectedBookingId: meeting.bookingId,
        action,
        signal: new AbortController().signal,
        ...options,
      })
    },
    time(value) {
      now = value
    },
    account(value) {
      scope = value
    },
    failWrites(value) {
      writeError = value
    },
    disableLocks() {
      context.navigator.locks = undefined
    },
  }
}

test('live entry is idempotent and keeps nickname across a second read', async () => {
  const env = environment()
  await Promise.all(Array.from({ length: 10 }, () => env.update('join')))
  assert.equal(env.values.size, 1)
  assert.equal(env.read().participants.length, 2)
  await env.update('rename', live, { nickname: '  산책하는 양  ' })
  assert.equal(env.read().nickname, '산책하는 양')
  assert.equal(env.read().participants.find(({ id }) => id === 'me').nickname, '산책하는 양')
})

test('only an admitted live host with at least two actual participants can start', async () => {
  const env = environment()
  const host = { ...live, membership: 'host', participants: 0 }
  await env.update('join', host)
  assert.equal(env.read(host).canStart, false)
  await assert.rejects(env.update('start', host))
  await assert.rejects(env.update('start', live))
  const withPeer = { ...host, participants: 1 }
  await Promise.all(Array.from({ length: 5 }, () => env.update('start', withPeer)))
  assert.equal(env.read(withPeer).phase, 'IN_PROGRESS')
  await assert.rejects(env.update('leave', withPeer))
})

test('live departure and host deletion persist without marking the room started', async () => {
  const env = environment()
  await env.update('join')
  await env.update('leave')
  assert.equal(env.read().entered, false)
  assert.equal(env.read().phase, 'OPEN')
  const host = { ...live, membership: 'host' }
  await env.update('join', host)
  await env.update('leave', host)
  assert.equal(env.read(host).phase, 'CANCELED')
  await assert.rejects(env.update('join', host))
})

for (const [offset, permitted] of [
  [-300001, false],
  [-300000, true],
  [119999, true],
  [120000, false],
]) {
  test(`scheduled admission at ${offset}ms relative to the start`, async () => {
    const env = environment()
    env.time(scheduled.startAt + offset)
    assert.equal(env.read(scheduled).canJoin, permitted)
    if (permitted) await env.update('join', scheduled)
    else await assert.rejects(env.update('join', scheduled))
  })
}

test('a reservation alone is not an actual attendee and nonmembers cannot enter', async () => {
  const env = environment()
  assert.equal(env.read(scheduled).participants.length, 0)
  const noBooking = { ...scheduled, membership: undefined }
  await assert.rejects(env.update('join', noBooking))
  assert.equal(env.values.size, 0)
})

test('a reserved room without visits keeps the same state in detail and waiting at the grace deadline', () => {
  const env = environment()
  const deadline = scheduled.startAt + 120_000
  env.time(deadline - 1)
  assert.equal(env.mock.applyWaitingRoomStatus(scheduled, deadline - 1).status, 'waiting')
  assert.equal(env.read(scheduled).phase, 'OPEN')
  env.time(deadline)
  assert.equal(env.mock.applyWaitingRoomStatus(scheduled, deadline).status, 'cancelled')
  assert.equal(env.read(scheduled).phase, 'CANCELED')
  assert.equal(env.values.size, 0)
})

test('rebooking for the same start never inherits a previous admission or a delayed room action', async () => {
  const env = environment()
  const first = { ...scheduled, bookingId: 'first' }
  const next = { ...scheduled, bookingId: 'next' }
  await env.update('join', first)
  assert.equal(env.read(first).entered, true)
  assert.equal(env.read(next).entered, false)
  assert.equal(env.mock.applyWaitingRoomStatus(next, openedAt).hasEntered, false)
  const original = [...env.values.values()][0]
  await assert.rejects(env.update('join', first, { loadMeeting: () => next }), /예약이 변경/)
  assert.equal([...env.values.values()][0], original)
  await env.update('join', next)
  assert.equal(env.read(next).entered, true)
})

test('the profile name is the initial nickname and a room nickname edit takes precedence', async () => {
  const env = environment()
  await env.update('join', live)
  assert.equal(
    env.read(live, null, ' 첫 계정 ').participants.find(({ id }) => id === 'me').nickname,
    '첫 계정',
  )
  await env.update('rename', live, { nickname: '이 방에서 쓸 이름' })
  assert.equal(env.read(live, null, '업데이트한 이름').nickname, '이 방에서 쓸 이름')
  env.account('moyang:user:b')
  await env.update('join', live)
  assert.equal(env.read(live, null, '두 번째 계정').nickname, '두 번째 계정')
})

test('legacy default names fall back to the profile while explicit room names survive', async () => {
  const env = environment()
  await env.update('join', live)
  const key = [...env.values.keys()][0]
  const record = JSON.parse(env.values.get(key))
  env.values.set(key, JSON.stringify({ ...record, nickname: '딸기를 좋아하는 양' }))
  assert.equal(env.read(live, null, '프로필 이름').nickname, '프로필 이름')
  assert.equal(env.read(live).nickname, '딸기를 좋아하는 양')
  env.values.set(key, JSON.stringify({ ...record, nickname: '이전 직접 설정 이름' }))
  assert.equal(env.read(live, null, '프로필 이름').nickname, '이전 직접 설정 이름')
  await env.update('rename', live, { nickname: '딸기를 좋아하는 양' })
  assert.equal(env.read(live, null, '프로필 이름').nickname, '딸기를 좋아하는 양')
})

test('two scheduled attendees can start without a host and a late host remains unadmitted', () => {
  const env = environment()
  const host = { ...scheduled, membership: 'host' }
  env.time(openedAt + 4999)
  assert.equal(env.read(host, 'host-absent').phase, 'OPEN')
  env.time(openedAt + 5000)
  const room = env.read(host, 'host-absent')
  assert.equal(room.phase, 'IN_PROGRESS')
  assert.equal(room.entered, false)
  assert.equal(room.canJoin, false)
})

test('one admitted participant can wait, and a second arrival inside grace starts immediately', async () => {
  const env = environment()
  await env.update('join', scheduled, { scenario: 'grace-start' })
  assert.equal(env.read(scheduled, 'grace-start').phase, 'OPEN')
  env.time(openedAt + 10_000)
  assert.equal(env.read(scheduled, 'grace-start').phase, 'IN_PROGRESS')
  env.time(openedAt + 5 * 60_000)
  assert.equal(env.read(scheduled, 'grace-start').phase, 'IN_PROGRESS')
})

test('the grace deadline cancels once without accepting an entry at the deadline', async () => {
  const env = environment()
  await env.update('join', scheduled)
  env.time(scheduled.startAt + 119999)
  assert.equal(env.read(scheduled).phase, 'OPEN')
  env.time(scheduled.startAt + 120000)
  assert.equal(env.read(scheduled).phase, 'CANCELED')
  assert.equal(env.read(scheduled).autoCancelled, true)
  await assert.rejects(env.update('join', scheduled))
})

test('aborting or changing the account during a request does not write a room', async () => {
  const env = environment()
  const controller = new AbortController()
  const aborted = env.update('join', live, { signal: controller.signal })
  controller.abort()
  await assert.rejects(aborted)
  const switched = env.update('join')
  env.account('moyang:user:b')
  await assert.rejects(switched)
  assert.equal(env.values.size, 0)
})

test('failed writes preserve the saved state and can be retried', async () => {
  const env = environment()
  await env.update('join')
  const original = [...env.values.values()][0]
  env.failWrites(true)
  await assert.rejects(env.update('rename', live, { nickname: '새 이름' }))
  assert.equal([...env.values.values()][0], original)
  env.failWrites(false)
  await env.update('rename', live, { nickname: '새 이름' })
  assert.equal(env.read().nickname, '새 이름')
})

test('account and room scopes keep saved names and admission history separate', async () => {
  const env = environment()
  await env.update('join')
  await env.update('rename', live, { nickname: 'A의 이름' })
  env.account('moyang:user:b')
  assert.equal(env.read().entered, false)
  await env.update('join')
  await env.update('rename', live, { nickname: 'B의 이름' })
  env.account('moyang:user:a')
  assert.equal(env.read().nickname, 'A의 이름')
  assert.equal(env.read({ ...live, id: '102' }).entered, false)
})

test('the shared meeting lookup hides started rooms and retains existing member reentry', async () => {
  const env = environment()
  const host = { ...live, membership: 'host' }
  await env.update('join', host)
  await env.update('start', host)
  const meeting = env.mock.applyWaitingRoomStatus(host, openedAt)
  assert.equal(meeting.status, 'in-progress')
  assert.equal(meeting.participants, 2)
  assert.equal(meeting.hasEntered, true)
  const data = env.mock.applyWaitingRoomStatuses({ meetings: [host], myMeetings: [] })
  assert.equal(data.myMeetings.length, 1)
  assert.equal(data.myMeetings[0].id, host.id)
})

test('a canceled reservation cannot recover old admission from its room record', async () => {
  const env = environment()
  await env.update('join', scheduled)
  const canceledBooking = { ...scheduled, membership: undefined }
  assert.equal(env.mock.applyWaitingRoomStatus(canceledBooking, openedAt).membership, undefined)
  assert.equal(env.read(canceledBooking).canJoin, false)
})

test('malformed room storage is reported and its original content is preserved', async () => {
  const env = environment()
  await env.update('join')
  const key = [...env.values.keys()][0]
  env.values.set(key, '{invalid')
  assert.throws(() => env.read())
  assert.throws(() => env.mock.applyWaitingRoomStatus(live, openedAt))
  await assert.rejects(env.update('join'))
  assert.equal(env.values.get(key), '{invalid')
})

test('an account change during the meeting lookup cannot write the old request', async () => {
  const env = environment()
  await assert.rejects(
    env.update('join', live, {
      loadMeeting: () => {
        env.account('moyang:user:b')
        return live
      },
    }),
  )
  assert.equal(env.values.size, 0)
})

test('a nickname change after the room starts fails without replacing the saved name', async () => {
  const env = environment()
  const host = { ...live, membership: 'host' }
  await env.update('join', host)
  await env.update('rename', host, { nickname: '시작 전 이름' })
  await env.update('start', host)
  const saved = [...env.values.values()][0]
  await assert.rejects(env.update('rename', host, { nickname: '시작 후 이름' }))
  assert.equal([...env.values.values()][0], saved)
  assert.equal(env.read(host).nickname, '시작 전 이름')
})

test('an empty nickname is rejected without changing admission or previously saved data', async () => {
  const env = environment()
  await env.update('join')
  const saved = [...env.values.values()][0]
  await assert.rejects(env.update('rename', live, { nickname: '   ' }))
  assert.equal([...env.values.values()][0], saved)
  assert.equal(env.read().entered, true)
})

test('a saved scheduled room keeps its date when the fixture is regenerated on the following day', async () => {
  const env = environment()
  await env.update('rename', scheduled, { nickname: '저장한 모임 이름' })
  const nextDay = { ...scheduled, startAt: scheduled.startAt + 86_400_000 }
  const restored = env.mock.applyWaitingRoomStatus(nextDay, openedAt + 86_400_000)
  assert.equal(restored.startAt, scheduled.startAt)
  assert.equal(env.read(scheduled).nickname, '저장한 모임 이름')
})

test('a browser without cross-tab locking cannot overwrite room participation or nickname data', async () => {
  const env = environment()
  await env.update('join')
  const original = [...env.values.values()][0]
  env.disableLocks()
  await assert.rejects(env.update('rename', live, { nickname: '다른 탭과 충돌하는 이름' }))
  await assert.rejects(env.update('leave'))
  assert.equal([...env.values.values()][0], original)
})

test('a departing peer updates the roster and prevents the live host from starting alone', async () => {
  const env = environment()
  const host = { ...live, membership: 'host', hasEntered: true }
  await env.update('rename', host, { scenario: 'participant-left', nickname: '기다리는 방장' })
  assert.equal(env.read(host, 'participant-left').canStart, true)
  env.time(openedAt + 10_000)
  const room = env.read(host, 'participant-left')
  assert.equal(room.participants.length, 1)
  assert.equal(room.participants[0].nickname, '기다리는 방장')
  assert.equal(room.canStart, false)
  await assert.rejects(env.update('start', host, { scenario: 'participant-left' }))
})

test('a peer rename preserves the admitted participant and their saved nickname', async () => {
  const env = environment()
  await env.update('join', live, { scenario: 'participant-rename' })
  await env.update('rename', live, { scenario: 'participant-rename', nickname: '내 이름' })
  const saved = [...env.values.values()][0]
  env.time(openedAt + 10_000)
  const room = env.read(live, 'participant-rename')
  assert.equal(room.participants.length, 2)
  assert.equal(room.participants.find(({ id }) => id === 'me').nickname, '내 이름')
  assert.equal(room.participants.find(({ id }) => id !== 'me').nickname, '새 이름으로 인사하는 양')
  assert.equal([...env.values.values()][0], saved)
})

test('insufficient wool rejects a first live entry without losing the saved profile', async () => {
  const env = environment()
  await env.update('rename', live, { scenario: 'insufficient-wool', nickname: '입장 전 이름' })
  const saved = [...env.values.values()][0]
  await assert.rejects(env.update('join', live, { scenario: 'insufficient-wool' }), /양털 1개/)
  assert.equal([...env.values.values()][0], saved)
  assert.equal(env.read(live, 'insufficient-wool').entered, false)
  assert.equal(env.read(live, 'insufficient-wool').nickname, '입장 전 이름')

  const host = { ...live, membership: 'host' }
  await env.update('join', host, { scenario: 'insufficient-wool' })
  assert.equal(env.read(host, 'insufficient-wool').entered, true)
})

test('an unpaid scheduled booking is not refundable just because it entered before cancellation', async () => {
  const env = environment()
  await env.update('join', scheduled)
  env.time(scheduled.startAt + 120000)
  const room = env.read(scheduled)
  assert.equal(room.phase, 'CANCELED')
  assert.equal(room.refundableWool, 0)
})

test('automatic cancellation makes only confirmed paid bookings eligible for a refund', async () => {
  for (const membership of ['host', 'participant']) {
    const env = environment()
    const meeting = { ...scheduled, membership, woolPaid: true }
    await env.update('join', meeting)
    assert.equal(env.read(meeting).refundableWool, 0)
    env.time(meeting.startAt + 120000)
    assert.equal(env.read(meeting).refundableWool, 1)
  }
})

test('a previously canceled room is not treated as an automatic cancellation after the deadline', () => {
  const env = environment()
  const meeting = {
    ...scheduled,
    membership: 'host',
    woolPaid: true,
    status: 'cancelled',
    startAt: openedAt - 180000,
  }
  assert.equal(env.read(meeting).autoCancelled, false)
  assert.equal(env.read(meeting).refundableWool, 0)
})

test('a canceled scheduled host cannot infer a creation-fee refund from the current time', () => {
  for (const remaining of [600000, 599999]) {
    const env = environment()
    const meeting = {
      ...scheduled,
      membership: 'host',
      woolPaid: true,
      status: 'cancelled',
      startAt: openedAt + remaining,
    }
    assert.equal(env.read(meeting).refundableWool, 0)
    assert.equal(env.read(meeting).closedByHost, false)
  }
})

test('live refund eligibility requires payment and ends after departure or start', async () => {
  const env = environment()
  await env.update('join')
  assert.equal(env.read().refundableWool, 0)
  const paid = { ...live, woolPaid: true }
  assert.equal(env.read(paid).refundableWool, 1)
  await env.update('leave', paid)
  assert.equal(env.read(paid).refundableWool, 0)
  const host = { ...paid, membership: 'host' }
  await env.update('join', host)
  assert.equal(env.read(host).refundableWool, 0)
  await env.update('leave', host)
  assert.equal(env.read(host).refundableWool, 0)
  const started = environment()
  assert.equal(started.read({ ...paid, status: 'in-progress', hasEntered: true }).refundableWool, 0)
})

test('leaving scheduled chat waiting preserves the booking without claiming a refund', async () => {
  const env = environment()
  const paid = { ...scheduled, woolPaid: true }
  await env.update('join', paid)
  await env.update('leave', paid)
  const room = env.read(paid)
  assert.equal(room.phase, 'OPEN')
  assert.equal(room.entered, false)
  assert.equal(room.refundableWool, 0)
  await env.update('join', paid)
  assert.equal(env.read(paid).entered, true)
})

test('old admission flags cannot manufacture a wool payment or modify the wallet', async () => {
  const env = environment()
  const walletKey = 'moyang:mock-reflection-records:user:a'
  const wallet = JSON.stringify({ records: [], completedDrawingIds: [], paidQuestions: [] })
  env.values.set(walletKey, wallet)
  await env.update('join')
  const roomKey = [...env.values.keys()].find((key) => key !== walletKey)
  env.values.set(
    roomKey,
    JSON.stringify({ ...JSON.parse(env.values.get(roomKey)), woolPaid: true }),
  )
  assert.equal(env.read().refundableWool, 0)
  await env.update('leave')
  assert.equal(env.values.get(walletKey), wallet)
})

test('a confirmed existing live payment is not rejected as another first-entry payment', async () => {
  const env = environment()
  const paid = { ...live, woolPaid: true }
  await env.update('join', paid, { scenario: 'insufficient-wool' })
  assert.equal(env.read(paid, 'insufficient-wool').entered, true)
})

test('out-of-range saved dates fail without replacing the saved room', async () => {
  for (const field of ['createdAt', 'startAt', 'enteredAt']) {
    const env = environment()
    await env.update('join', scheduled)
    const key = [...env.values.keys()][0]
    const invalid = JSON.stringify({ ...JSON.parse(env.values.get(key)), [field]: 9e15 })
    env.values.set(key, invalid)
    assert.throws(() => env.read(scheduled), /모임 상태/)
    await assert.rejects(env.update('rename', scheduled, { nickname: '변경할 이름' }))
    assert.equal(env.values.get(key), invalid)
  }
})

test('a saved room with the wrong kind of schedule cannot bypass admission time', async () => {
  for (const meeting of [live, scheduled]) {
    const env = environment()
    await env.update('rename', meeting, { nickname: '보존할 이름' })
    const key = [...env.values.keys()][0]
    const invalid = JSON.stringify({
      ...JSON.parse(env.values.get(key)),
      startAt: meeting.kind === 'live' ? openedAt : null,
    })
    env.values.set(key, invalid)
    assert.throws(() => env.read(meeting), /모임 상태/)
    await assert.rejects(env.update('join', meeting))
    assert.equal(env.values.get(key), invalid)
  }
})

test('a blank saved nickname is not silently accepted or overwritten', async () => {
  const env = environment()
  await env.update('join')
  const key = [...env.values.keys()][0]
  const invalid = JSON.stringify({ ...JSON.parse(env.values.get(key)), nickname: '   ' })
  env.values.set(key, invalid)
  assert.throws(() => env.read(), /모임 상태/)
  await assert.rejects(env.update('join'))
  assert.equal(env.values.get(key), invalid)
})
