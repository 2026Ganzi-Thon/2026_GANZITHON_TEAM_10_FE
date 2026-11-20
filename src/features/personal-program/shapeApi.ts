import { moyangRequest } from '@/lib/moyang-api'

export const weekdayCodes = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
type Weekday = (typeof weekdayCodes)[number]

export type ServerShape = {
  themeCode: string
  themeName: string
  completedRounds: number
  totalRounds: number
  nextRound: number | null
  weekdays: Weekday[]
  nextActivityDate: string | null
}

export const loadServerShape = (signal: AbortSignal) =>
  moyangRequest(signal).json<ServerShape | null>('/api/shapes/me')
