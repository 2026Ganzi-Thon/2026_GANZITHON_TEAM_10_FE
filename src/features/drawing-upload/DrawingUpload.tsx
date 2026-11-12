import { useRef, useState, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBullhorn } from '@fortawesome/free-solid-svg-icons'
import { faCircleCheck } from '@fortawesome/free-regular-svg-icons'
import { Button, PageHeader } from '@/components'
import styles from './DrawingUpload.module.css'

/** 촬영 또는 앨범에서 선택한 그림을 확인한다. */
export const DrawingUpload = () => {
  const navigate = useNavigate()
  const { state, search } = useLocation()
  const albumRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('JPG 또는 PNG 이미지를 선택해 주세요.')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('이미지는 10MB 이하로 선택해 주세요.')
      return
    }
    navigate(`/drawing/details${search}`, {
      state: { ...state, photo: selected, inputType: 'UPLOAD' },
    })
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title=""
        action="back"
        onNavigate={() =>
          navigate(
            `/drawing/onboarding/3?type=paper${search.includes('preview') ? '&preview' : ''}`,
            { state },
          )
        }
      />
      <div className={styles.content}>
        <h1>그림을 보여주세요</h1>
        <p className="text-body">완성한 그림을 촬영하거나 앨범에서 불러와 주세요</p>
        <section className={styles.guide} aria-label="촬영 안내">
          <h2>
            <FontAwesomeIcon icon={faBullhorn} aria-hidden="true" /> 더 좋은 결과를 위해 아래를
            확인해 주세요
          </h2>
          <ul>
            {[
              '그림자 없는 밝고 고른 빛',
              '그림 전체가 보이게',
              '책상과 배경은 잘라내기',
              '흐리거나 기울어진 사진은 피하기',
            ].map((tip) => (
              <li key={tip}>
                <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" /> {tip}
              </li>
            ))}
          </ul>
        </section>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <input
          ref={albumRef}
          type="file"
          accept="image/jpeg,image/png"
          onChange={selectFile}
          hidden
        />
        <Button onClick={() => navigate(`/drawing/camera${search}`, { state })}>
          사진 촬영하기
        </Button>
        <Button color="gray" onClick={() => albumRef.current?.click()}>
          앨범에서 가져오기
        </Button>
      </div>
    </div>
  )
}
