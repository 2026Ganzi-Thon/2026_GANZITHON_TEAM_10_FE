const legacyOwnerKey = 'moyang:mock-storage-legacy-owner'
const legacyReaders = new Map<string, (saved: string | null) => string | undefined>()
const legacyMigrations = new Map<string, (accountSuffix: string) => void>()
const migratingKeys = new Set<string>()
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

const readSessionStorage = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const backupUnownedSession = (key: string) => {
  try {
    const owner = localStorage.getItem(legacyOwnerKey)
    const sourceKeys = owner && owner !== 'moyang' ? [`${key}:guest`] : [key, `${key}:guest`]
    for (const sourceKey of sourceKeys) {
      const saved = sessionStorage.getItem(sourceKey)
      if (saved === null) continue

      const prefix = `moyang:mock-storage-backup:session:${encodeURIComponent(sourceKey)}:`
      let backedUp = false
      for (let index = 0; index < localStorage.length; index += 1) {
        const backupKey = localStorage.key(index)
        if (backupKey?.startsWith(prefix) && localStorage.getItem(backupKey) === saved) {
          backedUp = true
          break
        }
      }
      if (!backedUp) localStorage.setItem(`${prefix}${crypto.randomUUID()}`, saved)
    }
  } catch {
    // 백업에 실패해도 세션 원본은 삭제하지 않는다.
  }
}

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
}

export const readMockStorage = <T>(key: string, parse: (saved: string) => T): T | null => {
  const local = localStorage.getItem(key)
  const stored = local ?? readSessionStorage(key)
  const accountSuffix = getAccountSuffix()
  const readLegacy =
    accountSuffix && key.endsWith(accountSuffix)
      ? legacyReaders.get(key.slice(0, -accountSuffix.length))
      : undefined
  const legacy = readLegacy?.(stored)
  const saved = legacy ?? stored
  if (saved === null) return null

  const data = parse(saved)
  if (local === null && legacy === undefined) {
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
    migrate('')
    const scope = getMockStorageScope()
    const migrateForAccount = () => {
      if (getMockStorageScope() !== scope) return
      if (scope && scope !== 'moyang') {
        const accountSuffix = scope.slice('moyang'.length)
        for (const migrateKey of legacyMigrations.values()) migrateKey(accountSuffix)
      }
      for (const key of legacyMigrations.keys()) backupUnownedSession(key)
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
  const readSources = () =>
    [() => localStorage, () => sessionStorage].flatMap((getStorage) => {
      try {
        const storage = getStorage()
        const saved = storage.getItem(key)
        if (saved === null) return []
        return [{ storage, saved, data: parse(saved) }]
      } catch {
        return []
      }
    })

  const mergeSources = (current: string | null, sources: ReturnType<typeof readSources>) =>
    sources.reduce<T | null>(
      (data, source) => (data === null ? source.data : merge(data, source.data)),
      current === null ? null : parse(current),
    )

  const migrateForAccount = (suffix: string) => {
    try {
      if (
        !suffix ||
        getAccountSuffix() !== suffix ||
        localStorage.getItem(legacyOwnerKey) !== `moyang${suffix}`
      ) {
        return
      }

      const sources = readSources()
      if (!sources.length) return

      const scopedKey = keyWithAccount(key, suffix)
      const migrated = mergeSources(
        localStorage.getItem(scopedKey) ?? readSessionStorage(scopedKey),
        sources,
      )
      writeMockStorage(scopedKey, migrated)
      for (const { storage, saved } of sources) {
        if (storage.getItem(key) === saved) storage.removeItem(key)
      }
    } catch {
      // 이전에 실패하면 원본을 다음 실행까지 보관한다.
    }
  }

  legacyMigrations.set(key, migrateForAccount)
  legacyReaders.set(key, (saved) => {
    const suffix = getAccountSuffix()
    if (!suffix || localStorage.getItem(legacyOwnerKey) !== `moyang${suffix}`) return
    const sources = readSources()
    if (!sources.length) return
    const merged = JSON.stringify(mergeSources(saved, sources))
    const scopedKey = keyWithAccount(key, suffix)
    if (!migratingKeys.has(scopedKey)) {
      migratingKeys.add(scopedKey)
      void migrateLegacyMockStorage(migrateForAccount).finally(() =>
        migratingKeys.delete(scopedKey),
      )
    }
    return merged
  })

  migrateForAccount(accountSuffix)
}
