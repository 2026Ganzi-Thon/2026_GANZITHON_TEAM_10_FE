import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBell, faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { Button, HomeLayout } from '@/components'
import { apiClient } from '@/lib/api-client'
import banner1 from '@/assets/drawing/drawing-banner-1.png'
import banner2 from '@/assets/drawing/drawing-banner-2.png'
import banner3 from '@/assets/drawing/drawing-banner-3.png'
import banner4 from '@/assets/drawing/drawing-banner-4.png'
import styles from './DrawingHome.module.css'

const banners = [banner1, banner2, banner3, banner4]
type Option = { code: string; label: string }
type Profile = {
  nickname: string
  onboarding: {
    themeCode: string | null
    themeText: string | null
    emotions: string[] | null
    emotionText: string | null
  } | null
}
type Response<T> = { success: boolean; data: T | null }
type Info = { nickname: string; tags: string[] }

/** 내 정보와 선택지 문구를 함께 불러와 현재 주제에 반영된 정보를 표시한다. */
export const DrawingHome = () => {
  const { search, state } = useLocation()
  const navigate = useNavigate()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [banner] = useState(() => banners[Math.floor(Math.random() * banners.length)])
  const [info, setInfo] = useState<Info | null>(
    preview ? { nickname: '딸기를 좋아하는 양', tags: ['인간관계·가족', '불안해요'] } : null,
  )
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    Promise.all([
      apiClient.get<Response<Profile>>('/api/users/me', { signal: controller.signal }),
      apiClient.get<Response<{ themes: Option[]; emotions: Option[] }>>('/api/onboarding/options', {
        signal: controller.signal,
      }),
    ])
      .then(([profile, options]) => {
        if (
          !profile.data.success ||
          !profile.data.data ||
          !options.data.success ||
          !options.data.data
        )
          throw new Error('Invalid response')
        const { nickname, onboarding } = profile.data.data
        const label = (code: string, list: Option[], direct: string | null) =>
          code === 'DIRECT' ? direct?.trim() : list.find((item) => item.code === code)?.label
        const tags = [
          onboarding?.themeCode
            ? label(onboarding.themeCode, options.data.data.themes, onboarding.themeText)
            : undefined,
          ...(onboarding?.emotions ?? []).map((code) =>
            label(code, options.data.data!.emotions, onboarding.emotionText),
          ),
        ].filter((value): value is string => Boolean(value))
        setInfo({ nickname, tags })
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
    return () => controller.abort()
  }, [preview, attempt])

  return (
    <HomeLayout>
      <main className={styles.page}>
        <div className={styles.top}>
          <Link to={preview ? '/notifications?preview' : '/notifications'} aria-label="알림">
            <FontAwesomeIcon icon={faBell} />
          </Link>
        </div>
        <div className={styles.content}>
          <h1>
            오늘은 어떤 마음을
            <br />
            그려볼까요?
          </h1>
          <p className={styles.description}>
            {info?.nickname
              ? `${info.nickname}님의 고민과 오늘의 마음을 바탕으로`
              : '나의 고민과 오늘의 마음을 바탕으로'}
            <br />
            그림 주제를 준비했어요.
          </p>
          <img className={styles.sheep} src={banner} alt="" />
          <section className={styles.info} aria-label="현재 반영된 정보">
            <span className={styles.infoTitle}>
              <span>
                <FontAwesomeIcon icon={faCircleInfo} /> 현재 반영된 정보
              </span>
            </span>
            {error ? (
              <span>정보를 불러오지 못했어요.</span>
            ) : !info ? (
              <span>정보를 불러오는 중이에요.</span>
            ) : info.tags.length ? (
              <span className={styles.tags}>
                {info.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`}>{tag}</span>
                ))}
              </span>
            ) : (
              <span>아직 반영된 정보가 없어요.</span>
            )}
          </section>
          {error && (
            <button
              className={styles.retry}
              type="button"
              onClick={() => {
                setError(false)
                setAttempt((value) => value + 1)
              }}
            >
              다시 시도
            </button>
          )}
          <div className={styles.actions}>
            <Button
              onClick={() =>
                navigate(`/drawing/onboarding/2${preview ? '?preview' : ''}`, { state })
              }
            >
              주제 확인하기
            </Button>
            <Link to={`/onboarding/profile?page=3${preview ? '&preview' : ''}`}>
              고민을 바꾸고 시작하기
            </Link>
          </div>
        </div>
      </main>
    </HomeLayout>
  )
}
