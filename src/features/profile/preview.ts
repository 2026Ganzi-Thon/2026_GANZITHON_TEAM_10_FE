export const colors = ['white', 'pink', 'green', 'purple', 'blue'] as const
export type SheepColor = (typeof colors)[number]

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
