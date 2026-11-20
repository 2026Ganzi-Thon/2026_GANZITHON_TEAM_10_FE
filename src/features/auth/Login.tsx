import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Button, Input, PageHeader } from '@/components'
import { apiClient, setAccessToken } from '@/lib/api-client'
import styles from './Login.module.css'

type LoginResponse = {
  success: boolean
  data: { accessToken: string; user: { onboardingCompleted: boolean } } | null
}

/** 로그인 응답의 온보딩 완료 여부에 따라 다음 화면으로 이동한다. */
export const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentialsInvalid, setCredentialsInvalid] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (requestRef.current) return
    setError('')
    setCredentialsInvalid(false)
    setSubmitted(true)
    if (!loginId.trim() || !password) return
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    try {
      const { data } = await apiClient.post<LoginResponse>(
        '/api/auth/login',
        { loginId: loginId.trim(), password },
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      if (
        !data.success ||
        !data.data?.accessToken ||
        typeof data.data.user?.onboardingCompleted !== 'boolean'
      )
        throw new Error('Invalid response')
      setAccessToken(data.data.accessToken)
      navigate(data.data.user.onboardingCompleted ? '/home' : '/onboarding/profile', {
        replace: true,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      setCredentialsInvalid(axios.isAxiosError(error) && error.response?.status === 401)
      setError(
        axios.isAxiosError(error) && error.response?.status === 401
          ? '아이디 또는 비밀번호를 확인해 주세요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
    } finally {
      if (!controller.signal.aborted) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="로그인"
        action="back"
        onNavigate={() => {
          requestRef.current?.abort()
          if (location.key === 'default') navigate('/onboarding')
          else navigate(-1)
        }}
      />
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.intro}>
          <h2>다시 만나서 반가워요!</h2>
          <p>모양에서 나의 마음을 이어서 살펴봐요.</p>
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <Input
              id="login-id"
              label="아이디"
              placeholder="아이디를 입력해 주세요"
              autoComplete="username"
              value={loginId}
              error={submitted && !loginId.trim() ? '아이디를 입력해 주세요.' : undefined}
              aria-invalid={credentialsInvalid || undefined}
              aria-describedby={credentialsInvalid ? 'login-password-message' : undefined}
              onChange={(event) => {
                setLoginId(event.target.value)
                setCredentialsInvalid(false)
                setError('')
              }}
              required
            />
          </div>
          <div className={styles.field}>
            <Input
              id="login-password"
              label="비밀번호"
              placeholder="비밀번호를 입력해 주세요"
              type="password"
              autoComplete="current-password"
              value={password}
              error={
                submitted && !password
                  ? '비밀번호를 입력해 주세요.'
                  : credentialsInvalid
                    ? error
                    : undefined
              }
              onChange={(event) => {
                setPassword(event.target.value)
                setCredentialsInvalid(false)
                setError('')
              }}
              required
            />
          </div>
          <button type="button" className={styles.forgot} disabled>
            비밀번호를 잊으셨나요?
          </button>
          {error && !credentialsInvalid && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </Button>
          <p>
            아직 계정이 없으신가요?{' '}
            <button type="button" disabled>
              회원가입
            </button>
          </p>
        </div>
      </form>
    </div>
  )
}
