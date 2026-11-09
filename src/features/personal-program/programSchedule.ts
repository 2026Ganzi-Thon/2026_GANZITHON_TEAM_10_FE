export const weekdays = ['일', '월', '화', '수', '목', '금', '토'] as const
export const weekdayOrder = [1, 2, 3, 4, 5, 6, 0]

export const rounds = [
  {
    name: '첫 번째 모양',
    label: '나의 감정 살펴보기',
    topic: '내 마음속 방',
    description: '지금 느끼는 마음을 하나의 공간으로 표현해 보세요.',
  },
  {
    name: '두 번째 모양',
    label: '관계 속 나의 모습',
    topic: '관계 속 나의 자리',
    description: '가까운 사람들과 함께 있을 때의 내 모습을 그려 보세요.',
  },
  {
    name: '세 번째 모양',
    label: '나에게 편안한 관계',
    topic: '편안함을 느끼는 순간',
    description: '누군가와 함께 있으면서 마음이 편안했던 순간을 그려 보세요.',
  },
  {
    name: '네 번째 모양',
    label: '나에게 필요한 것',
    topic: '마음을 위한 작은 부탁',
    description: '관계 속에서 지금 내게 필요한 것을 그림으로 표현해 보세요.',
  },
  {
    name: '다섯 번째 모양',
    label: '앞으로의 나',
    topic: '앞으로의 나에게',
    description: '앞으로 사람들과 어떤 관계를 만들어 가고 싶은지 그려 보세요.',
  },
] as const

export type ProgramConcern = { id: string; label: string }
export type FirstReflection = { id: number; concern: ProgramConcern }
export type ProgramStartReflection = FirstReflection & { title: string; story: string }

export type PersonalProgram = {
  id: string
  firstReflection: FirstReflection
  days: number[]
  nextDate: string | null
  completed: number
  cancelled: boolean
}

export type ProgramActivity = {
  programId: string
  round: number
  date: string
  concern: ProgramConcern
  topic: string
  description: string
}

const kstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' })
const activityDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  timeZone: 'UTC',
})

const parseDate = (date: string) => new Date(`${date}T00:00:00Z`)

export const getToday = () => kstDate.format(new Date())

export const addDays = (date: string, days: number) => {
  const result = parseDate(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

export const getWeekday = (date: string) => parseDate(date).getUTCDay()

export const formatActivityDate = (date: string) => activityDate.format(parseDate(date))

export const formatWeekdays = (days: number[]) =>
  weekdayOrder
    .filter((day) => days.includes(day))
    .map((day) => weekdays[day])
    .join(' · ')

export const getNextActivityDate = (days: number[], date: string, includeToday = false) => {
  const weekday = getWeekday(date)
  const firstOffset = includeToday ? 0 : 1
  for (let offset = firstOffset; offset < firstOffset + 7; offset += 1) {
    if (days.includes((weekday + offset) % 7)) return addDays(date, offset)
  }
  return null
}

export const getActivitySchedule = (program: PersonalProgram, today: string) => {
  const rescheduled = program.nextDate !== null && program.nextDate < today
  return {
    rescheduled,
    date: rescheduled ? getNextActivityDate(program.days, today, true) : program.nextDate,
  }
}

export const getProgramForReflection = (programs: PersonalProgram[], reflection: FirstReflection) =>
  programs.find(
    (program) =>
      program.firstReflection.concern.id === reflection.concern.id &&
      !program.cancelled &&
      program.completed < rounds.length,
  ) ??
  programs.find(
    (program) =>
      program.firstReflection.concern.id === reflection.concern.id &&
      program.firstReflection.id === reflection.id,
  )

export const getProgramActivity = (program: PersonalProgram, today: string) => {
  const { date } = getActivitySchedule(program, today)
  const round = rounds[program.completed]
  if (program.cancelled || date !== today || !round) return null

  return {
    programId: program.id,
    round: program.completed + 1,
    date,
    concern: program.firstReflection.concern,
    topic: round.topic,
    description: round.description,
  }
}
