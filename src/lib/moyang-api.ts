import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { apiClient, getAccessToken } from './api-client'

export const hasMoyangApi = Boolean(
  import.meta.env.DEV
    ? import.meta.env.VITE_API_DEVELOPMENT_URL
    : import.meta.env.VITE_API_PRODUCTION_URL,
)

type ApiEnvelope<T> = {
  success: boolean
  data: T
  error?: { code: string }
}

export class MoyangApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(code: string, status?: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

export const moyangRequest = (signal?: AbortSignal, token = getAccessToken()) => {
  const assertCurrent = () => {
    if (signal?.aborted || token !== getAccessToken()) {
      throw new DOMException('Request cancelled', 'AbortError')
    }
  }

  const request = async <T>(url: string, config?: AxiosRequestConfig) => {
    assertCurrent()
    if (!token) throw new MoyangApiError('UNAUTHORIZED', 401)
    try {
      const response = await apiClient.request<T>({
        ...config,
        url,
        signal,
        headers: { Authorization: `Bearer ${token}` },
      })
      assertCurrent()
      return response.data
    } catch (error) {
      assertCurrent()
      if (axios.isAxiosError<ApiEnvelope<unknown>>(error)) {
        throw new MoyangApiError(
          error.response?.data?.error?.code ?? error.code ?? 'REQUEST_FAILED',
          error.response?.status,
        )
      }
      throw error
    }
  }

  return {
    async json<T>(url: string, config?: AxiosRequestConfig) {
      const body = await request<ApiEnvelope<T>>(url, config)
      if (!body?.success) throw new MoyangApiError(body?.error?.code ?? 'INVALID_RESPONSE')
      return body.data
    },
    image(url: string) {
      if (!/^\/api\/drawings\/\d+\/image$/.test(url)) throw new MoyangApiError('INVALID_IMAGE_PATH')
      return request<Blob>(url, { responseType: 'blob' })
    },
  }
}
