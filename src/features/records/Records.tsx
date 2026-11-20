import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const preview = import.meta.env.DEV && searchParams.has('preview')
  const empty = preview && searchParams.get('preview') === 'empty'
  const tab = searchParams.get('tab') === 'recent' ? 'recent' : 'calendar'
  const [month, setMonth] = useState(() => new Date(`${today()}T12:00:00`))
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)
  const [calendar, setCalendar] = useState<RecordItem[] | null>(null)
  const [recent, setRecent] = useState<RecordItem[] | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [hasNext, setHasNext] = useState(false)
  const [calendarError, setCalendarError] = useState(false)
  const [error, setError] = useState<'' | 'recent' | 'more'>('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [calendarAttempt, setCalendarAttempt] = useState(0)
  const [recentAttempt, setRecentAttempt] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)
  const monthValue = monthKey(month)
  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    apiClient
      .get<
        Response<{
          month: string
          items: { date: string; recordId: number; imageUrl: string | null }[]
        }>
      >('/api/records/calendar', {
        params: { month: monthValue },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data.success || !data.data || !Array.isArray(data.data.items))
          throw new Error('Invalid response')
        setCalendar(data.data.items.map(({ date, ...item }) => ({ ...item, recordDate: date })))
      })
      .catch(() => {
        if (!controller.signal.aborted) setCalendarError(true)
      })
    return () => controller.abort()
  }, [monthValue, preview, calendarAttempt])
  useEffect(() => {
    if (preview || tab !== 'recent') return
    const controller = new AbortController()
    apiClient
      .get<Response<{ items: RecordItem[]; hasNext: boolean; nextCursor: number | null }>>(
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
        if (!controller.signal.aborted) setError('recent')
      })
    return () => controller.abort()
  }, [preview, tab, recentAttempt])
  const calendarItems = preview ? (empty ? [] : mockItems(monthValue)) : calendar
  const recentItems = preview ? (empty ? [] : mockItems(monthValue).reverse()) : recent
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay()
  const selectedItems = calendarItems?.filter((item) => item.recordDate === selected) ?? []
  const selectedRecord =
    selectedItems.length === 1
      ? selectedItems[0]
      : selectedItems.find((item) => item.recordId === selectedRecordId)
  const showInlineDetail = tab === 'calendar' && Boolean(selectedRecord)
  useEffect(() => {
    if (showInlineDetail) pageRef.current?.scrollIntoView({ block: 'start' })
  }, [showInlineDetail])
  const changeTab = (nextTab: typeof tab) => {
    setError('')
    if (nextTab === tab) return

    const params = new URLSearchParams(searchParams)
    if (nextTab === 'recent') params.set('tab', 'recent')
    else params.delete('tab')
    setSearchParams(params, { replace: true })
  }
  const changeMonth = (amount: number) => {
    setCalendar(null)
    setCalendarError(false)
    setSelected(null)
    setSelectedRecordId(null)
    setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1))
  }
  const more = async () => {
    if (cursor === null || loadingMore) return
    setLoadingMore(true)
    setError('')
    try {
      const { data } = await apiClient.get<
        Response<{ items: RecordItem[]; hasNext: boolean; nextCursor: number | null }>
      >('/api/records', { params: { cursor, size: 20 } })
      if (!data.success || !data.data || !Array.isArray(data.data.items))
        throw new Error('Invalid response')
      setRecent((items) => [...(items ?? []), ...data.data!.items])
      setCursor(data.data.nextCursor)
      setHasNext(data.data.hasNext)
    } catch {
      setError('more')
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
            state={{ from: 'recent', ...(preview && { record: item }) }}
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
              onClick={() => changeTab('calendar')}
            >
              다이어리
            </button>
            <button role="tab" aria-selected={tab === 'recent'} onClick={() => changeTab('recent')}>
              최근 기록
            </button>
          </div>
        </header>
        <main className={showInlineDetail ? styles.inlineContent : styles.content}>
          {tab === 'calendar' ? (
            selectedRecord ? (
              <RecordDetailContent
                key={selectedRecord.recordId}
                recordId={String(selectedRecord.recordId)}
                preview={preview}
                record={selectedRecord}
                onClose={() => {
                  if (selectedItems.length > 1) setSelectedRecordId(null)
                  else setSelected(null)
                }}
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
                          onClick={() => {
                            setSelected(date)
                            setSelectedRecordId(null)
                          }}
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
                {selectedItems.length > 1 ? (
                  <section aria-label="선택한 날짜의 기록">
                    <h2>{selected}의 기록</h2>
                    <ul className={styles.cards}>
                      {selectedItems.map((item) => (
                        <li key={item.recordId}>
                          <button
                            className={styles.recordChoice}
                            onClick={() => setSelectedRecordId(item.recordId)}
                          >
                            <span className={styles.thumbnail}>
                              <RecordImage url={item.imageUrl} preview={preview} />
                            </span>
                            <strong>{item.title || '나의 그림 기록'}</strong>
                            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : calendarItems === null && !calendarError ? (
                  <p className={styles.status}>기록을 불러오고 있어요.</p>
                ) : calendarItems !== null && selected ? (
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
          {tab === 'calendar' && calendarError && (
            <p className={styles.status} role="alert">
              달력을 불러오지 못했어요.{' '}
              <button
                onClick={() => {
                  setCalendarError(false)
                  setCalendarAttempt((value) => value + 1)
                }}
              >
                다시 시도
              </button>
            </p>
          )}
          {tab === 'recent' && error && (
            <p className={styles.status} role="alert">
              {error === 'recent'
                ? '최근 기록을 불러오지 못했어요.'
                : '기록을 더 불러오지 못했어요.'}{' '}
              <button
                onClick={() => {
                  setError('')
                  if (error === 'more') void more()
                  else setRecentAttempt((value) => value + 1)
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
