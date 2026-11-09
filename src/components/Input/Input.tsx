import type { ComponentProps } from 'react'
import styles from './Input.module.css'

type InputProps = ComponentProps<'input'> & {
  id: string
  label?: string
  error?: string
  success?: string
}

/**
 * 선택적인 라벨을 제공하는 입력 요소다.
 *
 * @param props - 입력 요소에 전달할 설정
 * @param props.id - 라벨과 연결할 입력 요소 ID
 * @param props.label - 선택적인 라벨 텍스트
 * @param props.error - 입력값 오류 안내 문구
 * @param props.success - 입력값 성공 안내 문구 (오류가 있으면 오류 우선)
 * @param props.className - 입력 요소의 추가 스타일 클래스
 * @param props.type - 입력 유형 (기본값: text)
 * @returns 입력 요소
 */
export const Input = ({
  id,
  label,
  error,
  success,
  className,
  type = 'text',
  ...props
}: InputProps) => {
  const message = error || success
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
        type={type}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          [props['aria-describedby'], message && `${id}-message`].filter(Boolean).join(' ') ||
          undefined
        }
        className={[styles.input, !error && success && styles.successInput, className]
          .filter(Boolean)
          .join(' ')}
      />
      {message && (
        <p
          id={`${id}-message`}
          className={error ? styles.error : styles.success}
          role={error ? 'alert' : 'status'}
        >
          {message}
        </p>
      )}
    </div>
  )
}
