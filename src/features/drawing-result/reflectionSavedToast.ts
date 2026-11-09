import { createContext } from 'react'

export const ReflectionSavedToastContext = createContext<(() => void) | null>(null)
