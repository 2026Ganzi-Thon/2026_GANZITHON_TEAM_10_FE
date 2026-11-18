const legacyOwnerKey = 'moyang:mock-storage-legacy-owner'
const legacyReaders = new Map<
  string,
  (local: string | null, session: string | null, suffix: string) => string | undefined
>()
const legacyMigrations = new Map<string, (accountSuffix: string) => void>()
const migratingKeys = new Set<string>()
export const mockStorageLock = 'moyang:mock-storage'

export class MockStorageUnavailableError extends Error {
  constructor() {
    super('저장된 자료를 확인하지 못했어요. 브라우저 설정을 확인한 뒤 다시 시도해 주세요.')
  }
}

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

const readSessionStorage = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    throw new MockStorageUnavailableError()
  }
}

const ownedSessionPrefix = (key: string, scope: string) =>
  `moyang:mock-storage-owned-session:${encodeURIComponent(scope)}:${encodeURIComponent(key)}:`

const isAccountScope = (scope: string | null): scope is string =>
  scope !== null && scope.startsWith('moyang:user:') && scope.length > 'moyang:user:'.length

const backupSession = (sourceKey: string, prefix: string, keepLatest = false) => {
  try {
    const saved = readSessionStorage(sourceKey)
    if (saved === null) return
    let timestamp = Date.now()
    let latestTime = 0
    let matchingTime = -1
    for (let index = 0; index < localStorage.length; index += 1) {
      const backupKey = localStorage.key(index)
      if (!backupKey?.startsWith(prefix)) continue
      const previousTime = Number(backupKey.slice(prefix.length).split(':')[0])
      const savedTime = Number.isFinite(previousTime) ? previousTime : 0
      if (localStorage.getItem(backupKey) === saved) {
        matchingTime = Math.max(matchingTime, savedTime)
      }
      latestTime = Math.max(latestTime, savedTime)
      if (Number.isFinite(previousTime)) {
        timestamp = Math.max(timestamp, previousTime + 1)
      }
    }
    if (matchingTime >= 0 && (!keepLatest || matchingTime === latestTime)) return
    localStorage.setItem(`${prefix}${timestamp}:${crypto.randomUUID()}`, saved)
  } catch {
    // 백업에 실패해도 세션 원본은 삭제하지 않는다.
  }
}

const backupOwnedSession = (key: string) => {
  const owner = localStorage.getItem(legacyOwnerKey)
  if (isAccountScope(owner)) backupSession(key, ownedSessionPrefix(key, owner), true)
  try {
    const prefix = `${key}:user:`
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const sourceKey = sessionStorage.key(index)
      if (!sourceKey?.startsWith(prefix) || sourceKey.length === prefix.length) continue
      const scope = `moyang${sourceKey.slice(key.length)}`
      backupSession(sourceKey, ownedSessionPrefix(sourceKey, scope), true)
    }
  } catch {
    // 접근할 수 없는 세션 원본은 그대로 보관한다.
  }
}

const backupUnownedSession = (key: string) => {
  const owner = localStorage.getItem(legacyOwnerKey)
  const sourceKeys = isAccountScope(owner) ? [`${key}:guest`] : [key, `${key}:guest`]
  for (const sourceKey of sourceKeys) {
    backupSession(sourceKey, `moyang:mock-storage-backup:session:${encodeURIComponent(sourceKey)}:`)
  }
}

export const getMockStorageKey = (key: string) => keyWithAccount(key, getAccountSuffix())

export const withMockStorageLock = async <T>(
  key: string,
  update: () => T,
  signal?: AbortSignal,
): Promise<T> => {
  signal?.throwIfAborted()
  const accountKey = getMockStorageKey(key)
  const applyUpdate = () => {
    signal?.throwIfAborted()
    if (accountKey !== getMockStorageKey(key)) throw new Error('로그인 정보가 변경됐어요')
    return update()
  }
  if (!navigator.locks) return applyUpdate()
  return navigator.locks.request(mockStorageLock, { signal }, applyUpdate)
}

export const getMockStorageScope = () => {
  try {
    return `moyang${getAccountSuffix()}`
  } catch {
    return null
  }
}

export const writeMockStorage = (key: string, data: unknown) => {
  if (localStorage.getItem(key) === null) readSessionStorage(key)
  localStorage.setItem(key, JSON.stringify(data))
}

export const readMockStorage = <T>(key: string, parse: (saved: string) => T): T | null => {
  const suffix = getAccountSuffix()
  const accountSuffix = suffix || ':guest'
  const readLegacy = key.endsWith(accountSuffix)
    ? legacyReaders.get(key.slice(0, -accountSuffix.length))
    : undefined
  const local = localStorage.getItem(key)
  let session: string | null = null
  let sessionUnavailable = false
  if (local === null || readLegacy) {
    try {
      session = readSessionStorage(key)
    } catch {
      sessionUnavailable = true
    }
  }
  const saved = readLegacy?.(local, session, suffix) ?? local ?? session
  if (saved === null && sessionUnavailable) throw new MockStorageUnavailableError()
  if (saved === null) return null

  return parse(saved)
}

const migrateRegisteredStorage = async (includeGuest = false) => {
  try {
    const scope = getMockStorageScope()
    const migrateForAccount = () => {
      if (scope && getMockStorageScope() === scope && (scope !== 'moyang' || includeGuest)) {
        const accountSuffix = scope.slice('moyang'.length)
        for (const migrateKey of legacyMigrations.values()) migrateKey(accountSuffix)
      }
      for (const key of legacyMigrations.keys()) backupOwnedSession(key)
      for (const key of legacyMigrations.keys()) backupUnownedSession(key)
    }
    if (navigator.locks) await navigator.locks.request(mockStorageLock, migrateForAccount)
    else migrateForAccount()
  } catch {
    // 저장소를 읽지 못해도 앱은 시작한다.
  }
}

export const migrateLegacyMockStorage = async (migrate: (accountSuffix: string) => void) => {
  try {
    migrate('')
    await migrateRegisteredStorage()
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
  const readSources = (suffix: string, requireReadable = false) => {
    const sources: { storage: Storage; key: string; saved: string; data: T }[] = []
    let unavailable = false
    let unreadableBackup = false
    const readBackups = (sourceKey: string) => {
      const prefix = ownedSessionPrefix(sourceKey, `moyang${suffix}`)
      const backupKeys: string[] = []
      for (let index = 0; index < localStorage.length; index += 1) {
        const backupKey = localStorage.key(index)
        if (backupKey?.startsWith(prefix)) backupKeys.push(backupKey)
      }
      for (const backupKey of backupKeys.sort().reverse()) {
        try {
          const saved = localStorage.getItem(backupKey)
          if (saved !== null) {
            sources.push({ storage: localStorage, key: backupKey, saved, data: parse(saved) })
          }
        } catch {
          unreadableBackup = true
        }
      }
    }
    readBackups(keyWithAccount(key, suffix))
    if (localStorage.getItem(legacyOwnerKey) === `moyang${suffix}`) {
      for (const getStorage of [() => localStorage, () => sessionStorage]) {
        try {
          const storage = getStorage()
          const saved = storage.getItem(key)
          if (saved !== null) sources.push({ storage, key, saved, data: parse(saved) })
        } catch {
          unavailable = true
        }
      }
    }
    readBackups(key)
    if (unreadableBackup) throw new MockStorageUnavailableError()
    if (requireReadable && unavailable && !sources.length) throw new MockStorageUnavailableError()
    return sources
  }

  const mergeSources = (current: string | null, sources: ReturnType<typeof readSources>) =>
    sources.reduce<T | null>(
      (data, source) => (data === null ? source.data : merge(data, source.data)),
      current === null ? null : parse(current),
    )

  const migrateForAccount = (suffix: string) => {
    try {
      if (getAccountSuffix() !== suffix) return
      const sources = suffix ? readSources(suffix) : []
      const scopedKey = keyWithAccount(key, suffix)
      const local = localStorage.getItem(scopedKey)
      let session: string | null = null
      try {
        session = readSessionStorage(scopedKey)
      } catch (error) {
        if (local === null) throw error
      }
      if (session !== null) {
        sources.unshift({
          storage: sessionStorage,
          key: scopedKey,
          saved: session,
          data: parse(session),
        })
      }
      if (!sources.length) return
      const migrated = mergeSources(local, sources)
      writeMockStorage(scopedKey, migrated)
      for (const { storage, key: sourceKey, saved } of sources) {
        if (storage.getItem(sourceKey) === saved) storage.removeItem(sourceKey)
      }
    } catch {
      // 이전에 실패하면 원본을 다음 실행까지 보관한다.
    }
  }

  legacyMigrations.set(key, migrateForAccount)
  legacyReaders.set(key, (local, session, suffix) => {
    const sources = suffix ? readSources(suffix, local === null && session === null) : []
    if (!sources.length && session === null) return
    const current =
      local === null
        ? session
        : session === null
          ? local
          : JSON.stringify(merge(parse(local), parse(session)))
    const merged = JSON.stringify(mergeSources(current, sources))
    const scopedKey = keyWithAccount(key, suffix)
    if (!migratingKeys.has(scopedKey)) {
      migratingKeys.add(scopedKey)
      void migrateRegisteredStorage(true).finally(() => migratingKeys.delete(scopedKey))
    }
    return merged
  })

  if (accountSuffix) migrateForAccount(accountSuffix)
}
