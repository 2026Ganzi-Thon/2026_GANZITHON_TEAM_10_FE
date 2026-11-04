import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes/router'

/**
 * 애플리케이션에 라우터를 연결한다.
 *
 * @returns 라우터가 연결된 애플리케이션 요소
 */
const App = () => {
  return <RouterProvider router={router} />
}

export default App
