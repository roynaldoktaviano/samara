'use client'

import { useState, useMemo, useRef, useEffect, useReducer, type ReactNode } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, pointerWithin, rectIntersection,
  useDraggable, useDroppable, DragOverlay, type CollisionDetection, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Type, Heading as HeadingIcon, Image as ImageIcon, ImagePlus, Video as VideoIcon, MousePointerClick,
  Minus, MoveVertical, Columns, LayoutTemplate, Share2, Code2,
  GripVertical, Trash2, Copy, Eye, Pencil, Search, Monitor, Smartphone, Mail, Undo2, Redo2, LayoutGrid, Sparkles, Lock, X,
} from 'lucide-react'
import {
  createBlock, cloneBlockWithNewIds, renderBlocksToHtml, DEFAULT_EMAIL_SETTINGS, paddingStyle,
  type EmailBlock, type EmailSettings, type ColumnsBlock, type SectionBlock, type FooterBlock, BLOCK_LABELS,
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
  { type: 'columns', icon: Columns },
  { type: 'section', icon: LayoutTemplate },
  { type: 'social', icon: Share2 },
  { type: 'html', icon: Code2 },
  // 'footer' intentionally excluded — it's a fixed, system-managed block (see FIXED_FOOTER_ADDRESS),
  // not something users drag in themselves.
]

const LAYOUTS: { id: string; label: string; build: () => EmailBlock[] }[] = [
  { id: 'header-text-button', label: 'Header + Text + Button', build: () => [createBlock('heading'), createBlock('text'), createBlock('button')] },
  { id: 'image-caption', label: 'Image + Caption', build: () => [createBlock('image'), createBlock('text')] },
  { id: 'two-column-promo', label: 'Two Column Promo', build: () => [{ ...createBlock('heading'), fontSize: 20 } as EmailBlock, createBlock('columns')] },
  { id: 'video-feature', label: 'Video Feature', build: () => [createBlock('heading'), createBlock('video')] },
  { id: 'social-links', label: 'Social Links', build: () => [createBlock('social')] },
]

// ── Full ready-made templates ─────────────────────────────────────────────
// Curated, hardcoded designs (not user-addable) — picking one REPLACES the
// whole canvas so the user gets a finished layout and just swaps text/images/colors.
const heading = (html: string, overrides: Record<string, unknown> = {}): EmailBlock =>
  ({ ...createBlock('heading'), html, ...overrides }) as EmailBlock
const text = (html: string, overrides: Record<string, unknown> = {}): EmailBlock =>
  ({ ...createBlock('text'), html, ...overrides }) as EmailBlock
const button = (label: string, overrides: Record<string, unknown> = {}): EmailBlock =>
  ({ ...createBlock('button'), label, ...overrides }) as EmailBlock
const image = (src: string, alt: string, overrides: Record<string, unknown> = {}): EmailBlock =>
  ({ ...createBlock('image'), src, alt, ...overrides }) as EmailBlock
const logo = (src: string, alt: string, overrides: Record<string, unknown> = {}): EmailBlock =>
  ({ ...createBlock('logo'), src, alt, ...overrides }) as EmailBlock
const columnsOf = (cols: EmailBlock[][], overrides: Partial<ColumnsBlock> = {}): EmailBlock =>
  ({ ...(createBlock('columns') as ColumnsBlock), columns: cols, ...overrides }) as EmailBlock
const sectionOf = (blocks: EmailBlock[], overrides: Partial<SectionBlock> = {}): EmailBlock =>
  ({ ...(createBlock('section') as SectionBlock), blocks, ...overrides }) as EmailBlock

export const TEMPLATES: { id: string; label: string; description: string; build: () => EmailBlock[] }[] = [
  {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Logo, intro, featured story, two-column highlights, footer.',
    build: () => [
      logo('https://placehold.co/240x80?text=Your+Logo', 'Your logo'),
      heading('<p><strong>This Month\'s Update</strong></p>', { fontSize: 28, align: 'center' }),
      text('<p>Hi there! Here\'s what\'s new this month — updates, tips, and a few things we think you\'ll love.</p>', { align: 'center' }),
      image('https://picsum.photos/seed/newsletter/600/300', 'Featured image'),
      heading('<p><strong>Featured Story</strong></p>', { fontSize: 20 }),
      text('<p>Share the details of your featured update, announcement, or story here. Keep it short and to the point.</p>'),
      button('Read More'),
      createBlock('divider'),
      columnsOf([
        [heading('<p><strong>Highlight One</strong></p>', { fontSize: 16 }), text('<p>A short description of this highlight.</p>', { fontSize: 14 })],
        [heading('<p><strong>Highlight Two</strong></p>', { fontSize: 16 }), text('<p>A short description of this highlight.</p>', { fontSize: 14 })],
      ]),
      createBlock('footer'),
    ],
  },
  {
    id: 'promo-sale',
    label: 'Promo / Sale',
    description: 'Bold dark banner, offer details, two-column reasons, CTA.',
    build: () => [
      sectionOf(
        [
          heading('<p><strong>Big Sale — 30% Off</strong></p>', { fontSize: 32, align: 'center', color: '#ffffff' }),
          text('<p>For a limited time only. Use code SALE30 at checkout.</p>', { align: 'center', color: '#e5e7eb' }),
          button('Shop Now', { bgColor: '#bdac7e', align: 'center' }),
        ],
        { backgroundColor: '#111827' },
      ),
      image('https://picsum.photos/seed/promo-sale/600/300', 'Promo banner'),
      heading('<p><strong>Why You\'ll Love It</strong></p>', { fontSize: 20, align: 'center' }),
      columnsOf([
        [heading('<p><strong>Reason One</strong></p>', { fontSize: 16 }), text('<p>Explain one reason customers should buy now.</p>', { fontSize: 14 })],
        [heading('<p><strong>Reason Two</strong></p>', { fontSize: 16 }), text('<p>Explain another reason customers should buy now.</p>', { fontSize: 14 })],
      ]),
      createBlock('divider'),
      createBlock('footer'),
    ],
  },
  {
    id: 'welcome',
    label: 'Welcome Email',
    description: 'Logo, greeting, CTA, and a short help section.',
    build: () => [
      logo('https://placehold.co/240x80?text=Your+Logo', 'Your logo'),
      heading('<p><strong>Welcome Aboard!</strong></p>', { fontSize: 28, align: 'center' }),
      text('<p>We\'re thrilled to have you here. Here\'s a quick way to get started.</p>', { align: 'center' }),
      button('Get Started', { align: 'center' }),
      createBlock('divider'),
      heading('<p><strong>Need Help?</strong></p>', { fontSize: 18 }),
      text('<p>If you have any questions, just reply to this email — we\'re happy to help.</p>'),
      createBlock('footer'),
    ],
  },
  {
    id: 'event-invite',
    label: 'Event Invite',
    description: 'Banner image, date/location details, RSVP button.',
    build: () => [
      heading('<p><strong>You\'re Invited</strong></p>', { fontSize: 30, align: 'center' }),
      image('https://picsum.photos/seed/event-invite/600/300', 'Event photo'),
      text('<p><strong>Date:</strong> Saturday, 20 July 2026<br/><strong>Time:</strong> 6:00 PM<br/><strong>Location:</strong> Your venue name here</p>', { align: 'center' }),
      button('RSVP Now', { align: 'center' }),
      createBlock('divider'),
      text('<p>Add any extra details guests should know — dress code, parking, or an agenda.</p>', { align: 'center' }),
      createBlock('footer'),
    ],
  },
  {
    id: 'order-confirmation',
    label: 'Order Confirmation',
    description: 'Confirmation heading, order summary, tracking button, footer.',
    build: () => [
      logo('https://placehold.co/240x80?text=Your+Logo', 'Your logo'),
      heading('<p><strong>Your Order is Confirmed!</strong></p>', { fontSize: 26, align: 'center' }),
      text('<p>Thanks for your order — we\'re getting it ready. Here are the details:</p>', { align: 'center' }),
      text('<p><strong>Order #:</strong> 000123<br/><strong>Order date:</strong> 20 July 2026<br/><strong>Total:</strong> Rp 0</p>'),
      button('Track Order', { align: 'center' }),
      createBlock('divider'),
      createBlock('footer'),
    ],
  },
  {
    id: 'feedback',
    label: 'Feedback Request',
    description: 'Thank-you note, feedback CTA, footer.',
    build: () => [
      heading('<p><strong>How Did We Do?</strong></p>', { fontSize: 26, align: 'center' }),
      text('<p>We\'d love to hear about your recent experience — it only takes a minute.</p>', { align: 'center' }),
      button('Give Feedback', { align: 'center' }),
      createBlock('divider'),
      text('<p>Your feedback helps us improve and serve you better.</p>', { align: 'center' }),
      createBlock('footer'),
    ],
  },
  {
    id: 'product-announcement',
    label: 'Product Announcement',
    description: 'Banner image, feature highlights in columns, CTA.',
    build: () => [
      logo('https://placehold.co/240x80?text=Your+Logo', 'Your logo'),
      image('https://picsum.photos/seed/product-launch/600/300', 'New product'),
      heading('<p><strong>Introducing Something New</strong></p>', { fontSize: 26, align: 'center' }),
      text('<p>We\'re excited to announce our latest product. Here\'s what\'s new.</p>', { align: 'center' }),
      columnsOf([
        [heading('<p><strong>Feature One</strong></p>', { fontSize: 16 }), text('<p>Describe this feature.</p>', { fontSize: 14 })],
        [heading('<p><strong>Feature Two</strong></p>', { fontSize: 16 }), text('<p>Describe this feature.</p>', { fontSize: 14 })],
      ]),
      button('Learn More', { align: 'center' }),
      createBlock('footer'),
    ],
  },
  {
    id: 'thank-you',
    label: 'Thank You',
    description: 'Warm appreciation message, footer.',
    build: () => [
      heading('<p><strong>Thank You!</strong></p>', { fontSize: 30, align: 'center' }),
      text('<p>We just wanted to take a moment to say thank you for being with us. We truly appreciate it.</p>', { align: 'center' }),
      createBlock('divider'),
      text('<p>If there\'s ever anything we can do for you, just let us know.</p>', { align: 'center' }),
      createBlock('footer'),
    ],
  },
  {
    id: 're-engagement',
    label: 'We Miss You',
    description: 'Re-engagement message with a comeback CTA.',
    build: () => [
      heading('<p><strong>We Miss You!</strong></p>', { fontSize: 28, align: 'center' }),
      text('<p>It\'s been a while — come back and see what\'s new. We\'ve got something special waiting for you.</p>', { align: 'center' }),
      button('Come Back', { align: 'center' }),
      createBlock('divider'),
      createBlock('footer'),
    ],
  },
  {
    id: 'seasonal-greeting',
    label: 'Seasonal Greeting',
    description: 'Festive banner, greeting message, footer.',
    build: () => [
      sectionOf(
        [
          heading('<p><strong>Happy Holidays!</strong></p>', { fontSize: 30, align: 'center', color: '#ffffff' }),
          text('<p>Wishing you a wonderful season from all of us.</p>', { align: 'center', color: '#f3f4f6' }),
        ],
        { backgroundColor: '#b91c1c' },
      ),
      text('<p>Thank you for a great year — here\'s to more ahead.</p>', { align: 'center' }),
      createBlock('footer'),
    ],
  },
]

// ── Container-aware tree helpers ─────────────────────────────────────────
// Blocks form a tree: the root list, plus any ColumnsBlock's N column lists
// or SectionBlock's single list — and a Columns block may itself live inside
// a Section (so Section > Columns > leaf is valid), though Columns may not
// contain another Columns/Section, and a Section may not nest inside anything.
// A "container id" is 'root' or a '>'-joined path of hops, each hop being
// `sec:<blockId>` or `col:<blockId>:<index>`, e.g. `sec:abc>col:def:1`.
type ContainerId = string

const CONTAINER_TYPES = ['columns', 'section'] as const
function isContainerBlockType(type: EmailBlock['type']): boolean {
  return (CONTAINER_TYPES as readonly string[]).includes(type)
}

// A container block (Columns/Section) may only be dropped where the resulting
// tree stays valid: Section only at root; Columns at root or directly inside
// a Section (not inside another Columns' cell, not nested deeper).
function isValidContainerDestination(blockType: EmailBlock['type'], destContainer: ContainerId): boolean {
  if (!isContainerBlockType(blockType)) return true
  if (destContainer === 'root') return true
  if (blockType === 'section') return false
  const hops = destContainer.split('>')
  return hops.length === 1 && hops[0].startsWith('sec:')
}

function childContainerId(parentContainerId: ContainerId, hop: string): ContainerId {
  return parentContainerId === 'root' ? hop : `${parentContainerId}>${hop}`
}

function getContainerList(root: EmailBlock[], containerId: ContainerId): EmailBlock[] {
  let list = root
  for (const hop of containerId === 'root' ? [] : containerId.split('>')) {
    if (hop.startsWith('sec:')) {
      const [, id] = hop.split(':')
      const sec = list.find(b => b.id === id)
      list = sec && sec.type === 'section' ? sec.blocks : []
    } else {
      const [, id, idxStr] = hop.split(':')
      const idx = Number(idxStr)
      const col = list.find(b => b.id === id)
      list = col && col.type === 'columns' ? col.columns[idx] ?? [] : []
    }
  }
  return list
}

function setContainerList(root: EmailBlock[], containerId: ContainerId, newList: EmailBlock[]): EmailBlock[] {
  const hops = containerId === 'root' ? [] : containerId.split('>')
  if (hops.length === 0) return newList
  const [hop, ...rest] = hops
  const restId = rest.length === 0 ? 'root' : rest.join('>')
  return root.map(b => {
    if (hop.startsWith('sec:')) {
      const [, id] = hop.split(':')
      if (b.id !== id || b.type !== 'section') return b
      return { ...b, blocks: rest.length === 0 ? newList : setContainerList(b.blocks, restId, newList) }
    }
    const [, id, idxStr] = hop.split(':')
    const idx = Number(idxStr)
    if (b.id !== id || b.type !== 'columns') return b
    if (rest.length === 0) return { ...b, columns: b.columns.map((c, i) => (i === idx ? newList : c)) }
    return { ...b, columns: b.columns.map((c, i) => (i === idx ? setContainerList(c, restId, newList) : c)) }
  })
}

// The fixed footer must always stay last at the root level — clamp any insertion
// index in the root container so nothing lands after it (footer isn't draggable
// itself, but other blocks could otherwise be dropped/reordered past it).
function rootSafeInsertIndex(containerId: ContainerId, list: EmailBlock[], desired: number): number {
  if (containerId !== 'root') return desired
  const footerIdx = list.findIndex(b => b.type === 'footer')
  return footerIdx === -1 ? desired : Math.min(desired, footerIdx)
}

function findContainerOf(root: EmailBlock[], blockId: string): ContainerId {
  function search(list: EmailBlock[], prefix: ContainerId): ContainerId | null {
    if (list.some(b => b.id === blockId)) return prefix
    for (const b of list) {
      if (b.type === 'section') {
        const found = search(b.blocks, childContainerId(prefix, `sec:${b.id}`))
        if (found) return found
      }
      if (b.type === 'columns') {
        for (let i = 0; i < b.columns.length; i++) {
          if (b.columns[i].some(c => c.id === blockId)) return childContainerId(prefix, `col:${b.id}:${i}`)
        }
      }
    }
    return null
  }
  return search(root, 'root') ?? 'root'
}

// Recurses into a block's nested lists (Section's single list, Columns' N
// lists) — returns [] for leaf blocks, so callers naturally stop there.
function childLists(block: EmailBlock): EmailBlock[][] {
  if (block.type === 'section') return [block.blocks]
  if (block.type === 'columns') return block.columns
  return []
}

function withChildLists(block: EmailBlock, lists: EmailBlock[][]): EmailBlock {
  if (block.type === 'section') return { ...block, blocks: lists[0] }
  if (block.type === 'columns') return { ...block, columns: lists }
  return block
}

function findBlockDeep(root: EmailBlock[], id: string): EmailBlock | null {
  for (const b of root) {
    if (b.id === id) return b
    for (const list of childLists(b)) {
      const found = findBlockDeep(list, id)
      if (found) return found
    }
  }
  return null
}

function updateBlockDeep(root: EmailBlock[], updated: EmailBlock): EmailBlock[] {
  return root.map(b => {
    if (b.id === updated.id) return updated
    const lists = childLists(b)
    return lists.length === 0 ? b : withChildLists(b, lists.map(list => updateBlockDeep(list, updated)))
  })
}

function deleteBlockDeep(root: EmailBlock[], id: string): EmailBlock[] {
  return root.filter(b => b.id !== id).map(b => {
    const lists = childLists(b)
    return lists.length === 0 ? b : withChildLists(b, lists.map(list => deleteBlockDeep(list, id)))
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

// A full-width container (e.g. a Section) can have nearly the same bounding box
// as its own nested drop list, so `closestCenter` can resolve the drop to the
// container's outer sortable slot instead of the list inside it — the block
// then lands after the container at the parent level instead of inside it.
// Preferring the smallest-area droppable under the pointer always picks the
// most deeply nested match first.
const collisionDetection: CollisionDetection = args => {
  const hits = pointerWithin(args)
  if (hits.length === 0) return rectIntersection(args)
  return [...hits].sort((a, b) => {
    const rectA = args.droppableRects.get(a.id)
    const rectB = args.droppableRects.get(b.id)
    const areaA = rectA ? rectA.width * rectA.height : Infinity
    const areaB = rectB ? rectB.width * rectB.height : Infinity
    return areaA - areaB
  })
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

function TemplateItem({ label, description, onClick }: { label: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border bg-white p-3 text-left hover:border-[#bdac7e] hover:shadow-sm transition-all w-full"
    >
      <div className="h-9 w-9 shrink-0 rounded-md border flex items-center justify-center" style={{ background: 'rgba(189,172,126,0.10)' }}>
        <Sparkles className="h-4 w-4" style={{ color: ACCENT }} />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-700">{label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
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
  const hideOn = 'hideOn' in block ? block.hideOn : 'none'

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`group relative rounded-lg border-2 transition-all ${selected ? 'border-dashed border-[#bdac7e] ring-1 ring-[#bdac7e]' : 'border-transparent hover:border-dashed hover:border-gray-200'} ${isDragging ? 'opacity-40' : ''} ${hideOn !== 'none' ? 'opacity-60' : ''}`}
    >
      {selected && (
        <span className="absolute -top-2.5 left-2 z-10 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-sm" style={{ backgroundColor: ACCENT }}>
          {BLOCK_LABELS[block.type]}
        </span>
      )}
      {hideOn !== 'none' && (
        <span className="absolute -top-2.5 right-2 z-10 flex items-center gap-1 rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
          {hideOn === 'desktop' ? <Monitor className="h-2.5 w-2.5" /> : <Smartphone className="h-2.5 w-2.5" />}
          Hidden
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
              <div style={{ ...paddingStyle(block.padding), gap: block.gap ?? 24, gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))` }} className="grid">
                {block.columns.map((colList, i) => (
                  <BlockList key={i} containerId={childContainerId(containerId, `col:${block.id}:${i}`)} blocks={colList} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} emptyLabel="Drop here" />
                ))}
              </div>
            ) : block.type === 'section' ? (
              <div
                style={{
                  ...paddingStyle(block.padding),
                  backgroundColor: block.backgroundColor,
                  backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
                  backgroundSize: block.backgroundImage ? block.backgroundSize : undefined,
                  backgroundRepeat: block.backgroundImage ? (block.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat') : undefined,
                  backgroundPosition: 'center',
                }}
                className="rounded-md"
              >
                <BlockList containerId={childContainerId(containerId, `sec:${block.id}`)} blocks={block.blocks} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} emptyLabel="Drop blocks here" />
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
  // The fixed footer is rendered separately, outside the interactive/sortable tree,
  // so it can never be selected, dragged, deleted, or have other blocks dropped after it.
  const editableBlocks = blocks.filter(b => b.type !== 'footer')
  const footerBlock = blocks.find((b): b is FooterBlock => b.type === 'footer')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [search, setSearch] = useState('')
  const [paletteTab, setPaletteTab] = useState<'content' | 'layouts' | 'templates' | 'settings'>('content')
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
    if (overId === 'root' || overId.startsWith('col:') || overId.startsWith('sec:')) return overId
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
      if (!isValidContainerDestination(activeData.blockType, destContainer)) destContainer = 'root'
      const newBlock = createBlock(activeData.blockType)
      const destList = getContainerList(blocks, destContainer)
      const overIndex = destList.findIndex(b => b.id === overId)
      const insertAt = rootSafeInsertIndex(destContainer, destList, overIndex === -1 ? destList.length : overIndex + 1)
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
    if (!isValidContainerDestination(draggedBlock.type, destContainer)) destContainer = 'root'

    if (sourceContainer === destContainer) {
      const list = getContainerList(blocks, sourceContainer)
      const oldIndex = list.findIndex(b => b.id === activeId)
      const newIndex = list.findIndex(b => b.id === overId)
      if (oldIndex === -1) return
      if (newIndex === -1) {
        const maxIdx = rootSafeInsertIndex(sourceContainer, list, list.length)
        if (oldIndex === maxIdx - 1 || oldIndex >= maxIdx) return
        const next = list.filter(b => b.id !== activeId)
        next.splice(rootSafeInsertIndex(sourceContainer, next, next.length), 0, draggedBlock)
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
      const insertAt = rootSafeInsertIndex(destContainer, destList, overIndex === -1 ? destList.length : overIndex + 1)
      const newDestList = [...destList]
      newDestList.splice(insertAt, 0, draggedBlock)
      commit(setContainerList(afterRemoval, destContainer, newDestList))
    }
  }

  const updateBlock = (updated: EmailBlock) => {
    commit(updateBlockDeep(blocks, updated))
  }

  const deleteBlock = (id: string) => {
    const target = findBlockDeep(blocks, id)
    if (target?.type === 'footer') return // fixed footer — not user-deletable
    commit(deleteBlockDeep(blocks, id))
    if (selectedId === id) setSelectedId(null)
  }

  const duplicateBlock = (id: string) => {
    const target = findBlockDeep(blocks, id)
    if (target?.type === 'footer') return // fixed footer — not user-duplicable
    commit(duplicateBlockDeep(blocks, id))
  }

  const insertLayout = (build: () => EmailBlock[]) => {
    const footerIdx = blocks.findIndex(b => b.type === 'footer')
    if (footerIdx === -1) { commit([...blocks, ...build()]); return }
    commit([...blocks.slice(0, footerIdx), ...build(), ...blocks.slice(footerIdx)])
  }

  const applyTemplate = (build: () => EmailBlock[]) => {
    if (blocks.length > 0 && !window.confirm('Replace the current design with this template? You can undo afterwards.')) return
    commit(build())
    setSelectedId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
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
            <div className="w-72 border-r bg-white flex flex-col shrink-0">
              <div className={`flex items-center gap-4 border-b px-3 pt-3 text-sm font-medium shrink-0 ${selectedBlock ? 'opacity-40 pointer-events-none' : ''}`}>
                <button
                  onClick={() => { setSelectedId(null); setPaletteTab('content') }}
                  className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'content' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                  style={paletteTab === 'content' ? { borderColor: ACCENT } : undefined}
                >
                  Content
                </button>
                <button
                  onClick={() => { setSelectedId(null); setPaletteTab('layouts') }}
                  className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'layouts' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                  style={paletteTab === 'layouts' ? { borderColor: ACCENT } : undefined}
                >
                  Rows
                </button>
                <button
                  onClick={() => { setSelectedId(null); setPaletteTab('templates') }}
                  className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'templates' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                  style={paletteTab === 'templates' ? { borderColor: ACCENT } : undefined}
                >
                  Templates
                </button>
                {onSettingsChange && (
                  <button
                    onClick={() => { setSelectedId(null); setPaletteTab('settings') }}
                    className={`pb-2.5 border-b-2 transition-colors ${paletteTab === 'settings' ? 'text-gray-900' : 'border-transparent text-muted-foreground hover:text-gray-600'}`}
                    style={paletteTab === 'settings' ? { borderColor: ACCENT } : undefined}
                  >
                    Settings
                  </button>
                )}
              </div>

              {selectedBlock ? (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="flex items-center justify-between border-b bg-gray-100 px-3 py-2.5 shrink-0">
                    <p className="text-[11px] font-semibold tracking-wide text-gray-600 uppercase">{BLOCK_LABELS[selectedBlock.type]} properties</p>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => duplicateBlock(selectedBlock.id)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500" title="Duplicate">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteBlock(selectedBlock.id)} className="p-1.5 rounded hover:bg-gray-200 text-red-500" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setSelectedId(null)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500" title="Close">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 overflow-y-auto flex-1">
                    <BlockInspector block={selectedBlock} onChange={updateBlock} />
                  </div>
                </div>
              ) : (
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
                      <p className="text-[10px] text-muted-foreground pt-1">Drag a block into the canvas — including into a Columns or Section block — or drop it onto an existing block to insert after it.</p>
                    </>
                  ) : paletteTab === 'layouts' ? (
                    <>
                      <p className="text-[10px] text-muted-foreground pb-1">Click a layout to add its blocks to the end of your email.</p>
                      <div className="space-y-2">
                        {LAYOUTS.map(l => <LayoutItem key={l.id} label={l.label} onClick={() => insertLayout(l.build)} />)}
                      </div>
                    </>
                  ) : paletteTab === 'templates' ? (
                    <>
                      <p className="text-[10px] text-muted-foreground pb-1">Click a template to replace your whole email with a ready-made design — then just swap the text, images, and colors.</p>
                      <div className="space-y-2">
                        {TEMPLATES.map(t => (
                          <TemplateItem key={t.id} label={t.label} description={t.description} onClick={() => applyTemplate(t.build)} />
                        ))}
                      </div>
                    </>
                  ) : (
                    onSettingsChange && <EmailSettingsPanel settings={emailSettings} onChange={onSettingsChange} />
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6" style={DOT_GRID}>
              {/* Mirrors the exported table cell (padding:${contentPadding}px 12px; background:pageBackground)
                  so "Outer padding" is visible here, not just in the sent email. */}
              <div
                className="mx-auto"
                style={{
                  maxWidth: emailSettings.contentWidth + 24,
                  padding: `${emailSettings.contentPadding}px 12px`,
                  background: emailSettings.pageBackground,
                }}
              >
                <div
                  className="rounded-lg shadow-sm min-h-100 flex flex-col"
                  style={{ background: emailSettings.contentBackground }}
                >
                  <div className="flex-1 p-3">
                    <BlockList
                      containerId="root"
                      blocks={editableBlocks}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onDelete={deleteBlock}
                      onDuplicate={duplicateBlock}
                      emptyLabel="Drag blocks here to start designing"
                    />
                  </div>
                  {footerBlock && (
                    <div className="group relative shrink-0 cursor-not-allowed overflow-hidden rounded-b-lg" title="This footer is fixed and can't be edited, moved, or removed">
                      <BlockPreview block={footerBlock} />
                      <span className="absolute -top-2.5 left-2 z-10 flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                        <Lock className="h-2.5 w-2.5" /> Fixed footer
                      </span>
                    </div>
                  )}
                </div>
              </div>
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
