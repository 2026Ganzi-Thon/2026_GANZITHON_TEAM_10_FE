const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const base = path.resolve(__dirname, '..')
const ts = require('typescript')
const start = Date.parse('2026-11-13T12:00:00+09:00')
const signal = () => new AbortController().signal
const token = (id) => `qa.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.qa`

function environment(values = new Map(), initial = start) {
  let now = initial
  let failWrites = false
  let sessionBlocked = false
  const session = new Map()
  let queue = Promise.resolve()
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]))
    }
    static now() {
      return now
    }
  }
  const localStorage = {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (failWrites) throw new Error('quota')
      values.set(key, String(value))
    },
    removeItem: (key) => values.delete(key),
  }
  const locks = {
    request(_key, options, fn) {
      const callback = typeof options === 'function' ? options : fn
      const task = queue.then(() => {
        if (typeof options !== 'function') options?.signal?.throwIfAborted()
        return callback()
      })
      queue = task.catch(() => {})
      return task
    },
  }
  const navigator = { locks }
  const window = {
    navigator,
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
    clearTimeout,
  }
  const context = vm.createContext({
    window,
    navigator,
    localStorage,
    sessionStorage: {
      getItem(key) {
        if (sessionBlocked) throw new Error('session unavailable')
        return session.get(key) ?? null
      },
      removeItem: (key) => session.delete(key),
    },
    Date: Clock,
    Intl,
    Map,
    Set,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Promise,
    Error,
    Uint8Array,
    TextDecoder,
    AbortController,
    atob,
    crypto: require('node:crypto').webcrypto,
  })
  const modules = new Map()
  function load(file) {
    if (!path.isAbsolute(file)) file = path.join(base, file)
    if (!path.extname(file)) file += '.ts'
    if (modules.has(file)) return modules.get(file).exports
    const mod = { exports: {} }
    modules.set(file, mod)
    const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.DEV', 'true')
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    const localRequire = (name) =>
      load(
        name.startsWith('@/')
          ? path.join(base, 'src', name.slice(2))
          : path.resolve(path.dirname(file), name),
      )
    new vm.Script(`(function(exports, require, module) {${js}\n})`, {
      filename: file,
    }).runInContext(context)(mod.exports, localRequire, mod)
    return mod.exports
  }
  const reflections = load('src/lib/mock-reflections.ts')
  const meetings = load('src/features/meeting-list/meetingMock.ts')
  const reservation = load('src/features/meeting-reservation/reservationMock.ts')
  return {
    values,
    reflections,
    meetings,
    reservation,
    locks,
    navigator,
    session,
    load,
    storage: load('src/lib/mock-storage.ts'),
    time(value) {
      now = value
    },
    account(id) {
      if (id === null) values.delete('moyang.accessToken')
      else values.set('moyang.accessToken', token(id))
    },
    fail(value) {
      failWrites = value
    },
    blockSession(value) {
      sessionBlocked = value
    },
    seed(count = 3) {
      reflections.writeReflections({
        records: Array.from({ length: count }, (_, i) => ({
          drawingId: i + 1,
          recordDate: `2026-11-${10 + i}`,
          sheepReward: 1,
        })),
        completedDrawingIds: Array.from({ length: count }, (_, i) => i + 1),
      })
    },
  }
}

async function code(promise, expected) {
  await assert.rejects(promise, (error) => error.code === expected)
}

test('insufficient wool and rejected requests leave storage unchanged', async () => {
  const e = environment()
  e.seed(0)
  const before = JSON.stringify([...e.values])
  await code(e.reservation.applyForMeeting('211', signal()), 'wool')
  for (const [id, reason] of [
    ['203', 'full'],
    ['204', 'started'],
    ['206', 'cancelled'],
    ['999', 'missing'],
    ['101', 'missing'],
  ]) {
    await code(e.reservation.applyForMeeting(id, signal()), reason)
  }
  assert.equal(JSON.stringify([...e.values]), before)
})
test('50 duplicate applications charge once and 50 cancellations refund once', async () => {
  const e = environment()
  e.seed()
  const applications = await Promise.all(
    Array.from({ length: 50 }, () => e.reservation.applyForMeeting('211', signal())),
  )
  assert.equal(applications.filter(({ applied }) => applied).length, 1)
  assert.equal(e.reflections.getWoolBalance(), 2)
  assert.equal(e.meetings.getMockMeeting('211').participants, 3)
  const results = await Promise.all(
    Array.from({ length: 50 }, () => e.reservation.cancelReservation('211', signal())),
  )
  assert.equal(results.filter((r) => r.refunded).length, 1)
  assert.equal(results.filter((r) => r.alreadyCancelled).length, 49)
  assert.equal(e.reflections.getWoolBalance(), 3)
  assert.equal(e.meetings.getMockMeeting('211').participants, 2)
})
for (const [offset, refunded] of [
  [600000, true],
  [599999, false],
  [0, false],
  [-60000, false],
]) {
  test(`refund boundary ${offset}ms before scheduled start`, async () => {
    const e = environment()
    e.seed()
    await e.reservation.applyForMeeting('211', signal())
    e.time(e.meetings.getMockMeeting('211').startAt - offset)
    assert.equal((await e.reservation.cancelReservation('211', signal())).refunded, refunded)
    assert.equal(e.reflections.getWoolBalance(), refunded ? 3 : 2)
  })
}
test('reapplying after a late cancellation spends a new wool without an extra seat', async () => {
  const e = environment()
  e.seed()
  await e.reservation.applyForMeeting('211', signal())
  e.time(e.meetings.getMockMeeting('211').startAt - 9 * 60000)
  await e.reservation.cancelReservation('211', signal())
  await e.reservation.applyForMeeting('211', signal())
  assert.equal(e.reflections.getWoolBalance(), 1)
  assert.equal(e.meetings.getMockMeeting('211').participants, 3)
})
test('host early cancellation refunds once and closes the meeting', async () => {
  const e = environment()
  e.seed()
  const result = await e.reservation.cancelReservation('201', signal())
  assert.equal(result.refunded, true)
  assert.equal(result.cancelled, true)
  assert.equal(e.meetings.getMockMeeting('201').status, 'cancelled')
  await code(e.reservation.cancelReservation('201', signal()), 'cancelled')
  assert.equal(e.reflections.getWoolBalance(), 4)
})
test('host late cancellation closes the meeting with no creation refund', async () => {
  const e = environment()
  e.seed()
  const result = await e.reservation.cancelReservation('213', signal())
  assert.equal(result.refunded, false)
  assert.equal(result.cancelled, true)
  assert.equal(e.reflections.getWoolBalance(), 3)
})
test('full and simulated network failures do not charge or join', async () => {
  const e = environment()
  e.seed()
  const before = JSON.stringify([...e.values])
  await assert.rejects(e.reservation.applyForMeeting('211', signal(), { fail: true }))
  await code(e.reservation.applyForMeeting('211', signal(), { full: true }), 'full')
  await assert.rejects(e.reservation.cancelReservation('202', signal(), { fail: true }))
  assert.equal(JSON.stringify([...e.values]), before)
})
test('application and cancellation write failures roll back, retry succeeds once', async () => {
  const e = environment()
  e.seed()
  const before = JSON.stringify([...e.values])
  e.fail(true)
  await assert.rejects(e.reservation.applyForMeeting('211', signal()), /quota/)
  assert.equal(JSON.stringify([...e.values]), before)
  e.fail(false)
  await e.reservation.applyForMeeting('211', signal())
  const booked = JSON.stringify([...e.values])
  e.fail(true)
  await assert.rejects(e.reservation.cancelReservation('211', signal()), /quota/)
  assert.equal(JSON.stringify([...e.values]), booked)
  e.fail(false)
  await e.reservation.cancelReservation('211', signal())
  assert.equal(e.reflections.getWoolBalance(), 3)
})
test('aborted delayed application does not charge or join', async () => {
  const e = environment()
  e.seed()
  const controller = new AbortController()
  const pending = e.reservation.applyForMeeting('211', controller.signal, { delay: 3000 })
  controller.abort()
  await assert.rejects(pending)
  assert.equal(e.reflections.getWoolBalance(), 3)
  assert.equal(e.meetings.getMockMeeting('211').membership, undefined)
})
test('switching accounts during a pending request leaves both accounts unchanged', async () => {
  const e = environment()
  e.account('a')
  e.seed()
  const pending = e.reservation.applyForMeeting('211', signal())
  e.account('b')
  await assert.rejects(pending)
  assert.equal(e.reflections.getWoolBalance(), 0)
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 3)
  assert.equal(e.meetings.getMockMeeting('211').membership, undefined)
})

test('switching accounts after reading the wallet leaves the two stores unchanged', async () => {
  const e = environment()
  e.account('a')
  e.seed()
  const keyA = e.storage.getMockStorageKey('moyang:mock-reflection-records')
  e.account('b')
  e.seed(1)
  const keyB = e.storage.getMockStorageKey('moyang:mock-reflection-records')
  e.account('a')
  const a = e.values.get(keyA)
  const b = e.values.get(keyB)
  const read = e.values.get.bind(e.values)
  e.values.get = (key) => {
    const value = read(key)
    if (key === keyA) {
      e.values.get = read
      e.account('b')
    }
    return value
  }
  await assert.rejects(e.reservation.applyForMeeting('211', signal()), /로그인 정보/)
  assert.equal(e.values.get(keyA), a)
  assert.equal(e.values.get(keyB), b)
})

test('a blocked or conflicting session keeps the reservation and wool unchanged', async () => {
  const e = environment()
  e.seed(2)
  const key = e.storage.getMockStorageKey('moyang:mock-reflection-records')
  const original = e.values.get(key)
  e.blockSession(true)
  await assert.rejects(e.reservation.applyForMeeting('211', signal()))
  e.blockSession(false)
  const newer = JSON.stringify({ ...JSON.parse(original), paidQuestions: ['one', 'two'] })
  e.session.set(key, newer)
  await assert.rejects(e.reservation.applyForMeeting('211', signal()))
  await assert.rejects(e.reservation.cancelReservation('202', signal()))
  assert.equal(e.values.get(key), original)
  assert.equal(e.session.get(key), newer)
})

test('a browser without cross-tab locking cannot change reservations', async () => {
  const e = environment()
  e.seed()
  const original = JSON.stringify([...e.values])
  e.navigator.locks = undefined
  await assert.rejects(e.reservation.applyForMeeting('211', signal()))
  await assert.rejects(e.reservation.cancelReservation('202', signal()))
  assert.equal(JSON.stringify([...e.values]), original)
})
test('guest and two users keep separate wool and reservations', async () => {
  const e = environment()
  e.seed()
  await e.reservation.applyForMeeting('211', signal())
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.equal(e.meetings.getMockMeeting('211').membership, undefined)
  e.seed(2)
  await e.reservation.applyForMeeting('208', signal())
  e.account('b')
  assert.equal(e.meetings.getMockMeeting('208').membership, undefined)
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 1)
  e.account(null)
  assert.equal(e.reflections.getWoolBalance(), 2)
  assert.equal(e.meetings.getMockMeeting('211').membership, 'participant')
})
test('simultaneous AI question and reservation preserve both transactions and old records', async () => {
  const e = environment()
  e.seed(2)
  await Promise.all([
    e.reflections.spendWoolForQuestion('qa-question', signal()),
    e.reservation.applyForMeeting('211', signal()),
  ])
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.equal(e.reflections.readReflections().records.length, 2)
  assert.equal(e.reflections.readReflections().paidQuestions.length, 1)
  assert.equal(e.meetings.getMockMeeting('211').membership, 'participant')
})
test('one remaining wool cannot fund two different simultaneous applications', async () => {
  const e = environment()
  e.seed(1)
  const outcomes = await Promise.allSettled([
    e.reservation.applyForMeeting('211', signal()),
    e.reservation.applyForMeeting('208', signal()),
  ])
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(e.reflections.getWoolBalance(), 0)
})
test('booking dates and membership survive a new tab and the next day', async () => {
  const e = environment()
  e.seed()
  await e.reservation.applyForMeeting('211', signal())
  const original = e.meetings.getMockMeeting('211')
  const next = environment(e.values, start + 86400000)
  const loaded = next.meetings.getMockMeeting('211')
  assert.equal(loaded.startAt, original.startAt)
  assert.equal(loaded.membership, 'participant')
  assert.equal(loaded.participants, 3)
})

test('bookings from other preview lists are still visible in My meetings after reload', async () => {
  const e = environment()
  e.seed()
  const ids = ['208', '215']
  for (const id of ids) await e.reservation.applyForMeeting(id, signal())
  const reloaded = environment(e.values, start + 60_000)
  const options = { empty: false, fail: false }
  for (const view of [options, { ...options, states: true }, { ...options, many: true }]) {
    const { myMeetings } = await reloaded.meetings.loadMeetings(view)
    for (const id of ids) {
      const copies = myMeetings.filter((meeting) => meeting.id === id)
      assert.equal(copies.length, 1)
      assert.equal(copies[0].startAt, e.meetings.getMockMeeting(id).startAt)
      assert.equal(copies[0].participants, e.meetings.getMockMeeting(id).participants)
    }
  }
  await reloaded.reservation.cancelReservation('208', signal())
  const { meetings, myMeetings } = await reloaded.meetings.loadMeetings(options)
  assert.equal(
    myMeetings.some(({ id }) => id === '208'),
    false,
  )
  assert.equal(
    meetings.some(({ id }) => ids.includes(id)),
    false,
  )
})
test('entry is limited to members, exactly five minutes before through two minutes after', async () => {
  const e = environment()
  const booked = e.meetings.getMockMeeting('202')
  for (const [offset, allowed] of [
    [-300001, false],
    [-300000, true],
    [-1, true],
    [0, true],
    [119999, true],
    [120000, false],
  ]) {
    assert.equal(e.reservation.canEnterWaitingRoom(booked, booked.startAt + offset), allowed)
  }
  assert.equal(
    e.reservation.canEnterWaitingRoom(
      e.meetings.getMockMeeting('211'),
      e.meetings.getMockMeeting('211').startAt,
    ),
    false,
  )
})
test('new applications close at the exact start, while existing membership is idempotent', async () => {
  const e = environment()
  e.seed()
  e.time(e.meetings.getMockMeeting('211').startAt)
  await code(e.reservation.applyForMeeting('211', signal()), 'started')
  const original = JSON.stringify([...e.values])
  await e.reservation.applyForMeeting('202', signal())
  assert.equal(JSON.stringify([...e.values]), original)
})

test('an elapsed waiting-room window does not change membership or wool while status is pending', async () => {
  const e = environment()
  e.seed()
  const meeting = e.meetings.getMockMeeting('202')
  e.time(meeting.startAt + 120000)
  const original = JSON.stringify([...e.values])
  await assert.rejects(e.reservation.cancelReservation('202', signal()), /시작 상태/)
  assert.equal(JSON.stringify([...e.values]), original)
})
test('malformed reservation data is not reset or overwritten', async () => {
  const e = environment()
  e.seed()
  const key = e.storage.getMockStorageKey('moyang:mock-reflection-records')
  for (const reservation of [
    null,
    {
      joined: true,
      isHost: false,
      cancelled: false,
      participantDelta: 1,
      woolChange: -1,
      startAt: 9e15,
    },
  ]) {
    e.values.set(
      key,
      JSON.stringify({
        records: [],
        completedDrawingIds: [],
        meetingReservations: { 211: reservation },
      }),
    )
    const before = JSON.stringify([...e.values])
    await assert.rejects(e.reservation.applyForMeeting('211', signal()))
    assert.equal(JSON.stringify([...e.values]), before)
  }
  assert.equal(e.meetings.getMockMeeting('101').kind, 'live')
})
test('legacy reflection migration preserves the new booking ledger', async () => {
  const e = environment()
  e.account('a')
  e.seed()
  await e.reservation.applyForMeeting('211', signal())
  e.values.set(
    'moyang:mock-reflection-records',
    JSON.stringify([{ drawingId: 90, recordDate: '2026-10-20', sheepReward: 1 }]),
  )
  await e.storage.migrateLegacyMockStorage((suffix) =>
    e.reflections.migrateLegacyReflections(suffix),
  )
  assert.equal(e.meetings.getMockMeeting('211').membership, 'participant')
  assert.equal(e.reflections.getWoolBalance(), 3)
  assert.equal(e.reflections.readReflections().records.length, 4)
})
test('first reflection reward funds a booking without resetting the daily save limit', async () => {
  const e = environment()
  const result = e.load('src/features/drawing-result/resultMock.ts')
  const data = { drawing: { drawingId: 91, title: 'QA' }, card: { todaysStory: 'QA' } }
  const options = { preview: null, previewWallet: false, fail: false, signal: signal() }
  assert.equal((await result.saveDrawingResult(data, options)).status, 'saved')
  assert.equal(e.reflections.getWoolBalance(), 1)
  await e.reservation.applyForMeeting('211', signal())
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.equal(
    (await result.saveDrawingResult(data, { ...options, signal: signal() })).status,
    'already-saved',
  )
  const second = { ...data, drawing: { drawingId: 92, title: 'QA 2' } }
  assert.equal(
    (await result.saveDrawingResult(second, { ...options, signal: signal() })).status,
    'daily-limit',
  )
  await e.reservation.cancelReservation('211', signal())
  assert.equal(e.reflections.getWoolBalance(), 1)
  assert.equal(
    (await result.saveDrawingResult(second, { ...options, signal: signal() })).status,
    'daily-limit',
  )
  assert.equal(e.reflections.readReflections().records.length, 1)
})
test('booking and refund preserve personal-program schedules across a reload', async () => {
  const e = environment()
  e.seed()
  const programs = e.load('src/features/personal-program/programMock.ts')
  await programs.saveProgramSchedule({
    reflection: { id: 1, concern: { id: 'relationships', label: '대인관계' } },
    days: [1, 4],
    fail: false,
    signal: signal(),
  })
  const before = JSON.stringify(programs.readPrograms())
  await e.reservation.applyForMeeting('211', signal())
  await e.reservation.cancelReservation('211', signal())
  assert.equal(JSON.stringify(programs.readPrograms()), before)
  const reloaded = environment(e.values, start + 86400000)
  assert.equal(
    JSON.stringify(reloaded.load('src/features/personal-program/programMock.ts').readPrograms()),
    before,
  )
})
