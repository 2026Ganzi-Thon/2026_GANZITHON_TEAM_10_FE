const legacyOwnerKey = 'moyang:mock-storage-legacy-owner'
const pendingMigrations = new Map<string, (saved: string | null) => string>()
export const mockStorageLock = 'moyang:mock-storage'

const getAccountSuffix = () => {
  const token = localStorage.getItem('moyang.accessToken')
  if (!token) return ''

  const payload = token.split('.')[1]
  if (!payload) throw new Error('로그인 정보를 확인할 수 없어요')

  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0))
  const { sub } = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: unknown }
  if ((typeof sub !== 'string' && typeof sub !== 'number') || String(sub).length === 0) {
    throw new Error('로그인 정보를 확인할 수 없어요')
  }

  return `:user:${encodeURIComponent(String(sub))}`
}

const keyWithAccount = (key: string, suffix: string) => `${key}${suffix || ':guest'}`

export const getMockStorageKey = (key: string) => keyWithAccount(key, getAccountSuffix())

export const getMockStorageScope = () => {
  try {
    return `moyang${getAccountSuffix()}`
  } catch {
    return null
  }
}

export const writeMockStorage = (key: string, data: unknown) => {
  localStorage.setItem(key, JSON.stringify(data))
  pendingMigrations.delete(key)
}

export const readMockStorage = <T>(key: string, parse: (saved: string) => T): T | null => {
  const local = localStorage.getItem(key)
  const saved = local ?? sessionStorage.getItem(key)
  const pending = pendingMigrations.get(key)
  if (pending) return parse(pending(saved))
  if (saved === null) return null

  const data = parse(saved)
  if (local === null) {
    try {
      writeMockStorage(key, data)
      sessionStorage.removeItem(key)
    } catch {
      // 브라우저에 쓸 수 없으면 기존 세션 데이터를 계속 사용한다.
    }
  }
  return data
}

export const migrateLegacyMockStorage = async (migrate: (accountSuffix: string) => void) => {
  try {
    const accountSuffix = getAccountSuffix()
    const migrateForAccount = () => {
      if (getAccountSuffix() === accountSuffix) migrate(accountSuffix)
    }
    if (navigator.locks) await navigator.locks.request(mockStorageLock, migrateForAccount)
    else migrateForAccount()
  } catch {
    // 저장소를 읽지 못해도 앱은 시작한다.
  }
}

export const migrateLegacyMockKey = <T>(
  key: string,
  accountSuffix: string,
  parse: (saved: string) => T,
  merge: (current: T, legacy: T) => T,
) => {
  try {
    const scope = `moyang${accountSuffix}`
    const owner = localStorage.getItem(legacyOwnerKey)
    if (owner && owner !== scope) return

    const sources = [localStorage, sessionStorage].flatMap((storage) => {
      const saved = storage.getItem(key)
      if (saved === null) return []
      try {
        return [{ storage, data: parse(saved) }]
      } catch {
        return []
      }
    })
    if (!sources.length) return
    if (!owner) localStorage.setItem(legacyOwnerKey, scope)

    const scopedKey = keyWithAccount(key, accountSuffix)
    const mergeSources = (current: string | null) =>
      sources.reduce<T | null>(
        (data, source) => (data === null ? source.data : merge(data, source.data)),
        current === null ? null : parse(current),
      )
    const migrated = mergeSources(
      localStorage.getItem(scopedKey) ?? sessionStorage.getItem(scopedKey),
    )
    try {
      writeMockStorage(scopedKey, migrated)
    } catch {
      pendingMigrations.set(scopedKey, (current) => JSON.stringify(mergeSources(current)))
      return
    }
    for (const { storage } of sources) storage.removeItem(key)
  } catch {
    // 이전에 실패하면 원본을 다음 실행까지 보관한다.
  }
}
