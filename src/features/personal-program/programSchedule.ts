import { getMockRecordId } from '@/lib/mock-reflections'
import type { RecordId } from '@/lib/mock-reflections'

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
] as const

const concernRounds = {
  STUDY_CAREER: [
    {
      label: '지금의 내 마음 살펴보기',
      topic: '엉켜버린 마음의 실타래',
      description: '요즘 나를 답답하게 만드는 감정들을 서로 얽힌 실과 매듭의 모습으로 표현하기',
    },
    {
      label: '나를 힘들게 하는 것들',
      topic: '내 어깨 위의 짐',
      description: '학업과 진로에서 느끼는 부담과 스트레스를 크고 작은 짐의 모습으로 표현하기',
    },
    {
      label: '나만의 여유 찾아가기',
      topic: '마음에 작은 창문 만들기',
      description: '답답한 일상 속에서 나에게 필요한 휴식과 여유를 창문 너머의 풍경으로 표현하기',
    },
  ],
  DAILY_FUTURE: [
    {
      label: '지금의 내 마음 살펴보기',
      topic: '마음의 배터리',
      description: '요즘 나의 에너지와 감정 상태를 색과 모양으로 표현하기',
    },
    {
      label: '나를 불안하게 하는 것들',
      topic: '마음속 걱정 구름',
      description: '일상과 미래에 대한 걱정을 구름의 형태로 자유롭게 그려보기',
    },
    {
      label: '나에게 힘이 되는 순간',
      topic: '나만의 작은 쉼터',
      description: '지친 마음이 편안해지는 순간이나 공간을 그림으로 표현하기',
    },
  ],
}

export const getProgramRounds = (concernId?: string) => {
  if (concernId !== 'STUDY_CAREER' && concernId !== 'DAILY_FUTURE') return rounds
  return rounds.map((round, index) => ({ ...round, ...concernRounds[concernId][index] }))
}

export type ProgramConcern = { id: string; label: string }
export type FirstReflection = {
  concern: ProgramConcern
  title?: string
  story?: string
} & ({ recordId: RecordId; id?: never } | { recordId?: never; id: number })

export const getFirstReflectionRecordId = (reflection: FirstReflection) =>
  reflection.recordId ?? getMockRecordId(reflection.id)

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
      getFirstReflectionRecordId(program.firstReflection) ===
        getFirstReflectionRecordId(reflection),
  )

export const getProgramActivity = (program: PersonalProgram, today: string) => {
  const { date } = getActivitySchedule(program, today)
  const round = getProgramRounds(program.firstReflection.concern.id)[program.completed]
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
