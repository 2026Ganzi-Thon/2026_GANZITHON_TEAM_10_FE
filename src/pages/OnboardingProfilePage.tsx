import { Questionnaire } from '@/features/onboarding'

/**
 * `/onboarding/profile`에서 기본 정보부터 추가 이야기까지 설문을 표시한다.
 * `?page=1`부터 `?page=5`로 시작 단계를 지정하며, 생략하거나 유효하지 않으면 1단계부터 시작한다.
 * 개발 환경에서는 `?preview`를 추가해 API 연결 없이 설문을 확인할 수 있다.
 * 일반 모드에서는 내 정보 조회 API의 기존 답변을 초기값으로 사용한다.
 * 2~5단계부터 진입해 수정해도 1단계를 포함한 기존 답변을 함께 보존해 전체 저장한다.
 * 앞선 필수 답변 없이 중간 단계로 진입하면 1단계부터 시작하며, 내 정보 조회 실패 시 저장하지 않는다.
 *
 * @returns 설문 페이지 요소
 */
export const OnboardingProfilePage = () => <Questionnaire />
