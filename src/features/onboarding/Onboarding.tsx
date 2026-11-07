import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Autoplay, Pagination, A11y } from 'swiper/modules'
import { Swiper, SwiperSlide } from 'swiper/react'
import 'swiper/css'
import 'swiper/css/pagination'
import { Button } from '@/components'
import leftTop from '@/assets/onboarding/onboarding-l-t.webp'
import leftBottom from '@/assets/onboarding/onboarding-l-b.webp'
import centerBottom from '@/assets/onboarding/onboarding-c-b.webp'
import rightTop from '@/assets/onboarding/onboarding-r-t.webp'
import rightBottom from '@/assets/onboarding/onboarding-r-b.webp'
import slide1 from '@/assets/onboarding/onboarding-slide-1.png'
import slide2 from '@/assets/onboarding/onboarding-slide-2.png'
import slide3 from '@/assets/onboarding/onboarding-slide-3.png'
import slide4 from '@/assets/onboarding/onboarding-slide-4.png'
import styles from './Onboarding.module.css'

const slides = [
  {
    image: slide1,
    title: '말 대신, 그림으로',
    description: (
      <>
        내 마음과 감정을 어떻게 설명해야 할지 모르겠다면,
        <br />
        그림으로 시작해 보세요.
      </>
    ),
  },
  {
    image: slide2,
    title: '그림이 대화가 되는 순간',
    description: (
      <>
        AI와 그림에 대해 이야기하며
        <br />내 마음을 조금 더 알아가요.
      </>
    ),
  },
  {
    image: slide3,
    title: '그릴수록 포근해지는 양',
    description: (
      <>
        그림을 완성할 때마다 양털이 쌓여요.
        <br />
        나의 기록과 함께 양도 자라나요.
      </>
    ),
  },
  {
    image: slide4,
    title: '다음 그림, 다음 이야기',
    description: (
      <>
        내 고민에 맞는 그림 활동을 이어가고,
        <br />
        모임에서 서로의 이야기도 나눠요.
      </>
    ),
  },
]

/** 모션 설정에 따라 시작 화면과 소개 슬라이드를 표시한다. */
export const Onboarding = () => {
  const navigate = useNavigate()
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [phase, setPhase] = useState<'splash' | 'fade' | 'intro'>(
    reducedMotion ? 'intro' : 'splash',
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches)
      if (event.matches) setPhase('intro')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reducedMotion) return
    const fade = window.setTimeout(
      () => setPhase((current) => (current === 'splash' ? 'fade' : current)),
      2000,
    )
    const intro = window.setTimeout(() => setPhase('intro'), 2600)
    return () => {
      window.clearTimeout(fade)
      window.clearTimeout(intro)
    }
  }, [reducedMotion])

  return (
    <div className={styles.container}>
      {phase !== 'splash' && (
        <section className={styles.intro} aria-label="서비스 소개">
          <Swiper
            key={String(reducedMotion)}
            className={styles.swiper}
            modules={[Autoplay, Pagination, A11y]}
            loop
            autoplay={reducedMotion ? false : { delay: 4000, disableOnInteraction: false }}
            speed={reducedMotion ? 0 : 300}
            pagination={{ clickable: true }}
            aria-label="온보딩 슬라이드"
          >
            {slides.map((slide, index) => (
              <SwiperSlide key={slide.title}>
                <div className={styles.slide}>
                  <div className={styles.art}>
                    <img className={styles[`art${index + 1}`]} src={slide.image} alt="" />
                  </div>
                  <div className={styles.copy}>
                    <h2>{slide.title}</h2>
                    <p>{slide.description}</p>
                  </div>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
          <div className={styles.actions}>
            <Button onClick={() => navigate('/login')}>로그인</Button>
            <Button className={styles.signup} disabled>
              회원가입
            </Button>
            <Button className={styles.guest}>비회원 로그인</Button>
          </div>
        </section>
      )}
      {phase !== 'intro' && (
        <div
          className={`${styles.splash} ${phase === 'fade' ? styles.fade : ''}`}
          aria-hidden={phase === 'fade'}
        >
          <img className={styles.leftTop} src={leftTop} alt="" />
          <img className={styles.leftBottom} src={leftBottom} alt="" />
          <img className={styles.centerBottom} src={centerBottom} alt="" />
          <img className={styles.rightTop} src={rightTop} alt="" />
          <img className={styles.rightBottom} src={rightBottom} alt="" />
          <div className={styles.brand}>
            <h1>모양</h1>
            <p>마음에도 저마다의 모양이 있어요</p>
          </div>
        </div>
      )}
    </div>
  )
}
