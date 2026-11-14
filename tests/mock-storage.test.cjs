const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const recordsKey = 'moyang:mock-reflection-records'
const programsKey = 'moyang:personal-programs'
const ownerKey = 'moyang:mock-storage-legacy-owner'
const today = '2026-11-14'
const record = { drawingId: 41, recordDate: today, sheepReward: 1, title: '이전 회고' }
const reflection = { records: [record], completedDrawingIds: [41] }
const program = {
  id: 'old-program',
  firstReflection: { id: 41, concern: { id: 'relationships', label: '대인관계' } },
  days: [1, 4],
  nextDate: '2026-11-16',
  completed: 1,
  cancelled: false,
}
const plain = (value) => JSON.parse(JSON.stringify(value))

function environment(local = new Map(), session = new Map(), sharedLocks) {
  let failWrites = false
  let denySessionReads = false
  let now = Date.parse(`${today}T12:00:00+09:00`)
  let queue = Promise.resolve()
  const storage = (values) => ({
    getItem(key) {
      if (denySessionReads && values === session) throw new Error('session unavailable')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (failWrites) throw new Error('quota')
      values.set(key, String(value))
    },
    removeItem: (key) => values.delete(key),
  })
  const navigator = {
    locks: sharedLocks ?? {
      request(_key, options, callback) {
        const run = typeof options === 'function' ? options : callback
        const pending = queue.then(() => {
          if (typeof options !== 'function') options.signal?.throwIfAborted()
          return run()
        })
        queue = pending.catch(() => {})
        return pending
      },
    },
  }
  class Clock extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]))
    }
    static now() {
      return now
    }
  }
  const context = vm.createContext({
    localStorage: storage(local),
    sessionStorage: storage(session),
    navigator,
    window: { navigator, setTimeout: (callback) => setTimeout(callback, 0), clearTimeout },
    atob,
    TextDecoder,
    Uint8Array,
    AbortController,
    Date: Clock,
    crypto: require('node:crypto').webcrypto,
  })
  const modules = new Map()
  function load(file) {
    if (!path.extname(file)) file += '.ts'
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const source = fs.readFileSync(file, 'utf8').replaceAll('import.meta.env.DEV', 'true')
    const code = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText
    const resolve = (name) =>
      load(
        name.startsWith('@/')
          ? path.join(root, 'src', name.slice(2))
          : path.resolve(path.dirname(file), name),
      )
    new vm.Script(`(function(exports, require) {${code}\n})`, { filename: file }).runInContext(
      context,
    )(module.exports, resolve)
    return module.exports
  }
  const shared = load(path.join(root, 'src/lib/mock-storage.ts'))
  const reflections = load(path.join(root, 'src/lib/mock-reflections.ts'))
  const programs = load(path.join(root, 'src/features/personal-program/programMock.ts'))
  return {
    local,
    session,
    shared,
    reflections,
    programs,
    load: (file) => load(path.join(root, file)),
    fail: (value) => (failWrites = value),
    denySessionReads: (value) => (denySessionReads = value),
    time: (value) => (now = Date.parse(value)),
    navigator,
    locks: navigator.locks,
    settled: () => queue,
    account(id) {
      if (id === null) local.delete('moyang.accessToken')
      else {
        const payload = Buffer.from(JSON.stringify({ sub: id })).toString('base64url')
        local.set('moyang.accessToken', `test.${payload}.test`)
      }
    },
    boot: () =>
      shared.migrateLegacyMockStorage((suffix) => {
        reflections.migrateLegacyReflections(suffix)
        programs.migrateLegacyPrograms(suffix)
      }),
    seed() {
      local.set(recordsKey, JSON.stringify(reflection))
      session.set(programsKey, JSON.stringify([program]))
    },
  }
}

test('로그인 전에 기존 자료를 guest로 옮기거나 소유자를 지정하지 않는다', async () => {
  const e = environment()
  e.seed()
  const before = [...e.local, ...e.session]
  await e.boot()
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.deepEqual(plain(e.programs.readPrograms()), [])
  assert.deepEqual([...e.local, ...e.session], before)
  for (const id of ['a', 'b']) {
    e.account(id)
    assert.deepEqual(plain(e.reflections.readReflections().records), [])
    assert.deepEqual(plain(e.programs.readPrograms()), [])
  }
  assert.equal(e.local.has(ownerKey), false)
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.session.get(programsKey), JSON.stringify([program]))
})

test('이미 guest로 이전된 소유자 불명 자료도 계정에 자동 귀속하지 않는다', async () => {
  const e = environment()
  e.local.set(ownerKey, 'moyang')
  e.local.set(`${recordsKey}:guest`, JSON.stringify(reflection))
  e.session.set(`${programsKey}:guest`, JSON.stringify([program]))
  await e.boot()
  for (const id of ['a', 'b']) {
    e.account(id)
    assert.equal(e.reflections.getWoolBalance(), 0)
    assert.deepEqual(plain(e.programs.readPrograms()), [])
  }
  assert.equal(e.local.get(`${recordsKey}:guest`), JSON.stringify(reflection))
  assert.equal(e.session.get(`${programsKey}:guest`), JSON.stringify([program]))
  assert.equal(e.local.get(ownerKey), 'moyang')
})

test('소유자가 확인된 자료는 앱 실행 후 로그인해도 새로고침 없이 읽는다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  assert.equal(e.reflections.getWoolBalance(), 0)
  e.account('b')
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.deepEqual(plain(e.programs.readPrograms()), [])
  e.account('a')
  assert.deepEqual(plain(e.reflections.readReflections()), reflection)
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
  const result = e.load('src/features/drawing-result/resultMock.ts')
  assert.equal(result.getReflectionSaveStatus(e.reflections.readReflections(), 99), 'daily-limit')
  assert.equal(e.reflections.getWoolBalance(), 1)
})

test('정상 이전과 재실행에서 기록·당일 제한·사용한 양털·변경한 일정을 유지한다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  const current = { ...record, drawingId: 42, title: '현재 회고' }
  e.local.set(
    `${recordsKey}:user:a`,
    JSON.stringify({
      records: [current],
      completedDrawingIds: [42],
      paidQuestions: ['paid-1'],
    }),
  )
  const updated = { ...program, days: [2, 5], nextDate: '2026-11-17' }
  e.local.set(`${programsKey}:user:a`, JSON.stringify([updated]))
  await e.boot()
  assert.equal(e.local.has(recordsKey), false)
  assert.equal(e.session.has(programsKey), false)
  assert.deepEqual(plain(e.reflections.readReflections().records), [current])
  assert.deepEqual(plain(e.reflections.readReflections().completedDrawingIds), [41, 42])
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.deepEqual(plain(e.programs.readPrograms()), [updated])
  const saved = [...e.local]
  await e.boot()
  assert.deepEqual([...e.local], saved)
})

test('저장 공간이 부족해도 소유자의 원본과 당일 저장 제한을 유지하고 재시도한다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  e.fail(true)
  await e.boot()
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.session.get(programsKey), JSON.stringify([program]))
  const result = e.load('src/features/drawing-result/resultMock.ts')
  assert.equal(result.getReflectionSaveStatus(e.reflections.readReflections(), 99), 'daily-limit')
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
  e.fail(false)
  await e.boot()
  assert.equal(e.local.has(recordsKey), false)
  assert.equal(e.session.has(programsKey), false)
  assert.equal(e.reflections.getWoolBalance(), 1)
})

test('이전이 잠긴 동안 계정을 바꿔도 다른 사용자에게 자료를 옮기지 않는다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  const migration = e.boot()
  e.account('b')
  await migration
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.reflections.getWoolBalance(), 0)
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 1)
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
})

test('이전 후 계정 전환과 로그아웃을 해도 회고와 일정이 섞이지 않는다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  await e.reflections.spendWoolForQuestion('additional-question', new AbortController().signal)
  assert.equal(e.reflections.getWoolBalance(), 0)
  for (const id of ['b', null]) {
    e.account(id)
    assert.deepEqual(plain(e.reflections.readReflections().records), [])
    assert.deepEqual(plain(e.programs.readPrograms()), [])
  }
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
})

test('손상된 원본은 보존하고 정상 세션 자료만 이전한다', async () => {
  const e = environment()
  e.local.set(recordsKey, 'invalid-json')
  e.session.set(recordsKey, JSON.stringify(reflection))
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  assert.equal(e.local.get(recordsKey), 'invalid-json')
  assert.equal(e.session.has(recordsKey), false)
  assert.deepEqual(plain(e.reflections.readReflections()), reflection)
})

test('이미 계정에 저장된 자료가 손상됐으면 원본을 덮어쓰거나 지우지 않는다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  e.local.set(`${recordsKey}:user:a`, 'invalid-json')
  await e.boot()
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.local.get(`${recordsKey}:user:a`), 'invalid-json')
  assert.throws(() => e.reflections.readReflections())
})

test('여러 탭과 앱 재실행에서 동일한 자료로 양털을 중복 지급하지 않는다', async () => {
  const e = environment()
  e.seed()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  const other = environment(e.local, e.session, e.locks)
  await Promise.all([e.boot(), other.boot()])
  const reloaded = environment(e.local, e.session)
  await reloaded.boot()
  assert.equal(reloaded.reflections.getWoolBalance(), 1)
  assert.deepEqual(plain(reloaded.reflections.readReflections().records), [record])
  assert.deepEqual(plain(reloaded.programs.readPrograms()), [program])
})

test('잘못된 로그인 정보로 실행해도 기존 자료를 guest로 이전하지 않는다', async () => {
  const e = environment()
  e.seed()
  e.local.set('moyang.accessToken', 'invalid-token')
  await e.boot()
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.session.get(programsKey), JSON.stringify([program]))
  assert.equal(e.local.has(ownerKey), false)
  assert.equal(e.local.has(`${recordsKey}:guest`), false)
})

test('일반 자료와 미리보기 자료는 각각의 계정 키로 이전한다', async () => {
  const e = environment()
  e.seed()
  e.account('가/나')
  const suffix = ':user:' + encodeURIComponent('가/나')
  e.local.set(ownerKey, `moyang${suffix}`)
  e.local.set(
    `${recordsKey}:wool-preview`,
    JSON.stringify({
      records: [{ ...record, drawingId: 90 }],
      completedDrawingIds: [90],
    }),
  )
  e.session.set(`${programsKey}:today`, JSON.stringify([{ ...program, id: 'preview-program' }]))
  await e.boot()
  assert.deepEqual(plain(e.reflections.readReflections().records), [record])
  assert.equal(e.reflections.readReflections(true).records[0].drawingId, 90)
  assert.equal(e.programs.readPrograms('today')[0].id, 'preview-program')
  assert.equal(e.local.has(`${recordsKey}:wool-preview${suffix}`), true)
  assert.equal(e.local.has(`${programsKey}:today${suffix}`), true)
})

test('소유자 불명 원본이 있어도 새 계정의 기록과 일정은 별도로 저장한다', async () => {
  const e = environment()
  e.seed()
  await e.boot()
  e.account('new-user')
  const current = { ...record, drawingId: 99, title: '새 계정 회고' }
  e.reflections.writeReflections({ records: [current], completedDrawingIds: [99] })
  await e.programs.saveProgramSchedule({
    reflection: program.firstReflection,
    days: [2],
    fail: false,
    signal: new AbortController().signal,
  })
  assert.deepEqual(plain(e.reflections.readReflections().records), [current])
  assert.equal(e.programs.readPrograms().length, 1)
  assert.notEqual(e.programs.readPrograms()[0].id, program.id)
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.session.get(programsKey), JSON.stringify([program]))
})

test('초기화 중 오류가 나도 앱 시작을 막는 예외로 전파하지 않는다', async () => {
  const e = environment()
  await assert.doesNotReject(
    e.shared.migrateLegacyMockStorage(() => {
      throw new Error('storage unavailable')
    }),
  )
})

test('로그인 후 처음 조회할 때도 쓰기 잠금을 지키고 진행 중인 차감을 보존한다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const locked = e.locks.request(e.shared.mockStorageLock, () => gate)
  assert.equal(e.reflections.getWoolBalance(), 1)
  assert.equal(e.local.has(`${recordsKey}:user:a`), false)
  e.local.set(`${recordsKey}:user:a`, JSON.stringify({ ...reflection, paidQuestions: ['paid'] }))
  release()
  await locked
  await e.settled()
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.equal(e.local.has(recordsKey), false)
})

test('로그인 후 읽은 세션 일정은 탭을 닫고 다시 열어도 남는다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
  await e.settled()
  const reopened = environment(e.local, new Map())
  await reopened.boot()
  assert.deepEqual(plain(reopened.programs.readPrograms()), [program])
})

test('조회로 예약된 이전도 로그인 계정이 바뀌면 원본을 보관한다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const locked = e.locks.request(e.shared.mockStorageLock, () => gate)
  assert.equal(e.reflections.getWoolBalance(), 1)
  e.account('b')
  release()
  await locked
  await e.settled()
  assert.equal(e.reflections.getWoolBalance(), 0)
  assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
  assert.equal(e.local.has(`${recordsKey}:user:a`), false)
  assert.equal(e.local.has(`${recordsKey}:user:b`), false)
})

test('기존 자료 조회 직후 취소한 일정이 이전 작업으로 되살아나지 않는다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  e.programs.cancelProgramSchedule(program.id)
  await e.settled()
  const reopened = environment(e.local, new Map())
  await reopened.boot()
  const saved = reopened.programs.readPrograms()[0]
  assert.equal(saved.cancelled, true)
  assert.equal(saved.nextDate, null)
})

test('실제 회고 저장에서도 당일 제한을 지키고 다음 날 새 회고를 추가한다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  const result = e.load('src/features/drawing-result/resultMock.ts')
  const data = { drawing: { drawingId: 99, title: '새 회고' }, card: { todaysStory: '새 이야기' } }
  const options = () => ({
    preview: null,
    previewWallet: false,
    fail: false,
    signal: new AbortController().signal,
  })
  assert.equal((await result.saveDrawingResult(data, options())).status, 'daily-limit')
  assert.equal(e.reflections.getWoolBalance(), 1)
  e.time('2026-11-15T12:00:00+09:00')
  assert.equal((await result.saveDrawingResult(data, options())).status, 'saved')
  assert.equal((await result.saveDrawingResult(data, options())).status, 'already-saved')
  assert.equal(e.reflections.readReflections().records.length, 2)
  assert.equal(e.reflections.getWoolBalance(), 2)
  assert.equal(
    e.reflections.readReflections().records.some(({ drawingId }) => drawingId === 41),
    true,
  )
})

test('쓰기 잠금 API가 없는 환경에서도 소유자에게만 이전한다', async () => {
  const e = environment()
  e.navigator.locks = undefined
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  assert.equal(e.reflections.getWoolBalance(), 1)
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
  assert.equal(e.local.has(recordsKey), false)
  assert.equal(e.session.has(programsKey), false)
  e.account('b')
  assert.equal(e.reflections.getWoolBalance(), 0)
})

test('세션 저장소 접근이 막혀도 읽을 수 있는 회고는 유지하고 일정 원본을 보관한다', async () => {
  const e = environment()
  e.seed()
  e.local.set(ownerKey, 'moyang:user:a')
  await e.boot()
  e.account('a')
  e.local.set(`${recordsKey}:user:a`, JSON.stringify({ ...reflection, paidQuestions: ['paid'] }))
  e.denySessionReads(true)
  assert.equal(e.reflections.getWoolBalance(), 0)
  await e.settled()
  assert.equal(e.session.get(programsKey), JSON.stringify([program]))
  e.denySessionReads(false)
  assert.deepEqual(plain(e.programs.readPrograms()), [program])
  await e.settled()
  assert.equal(e.local.has(`${programsKey}:user:a`), true)
})
