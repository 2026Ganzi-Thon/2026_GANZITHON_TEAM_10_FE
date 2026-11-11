export const getMockStorageKey = (key: string) => {
  const token = localStorage.getItem('moyang.accessToken')
  if (!token) return key

  const payload = token.split('.')[1]
  if (!payload) throw new Error('로그인 정보를 확인할 수 없어요')

  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  const { sub } = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown }
  if ((typeof sub !== 'string' && typeof sub !== 'number') || String(sub).length === 0) {
    throw new Error('로그인 정보를 확인할 수 없어요')
  }

  return `${key}:user:${encodeURIComponent(String(sub))}`
}
