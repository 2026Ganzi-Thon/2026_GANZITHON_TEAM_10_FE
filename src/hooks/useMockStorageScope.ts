import { useSyncExternalStore } from 'react'
import { getMockStorageScope } from '@/lib/mock-storage'

const subscribe = (onChange: () => void) => {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

export const useMockStorageScope = () => useSyncExternalStore(subscribe, getMockStorageScope)
