import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { migrateLegacyPrograms } from '@/features/personal-program/programMock'
import { migrateLegacyReflections } from '@/lib/mock-reflections'
import { migrateLegacyMockStorage } from '@/lib/mock-storage'
import './index.css'
import App from './App.tsx'

void migrateLegacyMockStorage((accountSuffix) => {
  migrateLegacyReflections(accountSuffix)
  migrateLegacyPrograms(accountSuffix)
}).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
