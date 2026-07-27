import { useRef, useState } from 'react'

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  // readEntries only returns up to ~100 entries per call — keep calling until empty.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (batch.length === 0) break
    all.push(...batch)
  }
  return all
}

// pathPrefix is '' for anything dropped loose at the top level (no folder involved) and
// "FolderName/" (growing with depth) once we're inside a dropped directory — mirrors what
// `<input webkitdirectory>` already puts in File.webkitRelativePath natively, so a folder
// dropped here and a folder picked via the "Upload Folder" button look identical downstream.
async function walkEntry(entry: FileSystemEntry, out: File[], pathPrefix: string): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    if (pathPrefix) {
      Object.defineProperty(file, 'webkitRelativePath', { value: `${pathPrefix}${entry.name}`, configurable: true })
    }
    out.push(file)
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
    await Promise.all(children.map(child => walkEntry(child, out, `${pathPrefix}${entry.name}/`)))
  }
}

/**
 * Reads everything dropped, recursing into any dropped folders — via
 * `webkitGetAsEntry`, which is what actually gives you a folder's contents on
 * drop (`dataTransfer.files` alone yields nothing usable for a directory entry).
 * `webkitGetAsEntry()` is called synchronously (per-item, right here) because the
 * underlying drag data becomes invalid once the browser event handler returns —
 * only the resulting entry objects are safe to keep and walk asynchronously.
 * Falls back to the flat file list on browsers without entry support.
 */
async function readAllFiles(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items)
  const supportsEntries = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function'
  if (!supportsEntries) return Array.from(dataTransfer.files)

  const entries = items.map(i => i.webkitGetAsEntry()).filter((e): e is FileSystemEntry => !!e)
  const files: File[] = []
  await Promise.all(entries.map(entry => walkEntry(entry, files, '')))
  return files
}

/**
 * Wires native HTML5 file drag-and-drop onto a drop-zone element. Spread `dropProps`
 * onto the element that should accept a drop (usually the same `<label>`/`<div>` that
 * already wraps the hidden `<input type="file">`) — dropped files go through the same
 * `onFiles` callback as a normal file-picker selection. Dropping a folder is expanded
 * to its files (recursively, each carrying its folder path in `webkitRelativePath`)
 * before `onFiles` is called.
 *
 * dragCounter tracks nested enter/leave pairs (children of the drop zone fire their own
 * dragenter/dragleave) so `isDragging` doesn't flicker off while the pointer is still
 * inside the zone but has crossed into a child element.
 */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
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
      if (!e.dataTransfer.files?.length && !e.dataTransfer.items?.length) return
      readAllFiles(e.dataTransfer).then(files => {
        if (files.length) onFiles(files)
      })
    },
  }

  return { isDragging, dropProps }
}
