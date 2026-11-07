import axios from 'axios'

const tokenKey = 'moyang.accessToken'

/**
 * 백엔드 요청에서 공통으로 사용하는 클라이언트다.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_PRODUCTION_URL || '/api',
  timeout: 10_000,
})

/** 로그인에서 받은 토큰을 현재 탭에 보관하고, null이면 인증 정보를 지운다. */
export const setAccessToken = (token: string | null) => {
  if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`
  else delete apiClient.defaults.headers.common.Authorization

  try {
    if (token) sessionStorage.setItem(tokenKey, token)
    else sessionStorage.removeItem(tokenKey)
  } catch {
    // 저장소를 사용할 수 없는 환경에서는 현재 페이지에서만 토큰을 유지한다.
  }
}

try {
  const token = sessionStorage.getItem(tokenKey)
  if (token) apiClient.defaults.headers.common.Authorization = `Bearer ${token}`
} catch {
  // 저장소를 사용할 수 없으면 로그인 후 메모리에만 토큰을 설정한다.
}
