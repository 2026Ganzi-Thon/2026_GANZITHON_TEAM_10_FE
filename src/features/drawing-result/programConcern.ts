import { apiClient } from '@/lib/api-client'
import type { ProgramConcern } from '@/features/personal-program/programSchedule'

type UserResponse = {
  success: boolean
  data: { onboarding: { themeCode: string | null; themeText: string | null } | null } | null
}

type OptionsResponse = {
  success: boolean
  data: { themes: { code: string; label: string }[] } | null
}

export const loadProgramConcern = async (): Promise<ProgramConcern | undefined> => {
  const { data: profile } = await apiClient.get<UserResponse>('/users/me')
  const onboarding = profile.success ? profile.data?.onboarding : null
  if (!onboarding?.themeCode) return

  const { themeCode, themeText } = onboarding
  if (themeCode === 'DIRECT') {
    const label = themeText?.trim()
    return label ? { id: `DIRECT:${label}`, label } : undefined
  }

  const { data: options } = await apiClient.get<OptionsResponse>('/onboarding/options')
  const theme = options.success
    ? options.data?.themes.find(({ code }) => code === themeCode)
    : undefined
  if (theme) return { id: theme.code, label: theme.label }
}
