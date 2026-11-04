import { useLayoutEffect, useRef } from 'react'
import type { ComponentProps, CSSProperties } from 'react'
import styles from './TextArea.module.css'

type TextAreaProps = ComponentProps<'textarea'> & {
  id: string
  label?: string
  minHeight?: CSSProperties['minHeight']
  maxHeight?: CSSProperties['maxHeight']
}

/**
 * 여러 줄 텍스트를 입력하며 높이 범위와 라벨을 지정할 수 있다.
 *
 * @param props - 텍스트 영역에 전달할 설정
 * @param props.id - 라벨과 연결할 입력 요소 ID
 * @param props.label - 선택적인 라벨 텍스트
 * @param props.minHeight - 최소 높이 (기본값: 145px)
 * @param props.maxHeight - 최대 높이
 * @param props.style - 추가 인라인 스타일
 * @param props.className - 추가 스타일 클래스
 * @param props.value - 제어 방식으로 전달한 입력 값
 * @param props.onInput - 입력 시 호출할 함수
 * @param props.ref - 입력 요소에 연결할 ref
 * @returns 텍스트 영역 요소
 */
export const TextArea = ({
  id,
  label,
  minHeight = 145,
  maxHeight,
  style,
  className,
  value,
  onInput,
  ref,
  ...props
}: TextAreaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * 내용의 실제 높이에 맞추고 CSS의 최소·최대 높이 제한을 따른다.
   *
   * @param element - 높이를 조절할 텍스트 영역
   * @returns 반환값 없음
   */
  const resizeToContent = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
  }

  useLayoutEffect(() => {
    if (textareaRef.current) resizeToContent(textareaRef.current)
  }, [value, minHeight, maxHeight])

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <textarea
        {...props}
        id={id}
        value={value}
        ref={(element) => {
          textareaRef.current = element
          if (typeof ref === 'function') ref(element)
          else if (ref) ref.current = element
        }}
        onInput={(event) => {
          resizeToContent(event.currentTarget)
          onInput?.(event)
        }}
        className={[styles.textarea, className].filter(Boolean).join(' ')}
        style={{ ...style, minHeight, maxHeight }}
      />
    </div>
  )
}
