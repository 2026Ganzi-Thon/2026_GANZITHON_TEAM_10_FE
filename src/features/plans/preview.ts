export type Plan = 'basic' | 'plus'

/** 개발 미리보기에서만 저장한 요금제 선택을 읽는다. */
export const readPreviewPlan = (): Plan => {
  try {
    return sessionStorage.getItem('moyang.preview.plan') === 'plus' ? 'plus' : 'basic'
  } catch {
    return 'basic'
  }
}

export const savePreviewPlan = (plan: Plan) => {
  try {
    sessionStorage.setItem('moyang.preview.plan', plan)
    return true
  } catch {
    return false
  }
}
