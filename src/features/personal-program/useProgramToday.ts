import { useEffect, useState } from 'react'
import { getToday } from './programSchedule'

export const useProgramToday = () => {
  const [today, setToday] = useState(getToday)

  useEffect(() => {
    const refreshDate = () => setToday(getToday())
    const timer = window.setInterval(refreshDate, 30_000)
    window.addEventListener('focus', refreshDate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDate)
    }
  }, [])

  return [today, setToday] as const
}
