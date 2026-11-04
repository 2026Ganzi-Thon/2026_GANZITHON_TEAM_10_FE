import type { ReactNode } from 'react'
import { HomeFooter } from '../HomeFooter/HomeFooter'
import styles from './HomeLayout.module.css'

type HomeLayoutProps = {
  children: ReactNode
}

/**
 * 페이지 내용은 내부에서 스크롤하고 하단 메뉴는 고정한다.
 *
 * @param props - 레이아웃 설정
 * @param props.children - 스크롤 영역에 표시할 페이지 내용
 * @returns 하단 메뉴가 포함된 레이아웃 요소
 */
export const HomeLayout = ({ children }: HomeLayoutProps) => {
  return (
    <div className={styles.layout}>
      <div className={styles.content}>{children}</div>
      <HomeFooter />
    </div>
  )
}
