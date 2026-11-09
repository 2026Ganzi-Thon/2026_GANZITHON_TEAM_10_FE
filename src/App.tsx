import { RouterProvider } from 'react-router-dom'
import { ReflectionSavedToastProvider } from '@/features/drawing-result/ReflectionSavedToastProvider'
import { router } from '@/routes/router'

/**
 * 애플리케이션에 라우터를 연결한다.
 *
 * @returns 라우터가 연결된 애플리케이션 요소
 */
const App = () => {
  return (
    <ReflectionSavedToastProvider>
      <RouterProvider router={router} />
    </ReflectionSavedToastProvider>
  )
}

export default App
