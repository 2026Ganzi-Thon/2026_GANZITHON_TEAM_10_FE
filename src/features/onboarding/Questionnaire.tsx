import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Dropdown, Input, TextArea } from '@/components'
import { apiClient } from '@/lib/api-client'
import { previewOptions } from './preview'
import styles from './Questionnaire.module.css'

type Option = { code: string; label: string }
type Options = {
  themes: Option[]
  emotions: Option[]
  lifeStatuses: Option[]
  artExperiences: Option[]
}
type Response = { success: boolean; data: Options }
type OnboardingAnswers = {
  birthYear: number | null
  gender: string | null
  artExperience: string | null
  themeCode: string | null
  themeText: string | null
  lifeStatus: string | null
  lifeStatusText: string | null
  emotions: string[] | null
  emotionText: string | null
  extraStory: string | null
}
type UserResponse = { success: boolean; data: { onboarding: OnboardingAnswers | null } }

const order = {
  lifeStatuses: [
    'STUDENT',
    'GRAD_STUDENT',
    'JOB_SEEKER',
    'WORKER',
    'FREELANCER',
    'CAREGIVER',
    'ON_LEAVE',
    'ETC',
  ],
  themes: [
    'STUDY_CAREER',
    'LOVE',
    'RELATION_FAMILY',
    'SELF_HEALTH',
    'DAILY_FUTURE',
    'MONEY',
    'UNSURE',
    'DIRECT',
  ],
  emotions: [
    'ANXIOUS',
    'LONELY',
    'STUCK',
    'ANNOYED',
    'TIRED',
    'JOY',
    'CALM',
    'COMPLEX',
    'UNSURE',
    'DIRECT',
  ],
}

/** 서버에서 제공한 선택지의 코드와 문구를 유지하면서 디자인 순서로 정렬한다. */
const ordered = (options: Option[], codes: readonly string[]) =>
  [...options].sort((a, b) => {
    const index = (code: string) => {
      const position = codes.indexOf(code)
      return position < 0 ? codes.length : position
    }
    return index(a.code) - index(b.code)
  })

/** 각 설문과 함께 움직이는 현재 단계 표시다. */
const Progress = ({ step }: { step: number }) => (
  <div className={styles.progress} aria-label={`설문 ${step + 1} / 5단계`}>
    <span className={step ? styles.done : styles.hidden} />
    <strong>{step + 1}</strong>
    <span className={step === 4 ? styles.hidden : ''} />
  </div>
)

/**
 * 다섯 단계의 설문 응답을 보관하고 마지막 단계에서 한 번에 저장한다.
 * `page` 쿼리의 1~5는 최초 진입 단계이며, 다른 값은 1단계로 처리한다.
 * 개발 환경의 `?preview` 또는 `?preview=onboarding`은 임시 선택지를 사용하고 서버 저장 없이 그림 안내 화면으로 이동한다.
 * 일반 모드에서는 선택지와 기존 답변을 조회하고 온보딩 답변을 통째로 저장한다.
 * 중간 단계 진입 시 앞선 필수 선택이나 직접 입력이 비어 있으면 1단계에서 시작한다.
 * 마지막 저장 전 입력 길이를 다시 확인하며, 기존 답변 조회 실패 시 저장하지 않는다.
 *
 * @returns 설문 화면 또는 선택지 로딩·오류 화면
 */
export const Questionnaire = () => {
  const navigate = useNavigate()
  const preview = new URLSearchParams(window.location.search)
  const isPreview =
    import.meta.env.DEV &&
    preview.has('preview') &&
    (preview.get('preview') === '' || preview.get('preview') === 'onboarding')
  const requestedPage = preview.get('page')
  const [initialStep] = useState(() =>
    requestedPage && /^[1-5]$/.test(requestedPage) ? Number(requestedPage) - 1 : 0,
  )
  const [step, setStep] = useState(initialStep)
  const [options, setOptions] = useState<Options | null>(isPreview ? previewOptions : null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState('')
  const [artExperience, setArtExperience] = useState('')
  const [lifeStatus, setLifeStatus] = useState('')
  const [lifeStatusText, setLifeStatusText] = useState('')
  const [themeCode, setThemeCode] = useState('')
  const [themeText, setThemeText] = useState('')
  const [emotions, setEmotions] = useState<string[]>([])
  const [emotionsWereNull, setEmotionsWereNull] = useState(false)
  const [emotionsChanged, setEmotionsChanged] = useState(false)
  const [emotionText, setEmotionText] = useState('')
  const [extraStory, setExtraStory] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (isPreview) return
    let active = true
    Promise.all([
      apiClient.get<Response>('/api/onboarding/options'),
      apiClient.get<UserResponse>('/api/users/me'),
    ])
      .then(([optionsResponse, userResponse]) => {
        if (!active) return
        if (
          !optionsResponse.data.success ||
          !optionsResponse.data.data ||
          !userResponse.data.success ||
          !userResponse.data.data ||
          userResponse.data.data.onboarding === undefined
        ) {
          setLoadError(true)
          return
        }
        const answers = userResponse.data.data.onboarding
        if (
          initialStep > 0 &&
          ((initialStep > 1 && answers?.lifeStatus === 'ETC' && !answers.lifeStatusText?.trim()) ||
            (initialStep > 2 &&
              (!answers?.themeCode ||
                (answers.themeCode === 'DIRECT' && !answers.themeText?.trim()))) ||
            (initialStep > 3 &&
              answers?.emotions?.includes('DIRECT') &&
              !answers.emotionText?.trim()))
        ) {
          setStep(0)
        }
        if (answers) {
          const fields = [
            'birthYear',
            'gender',
            'artExperience',
            'themeCode',
            'themeText',
            'lifeStatus',
            'lifeStatusText',
            'emotions',
            'emotionText',
            'extraStory',
          ]
          if (!fields.every((field) => Object.hasOwn(answers, field))) {
            setLoadError(true)
            return
          }
          setBirthYear(answers.birthYear == null ? '' : String(answers.birthYear))
          setGender(answers.gender ?? '')
          setArtExperience(answers.artExperience ?? '')
          setThemeCode(answers.themeCode ?? '')
          setThemeText(answers.themeText ?? '')
          setLifeStatus(answers.lifeStatus ?? '')
          setLifeStatusText(answers.lifeStatusText ?? '')
          setEmotions(answers.emotions ?? [])
          setEmotionsWereNull(answers.emotions === null)
          setEmotionText(answers.emotionText ?? '')
          setExtraStory(answers.extraStory ?? '')
        }
        setOptions(optionsResponse.data.data)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [attempt, initialStep, isPreview])

  const selectEmotion = (code: string) => {
    setEmotionsChanged(true)
    setEmotions((current) =>
      current.includes(code)
        ? current.filter((item) => item !== code)
        : current.length < 2
          ? [...current, code]
          : current,
    )
  }

  const next = async () => {
    setError('')
    if (
      step === 1 &&
      lifeStatus === 'ETC' &&
      (lifeStatusText.trim().length < 3 || lifeStatusText.trim().length > 30)
    )
      return setError('일상을 3~30자로 적어주세요.')
    if (step === 2 && !themeCode) return setError('선택지를 하나 골라주세요.')
    if (
      step === 2 &&
      themeCode === 'DIRECT' &&
      (themeText.trim().length < 3 || themeText.trim().length > 30)
    )
      return setError('고민을 3~30자로 입력해 주세요.')
    if (
      step === 3 &&
      emotions.includes('DIRECT') &&
      (emotionText.trim().length < 3 || emotionText.trim().length > 30)
    )
      return setError('감정을 3~30자로 입력해 주세요.')
    if (step < 4) return setStep(step + 1)
    if (
      lifeStatus === 'ETC' &&
      (lifeStatusText.trim().length < 3 || lifeStatusText.trim().length > 30)
    ) {
      setStep(1)
      return setError('일상을 3~30자로 적어주세요.')
    }
    if (!themeCode) {
      setStep(2)
      return setError('선택지를 하나 골라주세요.')
    }
    if (themeCode === 'DIRECT' && (themeText.trim().length < 3 || themeText.trim().length > 30)) {
      setStep(2)
      return setError('고민을 3~30자로 입력해 주세요.')
    }
    if (
      emotions.includes('DIRECT') &&
      (emotionText.trim().length < 3 || emotionText.trim().length > 30)
    ) {
      setStep(3)
      return setError('감정을 3~30자로 입력해 주세요.')
    }
    if (extraStory.trim() && (extraStory.trim().length < 5 || extraStory.trim().length > 100))
      return setError('추가 이야기를 5~100자로 입력해 주세요.')
    if (isPreview) return navigate('/drawing/onboarding/1')
    setLoading(true)
    try {
      const response = await apiClient.put<{ success: boolean }>('/api/users/me/onboarding', {
        birthYear: birthYear ? Number(birthYear) : null,
        gender: gender || null,
        artExperience: artExperience || null,
        themeCode,
        themeText: themeCode === 'DIRECT' ? themeText.trim() : null,
        lifeStatus: lifeStatus || null,
        lifeStatusText: lifeStatus === 'ETC' ? lifeStatusText.trim() : null,
        emotions: emotionsWereNull && !emotionsChanged ? null : emotions,
        emotionText: emotions.includes('DIRECT') ? emotionText.trim() : null,
        extraStory: extraStory.trim() || null,
      })
      if (!response.data.success) throw new Error('save failed')
      navigate('/drawing/onboarding/1')
    } catch {
      setError('저장하지 못했어요. 로그인 상태와 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  const choices = (
    items: Option[],
    selected: readonly string[],
    onSelect: (code: string) => void,
    columns = 2,
  ) => (
    <div className={`${styles.choices} ${columns === 3 ? styles.three : ''}`}>
      {items.map(({ code, label }) => (
        <Button
          key={code}
          color="gray"
          className={selected.includes(code) ? styles.selected : styles.choice}
          aria-pressed={selected.includes(code)}
          onClick={() => onSelect(code)}
        >
          {label}
        </Button>
      ))}
    </div>
  )

  if (!options)
    return (
      <div className={styles.message}>
        {loadError ? (
          <>
            <p>설문 정보를 불러오지 못했어요.</p>
            <Button
              onClick={() => {
                setLoadError(false)
                setAttempt(attempt + 1)
              }}
            >
              다시 시도
            </Button>
          </>
        ) : (
          '선택지를 불러오고 있어요.'
        )}
      </div>
    )
  return (
    <main className={styles.container}>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(-${step * 100}%)` }}>
          <div className={styles.slide} inert={step !== 0} aria-hidden={step !== 0}>
            <Progress step={0} />
            <div className={styles.content}>
              <div className={styles.profile}>
                <p className={styles.hint}>모든 항목은 선택 사항이에요.</p>
                <h2 className={styles.birthYearTitle}>나이</h2>
                <Dropdown
                  id="birth-year"
                  ariaLabel="나이"
                  placeholder="출생연도를 선택해 주세요"
                  value={birthYear}
                  onChange={setBirthYear}
                  options={Array.from({ length: 73 }, (_, i) => {
                    const year = String(2022 - i)
                    return { value: year, label: `${year}년` }
                  })}
                />
                <section>
                  <h2>성별</h2>
                  {choices(
                    [
                      { code: 'MALE', label: '남성' },
                      { code: 'FEMALE', label: '여성' },
                      { code: 'OTHER', label: '기타' },
                    ],
                    [gender],
                    setGender,
                    3,
                  )}
                </section>
                <section>
                  <h2>평소 미술 활동에 얼마나 익숙하신가요?</h2>
                  <p>
                    그림 실력은 중요하지 않아요.
                    <br />
                    나에게 맞는 미술 활동을 추천할 수 있도록 평소 경험을 알려주세요.
                  </p>
                  {choices(options.artExperiences, [artExperience], setArtExperience, 3)}
                </section>
              </div>
            </div>
          </div>
          <div className={styles.slide} inert={step !== 1} aria-hidden={step !== 1}>
            <Progress step={1} />
            <div className={styles.content}>
              <>
                <h1>요즘 어떤 일상을 보내고 계신가요?</h1>
                <p className={styles.hint}>선택하지 않고 넘어갈 수 있어요.</p>
                {choices(
                  ordered(options.lifeStatuses, order.lifeStatuses),
                  [lifeStatus],
                  setLifeStatus,
                )}
                {lifeStatus === 'ETC' && (
                  <div className={styles.directInput}>
                    <Input
                      id="life-text"
                      aria-label="일상 직접 입력"
                      placeholder="일상을 입력해 주세요"
                      maxLength={30}
                      value={lifeStatusText}
                      onChange={(e) => setLifeStatusText(e.target.value)}
                    />
                  </div>
                )}
              </>
            </div>
          </div>
          <div className={styles.slide} inert={step !== 2} aria-hidden={step !== 2}>
            <Progress step={2} />
            <div className={styles.content}>
              <>
                <h1>요즘 가장 마음이 쓰이는 일은 무엇인가요?</h1>
                <p className={styles.hint}>지금 가장 신경 쓰이는 고민을 골라주세요.</p>
                {choices(ordered(options.themes, order.themes), [themeCode], setThemeCode)}
                {themeCode === 'DIRECT' && (
                  <div className={styles.directInput}>
                    <Input
                      id="theme-text"
                      aria-label="고민 직접 입력"
                      placeholder="고민을 입력해 주세요"
                      maxLength={30}
                      value={themeText}
                      onChange={(e) => setThemeText(e.target.value)}
                    />
                  </div>
                )}
              </>
            </div>
          </div>
          <div className={styles.slide} inert={step !== 3} aria-hidden={step !== 3}>
            <Progress step={3} />
            <div className={styles.content}>
              <>
                <h1>요즘 내 마음과 가장 가까운 감정은 무엇인가요?</h1>
                <p className={styles.hint}>
                  어떤 감정이든 괜찮아요.
                  <br />
                  지금 느끼는 마음을 최대 2개 골라주세요.
                </p>
                {choices(ordered(options.emotions, order.emotions), emotions, selectEmotion)}
                {emotions.includes('DIRECT') && (
                  <div className={styles.directInput}>
                    <Input
                      id="emotion-text"
                      aria-label="감정 직접 입력"
                      placeholder="감정을 입력해 주세요"
                      maxLength={30}
                      value={emotionText}
                      onChange={(e) => setEmotionText(e.target.value)}
                    />
                  </div>
                )}
              </>
            </div>
          </div>
          <div className={styles.slide} inert={step !== 4} aria-hidden={step !== 4}>
            <Progress step={4} />
            <div className={styles.content}>
              <>
                <h1>더 들려주고 싶은 이야기가 있나요?</h1>
                <p className={styles.hint}>
                  선택지에 담지 못한 고민이나 요즘 마음에 남는 이야기가 있다면
                  <br />
                  5~100자로 자유롭게 적어주세요.
                </p>
                <div className={styles.story}>
                  <TextArea
                    id="extra-story"
                    aria-label="추가 이야기"
                    minHeight={199}
                    maxLength={100}
                    placeholder="예) 곧 졸업인데 어떤 일을 하고 싶은지 아직 모르겠어요."
                    value={extraStory}
                    onChange={(e) => setExtraStory(e.target.value)}
                  />
                </div>
              </>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.actions}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <Button onClick={() => void next()} disabled={loading}>
          {loading ? '저장 중...' : step === 4 ? '저장' : '다음'}
        </Button>
        {step > 0 && (
          <Button
            color="gray"
            className={styles.previous}
            disabled={loading}
            onClick={() => {
              setError('')
              setStep((current) => Math.max(0, current - 1))
            }}
          >
            이전
          </Button>
        )}
      </div>
    </main>
  )
}
