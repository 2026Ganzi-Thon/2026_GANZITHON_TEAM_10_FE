import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn, faCircleUser, faCommentDots, faUsers } from '@fortawesome/free-solid-svg-icons'
import { PageHeader } from '@/components'
import styles from './Notifications.module.css'

type Notification = {
  id: number
  type: 'meeting' | 'activity' | 'profile' | 'notice'
  title: string
  description?: string
  time: string
  read: boolean
}

const previewNotifications: Notification[] = [
  {
    id: 1,
    type: 'meeting',
    title: '모임 시작 30분 전이에요.',
    description: '오늘 오후 8:00, 그림 나눔 모임 ‘나와 너 사이’가 곧 시작돼요.',
    time: '30분 전',
    read: false,
  },
  {
    id: 2,
    type: 'activity',
    title: '첫 번째 그림 활동을 완료했어요!',
    description: '나의 마음을 한 걸음 더 알아가는 시간이었어요. 다음 활동에서도 함께해요!',
    time: '45분 전',
    read: false,
  },
  { id: 3, type: 'profile', title: '닉네임을 변경하셨어요!', time: '2일 전', read: true },
  { id: 4, type: 'notice', title: '모양에 오신 걸 환영합니다', time: '2일 전', read: true },
]

const icons = {
  meeting: faUsers,
  activity: faCommentDots,
  profile: faCircleUser,
  notice: faBullhorn,
}

/** 알림을 읽음 상태별로 보여준다. 실제 알림 API는 명세 확인 후 연결한다. */
export const Notifications = () => {
  const navigate = useNavigate()
  const { search, state } = useLocation()
  const isPreview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [items, setItems] = useState<Notification[]>(() =>
    isPreview && new URLSearchParams(search).get('preview') !== 'empty' ? previewNotifications : [],
  )
  const [unreadOnly, setUnreadOnly] = useState(false)
  const unread = items.filter((item) => !item.read)
  const previous = items.filter((item) => item.read)

  const markRead = (id: number) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)))
  const renderList = (list: Notification[]) => (
    <ul className={styles.list}>
      {list.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`${styles.item} ${!item.read ? styles.unread : ''}`}
            onClick={() => markRead(item.id)}
            aria-label={`${item.title}${item.read ? '' : ', 읽지 않음'}`}
          >
            <FontAwesomeIcon className={styles.icon} icon={icons[item.type]} aria-hidden="true" />
            <span className={styles.message}>
              <span className={item.description ? styles.subtitle : styles.title}>
                {item.title}
              </span>
              {item.description && <span className={styles.title}>{item.description}</span>}
            </span>
            <span className={styles.time}>{item.time}</span>
          </button>
        </li>
      ))}
    </ul>
  )
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <PageHeader
          title="알림"
          action="back"
          onNavigate={() => {
            if (state?.fromMeetingList === true && window.history.state?.idx > 0) navigate(-1)
            else navigate(isPreview ? '/home?preview' : '/home')
          }}
        />
        {isPreview && (
          <button
            className={styles.readAll}
            type="button"
            disabled={unread.length === 0}
            onClick={() => setItems((current) => current.map((item) => ({ ...item, read: true })))}
          >
            모두 읽음
          </button>
        )}
      </div>
      <div className={styles.content}>
        {!isPreview ? (
          <p className={styles.empty} role="status">
            알림 기능을 준비하고 있어요.
          </p>
        ) : (
          <>
            <div className={styles.filters} aria-label="알림 필터">
              <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
                전체
              </button>
              <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
                읽지 않음
              </button>
            </div>
            {unread.length > 0 && (
              <section className={styles.group}>
                <h2>새 알림</h2>
                {renderList(unread)}
              </section>
            )}
            {!unreadOnly && previous.length > 0 && (
              <section className={styles.group}>
                <h2>이전 알림</h2>
                {renderList(previous)}
              </section>
            )}
            {(items.length === 0 || (unreadOnly && unread.length === 0)) && (
              <p className={styles.empty}>알림이 없어요.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
