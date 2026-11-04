import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import styles from './Dropdown.module.css'

type DropdownProps = {
  id: string
  options: readonly { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  label?: string
  ariaLabel?: string
  disabled?: boolean
}

/**
 * 선택한 값을 부모가 관리하는 키보드 접근 가능한 드롭다운이다.
 *
 * @param props - 선택지와 선택 상태를 포함한 드롭다운 설정
 * @param props.id - 라벨과 연결할 버튼 ID
 * @param props.options - 값과 표시 문구로 구성된 선택지 목록
 * @param props.value - 현재 선택된 값
 * @param props.onChange - 선택한 값을 전달받는 함수
 * @param props.placeholder - 선택 전 표시할 문구
 * @param props.label - 선택적인 라벨 텍스트
 * @param props.ariaLabel - 라벨이 없을 때 사용할 접근성 이름
 * @param props.disabled - 입력 비활성화 여부
 * @returns 드롭다운 요소
 */
export const Dropdown = ({
  id,
  options,
  value,
  onChange,
  placeholder,
  label,
  ariaLabel,
  disabled,
}: DropdownProps) => {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const selected = options.findIndex((option) => option.value === value)

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    setActive(selected >= 0 ? selected : 0)
    setOpen(true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) openList()
      else
        setActive((index) =>
          Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))),
        )
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!open) openList()
      else if (options[active]) {
        onChange(options[active].value)
        setOpen(false)
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div
      className={styles.wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        role="combobox"
        aria-label={label ? undefined : (ariaLabel ?? placeholder)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-haspopup="listbox"
        disabled={disabled}
        className={styles.trigger}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={selected < 0 ? styles.placeholder : undefined}>
          {options[selected]?.label ?? placeholder}
        </span>
        <FontAwesomeIcon icon={faChevronDown} className={styles.icon} aria-hidden="true" />
      </button>
      {open && (
        <div id={listId} role="listbox" aria-labelledby={id} className={styles.list} ref={listRef}>
          {options.map((option, index) => (
            <div
              id={`${listId}-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`${styles.option} ${index === active ? styles.active : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
