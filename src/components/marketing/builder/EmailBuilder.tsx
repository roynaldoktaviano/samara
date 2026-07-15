'use client'

import { useState, useMemo, useRef, useEffect, useReducer, type ReactNode } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
  useDraggable, useDroppable, DragOverlay, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Type, Heading as HeadingIcon, Image as ImageIcon, ImagePlus, Video as VideoIcon, MousePointerClick,
  Minus, MoveVertical, Columns2, Share2, Code2, PanelBottom,
  GripVertical, Trash2, Copy, Eye, Pencil, Search, Monitor, Smartphone, Mail, Undo2, Redo2, LayoutGrid, Settings2,
} from 'lucide-react'
import {
  createBlock, cloneBlockWithNewIds, renderBlocksToHtml, DEFAULT_EMAIL_SETTINGS,
  type EmailBlock, type EmailSettings, BLOCK_LABELS,
} from '@/lib/email-builder'
import BlockPreview from './BlockPreview'
import BlockInspector from './BlockInspector'

const ACCENT = '#bdac7e'
const DOT_GRID = { backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.08) 1px, transparent 1px)', backgroundSize: '18px 18px' }

const PALETTE: { type: EmailBlock['type']; icon: React.ElementType }[] = [
  { type: 'heading', icon: HeadingIcon },
  { type: 'text', icon: Type },
  { type: 'button', icon: MousePointerClick },
  { type: 'divider', icon: Minus },
  { type: 'spacer', icon: MoveVertical },
  { type: 'image', icon: ImageIcon },
  { type: 'logo', icon: ImagePlus },
  { type: 'video', icon: VideoIcon },
  { type: 'columns', icon: Columns2 },
  { type: 'social', icon: Share2 },
  { type: 'html', icon: Code2 },
  { type: 'footer', icon: PanelBottom },
]

const LAYOUTS: { id: string; label: string; build: () => EmailBlock[] }[] = [
  { id: 'header-text-button', label: 'Header + Text + Button', build: () => [createBlock('heading'), createBlock('text'), createBlock('button')] },
  { id: 'image-caption', label: 'Image + Caption', build: () => [createBlock('image'), createBlock('text')] },
  { id: 'two-column-promo', label: 'Two Column Promo', build: () => [{ ...createBlock('heading'), fontSize: 20 } as EmailBlock, createBlock('columns')] },
  { id: 'video-feature', label: 'Video Feature', build: () => [createBlock('heading'), createBlock('video')] },
  { id: 'social-footer', label: 'Social + Footer', build: () => [createBlock('social'), createBlock('footer')] },
]

// ── Container-aware tree helpers ─────────────────────────────────────────
// Blocks form a 2-level tree: the root list, and each ColumnsBlock's two
// column lists. A "container id" addresses either: 'root', or `col:<blockId>:<0|1>`.
type ContainerId = string

function getContainerList(root: EmailBlock[], containerId: ContainerId): EmailBlock[] {
  if (containerId === 'root') return root
  const [, colId, idxStr] = containerId.split(':')
  const idx = Number(idxStr) as 0 | 1
  const col = root.find(b => b.id === colId)
  return col && col.type === 'columns' ? col.columns[idx] : []
}

function setContainerList(root: EmailBlock[], containerId: ContainerId, list: EmailBlock[]): EmailBlock[] {
  if (containerId === 'root') return list
  const [, colId, idxStr] = containerId.split(':')
  const idx = Number(idxStr) as 0 | 1
  return root.map(b => {
    if (b.id === colId && b.type === 'columns') {
      const columns: [EmailBlock[], EmailBlock[]] = idx === 0 ? [list, b.columns[1]] : [b.columns[0], list]
      return { ...b, columns }
    }
    return b
  })
}

function findContainerOf(root: EmailBlock[], blockId: string): ContainerId {
  if (root.some(b => b.id === blockId)) return 'root'
  for (const b of root) {
    if (b.type === 'columns') {
      if (b.columns[0].some(c => c.id === blockId)) return `col:${b.id}:0`
      if (b.columns[1].some(c => c.id === blockId)) return `col:${b.id}:1`
    }
  }
  return 'root'
}

function findBlockDeep(root: EmailBlock[], id: string): EmailBlock | null {
  for (const b of root) {
    if (b.id === id) return b
    if (b.type === 'columns') {
      const found = b.columns[0].find(c => c.id === id) ?? b.columns[1].find(c => c.id === id)
      if (found) return found
    }
  }
  return null
}

function updateBlockDeep(root: EmailBlock[], updated: EmailBlock): EmailBlock[] {
  return root.map(b => {
    if (b.id === updated.id) return updated
    if (b.type === 'columns') {
      return { ...b, columns: [b.columns[0].map(c => (c.id === updated.id ? updated : c)), b.columns[1].map(c => (c.id === updated.id ? updated : c))] }
    }
    return b
  })
}

function deleteBlockDeep(root: EmailBlock[], id: string): EmailBlock[] {
  return root.filter(b => b.id !== id).map(b => {
    if (b.type === 'columns') return { ...b, columns: [b.columns[0].filter(c => c.id !== id), b.columns[1].filter(c => c.id !== id)] }
    return b
  })
}

function duplicateBlockDeep(root: EmailBlock[], id: string): EmailBlock[] {
  const containerId = findContainerOf(root, id)
  const list = getContainerList(root, containerId)
  const idx = list.findIndex(b => b.id === id)
  if (idx === -1) return root
  const clone = cloneBlockWithNewIds(list[idx])
  const next = [...list]
  next.splice(idx + 1, 0, clone)
  return setContainerList(root, containerId, next)
}

function PaletteItem({ type, icon: Icon }: { type: EmailBlock['type']; icon: React.ElementType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${type}`,
    data: { fromPalette: true, blockType: type },
  })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={`group flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-white py-3 px-1 text-[11px] font-medium text-gray-600 hover:border-[#bdac7e] hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="h-8 w-8 rounded-md border flex items-center justify-center transition-colors group-hover:border-[#bdac7e]">
        <Icon className="h-4 w-4 text-gray-500 transition-colors group-hover:text-[#bdac7e]" />
      </div>
      <span className="text-center leading-tight">{BLOCK_LABELS[type]}</span>
      <div className="flex gap-0.5">
        {[0, 1, 2].map(i => <span key={i} className="h-[3px] w-[3px] rounded-full bg-gray-300" />)}
      </div>
    </button>
  )
}

function LayoutItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border bg-white p-3 text-left text-xs font-medium text-gray-700 hover:border-[#bdac7e] hover:shadow-sm transition-all w-full"
    >
      <div className="h-9 w-9 shrink-0 rounded-md border flex items-center justify-center" style={{ background: 'rgba(189,172,126,0.10)' }}>
        <LayoutGrid className="h-4 w-4" style={{ color: ACCENT }} />
      </div>
      {label}
    </button>
  )
}

function SortableCanvasBlock({
  block, selected, onSelect, onDelete, onDuplicate, children,
}: {
  block: EmailBlock; selected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void; children?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`group relative rounded-lg border-2 transition-all ${selected ? 'border-dashed border-[#bdac7e] ring-1 ring-[#bdac7e]' : 'border-transparent hover:border-dashed hover:border-gray-200'} ${isDragging ? 'opacity-40' : ''}`}
    >
      {selected && (
        <span className="absolute -top-2.5 left-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm" style={{ backgroundColor: ACCENT }}>
          {BLOCK_LABELS[block.type]}
        </span>
      )}
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button {...attributes} {...listeners} className="flex items-center justify-center h-7 w-7 rounded-full bg-white border shadow-sm cursor-grab active:cursor-grabbing text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </div>
      {children ?? <BlockPreview block={block} />}
      {selected && (
        <div className="absolute top-1.5 right-1.5 flex gap-0.5 bg-white border rounded-md shadow-sm">
          <button onClick={e => { e.stopPropagation(); onDuplicate() }} className="p-1.5 hover:bg-gray-50 rounded-l-md" title="Duplicate">
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1.5 hover:bg-gray-50 rounded-r-md" title="Delete">
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
          </button>
        </div>
      )}
    </div>
  )
}

function BlockList({
  containerId, blocks, selectedId, onSelect, onDelete, onDuplicate, emptyLabel,
}: {
  containerId: ContainerId
  blocks: EmailBlock[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  emptyLabel?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: containerId })
  return (
    <div ref={setNodeRef} className={`space-y-1 min-h-[56px] rounded-md transition-colors ${isOver ? 'ring-2 ring-[#bdac7e]/50' : ''}`}>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.length === 0 && (
          <div className="flex items-center justify-center h-14 text-xs text-muted-foreground border-2 border-dashed rounded-md">
            {emptyLabel ?? 'Drop blocks here'}
          </div>
        )}
        {blocks.map(block => (
          <SortableCanvasBlock
            key={block.id}
            block={block}
            selected={block.id === selectedId}
            onSelect={() => onSelect(block.id)}
            onDelete={() => onDelete(block.id)}
            onDuplicate={() => onDuplicate(block.id)}
          >
            {block.type === 'columns' ? (
              <div style={{ padding: block.padding }} className="grid grid-cols-2 gap-3">
                <BlockList containerId={`col:${block.id}:0`} blocks={block.columns[0]} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} emptyLabel="Drop here" />
                <BlockList containerId={`col:${block.id}:1`} blocks={block.columns[1]} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} emptyLabel="Drop here" />
              </div>
            ) : null}
          </SortableCanvasBlock>
        ))}
      </SortableContext>
    </div>
  )
}

function EmailSettingsPanel({ settings, onChange }: { settings: EmailSettings; onChange: (s: EmailSettings) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Page background</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={settings.pageBackground} onChange={e => onChange({ ...settings, pageBackground: e.target.value })} className="h-8 w-10 rounded border cursor-pointer" />
          <Input value={settings.pageBackground} onChange={e => onChange({ ...settings, pageBackground: e.target.value })} className="h-8 text-xs font-mono" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Content background</Label>
        <div className="flex items-center gap-2">
          <input type="color" value={settings.contentBackground} onChange={e => onChange({ ...settings, contentBackground: e.target.value })} className="h-8 w-10 rounded border cursor-pointer" />
          <Input value={settings.contentBackground} onChange={e => onChange({ ...settings, contentBackground: e.target.value })} className="h-8 text-xs font-mono" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Content width (px)</Label>
        <Input type="number" min={400} max={800} value={settings.contentWidth} onChange={e => onChange({ ...settings, contentWidth: Number(e.target.value) || 600 })} className="h-8 text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Outer padding (px)</Label>
        <Input type="number" min={0} max={80} value={settings.contentPadding} onChange={e => onChange({ ...settings, contentPadding: Number(e.target.value) || 0 })} className="h-8 text-sm" />
      </div>
    </div>
  )
}

export default function EmailBuilder({
  blocks, onBlocksChange, settings, onSettingsChange, toolbarExtra, title = 'Email Builder',
}: {
  blocks: EmailBlock[]
  onBlocksChange: (blocks: EmailBlock[]) => void
  settings?: EmailSettings
  onSettingsChange?: (settings: EmailSettings) => void
  toolbarExtra?: ReactNode
  title?: string
}) {
  const emailSettings = settings ?? DEFAULT_EMAIL_SETTINGS
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [search, setSearch] = useState('')
  const [paletteTab, setPaletteTab] = useState<'content' | 'layouts'>('content')
  const [activeDrag, setActiveDrag] = useState<{ kind: 'palette'; blockType: EmailBlock['type'] } | { kind: 'block'; block: EmailBlock } | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Undo/redo history — a stack of past block-array snapshots, separate from
  // the controlled `blocks` prop so an externally-loaded template (e.g. "start
  // from template") correctly resets history instead of becoming undoable.
  const historyRef = useRef<EmailBlock[][]>([blocks])
  const historyIndexRef = useRef(0)
  const lastSetRef = useRef<EmailBlock[]>(blocks)
  const [, forceRerender] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    if (blocks !== lastSetRef.current) {
      historyRef.current = [blocks]
      historyIndexRef.current = 0
      lastSetRef.current = blocks
      forceRerender()
    }
  }, [blocks])

  const commit = (next: EmailBlock[]) => {
    const idx = historyIndexRef.current
    historyRef.current = [...historyRef.current.slice(0, idx + 1), next]
    historyIndexRef.current += 1
    lastSetRef.current = next
    onBlocksChange(next)
    forceRerender()
  }

  const undo = () => {
    if (historyIndexRef.current === 0) return
    historyIndexRef.current -= 1
    const prev = historyRef.current[historyIndexRef.current]
    lastSetRef.current = prev
    onBlocksChange(prev)
    forceRerender()
  }

  const redo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const nxt = historyRef.current[historyIndexRef.current]
    lastSetRef.current = nxt
    onBlocksChange(nxt)
    forceRerender()
  }

  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1

  const selectedBlock = selectedId ? findBlockDeep(blocks, selectedId) : null
  const filteredPalette = useMemo(
    () => PALETTE.filter(p => BLOCK_LABELS[p.type].toLowerCase().includes(search.toLowerCase())),
    [search]
  )

  const resolveContainer = (overId: string): ContainerId => {
    if (overId === 'root' || overId.startsWith('col:')) return overId
    return findContainerOf(blocks, overId)
  }

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const data = active.data.current as { fromPalette?: boolean; blockType?: EmailBlock['type'] } | undefined
    if (data?.fromPalette && data.blockType) {
      setActiveDrag({ kind: 'palette', blockType: data.blockType })
      return
    }
    const block = findBlockDeep(blocks, active.id as string)
    if (block) setActiveDrag({ kind: 'block', block })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current as { fromPalette?: boolean; blockType?: EmailBlock['type'] } | undefined
    const overId = String(over.id)

    if (activeData?.fromPalette && activeData.blockType) {
      let destContainer = resolveContainer(overId)
      if (activeData.blockType === 'columns' && destContainer !== 'root') destContainer = 'root'
      const newBlock = createBlock(activeData.blockType)
      const destList = getContainerList(blocks, destContainer)
      const overIndex = destList.findIndex(b => b.id === overId)
      const insertAt = overIndex === -1 ? destList.length : overIndex + 1
      const newList = [...destList]
      newList.splice(insertAt, 0, newBlock)
      commit(setContainerList(blocks, destContainer, newList))
      setSelectedId(newBlock.id)
      return
    }

    const activeId = String(active.id)
    const draggedBlock = findBlockDeep(blocks, activeId)
    if (!draggedBlock) return
    const sourceContainer = findContainerOf(blocks, activeId)
    let destContainer = resolveContainer(overId)
    if (draggedBlock.type === 'columns' && destContainer !== 'root') destContainer = 'root'

    if (sourceContainer === destContainer) {
      const list = getContainerList(blocks, sourceContainer)
      const oldIndex = list.findIndex(b => b.id === activeId)
      const newIndex = list.findIndex(b => b.id === overId)
      if (oldIndex === -1) return
      if (newIndex === -1) {
        if (oldIndex === list.length - 1) return
        const next = list.filter(b => b.id !== activeId)
        next.push(draggedBlock)
        commit(setContainerList(blocks, sourceContainer, next))
        return
      }
      if (oldIndex === newIndex) return
      commit(setContainerList(blocks, sourceContainer, arrayMove(list, oldIndex, newIndex)))
    } else {
      const sourceList = getContainerList(blocks, sourceContainer).filter(b => b.id !== activeId)
      const afterRemoval = setContainerList(blocks, sourceContainer, sourceList)
      const destList = getContainerList(afterRemoval, destContainer)
      const overIndex = destList.findIndex(b => b.id === overId)
      const insertAt = overIndex === -1 ? destList.length : overIndex + 1
      const newDestList = [...destList]
      newDestList.splice(insertAt, 0, draggedBlock)
      commit(setContainerList(afterRemoval, destContainer, newDestList))
    }
  }

  const updateBlock = (updated: EmailBlock) => {
    commit(updateBlockDeep(blocks, updated))
  }

  const deleteBlock = (id: string) => {
    commit(deleteBlockDeep(blocks, id))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicateBlock = (id: string) => {
    commit(duplicateBlockDeep(blocks, id))
  }

  const insertLayout = (build: () => EmailBlock[]) => {
    commit([...blocks, ...build()])
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDrag(null)}
    >
      <div className="flex flex-col h-full bg-gray-50">
        <div className="flex items-center justify-between border-b bg-white px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: ACCENT }}>
              <Mail className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-800">{title}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {onSettingsChange && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors mr-1"
                    title="Email background & padding"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Design
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                  <EmailSettingsPanel settings={emailSettings} onChange={onSettingsChange} />
                </PopoverContent>
              </Popover>
            )}

            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center justify-center h-8 w-8 rounded-full border text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center justify-center h-8 w-8 rounded-full border text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                title="Redo"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {showPreview && (
              <div className="flex items-center gap-0.5 rounded-full border p-0.5 mr-1">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`flex items-center justify-center h-7 w-7 rounded-full transition-colors ${previewDevice === 'desktop' ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-100'}`}
                  title="Desktop preview"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`flex items-center justify-center h-7 w-7 rounded-full transition-colors ${previewDevice === 'mobile' ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-gray-100'}`}
                  title="Mobile preview"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <button
              onClick={() => setShowPreview(v => !v)}
              className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {showPreview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Edit' : 'Preview'}
            </button>
            {toolbarExtra}
          </div>
        </div>

        {showPreview ? (
          <div className="flex-1 overflow-auto flex justify-center p-6" style={DOT_GRID}>
            <iframe
              title="Email preview"
              srcDoc={renderBlocksToHtml(blocks, emailSettings)}
              className="bg-white shadow-lg rounded-md transition-[width] duration-200"
              style={{ width: previewDevice === 'desktop' ? 640 : 375, height: '100%', minHeight: 600, border: 'none' }}
              sandbox=""
            />
          </div>
        ) : (
          <div className="flex flex-1 min-h-0">
            <div className="w-64 border-r bg-white flex flex-col shrink-0">
              <div className="flex items-center gap-4 border-b px-3 pt-3 text-sm font-medium shrink-0">
                <button
                  onClick={() => setPaletteTab('content')}
                  className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'content' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                  style={paletteTab === 'content' ? { borderColor: ACCENT } : undefined}
                >
                  Content
                </button>
                <button
                  onClick={() => setPaletteTab('layouts')}
                  className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'layouts' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                  style={paletteTab === 'layouts' ? { borderColor: ACCENT } : undefined}
                >
                  Layouts
                </button>
              </div>

              <div className="p-3 space-y-3 overflow-y-auto flex-1">
                {paletteTab === 'content' ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search blocks"
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {filteredPalette.map(p => <PaletteItem key={p.type} type={p.type} icon={p.icon} />)}
                    </div>
                    <p className="text-[10px] text-muted-foreground pt-1">Drag a block into the canvas — including into a 2-column block — or drop it onto an existing block to insert after it.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-muted-foreground pb-1">Click a layout to add its blocks to the end of your email.</p>
                    <div className="space-y-2">
                      {LAYOUTS.map(l => <LayoutItem key={l.id} label={l.label} onClick={() => insertLayout(l.build)} />)}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6" style={DOT_GRID}>
              <div
                className="mx-auto rounded-lg shadow-sm min-h-[400px] p-3"
                style={{ maxWidth: emailSettings.contentWidth, background: emailSettings.contentBackground }}
              >
                <BlockList
                  containerId="root"
                  blocks={blocks}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDelete={deleteBlock}
                  onDuplicate={duplicateBlock}
                  emptyLabel="Drag blocks here to start designing"
                />
              </div>
            </div>

            <div className="w-72 border-l bg-white p-4 overflow-y-auto shrink-0">
              {selectedBlock ? (
                <>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-3">{BLOCK_LABELS[selectedBlock.type]} settings</p>
                  <BlockInspector block={selectedBlock} onChange={updateBlock} />
                  <Separator className="my-4" />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Select a block to edit its settings.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 150, easing: 'ease-out' }}>
        {activeDrag?.kind === 'palette' && (() => {
          const Icon = PALETTE.find(p => p.type === activeDrag.blockType)?.icon ?? Type
          return (
            <div className="flex items-center gap-2 rounded-lg border bg-white shadow-xl px-3 py-2 text-xs font-medium text-gray-700">
              <Icon className="h-4 w-4" style={{ color: ACCENT }} />
              {BLOCK_LABELS[activeDrag.blockType]}
            </div>
          )
        })()}
        {activeDrag?.kind === 'block' && (
          <div className="rounded-lg border-2 shadow-2xl bg-white" style={{ width: 640, borderColor: ACCENT }}>
            <BlockPreview block={activeDrag.block} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
