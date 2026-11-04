import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faHouse,
  faPencil,
  faUsers,
  faFolderOpen,
  faCircleUser,
} from '@fortawesome/free-solid-svg-icons'
import { NavLink } from 'react-router-dom'
import styles from './HomeFooter.module.css'

const items = [
  { to: '/home', label: '홈', icon: faHouse },
  { to: '/drawing', label: '그리기', icon: faPencil },
  { to: '/meetings', label: '모임', icon: faUsers },
  { to: '/records', label: '기록', icon: faFolderOpen },
  { to: '/my', label: '마이', icon: faCircleUser },
] as const

/**
 * 주요 화면으로 이동하고 현재 메뉴를 표시한다.
 *
 * @returns 하단 내비게이션 요소
 */
export const HomeFooter = () => {
  return (
    <nav aria-label="주요 메뉴" className={styles.footer}>
      {items.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
        >
          <FontAwesomeIcon icon={icon} className={styles.icon} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
