import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faClipboardCheck,
  faPencil,
  faImage,
  faComments,
  faCopy,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components'
import drawing from '@/assets/home/home-introduction-1.png'
import meeting from '@/assets/home/home-introduction-2.png'
import records from '@/assets/home/home-introduction-3.png'
import sheep from '@/assets/home/home-introduction-4.png'
import styles from './About.module.css'

const values = [
  [
    '마음에도 저마다의 모양이 있어요.',
    '사람마다 느끼는 감정과 생각은 모두 달라요.',
    '모양은 나만의 마음을 자유롭게 표현하는 공간이에요.',
  ],
  [
    '잘 그리지 않아도 괜찮아요.',
    '동그라미, 세모, 네모처럼 단순한 모양만으로도 충분해요.',
    '그림의 완성도보다 내 마음을 표현하는 과정이 중요해요.',
  ],
  [
    '모양의 ‘양’과 함께해요.',
    '모양에는 마음을 함께 돌보는 작은 친구, 양이 있어요.',
    '그림을 그리며 양털을 모으고, 나만의 양을 성장시켜 보세요.',
  ],
]
const steps = [
  { icon: faClipboardCheck, label: '질문으로 시작' },
  { icon: faPencil, label: '그림 그리기' },
  { icon: faImage, label: '사진 업로드' },
  { icon: faComments, label: 'AI와 대화 나누기' },
  { icon: faCopy, label: '기록하고 마음 돌보기' },
]
const features = [
  {
    image: drawing,
    title: '그리며 마음 탐색하기',
    description: (
      <>
        그림을 그리고, AI와 대화하며
        <br />
        지금 내 마음을 천천히 들여다봐요.
      </>
    ),
  },
  {
    image: meeting,
    title: '그림 나눔 모임 참여하기',
    description: (
      <>
        비슷한 고민을 가진 사람들과
        <br />
        그림을 그리고, 이야기를 나눠요.
      </>
    ),
  },
  {
    image: records,
    title: '나의 기록 모아보기',
    description: (
      <>
        그동안 그린 그림과 대화를 한눈에
        <br />내 마음의 변화를 확인해요.
      </>
    ),
  },
  {
    image: sheep,
    title: '양털 모아 성장하기',
    description: (
      <>
        하루 첫 회고를 저장하면
        <br />
        양털 1개를 받아 나만의 양을 키워요.
      </>
    ),
  },
]

/** 모양의 의미와 이용 방법을 소개한다. */
export const About = () => {
  const navigate = useNavigate()
  const { search } = useLocation()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')

  return (
    <div className={styles.page}>
      <PageHeader
        title="모양 알아보기"
        action="back"
        onNavigate={() => {
          if (window.history.state?.idx > 0) navigate(-1)
          else navigate(`/home${preview ? '?preview' : ''}`, { replace: true })
        }}
      />
      <main className={styles.content}>
        <div className={styles.intro}>
          <h2>
            <span>모양</span>은<br />
            어떤 앱인가요?
          </h2>
          <p>
            그림을 통해 내 마음을 탐색하고 AI와의 대화로
            <br />
            스스로를 더 깊이 이해할 수 있는 정서 케어 앱이에요.
          </p>
        </div>
        <section className={styles.values}>
          <h2>모양의 의미</h2>
          <ul>
            {values.map(([title, line1, line2]) => (
              <li key={title}>
                <h3>{title}</h3>
                <p>
                  {line1}
                  <br />
                  {line2}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.how}>
          <h2>이렇게 이용해요</h2>
          <ol>
            {steps.map(({ icon, label }, index) => (
              <li key={label}>
                <div className={styles.step}>
                  <FontAwesomeIcon icon={icon} aria-hidden="true" />
                  <span>{label}</span>
                </div>
                {index < steps.length - 1 && (
                  <FontAwesomeIcon
                    className={styles.arrow}
                    icon={faChevronRight}
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className={styles.features}>
          <h2>주요 기능</h2>
          <ul>
            {features.map(({ image, title, description }) => (
              <li key={title}>
                <img src={image} alt="" />
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <p className={styles.disclaimer}>
          모양은 의료적 진단이나 치료를 대신하지 않으며,
          <br />
          스스로의 감정을 탐색할 수 있도록 도와줘요.
        </p>
      </main>
    </div>
  )
}
