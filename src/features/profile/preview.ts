export const colors = ['white', 'pink', 'green', 'purple', 'blue'] as const
export type SheepColor = (typeof colors)[number]

/** 서버 색상 저장 기능이 준비될 때까지 이 브라우저에 선택을 보관한다. */
export const readSheepColor = (): SheepColor => {
  try {
    const value = localStorage.getItem('moyang.sheepColor')
    return colors.find((color) => color === value) ?? 'green'
  } catch {
    return 'green'
  }
}

export const writeSheepColor = (color: SheepColor): boolean => {
  try {
    localStorage.setItem('moyang.sheepColor', color)
    return true
  } catch {
    return false
  }
}

/** 미리보기에서만 사용하는 프로필 값을 현재 브라우저 세션에 보관한다. */
export const readPreviewColor = (): SheepColor => {
  try {
    const value = sessionStorage.getItem('moyang.preview.sheepColor')
    return colors.find((color) => color === value) ?? 'green'
  } catch {
    return 'green'
  }
}

export const writePreviewValue = (key: string, value: string) => {
  try {
    sessionStorage.setItem(`moyang.preview.${key}`, value)
  } catch {
    /* 저장소를 사용할 수 없는 환경 */
  }
}

export const readPreviewNickname = () => {
  try {
    return sessionStorage.getItem('moyang.preview.nickname') ?? '딸기를 좋아하는 양'
  } catch {
    return '딸기를 좋아하는 양'
  }
}
