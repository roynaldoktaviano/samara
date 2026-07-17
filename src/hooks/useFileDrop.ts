import { useRef, useState } from 'react'

/**
 * Wires native HTML5 file drag-and-drop onto a drop-zone element. Spread `dropProps`
 * onto the element that should accept a drop (usually the same `<label>`/`<div>` that
 * already wraps the hidden `<input type="file">`) — dropped files go through the same
 * `onFiles` callback as a normal file-picker selection.
 *
 * dragCounter tracks nested enter/leave pairs (children of the drop zone fire their own
 * dragenter/dragleave) so `isDragging` doesn't flicker off while the pointer is still
 * inside the zone but has crossed into a child element.
 */
export function useFileDrop(onFiles: (files: FileList) => void, disabled = false) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const dropProps = disabled ? {} : {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current += 1
      if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setIsDragging(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
    },
  }

  return { isDragging, dropProps }
}
