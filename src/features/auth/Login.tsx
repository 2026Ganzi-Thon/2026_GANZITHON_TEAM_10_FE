import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Button, Input, PageHeader } from '@/components'
import { apiClient, setAccessToken } from '@/lib/api-client'
import styles from './Login.module.css'

type LoginResponse = {
  success: boolean
  data: { accessToken: string } | null
}

type UserResponse = {
  success: boolean
  data: { onboarding: object | null } | null
}

/** 로그인 후 내 정보를 조회해 온보딩 정보가 없으면 프로필로, 있으면 홈으로 이동한다. */
export const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentialsInvalid, setCredentialsInvalid] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setCredentialsInvalid(false)
    setLoading(true)
    try {
      const { data } = await apiClient.post<LoginResponse>('/api/auth/login', {
        loginId: loginId.trim(),
        password,
      })
      if (!data.success || !data.data?.accessToken) throw new Error('Invalid response')
      setAccessToken(data.data.accessToken)
    } catch (error) {
      setCredentialsInvalid(axios.isAxiosError(error) && error.response?.status === 401)
      setError(
        axios.isAxiosError(error) && error.response?.status === 401
          ? '아이디 또는 비밀번호를 확인해 주세요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
      setLoading(false)
      return
    }

    try {
      const { data } = await apiClient.get<UserResponse>('/api/users/me')
      if (
        !data.success ||
        !data.data ||
        (data.data.onboarding !== null &&
          (typeof data.data.onboarding !== 'object' || Array.isArray(data.data.onboarding)))
      )
        throw new Error('Invalid response')
      navigate(data.data.onboarding === null ? '/onboarding/profile' : '/home', { replace: true })
    } catch {
      setAccessToken(null)
      setError('내 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="로그인"
        action="back"
        onNavigate={() => (location.key === 'default' ? navigate('/onboarding') : navigate(-1))}
      />
      <form className={styles.form} onSubmit={handleSubmit}>
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
              aria-invalid={credentialsInvalid || undefined}
              aria-describedby={credentialsInvalid ? 'login-password-error' : undefined}
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
              error={credentialsInvalid ? error : undefined}
              onChange={(event) => {
                setPassword(event.target.value)
                setCredentialsInvalid(false)
                setError('')
              }}
              required
            />
          </div>
          <button type="button" className={styles.forgot}>
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
            아직 계정이 없으신가요? <button type="button">회원가입</button>
          </p>
        </div>
      </form>
    </div>
  )
}
