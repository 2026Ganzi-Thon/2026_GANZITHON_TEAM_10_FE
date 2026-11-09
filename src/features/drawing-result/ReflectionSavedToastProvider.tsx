import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ReflectionSavedToastContext } from './reflectionSavedToast'
import styles from './DrawingResult.module.css'

export const ReflectionSavedToastProvider = ({ children }: { children: ReactNode }) => {
  const [visible, setVisible] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const showToast = useCallback(() => {
    window.clearTimeout(timer.current)
    setVisible(true)
    timer.current = window.setTimeout(() => setVisible(false), 3000)
  }, [])

  return (
    <ReflectionSavedToastContext value={showToast}>
      {children}
      <div className={styles.savedToast} role="status">
        {visible && <span>오늘의 기록이 저장되었어요</span>}
      </div>
    </ReflectionSavedToastContext>
  )
}
