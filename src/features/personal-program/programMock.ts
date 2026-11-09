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

const storageKey = 'moyang:personal-programs'
const scenarios = ['save-error', 'upcoming', 'today', 'missed', 'completed', 'home-list'] as const
type Scenario = (typeof scenarios)[number]
export type ProgramActivityHandoff = ProgramActivity & { mock?: Scenario }

export const exampleReflection: FirstReflection = {
  id: 0,
  concern: { id: 'relationships', label: '대인관계' },
}

export const getProgramScenario = (value: string | null) =>
  scenarios.find((scenario) => scenario === value)

const examplePrograms = (scenario?: Scenario): PersonalProgram[] => {
  if (!scenario || scenario === 'save-error') return []

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
        firstReflection: { id: index, concern },
        days: [getWeekday(nextDate)],
        nextDate,
        completed: index + 1,
        cancelled: false,
      }
    })
  }

  const nextDate =
    scenario === 'completed'
      ? null
      : addDays(today, { upcoming: 1, today: 0, missed: -3 }[scenario])
  return [
    {
      id: 'example-program',
      firstReflection: exampleReflection,
      days: nextDate ? [getWeekday(nextDate), getWeekday(addDays(nextDate, 2))] : [],
      nextDate,
      completed: scenario === 'completed' ? rounds.length : 1,
      cancelled: false,
    },
  ]
}

const keyFor = (scenario?: Scenario) => (scenario ? `${storageKey}:${scenario}` : storageKey)

export const readPrograms = (scenario?: Scenario): PersonalProgram[] => {
  try {
    const saved = sessionStorage.getItem(keyFor(scenario))
    const programs: unknown = saved ? JSON.parse(saved) : null
    return Array.isArray(programs) ? programs : examplePrograms(scenario)
  } catch {
    return examplePrograms(scenario)
  }
}

const storePrograms = (programs: PersonalProgram[], scenario?: Scenario) => {
  sessionStorage.setItem(keyFor(scenario), JSON.stringify(programs))
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
  await new Promise((resolve) => window.setTimeout(resolve, 350))
  signal.throwIfAborted()
  if (fail) throw new Error('일정 저장 실패')

  const programs = readPrograms(scenario)
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
  storePrograms([...programs.filter(({ id }) => id !== saved.id), saved], scenario)
}

export const cancelProgramSchedule = (id: string, scenario?: Scenario) => {
  storePrograms(
    readPrograms(scenario).map((program) =>
      program.id === id && program.completed < rounds.length
        ? { ...program, cancelled: true, nextDate: null }
        : program,
    ),
    scenario,
  )
}

export const completeProgramActivity = (activity: ProgramActivity, scenario?: Scenario) => {
  const programs = readPrograms(scenario)
  const program = programs.find(({ id }) => id === activity.programId)
  const today = getToday()
  if (
    !program ||
    activity.date > today ||
    getProgramActivity(program, activity.date)?.round !== activity.round
  ) {
    return
  }

  const completed = activity.round
  const nextDate = completed < rounds.length ? getNextActivityDate(program.days, today) : null

  storePrograms(
    programs.map((item) => (item.id === program.id ? { ...item, completed, nextDate } : item)),
    scenario,
  )
}
