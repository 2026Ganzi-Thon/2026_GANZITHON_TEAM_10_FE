import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faChevronRight,
  faCircleQuestion,
  faCircleUser,
  faClipboardList,
  faCommentDots,
  faLock,
  faRightFromBracket,
  faSliders,
  faStar,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { HomeLayout, Modal, SheepProfile } from '@/components'
import { apiClient, getAccessToken, setAccessToken } from '@/lib/api-client'
import { readPreviewColor } from '@/features/profile'
import { readPreviewPlan } from '@/features/plans'
import styles from './MyPage.module.css'

type MenuItem = { label: string; icon: IconDefinition; to?: string; action?: () => void }

const Menu = ({
  title,
  items,
  filled = false,
}: {
  title?: string
  items: MenuItem[]
  filled?: boolean
}) => (
  <section className={styles.section}>
    {title && <h2 className="text-body">{title}</h2>}
    <div className={`${styles.menu} ${filled ? styles.filled : ''}`}>
      {items.map(({ label, icon, to, action }) => {
        const content = (
          <>
            <FontAwesomeIcon icon={icon} className={styles.menuIcon} aria-hidden="true" />
            <span>{label}</span>
            <FontAwesomeIcon icon={faChevronRight} className={styles.chevron} aria-hidden="true" />
          </>
        )
        return to ? (
          <Link key={label} className={styles.menuItem} to={to}>
            {content}
          </Link>
        ) : (
          <button
            key={label}
            type="button"
            className={styles.menuItem}
            onClick={action}
            disabled={!action}
            aria-label={action ? undefined : `${label} (준비 중)`}
          >
            {content}
          </button>
        )
      })}
    </div>
  </section>
)

export const MyPage = () => {
  const { search } = useLocation()
  const navigate = useNavigate()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [balance, setBalance] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawError, setWithdrawError] = useState('')

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
      .get<{ success: boolean; data: { balance: number } | null }>('/api/sheep', {
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data.success || typeof data.data?.balance !== 'number')
          throw new Error('Invalid response')
        setBalance(data.data.balance)
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [preview, retry])

  const logout = () => {
    if (!window.confirm('로그아웃 하시겠어요?')) return
    if (!preview) setAccessToken(null)
    navigate('/onboarding')
  }
  const withdraw = async () => {
    const token = getAccessToken()
    setWithdrawing(true)
    setWithdrawError('')
    try {
      if (!preview) {
        const response = await apiClient.delete<{ success: boolean }>('/api/users/me')
        if (response.data && !response.data.success) throw new Error('Withdrawal failed')
        if (getAccessToken() !== token) return
        setAccessToken(null)
      }
      if (!active.current) return
      setWithdrawOpen(false)
      navigate('/onboarding', { replace: true })
    } catch {
      if (active.current && (preview || getAccessToken() === token))
        setWithdrawError('회원 탈퇴를 처리하지 못했어요. 다시 시도해 주세요.')
    } finally {
      if (active.current) setWithdrawing(false)
    }
  }
  const suffix = preview ? '?preview' : ''
  const previewPlan = preview ? readPreviewPlan() : null

  return (
    <HomeLayout>
      <main className={styles.page}>
        <header className={styles.header}>
          <Link to={`/notifications${suffix}`} aria-label="알림">
            <FontAwesomeIcon icon={faBell} />
          </Link>
        </header>
        <div className={styles.profile}>
          <div className={styles.stat}>
            <span className="text-caption">모은 양털</span>
            <strong className="text-caption-medium">
              {preview ? '2개' : balance !== null ? `${balance}개` : '—'}
            </strong>
          </div>
          <div className={styles.avatar}>
            <div className={styles.avatarImage}>
              <SheepProfile color={preview ? readPreviewColor() : 'green'} size={95} />
            </div>
          </div>
          <div className={styles.stat}>
            <span className="text-caption">다음 성장까지</span>
            <strong className="text-caption-medium">{preview ? '8개' : '—'}</strong>
          </div>
        </div>
        {failed && (
          <p className={`${styles.error} text-caption`} role="status">
            양 정보를 불러오지 못했어요.{' '}
            <button type="button" onClick={() => setRetry((value) => value + 1)}>
              다시 시도
            </button>
          </p>
        )}
        <div className={styles.sections}>
          <Menu
            title="내 정보"
            filled
            items={[
              { label: '개인정보 수정', icon: faCircleUser, to: `/my/profile${suffix}` },
              { label: '나의 맞춤 정보 수정', icon: faSliders },
            ]}
          />
          <section className={styles.section}>
            <div className={styles.planHeading}>
              <h2 className="text-body">요금제</h2>
              <Link to={`/my/plans${suffix}`}>
                요금제 자세히 보기 <FontAwesomeIcon icon={faChevronRight} />
              </Link>
            </div>
            <div className={styles.plan}>
              <span className={styles.planIcon}>
                <FontAwesomeIcon icon={faStar} />
              </span>
              <div>
                <strong className="text-body">
                  {previewPlan ? `모양 ${previewPlan === 'basic' ? '베이직' : '플러스'}` : '요금제'}
                </strong>
                <p className="text-caption">
                  {previewPlan
                    ? `지금은 ${previewPlan === 'basic' ? '베이직' : '플러스'} 요금제를 이용하고 있어요`
                    : '요금제 정보를 준비하고 있어요'}
                </p>
              </div>
            </div>
          </section>
          <Menu
            title="서비스 설정"
            items={[
              { label: '알림 설정', icon: faBell },
              { label: '개인정보 및 기록 관리', icon: faClipboardList },
            ]}
          />
          <Menu
            title="서비스 안내"
            items={[
              { label: '모양 서비스 소개', icon: faCommentDots, to: `/about${suffix}` },
              { label: '자주 묻는 질문', icon: faCircleQuestion },
              { label: '문의하기', icon: faCommentDots },
              { label: '이용약관 및 개인정보처리 방침', icon: faTriangleExclamation },
            ]}
          />
          <Menu
            items={[
              { label: '로그아웃', icon: faLock, action: logout },
              {
                label: '회원 탈퇴',
                icon: faRightFromBracket,
                action: () => {
                  setWithdrawError('')
                  setWithdrawOpen(true)
                },
              },
            ]}
          />
        </div>
      </main>
      <Modal
        isOpen={withdrawOpen}
        onClose={() => {
          if (!withdrawing) setWithdrawOpen(false)
        }}
        title="회원 탈퇴"
        actions={[
          {
            label: '취소',
            color: 'gray',
            onClick: () => setWithdrawOpen(false),
            disabled: withdrawing,
          },
          {
            label: withdrawing ? '처리 중...' : '탈퇴하기',
            onClick: withdraw,
            disabled: withdrawing,
          },
        ]}
      >
        <p>탈퇴하면 계정과 그림, 대화, 기록, 양털이 함께 삭제돼요. 계속하시겠어요?</p>
        {withdrawError && <p role="alert">{withdrawError}</p>}
      </Modal>
    </HomeLayout>
  )
}
