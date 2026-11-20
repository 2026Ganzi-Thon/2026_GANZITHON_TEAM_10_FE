import { useNavigate } from 'react-router-dom'
import { Button } from '@/components'

/** 존재하지 않는 주소에서는 서비스 시작 화면으로 돌아갈 수 있다. */
export const NotFoundPage = () => {
  const navigate = useNavigate()
  return (
    <section style={{ padding: '48px 24px', textAlign: 'center' }}>
      <h1 className="text-question">페이지를 찾을 수 없어요.</h1>
      <p className="text-body">주소를 확인하거나 처음 화면으로 돌아가 주세요.</p>
      <Button onClick={() => navigate('/', { replace: true })}>처음으로 돌아가기</Button>
    </section>
  )
}
