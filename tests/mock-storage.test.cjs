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
const backupPrefix = 'moyang:mock-storage-backup:session:'
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
  let denySessionAccess = false
  let storageLimit = Infinity
  let now = Date.parse(`${today}T12:00:00+09:00`)
  let queue = Promise.resolve()
  const storage = (values) => ({
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem(key) {
      if (denySessionReads && values === session) throw new Error('session unavailable')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (failWrites) throw new Error('quota')
      if (values === local) {
        const size = [...values]
          .filter(([existingKey]) => existingKey !== key)
          .reduce((total, [key, value]) => total + key.length + value.length, 0)
        if (size + key.length + String(value).length > storageLimit) throw new Error('quota')
      }
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
  const sessionStore = storage(session)
  const context = vm.createContext({
    localStorage: storage(local),
    navigator,
    window: { navigator, setTimeout: (callback) => setTimeout(callback, 0), clearTimeout },
    atob,
    TextDecoder,
    Uint8Array,
    AbortController,
    Date: Clock,
    crypto: require('node:crypto').webcrypto,
  })
  Object.defineProperty(context, 'sessionStorage', {
    get() {
      if (denySessionAccess) throw new Error('session access denied')
      return sessionStore
    },
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
    limit: (value) => (storageLimit = value),
    denySessionReads: (value) => (denySessionReads = value),
    denySessionAccess: (value) => (denySessionAccess = value),
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
  assert.deepEqual(
    [...e.local, ...e.session].filter(([key]) => !key.startsWith(backupPrefix)),
    before,
  )
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

test('소유자 불명 세션 일정은 비로그인 실행 후 탭을 닫아도 백업이 남는다', async () => {
  const e = environment()
  const saved = JSON.stringify([program])
  e.session.set(programsKey, saved)
  await e.boot()
  const reopened = environment(e.local, new Map())
  await reopened.boot()
  reopened.account('a')
  assert.deepEqual(plain(reopened.programs.readPrograms()), [])
  const backup = [...reopened.local].find(
    ([key, value]) => key.startsWith(backupPrefix) && value === saved,
  )
  assert.ok(backup)
  assert.equal(reopened.local.has(`${programsKey}:user:a`), false)
  assert.equal(reopened.local.has(`${programsKey}:guest`), false)
  assert.equal(reopened.local.has(ownerKey), false)
})

test('이미 guest에 옮겨진 세션 원본도 탭을 닫기 전에 별도로 보관한다', async () => {
  for (const owner of [null, 'moyang', 'moyang:user:a']) {
    const e = environment()
    const saved = JSON.stringify(reflection)
    if (owner) e.local.set(ownerKey, owner)
    e.session.set(`${recordsKey}:guest`, saved)
    await e.boot()
    const reopened = environment(e.local, new Map())
    await reopened.boot()
    reopened.account('a')
    assert.deepEqual(plain(reopened.reflections.readReflections().records), [])
    assert.ok(
      [...reopened.local].some(([key, value]) => key.startsWith(backupPrefix) && value === saved),
    )
    assert.equal(reopened.local.has(`${recordsKey}:user:a`), false)
  }
})

test('같은 세션 원본은 중복 백업하지 않고 바뀐 내용은 별도 보관한다', async () => {
  const e = environment()
  const original = JSON.stringify([program])
  e.session.set(programsKey, original)
  await e.boot()
  await e.boot()
  assert.equal([...e.local.keys()].filter((key) => key.startsWith(backupPrefix)).length, 1)
  const changed = JSON.stringify([{ ...program, days: [2, 5], nextDate: '2026-11-17' }])
  e.session.set(programsKey, changed)
  await e.boot()
  const backups = [...e.local].filter(([key]) => key.startsWith(backupPrefix))
  assert.equal(backups.length, 2)
  assert.ok(backups.some(([, value]) => value === original))
  assert.ok(backups.some(([, value]) => value === changed))
  assert.equal(e.session.get(programsKey), changed)
})

test('여러 탭의 서로 다른 세션 원본을 덮어쓰거나 합치지 않는다', async () => {
  const first = environment()
  const second = environment(first.local, new Map(), first.locks)
  const firstSaved = JSON.stringify([program])
  const secondSaved = JSON.stringify([{ ...program, id: 'another-session-program' }])
  first.session.set(programsKey, firstSaved)
  second.session.set(programsKey, secondSaved)
  await Promise.all([first.boot(), second.boot()])
  const backups = [...first.local].filter(([key]) => key.startsWith(backupPrefix))
  assert.equal(backups.length, 2)
  assert.ok(backups.some(([, value]) => value === firstSaved))
  assert.ok(backups.some(([, value]) => value === secondSaved))
})

test('백업이 저장 공간 부족으로 실패하면 원본을 남기고 다음 실행에서 다시 보관한다', async () => {
  const e = environment()
  const saved = JSON.stringify([program])
  e.session.set(programsKey, saved)
  e.fail(true)
  await e.boot()
  assert.equal(e.session.get(programsKey), saved)
  assert.equal(
    [...e.local.keys()].some((key) => key.startsWith(backupPrefix)),
    false,
  )
  e.fail(false)
  await e.boot()
  assert.ok([...e.local].some(([key, value]) => key.startsWith(backupPrefix) && value === saved))
  assert.equal(e.session.get(programsKey), saved)
})

test('백업할 때 기존 로컬 자료와 손상된 세션 원본도 그대로 유지한다', async () => {
  const e = environment()
  const localSaved = JSON.stringify([program])
  e.local.set(programsKey, localSaved)
  e.session.set(programsKey, 'damaged-session-json')
  await e.boot()
  assert.equal(e.local.get(programsKey), localSaved)
  assert.equal(e.session.get(programsKey), 'damaged-session-json')
  assert.ok(
    [...e.local].some(
      ([key, value]) => key.startsWith(backupPrefix) && value === 'damaged-session-json',
    ),
  )
})

test('일반 회고와 미리보기 일정도 각각 원본 형식으로 백업한다', async () => {
  const e = environment()
  e.session.set(recordsKey, JSON.stringify(reflection))
  e.session.set(`${recordsKey}:wool-preview`, JSON.stringify([record]))
  e.session.set(`${programsKey}:today`, JSON.stringify([program]))
  await e.boot()
  const backups = [...e.local].filter(([key]) => key.startsWith(backupPrefix))
  assert.equal(backups.length, 3)
  for (const [sourceKey, saved] of e.session) {
    const prefix = `${backupPrefix}${encodeURIComponent(sourceKey)}:`
    assert.ok(backups.some(([key, value]) => key.startsWith(prefix) && value === saved))
  }
})

test('보관용 백업은 소유 계정 표식이 나중에 바뀌어도 자동 복구에 사용하지 않는다', async () => {
  const e = environment()
  const saved = JSON.stringify([program])
  e.session.set(programsKey, saved)
  await e.boot()
  const reopened = environment(e.local, new Map())
  reopened.account('a')
  reopened.local.set(ownerKey, 'moyang:user:a')
  await reopened.boot()
  assert.deepEqual(plain(reopened.programs.readPrograms()), [])
  assert.ok(
    [...reopened.local].some(([key, value]) => key.startsWith(backupPrefix) && value === saved),
  )
  assert.equal(reopened.local.has(`${programsKey}:user:a`), false)
})

test('공간이 부족하면 guest 백업보다 확인된 계정 일정을 먼저 이전한다', async () => {
  const e = environment()
  e.account('a')
  e.local.set(ownerKey, 'moyang:user:a')
  e.session.set(programsKey, JSON.stringify([program]))
  e.session.set(
    `${recordsKey}:guest`,
    JSON.stringify({
      ...reflection,
      records: [{ ...record, card: { todaysStory: 'x'.repeat(1750) } }],
    }),
  )
  e.limit(2200)
  await e.boot()
  assert.equal(e.local.has(`${programsKey}:user:a`), true)
  const reopened = environment(e.local, new Map())
  await reopened.boot()
  assert.deepEqual(plain(reopened.programs.readPrograms()), [program])
})

test('로그인 후 회고를 먼저 읽어도 다른 영역의 계정 일정까지 백업보다 먼저 이전한다', async () => {
  const e = environment()
  e.local.set(ownerKey, 'moyang:user:a')
  e.session.set(programsKey, JSON.stringify([program]))
  e.session.set(recordsKey, JSON.stringify(reflection))
  await e.boot()
  e.account('a')
  e.session.set(
    `${recordsKey}:guest`,
    JSON.stringify({
      ...reflection,
      records: [{ ...record, card: { todaysStory: 'x'.repeat(1750) } }],
    }),
  )
  e.limit(2400)
  assert.equal(e.reflections.getWoolBalance(), 1)
  await e.settled()
  assert.equal(e.local.has(`${programsKey}:user:a`), true)
  assert.equal(e.local.has(`${recordsKey}:user:a`), true)
  const reopened = environment(e.local, new Map())
  await reopened.boot()
  assert.deepEqual(plain(reopened.programs.readPrograms()), [program])
})

for (const block of ['denySessionReads', 'denySessionAccess']) {
  test(`${block}: 비로그인 실행 후 로그인해도 로컬 원본의 회고·일정·당일 제한을 읽는다`, async () => {
    const e = environment()
    e.local.set(recordsKey, JSON.stringify(reflection))
    e.local.set(programsKey, JSON.stringify([program]))
    e.local.set(ownerKey, 'moyang:user:a')
    e[block](true)
    await e.boot()
    assert.deepEqual(plain(e.reflections.readReflections().records), [])
    e.account('a')
    assert.deepEqual(plain(e.reflections.readReflections().records), [record])
    assert.deepEqual(plain(e.programs.readPrograms()), [program])
    const result = e.load('src/features/drawing-result/resultMock.ts')
    assert.equal(result.getReflectionSaveStatus(e.reflections.readReflections(), 99), 'daily-limit')
    assert.equal(e.reflections.getWoolBalance(), 1)
    await e.settled()
    const reloaded = environment(e.local, new Map())
    reloaded[block](true)
    await reloaded.boot()
    assert.deepEqual(plain(reloaded.reflections.readReflections().records), [record])
    assert.deepEqual(plain(reloaded.programs.readPrograms()), [program])
    reloaded.account('b')
    assert.deepEqual(plain(reloaded.reflections.readReflections().records), [])
    assert.deepEqual(plain(reloaded.programs.readPrograms()), [])
    assert.equal(reloaded.local.has(`${recordsKey}:guest`), false)
  })

  test(`${block}: 로그인한 채 실행해도 로컬 원본과 기존 계정 자료를 합쳐 보존한다`, async () => {
    const e = environment()
    e.account('a')
    e.local.set(ownerKey, 'moyang:user:a')
    e.local.set(recordsKey, JSON.stringify(reflection))
    e.local.set(programsKey, JSON.stringify([program]))
    e.local.set(
      `${recordsKey}:user:a`,
      JSON.stringify({
        records: [{ ...record, drawingId: 42, recordDate: '2026-11-13' }],
        completedDrawingIds: [42],
        paidQuestions: ['paid'],
      }),
    )
    const updated = { ...program, days: [2, 5], nextDate: '2026-11-17' }
    e.local.set(`${programsKey}:user:a`, JSON.stringify([updated]))
    e[block](true)
    await e.boot()
    assert.equal(e.reflections.readReflections().records.length, 2)
    assert.equal(e.reflections.getWoolBalance(), 1)
    assert.deepEqual(plain(e.programs.readPrograms()), [updated])
    assert.equal(e.local.has(recordsKey), false)
    assert.equal(e.local.has(programsKey), false)
  })

  test(`${block}: 접근할 수 없는 세션 원본은 지우지 않고 접근 복구 후 이전한다`, async () => {
    const e = environment()
    e.local.set(ownerKey, 'moyang:user:a')
    e.session.set(recordsKey, JSON.stringify(reflection))
    e.session.set(programsKey, JSON.stringify([program]))
    e[block](true)
    await e.boot()
    e.account('a')
    assert.deepEqual(plain(e.reflections.readReflections().records), [])
    assert.deepEqual(plain(e.programs.readPrograms()), [])
    assert.equal(e.session.get(recordsKey), JSON.stringify(reflection))
    assert.equal(e.session.get(programsKey), JSON.stringify([program]))
    assert.equal(e.local.has(`${recordsKey}:user:a`), false)
    assert.equal(e.local.has(`${programsKey}:user:a`), false)
    e[block](false)
    assert.equal(e.reflections.getWoolBalance(), 1)
    assert.deepEqual(plain(e.programs.readPrograms()), [program])
    await e.settled()
    assert.equal(e.session.has(recordsKey), false)
    assert.equal(e.session.has(programsKey), false)
  })

  test(`${block}: 소유자 불명 로컬 자료는 차단 환경에서도 새 계정에 붙이지 않는다`, async () => {
    const e = environment()
    e.local.set(recordsKey, JSON.stringify(reflection))
    e.local.set(programsKey, JSON.stringify([program]))
    e[block](true)
    await e.boot()
    e.account('a')
    assert.equal(e.reflections.getWoolBalance(), 0)
    assert.deepEqual(plain(e.programs.readPrograms()), [])
    assert.equal(e.local.get(recordsKey), JSON.stringify(reflection))
    assert.equal(e.local.get(programsKey), JSON.stringify([program]))
    assert.equal(e.local.has(ownerKey), false)
  })

  test(`${block}: 복원한 회고의 중복 저장·차감과 일정 변경·취소를 이어서 처리한다`, async () => {
    const e = environment()
    e.local.set(recordsKey, JSON.stringify(reflection))
    e.local.set(programsKey, JSON.stringify([program]))
    e.local.set(ownerKey, 'moyang:user:a')
    e[block](true)
    await e.boot()
    e.account('a')
    const result = e.load('src/features/drawing-result/resultMock.ts')
    const options = () => ({
      preview: null,
      previewWallet: false,
      fail: false,
      signal: new AbortController().signal,
    })
    const existing = {
      drawing: { drawingId: 41, title: '기존 회고' },
      card: { todaysStory: '이야기' },
    }
    assert.equal((await result.saveDrawingResult(existing, options())).status, 'already-saved')
    const another = { ...existing, drawing: { drawingId: 99, title: '새 회고' } }
    assert.equal((await result.saveDrawingResult(another, options())).status, 'daily-limit')
    await e.reflections.spendWoolForQuestion('paid-after-login', new AbortController().signal)
    assert.equal(e.reflections.getWoolBalance(), 0)
    await e.programs.saveProgramSchedule({
      reflection: program.firstReflection,
      programId: program.id,
      days: [2, 5],
      fail: false,
      signal: new AbortController().signal,
    })
    assert.deepEqual(plain(e.programs.readPrograms()[0].days), [2, 5])
    e.programs.cancelProgramSchedule(program.id)
    assert.equal(e.programs.readPrograms()[0].cancelled, true)
    await e.settled()
    assert.equal(e.programs.readPrograms()[0].cancelled, true)
  })
}
