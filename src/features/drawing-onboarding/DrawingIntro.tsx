import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components'
import drawingIntro from '@/assets/drawing/drawing-1.png'
import styles from './DrawingIntro.module.css'

/** 첫 그림 활동을 시작하거나 홈으로 이동하는 안내 화면이다. */
export const DrawingIntro = () => {
  const navigate = useNavigate()
  const { search } = useLocation()

  return (
    <div className={styles.page}>
      <img
        className={styles.illustration}
        src={drawingIntro}
        alt="이제 마음의 모양을 찾아볼까요? 선택한 고민을 그림으로 표현해 보거나, 홈에서 모양을 먼저 둘러봐도 좋아요."
      />
      <div className={styles.actions}>
        <Button onClick={() => navigate(`/drawing/onboarding/2${search}`)}>
          이 고민으로 그림 그리기
        </Button>
        <Button color="gray" onClick={() => navigate('/home')}>
          홈 먼저 둘러보기
        </Button>
      </div>
    </div>
  )
}
