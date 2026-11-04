import sheepWhite from '@/assets/sheep/sheep-white.svg'
import sheepPink from '@/assets/sheep/sheep-pink.svg'
import sheepPurple from '@/assets/sheep/sheep-purple.svg'
import sheepBlue from '@/assets/sheep/sheep-blue.svg'
import sheepGreen from '@/assets/sheep/sheep-green.svg'

const sheepImages = {
  white: sheepWhite,
  pink: sheepPink,
  purple: sheepPurple,
  blue: sheepBlue,
  green: sheepGreen,
} as const

type SheepProfileProps = {
  color: keyof typeof sheepImages
  size?: number
  alt?: string
}

/**
 * 색상별 양 프로필을 동일한 가로·세로 크기로 표시한다.
 *
 * @param props - 양 프로필의 표시 설정
 * @param props.color - 양 이미지 색상
 * @param props.size - 가로·세로 크기(px, 기본값: 82)
 * @param props.alt - 이미지의 대체 텍스트
 * @returns 양 프로필 이미지 요소
 */
export const SheepProfile = ({ color, size = 82, alt = '양 프로필' }: SheepProfileProps) => {
  return <img src={sheepImages[color]} width={size} height={size} alt={alt} />
}
