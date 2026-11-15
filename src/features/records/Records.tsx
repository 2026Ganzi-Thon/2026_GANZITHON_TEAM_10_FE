import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faChevronLeft,
  faChevronRight,
  faCircleInfo,
} from '@fortawesome/free-solid-svg-icons'
import { HomeLayout } from '@/components'
import { apiClient } from '@/lib/api-client'
import drawing from '@/assets/drawing/drawing-2.png'
import { RecordImage } from './RecordImage'
import { RecordDetailContent } from './RecordDetail'
import type { RecordItem, Response } from './types'
import styles from './Records.module.css'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const monthKey = (date: Date) => dateKey(date).slice(0, 7)
const mockItems = (month: string): RecordItem[] =>
  [4, 6, 12].map((day, index) => ({
    recordId: index + 1,
    recordDate: `${month}-${String(day).padStart(2, '0')}`,
    title: ['나의 마음 정원', '따뜻한 하루', '마음속 풍경'][index],
    imageUrl: drawing,
  }))

/** 월별 달력과 최근 회고 목록을 조회한다. */
export const Records = () => {
  const { search } = useLocation()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const empty = preview && new URLSearchParams(search).get('preview') === 'empty'
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00`))
  const [tab, setTab] = useState<'calendar' | 'recent'>('calendar')
  const [selected, setSelected] = useState<string | null>(null)
  const [calendar, setCalendar] = useState<RecordItem[] | null>(null)
  const [recent, setRecent] = useState<RecordItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const monthValue = monthKey(month)
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    apiClient
      .get<Response<{ month: string; records: RecordItem[] }>>('/api/records/calendar', {
        params: { month: monthValue },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data.success || !data.data || !Array.isArray(data.data.records))
          throw new Error('Invalid response')
        setCalendar(data.data.records)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('달력을 불러오지 못했어요.')
      })
    return () => controller.abort()
  }, [monthValue, preview, attempt])
  useEffect(() => {
    if (preview || tab !== 'recent') return
    const controller = new AbortController()
    apiClient
      .get<Response<{ items: RecordItem[]; hasNext: boolean; nextCursor: string | null }>>(
        '/api/records',
        { params: { size: 20 }, signal: controller.signal },
      )
      .then(({ data }) => {
        if (!data.success || !data.data || !Array.isArray(data.data.items))
          throw new Error('Invalid response')
        setRecent(data.data.items)
        setCursor(data.data.nextCursor)
        setHasNext(data.data.hasNext)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('최근 기록을 불러오지 못했어요.')
      })
    return () => controller.abort()
  }, [preview, tab, attempt])
  const calendarItems = preview ? (empty ? [] : mockItems(monthValue)) : calendar
  const recentItems = preview ? (empty ? [] : mockItems(monthValue).reverse()) : recent
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const selectedItems = calendarItems?.filter((item) => item.recordDate === selected) ?? []
  const showInlineDetail = tab === 'calendar' && selectedItems.length > 0
  useEffect(() => {
    if (showInlineDetail) pageRef.current?.scrollIntoView({ block: 'start' })
  }, [showInlineDetail])
  const changeMonth = (amount: number) => {
    setCalendar(null)
    setError('')
    setSelected(null)
    setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1))
  }
  const more = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const { data } = await apiClient.get<
        Response<{ items: RecordItem[]; hasNext: boolean; nextCursor: string | null }>
      >('/api/records', { params: { cursor, size: 20 } })
      if (!data.success || !data.data || !Array.isArray(data.data.items))
        throw new Error('Invalid response')
      setRecent((items) => [...(items ?? []), ...data.data!.items])
      setCursor(data.data.nextCursor)
      setHasNext(data.data.hasNext)
    } catch {
      setError('기록을 더 불러오지 못했어요.')
    } finally {
      setLoadingMore(false)
    }
  }
  const cards = (items: RecordItem[]) => (
    <ul className={styles.cards}>
      {items.map((item) => (
        <li key={item.recordId}>
          <Link
            to={`/records/${item.recordId}${preview ? '?preview' : ''}`}
            state={preview ? { record: item } : undefined}
            className={styles.card}
          >
            <div className={styles.thumbnail}>
              <RecordImage key={item.imageUrl} url={item.imageUrl} preview={preview} />
            </div>
            <div className={styles.cardCopy}>
              <strong>{item.title || '나의 그림 기록'}</strong>
              <time dateTime={item.recordDate}>{item.recordDate.replaceAll('-', '.')}</time>
            </div>
            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
  return (
    <HomeLayout>
      <div className={styles.page} ref={pageRef}>
        <header className={styles.header}>
          <Link
            className={styles.bell}
            to={preview ? '/notifications?preview' : '/notifications'}
            aria-label="알림"
          >
            <FontAwesomeIcon icon={faBell} />
          </Link>
          <h1>기록</h1>
          <p>그림과 함께한 마음을 다시 만나보세요.</p>
          <div className={styles.tabs} role="tablist" aria-label="기록 보기">
            <button
              role="tab"
              aria-selected={tab === 'calendar'}
              onClick={() => {
                setError('')
                setTab('calendar')
              }}
            >
              다이어리
            </button>
            <button
              role="tab"
              aria-selected={tab === 'recent'}
              onClick={() => {
                setError('')
                setTab('recent')
              }}
            >
              최근 기록
            </button>
          </div>
        </header>
        <main
          className={
            selectedItems.length && tab === 'calendar' ? styles.inlineContent : styles.content
          }
        >
          {tab === 'calendar' ? (
            selectedItems.length ? (
              <RecordDetailContent
                key={selectedItems[0].recordId}
                recordId={String(selectedItems[0].recordId)}
                preview={preview}
                record={selectedItems[0]}
                onClose={() => setSelected(null)}
              />
            ) : (
              <>
                <section className={styles.calendar} aria-label="기록 달력">
                  <div className={styles.month}>
                    <button aria-label="이전 달" onClick={() => changeMonth(-1)}>
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <h2>
                      {month.getFullYear()}년 {month.getMonth() + 1}월
                    </h2>
                    <button aria-label="다음 달" onClick={() => changeMonth(1)}>
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </div>
                  <div className={styles.grid}>
                    {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                      <span className={styles.weekday} key={day}>
                        {day}
                      </span>
                    ))}
                    {Array.from({ length: 42 }, (_, i) => {
                      const cellDate = new Date(
                        month.getFullYear(),
                        month.getMonth(),
                        i - firstDay + 1,
                      )
                      const date = dateKey(cellDate)
                      const inMonth = cellDate.getMonth() === month.getMonth()
                      const record = inMonth
                        ? calendarItems?.find((item) => item.recordDate === date)
                        : undefined
                      const hasRecord = Boolean(record)
                      return (
                        <button
                          key={date}
                          className={`${styles.day} ${selected === date ? styles.selected : ''} ${!inMonth ? styles.outside : ''}`}
                          aria-label={`${date}${hasRecord ? ', 기록 있음' : ''}`}
                          aria-pressed={selected === date}
                          aria-current={date === today() ? 'date' : undefined}
                          disabled={!inMonth}
                          onClick={() => setSelected(date)}
                        >
                          {record?.imageUrl && (
                            <span className={styles.dayImage}>
                              <RecordImage
                                key={record.imageUrl}
                                url={record.imageUrl}
                                preview={preview}
                              />
                            </span>
                          )}
                          <span
                            className={`${styles.dayNumber} ${hasRecord ? styles.recordNumber : ''}`}
                          >
                            {cellDate.getDate()}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
                {calendarItems === null && !error ? (
                  <p className={styles.status}>기록을 불러오고 있어요.</p>
                ) : selected ? (
                  <p className={styles.empty}>
                    <FontAwesomeIcon icon={faCircleInfo} /> 선택한 날짜에 기록이 없어요.
                  </p>
                ) : calendarItems?.length === 0 ? (
                  <p className={styles.empty}>
                    <FontAwesomeIcon icon={faCircleInfo} /> 아직 기록된 그림이 없어요!
                  </p>
                ) : null}
              </>
            )
          ) : recentItems === null && !error ? (
            <p className={styles.status}>기록을 불러오고 있어요.</p>
          ) : recentItems?.length ? (
            <>
              {cards(recentItems)}
              {hasNext && (
                <button className={styles.more} disabled={loadingMore} onClick={() => void more()}>
                  {loadingMore ? '불러오는 중...' : '더 보기'}
                </button>
              )}
            </>
          ) : (
            !error && (
              <p className={styles.empty}>
                <FontAwesomeIcon icon={faCircleInfo} /> 아직 기록된 그림이 없어요!
              </p>
            )
          )}
          {error && (
            <p className={styles.status} role="alert">
              {error}{' '}
              <button
                onClick={() => {
                  setError('')
                  setAttempt((value) => value + 1)
                }}
              >
                다시 시도
              </button>
            </p>
          )}
        </main>
      </div>
    </HomeLayout>
  )
}
