import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faHouse } from '@fortawesome/free-solid-svg-icons'
import type { ReactNode } from 'react'
import styles from './PageHeader.module.css'

type PageHeaderProps = {
  title: string
  action: 'back' | 'home'
  onNavigate: () => void
  actions?: ReactNode
}

/** 화면 제목과 이전 화면 또는 홈으로 이동하는 동작을 표시한다. */
export const PageHeader = ({ title, action, onNavigate, actions }: PageHeaderProps) => (
  <header className={styles.header}>
    <button
      type="button"
      className={styles.navigation}
      onClick={onNavigate}
      aria-label={action === 'back' ? '뒤로 가기' : '홈으로 가기'}
    >
      <FontAwesomeIcon icon={action === 'back' ? faArrowLeft : faHouse} />
    </button>
    <h1>{title}</h1>
    {actions && <div className={styles.actions}>{actions}</div>}
  </header>
)
