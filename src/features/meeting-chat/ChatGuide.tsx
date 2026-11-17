import type { ReactNode } from 'react'
import { SheepProfile } from '@/components'
import styles from './MeetingChat.module.css'

export const ChatGuide = ({ children }: { children: ReactNode }) => (
  <div className={styles.guide}>
    <SheepProfile color="white" size={42} alt="" />
    <div className={styles.guideBody}>
      <span className={styles.nickname}>모양 AI</span>
      {children}
    </div>
  </div>
)
