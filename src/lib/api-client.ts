import axios from 'axios'

/**
 * 백엔드 요청에서 공통으로 사용하는 클라이언트다.
 */
export const apiClient = axios.create({
  baseURL: import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_PRODUCTION_URL || '/api',
  timeout: 10_000,
})
