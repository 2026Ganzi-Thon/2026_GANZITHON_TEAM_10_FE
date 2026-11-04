import type { ComponentProps } from 'react'
import styles from './Input.module.css'

type InputProps = Omit<ComponentProps<'input'>, 'type'> & {
  id: string
  label?: string
}

/**
 * 선택적인 라벨을 제공하는 한 줄 텍스트 입력이다.
 *
 * @param props - 입력 요소에 전달할 설정
 * @param props.id - 라벨과 연결할 입력 요소 ID
 * @param props.label - 선택적인 라벨 텍스트
 * @param props.className - 입력 요소의 추가 스타일 클래스
 * @returns 텍스트 입력 요소
 */
export const Input = ({ id, label, className, ...props }: InputProps) => {
  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <input
        {...props}
        id={id}
        type="text"
        className={[styles.input, className].filter(Boolean).join(' ')}
      />
    </div>
  )
}
