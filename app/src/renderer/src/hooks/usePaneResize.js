import { useRef, useState, useCallback } from 'react'
import { updateSplitRatio } from '../utils/layoutTree'

// Handles drag-to-resize for split pane dividers.
//
// Returns:
//   startDrag(e, tabId, divider) — call from a divider's onMouseDown
//   dragCursor                  — 'col-resize' | 'row-resize' | null (used for the capture overlay)
//
// During a drag, mouse events are captured at the document level so the
// pointer can move freely over xterm canvases without losing the drag.
export function usePaneResize(paneWrapperRef, setTabs) {
  const dragRef = useRef(null)
  const [dragCursor, setDragCursor] = useState(null)

  const startDrag = useCallback((e, tabId, divider) => {
    e.preventDefault()
    const { width, height } = paneWrapperRef.current.getBoundingClientRect()
    dragRef.current = {
      tabId,
      dividerId:    divider.id,
      isVertical:   divider.vertical,
      startX:       e.clientX,
      startY:       e.clientY,
      startRatio:   divider.ratio,
      parentOffset: divider.parentOffset,
      parentSize:   divider.parentSize,
      wrapperWidth:  width,
      wrapperHeight: height,
    }
    setDragCursor(divider.vertical ? 'col-resize' : 'row-resize')

    function onMouseMove(e) {
      const d = dragRef.current
      let newRatio
      if (d.isVertical) {
        const dx = e.clientX - d.startX
        const newX = d.parentOffset + d.parentSize * d.startRatio + (dx / d.wrapperWidth) * 100
        newRatio = (newX - d.parentOffset) / d.parentSize
      } else {
        const dy = e.clientY - d.startY
        const newY = d.parentOffset + d.parentSize * d.startRatio + (dy / d.wrapperHeight) * 100
        newRatio = (newY - d.parentOffset) / d.parentSize
      }
      newRatio = Math.max(0.1, Math.min(0.9, newRatio))
      setTabs(prev => prev.map(t =>
        t.id !== d.tabId ? t : { ...t, layout: updateSplitRatio(t.layout, d.dividerId, newRatio) }
      ))
    }

    function onMouseUp() {
      dragRef.current = null
      setDragCursor(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [paneWrapperRef, setTabs])

  return { startDrag, dragCursor }
}
