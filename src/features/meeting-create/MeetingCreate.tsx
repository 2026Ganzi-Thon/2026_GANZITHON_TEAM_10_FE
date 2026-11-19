import { useState } from 'react'
import axios from 'axios'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays, faPeopleGroup } from '@fortawesome/free-solid-svg-icons'
import { Button, Input, Modal, PageHeader, TextArea } from '@/components'
import { apiClient } from '@/lib/api-client'
import { useModal } from '@/hooks/useModal'
import styles from './MeetingCreate.module.css'

const concerns = [
  ['STUDY_CAREER', '학업·진로·일'],
  ['LOVE', '연애·이별'],
  ['RELATION_FAMILY', '인간관계·가족'],
  ['SELF_HEALTH', '나 자신·건강'],
  ['DAILY_FUTURE', '일상·미래'],
  ['MONEY', '경제·금전'],
] as const

type Response = {
  success?: boolean
  data?: { meetingId?: number }
  error?: { code?: string; message?: string }
}

/** 실시간 또는 예약 모임 정보를 입력하고 양털 사용을 확인한 뒤 생성한다. */
export const MeetingCreate = () => {
  const navigate = useNavigate()
  const { search } = useLocation()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [type, setType] = useState<'LIVE' | 'SCHEDULED'>('LIVE')
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [nickname, setNickname] = useState('')
  const [capacity, setCapacity] = useState<number>(4)
  const [startAt, setStartAt] = useState('')
  const confirmModal = useModal()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const createdModal = useModal()

  const validDate = type === 'LIVE' || Number.isFinite(Date.parse(startAt))
  const valid =
    category &&
    title.trim() &&
    description.trim() &&
    [...nickname.trim()].length >= 2 &&
    [...nickname.trim()].length <= 15 &&
    validDate

  /** 서버의 모임 생성 결과를 확인하고 실패 시 입력값을 유지한다. */
  const create = async () => {
    if (!valid || saving) return
    if (
      type === 'SCHEDULED' &&
      (Date.parse(startAt) <= Date.now() || Date.parse(startAt) > Date.now() + 7 * 86400000)
    ) {
      confirmModal.closeModal()
      setError('예약 시간은 지금부터 7일 이내로 선택해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        type,
        title: title.trim(),
        description: description.trim(),
        category,
        capacity,
        meetingNickname: nickname.trim(),
        ...(type === 'SCHEDULED' ? { startAt: new Date(startAt).toISOString() } : {}),
      }
      if (preview) {
        let saved: unknown = []
        try {
          saved = JSON.parse(sessionStorage.getItem('moyang.preview.createdMeetings') || '[]')
        } catch {
          /* 저장된 데이터가 잘못되면 새로 시작한다. */
        }
        if (!Array.isArray(saved)) saved = []
        sessionStorage.setItem(
          'moyang.preview.createdMeetings',
          JSON.stringify([
            ...(saved as unknown[]),
            {
              id: `preview-${Date.now()}`,
              title: payload.title,
              description: payload.description,
              concern: category,
              capacity,
              participants: 1,
              status: 'waiting',
              membership: 'host',
              kind: type === 'LIVE' ? 'live' : 'scheduled',
              ...(type === 'SCHEDULED' ? { startAt: Date.parse(startAt) } : {}),
            },
          ]),
        )
      } else {
        const { data } = await apiClient.post<Response>('/api/meetings', payload)
        if (!data.success || !data.data?.meetingId)
          throw new Error(data.error?.message || '모임을 만들지 못했어요.')
      }
      confirmModal.closeModal()
      createdModal.openModal()
    } catch (e) {
      const body = axios.isAxiosError<Response>(e) ? e.response?.data?.error : undefined
      setError(
        body?.code === 'NOT_ENOUGH_WOOL'
          ? '보유한 양털이 부족해요.'
          : body?.message ||
              (e instanceof Error ? e.message : '모임을 만들지 못했어요. 다시 시도해 주세요.'),
      )
      confirmModal.closeModal()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="모임 만들기"
        action="back"
        onNavigate={() => navigate(`/meetings${preview ? '?preview' : ''}`)}
      />
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (
            valid &&
            type === 'SCHEDULED' &&
            (Date.parse(startAt) <= Date.now() || Date.parse(startAt) > Date.now() + 7 * 86400000)
          )
            setError('예약 시간은 지금부터 7일 이내로 선택해 주세요.')
          else if (valid) {
            setError('')
            confirmModal.openModal()
          }
        }}
      >
        <div className={styles.intro}>
          <h2 className="text-heading">
            함께 그림을 그리고 이야기를 나눌
            <br />
            모임 정보를 입력해 주세요.
          </h2>
          <p className="text-caption">모임을 만들면 보유한 양털 중 1개가 사용돼요.</p>
        </div>
        <fieldset>
          <legend className="text-choice">모임 유형 선택</legend>
          <div className={styles.row}>
            <button
              type="button"
              className={type === 'LIVE' ? styles.selected : ''}
              aria-pressed={type === 'LIVE'}
              onClick={() => setType('LIVE')}
            >
              <FontAwesomeIcon icon={faPeopleGroup} /> 곧 시작할 모임
            </button>
            <button
              type="button"
              className={type === 'SCHEDULED' ? styles.selected : ''}
              aria-pressed={type === 'SCHEDULED'}
              onClick={() => setType('SCHEDULED')}
            >
              <FontAwesomeIcon icon={faCalendarDays} /> 예약 모임
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-choice">고민 주제 선택</legend>
          <div className={styles.chips}>
            {concerns.map(([code, label]) => (
              <button
                type="button"
                key={code}
                className={category === code ? styles.selected : ''}
                aria-pressed={category === code}
                onClick={() => setCategory(code)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={styles.field}>
          <label htmlFor="meeting-title" className="text-choice">
            모임 이름
          </label>
          <Input
            id="meeting-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="모임 이름을 입력해 주세요"
            required
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="meeting-description" className="text-choice">
            한 줄 소개
          </label>
          <TextArea
            id="meeting-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="모임을 소개해 주세요"
            minHeight={98}
            required
          />
        </div>
        <fieldset>
          <legend className="text-choice">최대 모집 인원</legend>
          <div className={styles.row}>
            {[2, 4, 6].map((n) => (
              <button
                type="button"
                key={n}
                className={capacity === n ? styles.selected : ''}
                aria-pressed={capacity === n}
                onClick={() => setCapacity(n)}
              >
                {n}명
              </button>
            ))}
          </div>
        </fieldset>
        {type === 'SCHEDULED' ? (
          <div className={styles.field}>
            <label htmlFor="meeting-start" className="text-choice">
              모임 날짜와 시간
            </label>
            <Input
              id="meeting-start"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
            />
            <p className="text-caption">지금부터 7일 이내로 선택해 주세요.</p>
          </div>
        ) : (
          <p className={`${styles.hint} text-caption`}>
            2명 이상 모이면 방장이 모임을 시작할 수 있어요.
            <br />
            별도의 날짜·시간 설정은 필요하지 않아요.
          </p>
        )}
        <div className={styles.field}>
          <label htmlFor="meeting-nickname" className="text-choice">
            모임 닉네임
          </label>
          <Input
            id="meeting-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="모임에서 사용할 닉네임 (2~15자)"
            required
          />
          <p className="text-caption">모임에서 사용할 닉네임을 입력해 주세요.</p>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!valid || saving}>
          모임 만들기
        </Button>
      </form>
      <Modal
        isOpen={confirmModal.isOpen}
        title="모임을 만드시겠어요?"
        onClose={() => !saving && confirmModal.closeModal()}
        actions={[
          {
            label: '취소',
            color: 'gray',
            onClick: () => confirmModal.closeModal(),
            disabled: saving,
          },
          { label: saving ? '만드는 중...' : '모임 만들기', onClick: create, disabled: saving },
        ]}
      >
        모임을 만들면 양털 1개가 사용돼요.
        <br />
        정말 모임을 만들겠어요?
      </Modal>
      <Modal
        isOpen={createdModal.isOpen}
        title="모임을 만들었어요"
        onClose={() =>
          navigate(`/meetings?tab=mine${preview ? '&preview' : ''}`, { replace: true })
        }
        actions={[
          {
            label: '확인',
            onClick: () =>
              navigate(`/meetings?tab=mine${preview ? '&preview' : ''}`, { replace: true }),
          },
        ]}
      >
        만든 모임을 확인해 주세요.
      </Modal>
    </>
  )
}
