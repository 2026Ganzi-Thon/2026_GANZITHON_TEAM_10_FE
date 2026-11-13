import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { PersonalProgramPage } from '@/features/personal-program/PersonalProgramPage'
import styles from '@/features/personal-program/PersonalProgram.module.css'

export const SessionsPage = () => {
  const { key } = useLocation()
  const pageRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    pageRef.current?.scrollIntoView({ block: 'start' })
  }, [key])

  return (
    <div className={styles.route} ref={pageRef}>
      <PersonalProgramPage key={key} />
    </div>
  )
}
