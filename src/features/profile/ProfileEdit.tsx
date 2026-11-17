import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { Button, Input, Modal, SheepProfile } from '@/components'
import { apiClient, getAccessToken } from '@/lib/api-client'
import { colors, readPreviewColor, readPreviewNickname, writePreviewValue } from './preview'
import type { SheepColor } from './preview'
import styles from './ProfileEdit.module.css'

const names: Record<SheepColor, string> = {
  white: '하얀색',
  pink: '분홍색',
  green: '초록색',
  purple: '보라색',
  blue: '파란색',
}
type Response<T> = { success: boolean; data: T | null }

/** 사용자 정보와 양 상태를 불러오고 닉네임을 수정한다. */
export const ProfileEdit = () => {
  const { search } = useLocation()
  const navigate = useNavigate()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [nickname, setNickname] = useState(() => (preview ? readPreviewNickname() : ''))
  const [color, setColor] = useState<SheepColor>(() => (preview ? readPreviewColor() : 'green'))
  const [balance, setBalance] = useState<number | null>(preview ? 2 : null)
  const [loading, setLoading] = useState(!preview)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sheepError, setSheepError] = useState(false)
  const [open, setOpen] = useState(false)
  const [retry, setRetry] = useState(0)

  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    apiClient
      .get<Response<{ nickname: string }>>('/api/users/me', { signal: controller.signal })
      .then(({ data }) => {
        if (!data.success || typeof data.data?.nickname !== 'string')
          throw new Error('Invalid response')
        setNickname(data.data.nickname)
        setError('')
        setLoading(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('정보를 불러오지 못했어요.')
          setLoading(false)
        }
      })
    apiClient
      .get<Response<{ balance: number }>>('/api/sheep', { signal: controller.signal })
      .then(({ data }) => {
        if (!data.success || typeof data.data?.balance !== 'number')
          throw new Error('Invalid response')
        setBalance(data.data.balance)
        setSheepError(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSheepError(true)
      })
    return () => controller.abort()
  }, [preview, retry])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = nickname.trim()
    if (value.length < 2 || value.length > 15) {
      setError('닉네임은 2~15자로 입력해 주세요.')
      return
    }
    const token = getAccessToken()
    setSaving(true)
    setError('')
    try {
      if (preview) writePreviewValue('nickname', value)
      else {
        const { data } = await apiClient.patch<Response<unknown>>('/api/users/me/nickname', {
          nickname: value,
        })
        if (!data.success) throw new Error('Save failed')
      }
      if (active.current && (preview || getAccessToken() === token))
        navigate(`/my${preview ? '?preview' : ''}`)
    } catch {
      if (active.current && (preview || getAccessToken() === token))
        setError('닉네임을 저장하지 못했어요. 다시 시도해 주세요.')
    } finally {
      if (active.current) setSaving(false)
    }
  }

  const choose = (next: SheepColor) => {
    setColor(next)
    if (preview) {
      writePreviewValue('sheepColor', next)
      setOpen(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          aria-label="마이페이지로 돌아가기"
          onClick={() => navigate(`/my${preview ? '?preview' : ''}`)}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
      </header>
      <div className={styles.content}>
        <div className={styles.profile}>
          <div className={styles.stat}>
            <span className="text-caption">모은 양털</span>
            <strong className="text-caption-medium">
              {balance === null ? '—' : `${balance}개`}
            </strong>
          </div>
          <div className={styles.avatar}>
            <div className={styles.avatarImage}>
              <SheepProfile color={color} size={95} />
            </div>
            <button type="button" aria-label="프로필 수정" onClick={() => setOpen(true)}>
              <FontAwesomeIcon icon={faPenToSquare} />
            </button>
          </div>
          <div className={styles.stat}>
            <span className="text-caption">다음 성장까지</span>
            <strong className="text-caption-medium">{preview ? '8개' : '—'}</strong>
          </div>
        </div>
        {sheepError && (
          <p className="text-caption" role="status">
            양 정보를 불러오지 못했어요.
          </p>
        )}
        <form className={styles.form} onSubmit={save}>
          <section>
            <h1 className="text-body">닉네임 수정</h1>
            <div className={styles.card}>
              <Input
                id="profile-nickname"
                label="닉네임"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={15}
                disabled={loading}
                className={styles.input}
                aria-describedby="nickname-help"
              />
              <p id="nickname-help" className="text-caption">
                그림 해석을 만드는 과정에 전달되는 내 정보는 이 호칭 하나뿐이니, 실명보다 편하게
                불리고 싶은 이름을 권해요.
              </p>
              {error && (
                <p className={styles.error} role="alert">
                  {error}{' '}
                  {!loading && !nickname && (
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true)
                        setRetry((value) => value + 1)
                      }}
                    >
                      다시 시도
                    </button>
                  )}
                </p>
              )}
            </div>
          </section>
          <Button type="submit" disabled={loading || saving || (!preview && !nickname)}>
            {saving ? '저장 중...' : '저장하기'}
          </Button>
        </form>
      </div>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="프로필 색상 선택">
        <div className={styles.colors}>
          {colors.map((item) => (
            <button
              type="button"
              key={item}
              className={`${styles.color} ${color === item ? styles.selected : ''}`}
              aria-label={`${names[item]} 양`}
              aria-pressed={color === item}
              onClick={() => choose(item)}
            >
              <SheepProfile color={item} size={82} />
            </button>
          ))}
        </div>
        {!preview && (
          <p className="text-caption">
            선택한 색상을 미리 볼 수 있어요. 색상 저장 기능은 준비 중이에요.
          </p>
        )}
      </Modal>
    </main>
  )
}
