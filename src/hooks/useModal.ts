import { useState } from 'react'

/**
 * 모달의 열림 상태와 열기·닫기 동작을 관리한다.
 *
 * @returns 모달 상태와 열기·닫기 함수
 */
export const useModal = () => {
  const [isOpen, setIsOpen] = useState(false)

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  return { isOpen, openModal, closeModal }
}
