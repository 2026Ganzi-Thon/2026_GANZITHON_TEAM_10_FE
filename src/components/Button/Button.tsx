import type { ComponentProps } from 'react'
import styles from './Button.module.css'

type ButtonProps = Omit<ComponentProps<'button'>, 'color'> & {
  color?: 'green' | 'gray'
}

/**
 * 색상과 기본 버튼 속성을 지정할 수 있는 공통 버튼이다.
 *
 * @param props - 버튼 색상과 기본 버튼 속성
 * @param props.color - 버튼 색상 (기본값: green)
 * @param props.type - 버튼 유형 (기본값: button)
 * @param props.className - 추가 스타일 클래스
 * @returns 버튼 요소
 */
export const Button = ({ color = 'green', type = 'button', className, ...props }: ButtonProps) => {
  return (
    <button
      type={type}
      className={[styles.button, styles[color], className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
