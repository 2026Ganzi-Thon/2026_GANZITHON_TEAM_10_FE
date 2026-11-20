const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const storageKey = 'moyang:personal-programs:user:a'
const program = {
  id: 'saved-program',
  firstReflection: { id: 41, concern: { id: 'relationships', label: '대인관계' } },
  days: [1, 4],
  nextDate: '2026-11-16',
  completed: 1,
  cancelled: false,
}
const plain = (value) => JSON.parse(JSON.stringify(value))

function environment(saved) {
  const values = new Map([
    [storageKey, saved],
    ['moyang.accessToken', `test.${Buffer.from('{"sub":"a"}').toString('base64url')}.test`],
  ])
  const sessionValues = new Map()
  const navigator = {
    locks: {
      request(_key, options, callback) {
        return Promise.resolve().then(typeof options === 'function' ? options : callback)
      },
    },
  }
  const context = vm.createContext({
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
      get length() {
        return values.size
      },
      key: (index) => [...values.keys()][index] ?? null,
    },
    sessionStorage: {
      getItem: (key) => sessionValues.get(key) ?? null,
      setItem: (key, value) => sessionValues.set(key, String(value)),
      removeItem: (key) => sessionValues.delete(key),
    },
    navigator,
    window: { navigator, setTimeout: (callback) => setTimeout(callback, 0), clearTimeout },
    atob,
    TextDecoder,
    Uint8Array,
    AbortController,
    crypto: require('node:crypto').webcrypto,
  })
  const modules = new Map()
  function load(file) {
    if (!path.extname(file)) file += '.ts'
    if (modules.has(file)) return modules.get(file).exports
    const module = { exports: {} }
    modules.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
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
  return {
    values,
    sessionValues,
    programs: load(path.join(root, 'src/features/personal-program/programMock.ts')),
    schedule: load(path.join(root, 'src/features/personal-program/programSchedule.ts')),
  }
}

const drawingActivity = {
  programId: 'RELATION_FAMILY',
  round: 2,
  date: '2026-11-19',
  concern: { id: 'RELATION_FAMILY', label: '인간관계·가족' },
  topicId: 42,
  topic: '관계 속 나의 자리',
  description: '가까운 사람들과 함께 있을 때의 내 모습을 그려 보세요.',
}

test('다른 탭에서 같은 계정과 그림의 활동 회차를 읽는다', () => {
  const original = environment('[]')
  const nextTab = environment('[]')
  original.schedule.rememberDrawingActivity('moyang:user:a', 17, drawingActivity)
  for (const [key, value] of original.values) nextTab.values.set(key, value)

  assert.deepEqual(
    plain(nextTab.schedule.readDrawingActivity('moyang:user:a', 17)),
    drawingActivity,
  )
  assert.equal(nextTab.schedule.readDrawingActivity('moyang:user:a', 18), undefined)
  assert.equal(nextTab.schedule.readDrawingActivity('moyang:user:b', 17), undefined)
})

test('같은 탭에서는 기존 세션에 저장된 활동 회차도 읽는다', () => {
  const { schedule, sessionValues, values } = environment('[]')
  const key = JSON.stringify(['moyang:program-drawing', 'moyang:user:a', 17])
  values.set(key, 'malformed')
  sessionValues.set(key, JSON.stringify(drawingActivity))

  assert.deepEqual(plain(schedule.readDrawingActivity('moyang:user:a', 17)), drawingActivity)
})

for (const [name, damaged] of [
  ['누락된 회고', { ...program, firstReflection: null }],
  ['누락된 고민', { ...program, firstReflection: { id: 41 } }],
  ['잘못된 요일', { ...program, days: [7] }],
  ['비어 있는 활동 요일', { ...program, days: [] }],
  ['존재하지 않는 날짜', { ...program, nextDate: '2026-02-30' }],
  ['잘못된 진행률', { ...program, completed: -1 }],
  ['잘못된 취소 상태', { ...program, cancelled: 'false' }],
  ['빈 항목', null],
]) {
  test(`${name}: 오류를 알리고 일정 변경·취소로 원본을 덮어쓰지 않는다`, async () => {
    const saved = JSON.stringify([damaged])
    const e = environment(saved)
    assert.throws(() => e.programs.readPrograms(), /확인/)
    await assert.rejects(e.programs.cancelProgramSchedule(program.id), /확인/)
    await assert.rejects(
      e.programs.saveProgramSchedule({
        reflection: program.firstReflection,
        programId: program.id,
        days: [2, 5],
        fail: false,
        signal: new AbortController().signal,
      }),
      /확인/,
    )
    assert.equal(e.values.get(storageKey), saved)
  })
}

test('손상된 JSON도 비어 있는 일정으로 숨기지 않고 원본을 보존한다', () => {
  const e = environment('damaged-json')
  assert.throws(() => e.programs.readPrograms(), /확인/)
  assert.equal(e.values.get(storageKey), 'damaged-json')
})

test('정상 항목과 손상 항목이 섞여 있어도 일부만 저장하지 않는다', async () => {
  const saved = JSON.stringify([program, { ...program, id: 'damaged', days: ['1'] }])
  const e = environment(saved)
  assert.throws(() => e.programs.readPrograms(), /확인/)
  await assert.rejects(e.programs.cancelProgramSchedule(program.id), /확인/)
  assert.equal(e.values.get(storageKey), saved)
})

test('기존 5회 완료 일정은 3회로 정리하고 취소된 일정도 읽는다', () => {
  const completed = { ...program, completed: 5 }
  const cancelled = { ...program, id: 'cancelled', cancelled: true, days: [], nextDate: null }
  const e = environment(JSON.stringify([completed, cancelled]))
  assert.deepEqual(plain(e.programs.readPrograms()), [
    { ...completed, completed: 3, nextDate: null },
    cancelled,
  ])
})

test('빈 목록은 정상적으로 저장하고 복구된 자료는 다시 변경·취소할 수 있다', async () => {
  const e = environment('[]')
  assert.deepEqual(plain(e.programs.readPrograms()), [])
  await e.programs.saveProgramSchedule({
    reflection: program.firstReflection,
    days: [1, 4],
    fail: false,
    signal: new AbortController().signal,
  })
  assert.equal(e.programs.readPrograms().length, 1)
  e.values.set(storageKey, JSON.stringify([{ ...program, firstReflection: null }]))
  assert.throws(() => e.programs.readPrograms(), /확인/)
  e.values.set(storageKey, JSON.stringify([program]))
  await e.programs.saveProgramSchedule({
    reflection: program.firstReflection,
    programId: program.id,
    days: [2, 5],
    fail: false,
    signal: new AbortController().signal,
  })
  assert.deepEqual(plain(e.programs.readPrograms()[0].days), [2, 5])
  await e.programs.cancelProgramSchedule(program.id)
  assert.equal(e.programs.readPrograms()[0].cancelled, true)
})

test('이미 취소된 일정은 이전 자료에 다음 날짜가 남아 있어도 활동 일정을 표시하지 않는다', () => {
  for (const nextDate of ['2026-11-16', 'invalid-date', { date: '2026-11-16' }]) {
    const cancelled = { ...program, cancelled: true, nextDate }
    const saved = JSON.stringify([cancelled])
    const e = environment(saved)
    assert.deepEqual(plain(e.programs.readPrograms()), [{ ...cancelled, nextDate: null }])
    assert.equal(e.values.get(storageKey), saved)
  }
})
