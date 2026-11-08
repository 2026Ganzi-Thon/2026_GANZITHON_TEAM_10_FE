import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Button, Input, PageHeader } from '@/components'
import { apiClient, setAccessToken } from '@/lib/api-client'
import styles from './Login.module.css'

type LoginResponse = {
  success: boolean
  data: { accessToken: string; user: { onboardingCompleted: boolean } } | null
}

/** 로그인 후 액세스 토큰을 저장하고 온보딩 완료 여부에 맞는 화면으로 이동한다. */
export const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const { data } = await apiClient.post<LoginResponse>('/auth/login', {
        loginId: loginId.trim(),
        password,
      })
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
      setError(
        axios.isAxiosError(error) && error.response?.status === 401
          ? '아이디 또는 비밀번호를 확인해 주세요.'
          : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
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
              onChange={(event) => setLoginId(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <p className={styles.forgot}>비밀번호를 잊으셨나요?</p>
          {error && (
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
            아직 계정이 없으신가요? <span>회원가입</span>
          </p>
        </div>
      </form>
    </div>
  )
}
