import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { ReactSketchCanvas, type CanvasPath, type ReactSketchCanvasRef } from 'react-sketch-canvas'
import { Button } from '@/components'
import penImage from '@/assets/drawing/drawing-pen.png'
import eraserImage from '@/assets/drawing/drawing-eraser.png'
import styles from './DrawingCanvas.module.css'

const colors = ['#252525', '#599468', '#4c8cde', '#e56769', '#f2bc4b']
const sizes = [1, 3, 6, 10]

/** 웹 그림 화면의 캔버스와 그리기 도구를 표시한다. */
export const DrawingCanvas = () => {
  const navigate = useNavigate()
  const { search, state } = useLocation()
  const drawingState = state as {
    topic?: { title: string; description: string }
    paths?: CanvasPath[]
  } | null
  const topic = drawingState?.topic
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState(colors[0])
  const [size, setSize] = useState(3)
  const [menu, setMenu] = useState<'color' | 'size' | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<ReactSketchCanvasRef>(null)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    if (!drawingState?.paths?.length) return
    canvasRef.current?.resetCanvas()
    canvasRef.current?.loadPaths(drawingState.paths)
  }, [drawingState?.paths])

  const finishDrawing = async () => {
    if (!canvasRef.current) return
    try {
      const [image, paths] = await Promise.all([
        canvasRef.current.exportImage('png'),
        canvasRef.current.exportPaths(),
      ])
      const bytes = Uint8Array.from(atob(image.split(',')[1]), (character) =>
        character.charCodeAt(0),
      )
      const photo = new Blob([bytes], { type: 'image/png' })
      navigate(`/drawing/details${search}`, {
        state: { ...state, photo, paths, inputType: 'CANVAS', uploaded: undefined },
      })
    } catch {
      setExportError('그림을 준비하지 못했어요. 다시 시도해 주세요.')
    }
  }

  useEffect(() => {
    if (!menu) return
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !dockRef.current?.contains(event.target)) setMenu(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
    }
  }, [menu])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.back}
          type="button"
          aria-label="뒤로 가기"
          onClick={() =>
            navigate(
              `/drawing/onboarding/3?type=canvas${new URLSearchParams(search).has('preview') ? '&preview' : ''}`,
              { state },
            )
          }
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <Button className={styles.done} disabled={!hasDrawing} onClick={() => void finishDrawing()}>
          다 그렸어요
        </Button>
      </header>
      <div className={styles.content}>
        <section className={styles.topic} aria-label="주제 설명">
          <span className={styles.topicLabel}>주제 설명</span>
          <h1>{topic?.title ?? '내 마음속 방을 그려볼까요?'}</h1>
          <p>
            {topic?.description ?? (
              <>
                지금 내 마음을 하나의 방으로
                <br />
                자유롭게 표현해 보세요.
              </>
            )}
          </p>
        </section>
        <div className={styles.canvas} aria-label="그림 그리기 영역">
          <ReactSketchCanvas
            ref={canvasRef}
            style={{ border: 'none', borderRadius: 'inherit' }}
            strokeColor={color}
            strokeWidth={size}
            eraserWidth={size * 3}
            canvasColor="white"
            onChange={(paths) => setHasDrawing(paths.some((path) => path.drawMode))}
          />
        </div>
        {exportError && <p role="alert">{exportError}</p>}
        <div className={styles.dock} ref={dockRef}>
          <div className={styles.tools} aria-label="그리기 도구">
            <button
              type="button"
              className={`${styles.tool} ${styles.drawingTool}`}
              data-selected={tool === 'pen'}
              aria-label="펜"
              aria-pressed={tool === 'pen'}
              onClick={() => {
                setTool('pen')
                canvasRef.current?.eraseMode(false)
                setMenu(null)
              }}
            >
              <img src={penImage} alt="" className={styles.toolImage} />
            </button>
            <button
              type="button"
              className={`${styles.tool} ${styles.drawingTool}`}
              data-selected={tool === 'eraser'}
              aria-label="지우개"
              aria-pressed={tool === 'eraser'}
              onClick={() => {
                setTool('eraser')
                canvasRef.current?.eraseMode(true)
                setMenu(null)
              }}
            >
              <img src={eraserImage} alt="" className={styles.toolImage} />
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <div className={styles.secondaryTools}>
              <button
                type="button"
                className={styles.tool}
                aria-label="색 선택"
                aria-expanded={menu === 'color'}
                onClick={() => setMenu(menu === 'color' ? null : 'color')}
              >
                <span className={styles.swatch} style={{ backgroundColor: color }} />
              </button>
              <button
                type="button"
                className={`${styles.tool} ${styles.compactTool}`}
                aria-label="굵기 선택"
                aria-expanded={menu === 'size'}
                onClick={() => setMenu(menu === 'size' ? null : 'size')}
              >
                <span className={styles.thicknessIcon} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <button
                type="button"
                className={`${styles.tool} ${styles.compactTool}`}
                aria-label="실행 취소"
                onClick={() => canvasRef.current?.undo()}
              >
                <FontAwesomeIcon icon={faRotateLeft} />
              </button>
              <button
                type="button"
                className={`${styles.tool} ${styles.compactTool}`}
                aria-label="다시 실행"
                onClick={() => canvasRef.current?.redo()}
              >
                <FontAwesomeIcon icon={faRotateRight} />
              </button>
            </div>
          </div>
          {menu === 'color' && (
            <div className={styles.options} role="group" aria-label="펜 색상">
              {colors.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.colorOption}
                  style={{ backgroundColor: item }}
                  aria-label={`색상 ${item}`}
                  aria-pressed={color === item}
                  onClick={() => {
                    setColor(item)
                    setTool('pen')
                    canvasRef.current?.eraseMode(false)
                    setMenu(null)
                  }}
                />
              ))}
              <label className={styles.colorPicker} aria-label="직접 색상 선택">
                <input
                  type="color"
                  value={color}
                  aria-label="직접 색상 선택"
                  onChange={(event) => {
                    setColor(event.target.value)
                    setTool('pen')
                    canvasRef.current?.eraseMode(false)
                  }}
                />
              </label>
            </div>
          )}
          {menu === 'size' && (
            <div className={styles.options} role="group" aria-label="펜 굵기">
              {sizes.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={styles.sizeOption}
                  aria-label={`굵기 ${item}`}
                  aria-pressed={size === item}
                  onClick={() => {
                    setSize(item)
                    setMenu(null)
                  }}
                >
                  <span style={{ width: item + 6, height: item + 6 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
