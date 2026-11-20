import { isRecordId } from '@/lib/mock-reflections'
import {
  getMockStorageKey,
  migrateLegacyMockKey,
  MockStorageUnavailableError,
  readMockStorage,
  withMockStorageLock,
  writeMockStorage,
} from '@/lib/mock-storage'
import {
  addDays,
  getActivitySchedule,
  getNextActivityDate,
  getProgramActivity,
  getProgramForReflection,
  getToday,
  getWeekday,
  rounds,
} from './programSchedule'
import type { FirstReflection, PersonalProgram, ProgramActivity } from './programSchedule'

const programStorageKey = 'moyang:personal-programs'
const scenarios = [
  'setup',
  'save-error',
  'upcoming',
  'today',
  'final-round',
  'missed',
  'completed',
  'home-list',
] as const
type Scenario = (typeof scenarios)[number]
export type ProgramActivityHandoff = ProgramActivity & { mock?: Scenario }

export const exampleReflection: FirstReflection = {
  recordId: 0,
  concern: { id: 'relationships', label: '대인관계' },
}

export const getProgramScenario = (value: string | null) =>
  scenarios.find((scenario) => scenario === value)

const examplePrograms = (scenario?: Scenario): PersonalProgram[] => {
  if (!scenario || scenario === 'setup' || scenario === 'save-error') return []

  const today = getToday()
  if (scenario === 'home-list') {
    const concerns = [
      exampleReflection.concern,
      { id: 'self-esteem', label: '자존감' },
      { id: 'career', label: '진로' },
    ]

    return concerns.map((concern, index) => {
      const nextDate = addDays(today, index * 2)
      return {
        id: `example-${concern.id}`,
        firstReflection: { recordId: index, concern },
        days: [getWeekday(nextDate)],
        nextDate,
        completed: Math.min(index + 1, rounds.length - 1),
        cancelled: false,
      }
    })
  }

  const nextDate =
    scenario === 'completed'
      ? null
      : addDays(today, { upcoming: 1, today: 0, 'final-round': 0, missed: -3 }[scenario])
  const completed = scenario === 'completed' ? rounds.length : scenario === 'final-round' ? 2 : 1
  return [
    {
      id: 'example-program',
      firstReflection: exampleReflection,
      days: nextDate ? [getWeekday(nextDate), getWeekday(addDays(nextDate, 2))] : [],
      nextDate,
      completed,
      cancelled: false,
    },
  ]
}

const unscopedKeyFor = (scenario?: Scenario) =>
  scenario ? `${programStorageKey}:${scenario}` : programStorageKey
export const getProgramStorageKey = (scenario?: Scenario) =>
  getMockStorageKey(unscopedKeyFor(scenario))

const isStoredDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const parsePrograms = (saved: string): PersonalProgram[] => {
  let programs: PersonalProgram[] | null
  try {
    programs = JSON.parse(saved) as PersonalProgram[] | null
  } catch {
    throw new MockStorageUnavailableError()
  }
  if (
    !Array.isArray(programs) ||
    programs.some(
      (program) =>
        !program ||
        typeof program.id !== 'string' ||
        !program.id.length ||
        !program.firstReflection ||
        !isRecordId(program.firstReflection.recordId ?? program.firstReflection.id) ||
        typeof program.firstReflection.concern?.id !== 'string' ||
        !program.firstReflection.concern.id.length ||
        typeof program.firstReflection.concern.label !== 'string' ||
        !program.firstReflection.concern.label.length ||
        !Array.isArray(program.days) ||
        program.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
        !Number.isInteger(program.completed) ||
        program.completed < 0 ||
        typeof program.cancelled !== 'boolean' ||
        (program.completed < rounds.length &&
          !program.cancelled &&
          (!program.days.length || !isStoredDate(program.nextDate))),
    )
  ) {
    throw new MockStorageUnavailableError()
  }
  return programs.map((program) =>
    program.completed >= rounds.length || program.cancelled
      ? { ...program, completed: Math.min(program.completed, rounds.length), nextDate: null }
      : program,
  )
}

export const migrateLegacyPrograms = (accountSuffix: string) => {
  for (const scenario of [undefined, ...scenarios]) {
    migrateLegacyMockKey(
      unscopedKeyFor(scenario),
      accountSuffix,
      parsePrograms,
      (current, legacy) => {
        const programs = new Map(legacy.map((program) => [program.id, program]))
        for (const program of current) {
          const previous = programs.get(program.id)
          if (!previous) {
            programs.set(program.id, program)
            continue
          }
          const completed = Math.max(program.completed, previous.completed)
          const cancelled = program.cancelled || previous.cancelled
          let nextDate = program.nextDate
          if (cancelled || completed >= rounds.length) nextDate = null
          else if (
            completed > program.completed &&
            previous.nextDate &&
            nextDate &&
            previous.nextDate > nextDate
          ) {
            nextDate = getNextActivityDate(program.days, previous.nextDate, true)
          }
          programs.set(program.id, { ...program, completed, cancelled, nextDate })
        }
        return [...programs.values()]
      },
    )
  }
}

const readProgramStore = (key: string, scenario?: Scenario, forWrite = false) =>
  readMockStorage(key, parsePrograms, forWrite) ?? examplePrograms(scenario)

export const readPrograms = (scenario?: Scenario): PersonalProgram[] =>
  readProgramStore(getProgramStorageKey(scenario), scenario)

const assertProgramAccount = (key: string, scenario?: Scenario) => {
  if (key !== getProgramStorageKey(scenario)) throw new Error('로그인 정보가 변경됐어요')
}

const storePrograms = (key: string, programs: PersonalProgram[], scenario?: Scenario) => {
  assertProgramAccount(key, scenario)
  writeMockStorage(key, programs)
  try {
    sessionStorage.removeItem(key)
  } catch {
    return
  }
}

export const saveProgramSchedule = async ({
  reflection,
  programId,
  days,
  fail,
  signal,
  scenario,
}: {
  reflection: FirstReflection
  programId?: string
  days: number[]
  fail: boolean
  signal: AbortSignal
  scenario?: Scenario
}) => {
  const accountKey = getProgramStorageKey(scenario)
  await new Promise((resolve) => window.setTimeout(resolve, 350))
  signal.throwIfAborted()
  assertProgramAccount(accountKey, scenario)
  if (fail) throw new Error('일정 저장 실패')

  await withMockStorageLock(
    unscopedKeyFor(scenario),
    () => {
      assertProgramAccount(accountKey, scenario)
      const programs = readProgramStore(accountKey, scenario, true)
      const program = programId
        ? programs.find(({ id }) => id === programId)
        : getProgramForReflection(programs, reflection)
      if (!programId && program) return
      if (programId && (!program || program.cancelled || program.completed >= rounds.length)) {
        throw new Error('변경할 일정을 찾을 수 없어요')
      }

      const today = getToday()
      const isDueToday = program && getActivitySchedule(program, today).date === today
      const nextDate = getNextActivityDate(days, today, isDueToday)
      if (!nextDate) throw new Error('활동할 요일을 선택해 주세요')

      const saved: PersonalProgram = program
        ? { ...program, days, nextDate }
        : {
            id: crypto.randomUUID(),
            firstReflection: reflection,
            days,
            nextDate,
            completed: 1,
            cancelled: false,
          }
      storePrograms(accountKey, [...programs.filter(({ id }) => id !== saved.id), saved], scenario)
    },
    signal,
  )
}

export const cancelProgramSchedule = async (
  id: string,
  scenario?: Scenario,
  signal?: AbortSignal,
) => {
  const accountKey = getProgramStorageKey(scenario)
  return withMockStorageLock(
    unscopedKeyFor(scenario),
    () => {
      assertProgramAccount(accountKey, scenario)
      const programs = readProgramStore(accountKey, scenario, true)
      const program = programs.find((item) => item.id === id)
      if (!program || program.cancelled || program.completed >= rounds.length) return
      storePrograms(
        accountKey,
        programs.map((item) =>
          item.id === id ? { ...item, cancelled: true, nextDate: null } : item,
        ),
        scenario,
      )
    },
    signal,
  )
}

const isScheduledActivity = (program: PersonalProgram, activity: ProgramActivity, today: string) =>
  activity.date === today && getProgramActivity(program, today)?.round === activity.round

export const canCompleteProgramActivity = (
  activity: ProgramActivity,
  scenario?: Scenario,
  accountKey = getProgramStorageKey(scenario),
) => {
  assertProgramAccount(accountKey, scenario)
  return readProgramStore(accountKey, scenario, true).some(
    (program) =>
      program.id === activity.programId && isScheduledActivity(program, activity, getToday()),
  )
}

export const applyProgramActivityCompletion = (
  activity: ProgramActivity,
  scenario?: Scenario,
  completionDate = getToday(),
  accountKey = getProgramStorageKey(scenario),
) => {
  assertProgramAccount(accountKey, scenario)
  const programs = readProgramStore(accountKey, scenario, true)
  const program = programs.find(({ id }) => id === activity.programId)
  if (!program) return false
  if (program.completed >= activity.round) return true
  if (!isScheduledActivity(program, activity, completionDate)) return false

  const completed = activity.round
  const nextDate =
    completed < rounds.length ? getNextActivityDate(program.days, completionDate) : null

  storePrograms(
    accountKey,
    programs.map((item) => (item.id === program.id ? { ...item, completed, nextDate } : item)),
    scenario,
  )
  return true
}

export const completeProgramActivity = async (
  activity: ProgramActivity,
  scenario?: Scenario,
  signal?: AbortSignal,
) => {
  const accountKey = getProgramStorageKey(scenario)
  return withMockStorageLock(
    unscopedKeyFor(scenario),
    () => applyProgramActivityCompletion(activity, scenario, undefined, accountKey),
    signal,
  )
}
