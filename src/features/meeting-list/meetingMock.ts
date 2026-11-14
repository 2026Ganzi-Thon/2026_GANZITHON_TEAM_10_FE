export const meetingConcerns = [
  { id: 'STUDY_CAREER', label: '학업·진로·일' },
  { id: 'LOVE', label: '연애·이별' },
  { id: 'RELATION_FAMILY', label: '인간관계·가족' },
  { id: 'SELF_HEALTH', label: '나 자신·건강' },
  { id: 'DAILY_FUTURE', label: '일상·미래' },
  { id: 'MONEY', label: '경제·금전' },
] as const

export type MeetingConcern = (typeof meetingConcerns)[number]['id']

export const meetingCapacities = [2, 4, 6] as const

type MeetingInfo = {
  id: string
  title: string
  description: string
  concern: MeetingConcern
  participants: number
  capacity: (typeof meetingCapacities)[number]
  status: 'waiting' | 'in-progress' | 'cancelled'
  membership?: 'host' | 'participant'
  hasEntered?: boolean
}

export type LiveMeeting = MeetingInfo & { kind: 'live' }
export type ScheduledMeeting = MeetingInfo & {
  kind: 'scheduled'
  startAt: number
}
export type Meeting = LiveMeeting | ScheduledMeeting
export type PastMeeting = Pick<MeetingInfo, 'id' | 'title' | 'concern'> & {
  startAt: number
  endAt: number
}

export const pastConversationDuration = 24 * 60 * 60 * 1000

export type MeetingListData = { meetings: Meeting[]; pastMeetings: PastMeeting[] }

const day = 86_400_000
const now = Date.now()
const kstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now)
const atKst = (time: string, daysAhead: number) =>
  Date.parse(kstDate + 'T' + time + '+09:00') + daysAhead * day

const liveMeetings: LiveMeeting[] = [
  {
    id: '101',
    title: '지금 내 마음의 날씨는?',
    description: '오늘의 감정을 날씨로 표현해 주세요.',
    concern: 'SELF_HEALTH',
    kind: 'live',
    participants: 1,
    capacity: 4,
    status: 'waiting',
  },
  {
    id: '102',
    title: '요즘 나를 지탱해 주는 것',
    description: '나를 버티게 해주는 존재나 힘을 그려요.',
    concern: 'RELATION_FAMILY',
    kind: 'live',
    participants: 1,
    capacity: 2,
    status: 'waiting',
  },
  {
    id: '103',
    title: '요즘 나에게 가장 필요한 것은?',
    description: '내 마음에 가장 필요한 것을 자유롭게 표현해 주세요.',
    concern: 'SELF_HEALTH',
    kind: 'live',
    participants: 1,
    capacity: 6,
    status: 'waiting',
  },
]

const scheduledMeetings: ScheduledMeeting[] = [
  {
    id: '201',
    title: '나와 너 사이',
    description: '사람들과의 관계에서 겪은 고민과 경험을 각자의 그림과 함께 나눠요.',
    concern: 'RELATION_FAMILY',
    kind: 'scheduled',
    startAt: atKst('20:00:00', 2),
    participants: 2,
    capacity: 6,
    status: 'waiting',
    membership: 'host',
  },
  {
    id: '202',
    title: '관계가 어려웠던 날',
    description: '누군가와의 관계에서 마음이 복잡했던 순간을 그림과 함께 이야기해요.',
    concern: 'RELATION_FAMILY',
    kind: 'scheduled',
    startAt: atKst('09:00:00', 5),
    participants: 1,
    capacity: 6,
    status: 'waiting',
    membership: 'participant',
  },
]

const meetings: Meeting[] = [...liveMeetings, ...scheduledMeetings]

const extraMeetings: Meeting[] = [
  {
    ...liveMeetings[1],
    id: '109',
    title: '친구에게 전하고 싶은 말',
    description: '친구에게 전하지 못한 말을 그림으로 표현해 봐요.',
  },
  {
    ...liveMeetings[2],
    id: '110',
    title: '나를 편안하게 해 주는 것',
    description: '하루 중 마음이 편해지는 순간을 그려 봐요.',
  },
  {
    ...scheduledMeetings[0],
    id: '208',
    title: '우리가 함께한 시간',
    description: '가까운 사람과 함께한 장면을 그려 보고 이야기를 나눠요.',
    membership: undefined,
    startAt: atKst('18:00:00', 6),
  },
  {
    ...scheduledMeetings[1],
    id: '209',
    title: '가족에게 전하는 마음',
    description: '가족에게 전하고 싶은 마음을 그림으로 표현해 봐요.',
    membership: undefined,
    startAt: atKst('14:00:00', 7),
  },
  {
    ...scheduledMeetings[0],
    id: '210',
    title: '나만의 쉼터',
    description: '잠시 쉬어 갈 수 있는 나만의 공간을 그려 봐요.',
    concern: 'SELF_HEALTH',
    membership: undefined,
    startAt: atKst('20:00:00', 8),
  },
]

const meetingStates: Meeting[] = [
  { ...liveMeetings[0], id: '104', participants: 4 },
  { ...liveMeetings[1], id: '105', participants: 2, status: 'in-progress' },
  {
    ...liveMeetings[2],
    id: '106',
    participants: 2,
    status: 'in-progress',
    membership: 'participant',
    hasEntered: true,
  },
  { ...liveMeetings[0], id: '107', participants: 4, membership: 'host', hasEntered: true },
  { ...liveMeetings[0], id: '108', status: 'cancelled' },
  { ...scheduledMeetings[0], id: '203', participants: 6, membership: undefined },
  {
    ...scheduledMeetings[0],
    id: '204',
    startAt: now - 20 * 60 * 1000,
    status: 'in-progress',
    membership: undefined,
  },
  {
    ...scheduledMeetings[1],
    id: '205',
    startAt: now - 20 * 60 * 1000,
    participants: 2,
    status: 'in-progress',
    hasEntered: true,
  },
  { ...scheduledMeetings[0], id: '206', status: 'cancelled' },
  {
    ...scheduledMeetings[1],
    id: '207',
    startAt: now - 20 * 60 * 1000,
    participants: 2,
    status: 'in-progress',
  },
]

const pastMeetings: PastMeeting[] = [
  {
    id: '301',
    title: '관계가 어려웠던 날',
    concern: 'RELATION_FAMILY',
    startAt: now - 3 * 60 * 60 * 1000,
    endAt: now - 2 * 60 * 60 * 1000,
  },
  {
    id: '302',
    title: '지금 내 마음의 날씨는?',
    concern: 'SELF_HEALTH',
    startAt: atKst('19:00:00', -5),
    endAt: atKst('20:00:00', -5),
  },
]

export const getMockMeeting = (meetingId: string | undefined) =>
  meetings.find(({ id }) => id === meetingId) ??
  (import.meta.env.DEV
    ? [...meetingStates, ...extraMeetings].find(({ id }) => id === meetingId)
    : undefined)

export const loadMeetings = async ({
  empty,
  fail,
  states = false,
  many = false,
  expiringPast = false,
  delay = 300,
}: {
  empty: boolean
  fail: boolean
  states?: boolean
  many?: boolean
  expiringPast?: boolean
  delay?: number
}): Promise<MeetingListData> => {
  await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
  if (fail) throw new Error('Mock meeting list unavailable')
  if (empty) return { meetings: [], pastMeetings: [] }
  const endAt = Date.now() - pastConversationDuration + 5000
  return {
    meetings: states ? meetingStates : many ? [...meetings, ...extraMeetings] : meetings,
    pastMeetings: expiringPast
      ? [{ ...pastMeetings[0], startAt: endAt - 60 * 60 * 1000, endAt }]
      : pastMeetings,
  }
}
