import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { Modal } from '@/components'

export const useDraftNavigation = ({
  shouldBlock,
  flush,
  canLeave,
}: {
  shouldBlock: () => boolean
  flush: () => Promise<unknown>
  canLeave: () => boolean
}) => {
  const leaving = useRef(false)
  const [failed, setFailed] = useState(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    leaving.current = currentLocation.key !== nextLocation.key && shouldBlock()
    return leaving.current
  })
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let active = true
    void flush().then(
      () => {
        if (!active || !leaving.current) return
        if (canLeave()) blocker.proceed()
        else setFailed(true)
      },
      () => {
        if (active && leaving.current) setFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [blocker, flush, canLeave])
  const stay = () => {
    leaving.current = false
    setFailed(false)
    if (blocker.state === 'blocked') blocker.reset()
  }
  return {
    leaving,
    prompt: (
      <Modal
        isOpen={blocker.state === 'blocked'}
        title={failed ? '아직 저장하지 못했어요' : '입력 내용을 저장하고 있어요'}
        onClose={stay}
        actions={[{ label: '이 화면에 머무르기', onClick: stay }]}
      >
        <p>
          {failed
            ? '입력 내용은 현재 화면에 남아 있어요. 머무른 뒤 다시 저장해 주세요.'
            : '저장이 끝나면 이동해요. 이 화면에 머무르면 이동을 취소할 수 있어요.'}
        </p>
      </Modal>
    ),
  }
}
