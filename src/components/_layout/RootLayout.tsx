import { useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import styles from './RootLayout.module.css'

/**
 * 화면 이동 시 프레임 내부 스크롤을 맨 위로 옮긴다.
 *
 * @returns 라우트가 표시되는 모바일 프레임
 */
export const RootLayout = () => {
  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    contentRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className={styles.backdrop}>
      <main className={styles.frame} ref={contentRef}>
        <Outlet />
      </main>
    </div>
  )
}
