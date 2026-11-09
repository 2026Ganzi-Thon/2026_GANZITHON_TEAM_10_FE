import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components'
import { getNextActivityDate, weekdayOrder, weekdays } from './programSchedule'
import { ProgramSchedule } from './ProgramOverview'
import styles from './PersonalProgram.module.css'

type ProgramScheduleFormProps = {
  initialDays: number[]
  today: string
  includeToday: boolean
  onSave: (days: number[], signal: AbortSignal) => Promise<void>
  onClose?: () => void
}

export const ProgramScheduleForm = ({
  initialDays,
  today,
  includeToday,
  onSave,
  onClose,
}: ProgramScheduleFormProps) => {
  const [days, setDays] = useState(initialDays)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const date = getNextActivityDate(days, today, includeToday)

  useEffect(() => {
    closeButton.current?.focus()
    return () => request.current?.abort()
  }, [])

  const save = async () => {
    if (!date || request.current) return
    const controller = new AbortController()
    request.current = controller
    const { signal } = controller
    setSaving(true)
    setFailed(false)

    try {
      await onSave(days, signal)
    } catch {
      if (!signal.aborted) setFailed(true)
    } finally {
      request.current = null
      if (!signal.aborted) setSaving(false)
    }
  }

  return (
    <form
      className={onClose ? styles.editForm : styles.scheduleForm}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {onClose && (
        <button
          ref={closeButton}
          type="button"
          className={styles.editClose}
          aria-label="일정 변경 닫기"
          onClick={onClose}
          disabled={saving}
        >
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      )}
      <fieldset disabled={saving}>
        <legend>활동 일정 선택</legend>
        <p>나에게 편한 요일을 선택해 주세요. 여러 요일을 선택할 수 있어요.</p>
        <div className={styles.weekdays}>
          {weekdayOrder.map((day) => {
            const selected = days.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-label={`${weekdays[day]}요일`}
                aria-pressed={selected}
                onClick={() =>
                  setDays((current) =>
                    current.includes(day)
                      ? current.filter((item) => item !== day)
                      : [...current, day],
                  )
                }
              >
                <span>{weekdays[day]}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {date && (
        <div aria-live="polite">
          <ProgramSchedule days={days} date={date} />
        </div>
      )}
      {failed && (
        <p role="alert" className={styles.error}>
          일정을 저장하지 못했어요. 선택한 요일은 그대로예요.
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="submit" disabled={!date || saving}>
          {saving
            ? '저장하는 중이에요'
            : failed
              ? '다시 시도'
              : onClose
                ? '저장하기'
                : '이 일정으로 활동 저장하기'}
        </Button>
      </div>
    </form>
  )
}
