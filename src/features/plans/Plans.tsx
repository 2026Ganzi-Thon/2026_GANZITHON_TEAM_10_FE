import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleCheck, faCircleInfo, faStar } from '@fortawesome/free-solid-svg-icons'
import { Button, PageHeader } from '@/components'
import { readPreviewPlan, savePreviewPlan } from './preview'
import type { Plan } from './preview'
import styles from './Plans.module.css'

const plans = [
  {
    id: 'basic',
    name: '모양 베이직',
    price: '무료',
    benefits: [
      '기본 그림 분석 (월 5회)',
      '그림 나눔 모임 참여 (월 2회)',
      '나의 모양 만들기 (월 2회)',
    ],
  },
  {
    id: 'plus',
    name: '모양 플러스',
    price: '6,900 / 월',
    benefits: [
      '그림 분석 무제한',
      '그림 나눔 모임 무제한 참여',
      '나의 모양 만들기 무제한',
      '감정 리포트 제공 (월 1회)',
    ],
  },
] as const

/** 요금제의 구성과 개발 미리보기용 선택 상태를 보여준다. */
export const Plans = () => {
  const navigate = useNavigate()
  const { search } = useLocation()
  const preview = import.meta.env.DEV && new URLSearchParams(search).has('preview')
  const [current, setCurrent] = useState<Plan>(() => (preview ? readPreviewPlan() : 'basic'))
  const [selected, setSelected] = useState<Plan>(current)
  const [saved, setSaved] = useState(false)
  return (
    <div className={styles.page}>
      <PageHeader
        title="요금제"
        action="back"
        onNavigate={() => navigate(`/my${preview ? '?preview' : ''}`)}
      />
      <main className={styles.content}>
        <div className={styles.summary}>
          <span className={styles.summaryIcon}>
            <FontAwesomeIcon icon={faStar} />
          </span>
          <div>
            <strong className="text-body">
              {preview ? (current === 'basic' ? '모양 베이직' : '모양 플러스') : '요금제'}
            </strong>
            <p className="text-caption">
              {preview
                ? `지금은 ${current === 'basic' ? '베이직' : '플러스'} 요금제를 이용하고 있어요`
                : '요금제 정보를 준비하고 있어요'}
            </p>
          </div>
        </div>
        <fieldset className={styles.plans} aria-label="요금제 선택">
          {plans.map((plan) => (
            <label
              className={`${styles.plan} ${selected === plan.id ? styles.selected : ''}`}
              key={plan.id}
            >
              <input
                className={styles.radio}
                type="radio"
                name="plan"
                value={plan.id}
                checked={selected === plan.id}
                onChange={() => {
                  setSelected(plan.id)
                  setSaved(false)
                }}
              />
              <span className={styles.planHeading}>
                <strong className="text-body">{plan.name}</strong>
                <strong className="text-choice">{plan.price}</strong>
              </span>
              <span className={styles.benefits}>
                {plan.benefits.map((benefit) => (
                  <span className="text-caption-medium" key={benefit}>
                    <FontAwesomeIcon icon={faCircleCheck} aria-hidden="true" />
                    {benefit}
                  </span>
                ))}
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.footer}>
          <p className="text-caption" role="status">
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />{' '}
            {preview
              ? saved
                ? '미리보기에서 선택한 요금제가 저장되었어요.'
                : '미리보기에서 요금제를 선택해 볼 수 있어요.'
              : '요금제 변경 기능을 준비하고 있어요.'}
          </p>
          <Button
            disabled={!preview}
            onClick={() => {
              if (savePreviewPlan(selected)) {
                setCurrent(selected)
                setSaved(true)
              }
            }}
          >
            저장하기
          </Button>
        </div>
      </main>
    </div>
  )
}
