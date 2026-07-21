'use client'

import { useRef, useState } from 'react'
import { FONT_OPTIONS, uniformPadding, type EmailBlock, type BlockAlign, type Padding, type HideOn } from '@/lib/email-builder'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Superscript, Subscript, Link as LinkIcon, Link2Off, Loader2, Upload, Monitor, Smartphone, AlignLeft, AlignCenter, AlignRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useFileDrop } from '@/hooks/useFileDrop'

// Catches the ways a manual line break (Enter in the label, rendered as a real
// <br> on every device — see renderMultilineLabel in email-builder.ts) can look
// awkward: splitting mid-word, leaving a lone word stranded on its own line, or a
// line long enough that a narrow button still wraps it again anyway.
function labelBreakWarnings(label: string): string[] {
  const lines = label.split('\n')
  if (lines.length < 2) return []
  const warnings: string[] = []
  for (let i = 0; i < lines.length - 1; i++) {
    const lastChar = lines[i].slice(-1)
    const firstChar = lines[i + 1].slice(0, 1)
    if (/\S/.test(lastChar) && /\S/.test(firstChar)) {
      warnings.push(`Baris ${i + 1} & ${i + 2} terputus di tengah kata ("...${lastChar}" / "${firstChar}...") — pindahkan Enter ke sebelah spasi.`)
    }
  }
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    if (wordCount === 1) warnings.push(`Baris ${i + 1} cuma 1 kata ("${trimmed}") — bisa kelihatan aneh sendirian, coba gabung ke baris sebelah.`)
    else if (trimmed.length > 30) warnings.push(`Baris ${i + 1} agak panjang (${trimmed.length} karakter) — kemungkinan tetap wrap ulang otomatis kalau layar/tombolnya sempit.`)
  })
  return warnings
}

/** Full-bleed section divider bar — groups fields the way "BLOCK OPTIONS" / "ACTION" do in the reference builder. */
function SectionHeader({ label }: { label: string }) {
  return <p className="-mx-3 bg-gray-100 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-gray-500 uppercase">{label}</p>
}

function Stepper({ value, onChange, min = 0, max = 200, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const round = (n: number) => Math.round(n * 100) / 100
  const dec = () => onChange(Math.max(min, round(value - step)))
  const inc = () => onChange(Math.min(max, round(value + step)))
  return (
    <div className="flex items-center rounded-md border overflow-hidden">
      <button type="button" onClick={dec} className="flex h-8 w-7 shrink-0 items-center justify-center text-gray-500 hover:bg-gray-50 border-r">−</button>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        className="h-8 w-full min-w-0 text-center text-sm outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={inc} className="flex h-8 w-7 shrink-0 items-center justify-center text-gray-500 hover:bg-gray-50 border-l">+</button>
    </div>
  )
}

function AlignField({ value, onChange }: { value: BlockAlign; onChange: (v: BlockAlign) => void }) {
  const options: { v: BlockAlign; icon: React.ElementType }[] = [
    { v: 'left', icon: AlignLeft },
    { v: 'center', icon: AlignCenter },
    { v: 'right', icon: AlignRight },
  ]
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Alignment</Label>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map(o => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex h-8 items-center justify-center rounded-md border transition-colors ${value === o.v ? 'bg-[#bdac7e] text-white border-[#bdac7e]' : 'text-muted-foreground hover:bg-muted/50'}`}
          >
            <o.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}

function FontField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Font</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map(f => (
            <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
        <Input value={value} onChange={e => onChange(e.target.value)} className="h-8 text-xs font-mono" />
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange, min = 0, max = 200, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Stepper value={value} onChange={onChange} min={min} max={max} step={step} />
    </div>
  )
}

function PaddingField({ value, onChange }: { value: Padding; onChange: (p: Padding) => void }) {
  const allEqual = value.top === value.right && value.right === value.bottom && value.bottom === value.left
  const [expanded, setExpanded] = useState(!allEqual)
  const side = (key: keyof Padding, label: string) => (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Stepper value={value[key]} onChange={n => onChange({ ...value, [key]: n })} />
    </div>
  )
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Padding</Label>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">More options</span>
          <Switch checked={expanded} onCheckedChange={setExpanded} />
        </div>
      </div>
      {expanded ? (
        <div className="grid grid-cols-2 gap-2">
          {side('top', 'Top')}
          {side('right', 'Right')}
          {side('bottom', 'Bottom')}
          {side('left', 'Left')}
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">All sides</Label>
          <Stepper value={value.top} onChange={n => onChange(uniformPadding(n))} />
        </div>
      )}
    </div>
  )
}

/** Desktop/Mobile tab switcher for a group of fields that support a mobile-only override (see TextMobileOverride/ButtonMobileOverride) — the same 2-icon pattern as HideOnField, but for style values instead of visibility. */
function DeviceToggle({ device, onChange }: { device: 'desktop' | 'mobile'; onChange: (d: 'desktop' | 'mobile') => void }) {
  const base = 'flex items-center justify-center gap-1.5 h-7 px-3 rounded-md border text-xs font-medium transition-colors'
  const active = 'bg-[#bdac7e] text-white border-[#bdac7e]'
  const inactive = 'text-muted-foreground hover:bg-muted/50'
  return (
    <div className="inline-flex gap-1.5">
      <button type="button" onClick={() => onChange('desktop')} className={`${base} ${device === 'desktop' ? active : inactive}`}>
        <Monitor className="h-3.5 w-3.5" /> Desktop
      </button>
      <button type="button" onClick={() => onChange('mobile')} className={`${base} ${device === 'mobile' ? active : inactive}`}>
        <Smartphone className="h-3.5 w-3.5" /> Mobile
      </button>
    </div>
  )
}

function ResetMobileLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors">
      Reset mobile overrides
    </button>
  )
}

function HideOnField({ value, onChange }: { value: HideOn; onChange: (v: HideOn) => void }) {
  const base = 'flex items-center justify-center gap-1 h-8 rounded-md border text-xs font-medium transition-colors'
  const active = 'bg-[#bdac7e] text-white border-[#bdac7e]'
  const inactive = 'text-muted-foreground hover:bg-muted/50'
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Hide on</Label>
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" onClick={() => onChange('none')} className={`${base} ${value === 'none' ? active : inactive}`}>Off</button>
        <button type="button" title="Hide on desktop" onClick={() => onChange('desktop')} className={`${base} ${value === 'desktop' ? active : inactive}`}>
          <Monitor className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Hide on mobile" onClick={() => onChange('mobile')} className={`${base} ${value === 'mobile' ? active : inactive}`}>
          <Smartphone className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Hides this block on that device when the email is opened. Support varies slightly across email clients.</p>
    </div>
  )
}

// Toolbar buttons live outside the contentEditable div, so clicking one is a
// separate mousedown/click on a different element — browsers can collapse or
// clear the user's in-progress text selection as part of that, independently
// of focus (preventDefault on the button's mousedown stops the focus jump but
// isn't reliably enough to keep the Selection/Range itself intact everywhere).
// Explicitly saving the Range whenever it changes inside the editor, then
// re-applying that exact Range right before execCommand runs, makes formatting
// commands act on precisely what was selected instead of falling back to
// wherever the caret happens to end up (which reads as "it formatted everything").
// variant="compact" is for single-line contexts like a button label — no block-level
// formatting (lists, links: a link nested inside the button's own <a> isn't valid HTML,
// and a bullet/numbered list doesn't make sense in a short CTA), and Enter inserts a
// plain <br> instead of contentEditable's default new-paragraph block split.
function RichTextField({ label = 'Text', html, onChange, linkColor, variant = 'full', minHeight = 80 }: { label?: string; html: string; onChange: (html: string) => void; linkColor?: string; variant?: 'full' | 'compact'; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand(cmd, false, arg)
    saveSelection()
    if (ref.current) onChange(ref.current.innerHTML)
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-1 border rounded-md p-1 bg-muted/40">
        <Button type="button" variant="ghost" size="sm" title="Bold" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" title="Italic" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" title="Underline" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')}><Underline className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" title="Strikethrough" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('strikeThrough')}><Strikethrough className="h-3.5 w-3.5" /></Button>
        <span className="w-px self-stretch bg-border mx-0.5" />
        {variant === 'full' && (
          <>
            <Button type="button" variant="ghost" size="sm" title="Bullet list" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><List className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="sm" title="Numbered list" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-3.5 w-3.5" /></Button>
            <span className="w-px self-stretch bg-border mx-0.5" />
          </>
        )}
        <Button type="button" variant="ghost" size="sm" title="Superscript" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('superscript')}><Superscript className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" title="Subscript" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('subscript')}><Subscript className="h-3.5 w-3.5" /></Button>
        {variant === 'full' && (
          <>
            <span className="w-px self-stretch bg-border mx-0.5" />
            <Button type="button" variant="ghost" size="sm" title="Add link" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => {
              const url = window.prompt('Link URL')
              if (url) exec('createLink', url)
            }}><LinkIcon className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="sm" title="Remove link" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('unlink')}><Link2Off className="h-3.5 w-3.5" /></Button>
          </>
        )}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="email-rich-text border rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
        style={{ minHeight, ...(linkColor ? ({ '--link-color': linkColor } as React.CSSProperties) : undefined) }}
        dangerouslySetInnerHTML={{ __html: html }}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onKeyDown={variant === 'compact' ? e => {
          if (e.key === 'Enter') { e.preventDefault(); exec('insertLineBreak') }
        } : undefined}
        onBlur={e => { saveSelection(); onChange(e.currentTarget.innerHTML) }}
      />
    </div>
  )
}

function ImageUploadField({ label = 'Image', src, onChange }: { label?: string; src: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/marketing/upload-image', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error ?? 'Upload failed'); return }
      onChange(data.url)
    } catch {
      toast.error('Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const { isDragging, dropProps } = useFileDrop(files => { const f = files[0]; if (f) upload(f) }, uploading)

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div {...dropProps} className={`flex gap-2 rounded-md p-1 -m-1 transition-colors ${isDragging ? 'ring-2 ring-[#bdac7e] bg-[#bdac7e]/5' : ''}`}>
        <Input value={src} onChange={e => onChange(e.target.value)} placeholder={isDragging ? 'Drop image to upload' : 'https://...'} className="h-8 text-xs" />
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        </Button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
      </div>
    </div>
  )
}

export default function BlockInspector({ block, onChange }: { block: EmailBlock; onChange: (block: EmailBlock) => void }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  switch (block.type) {
    case 'text':
    case 'heading': {
      const sizeRange = block.type === 'heading' ? { min: 14, max: 60 } : { min: 10, max: 48 }
      return (
        <div className="space-y-3">
          <RichTextField html={block.html} onChange={html => onChange({ ...block, html })} linkColor={block.linkColor} />
          <FontField value={block.fontFamily} onChange={fontFamily => onChange({ ...block, fontFamily })} />
          <SectionHeader label="Size, align & color" />
          <DeviceToggle device={device} onChange={setDevice} />
          {device === 'desktop' ? (
            <>
              <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
              <NumberField label="Font size" value={block.fontSize} onChange={fontSize => onChange({ ...block, fontSize })} {...sizeRange} />
              <ColorField label="Text color" value={block.color} onChange={color => onChange({ ...block, color })} />
            </>
          ) : (
            <>
              <AlignField value={block.mobile?.align ?? block.align} onChange={align => onChange({ ...block, mobile: { ...block.mobile, align } })} />
              <NumberField label="Font size" value={block.mobile?.fontSize ?? block.fontSize} onChange={fontSize => onChange({ ...block, mobile: { ...block.mobile, fontSize } })} {...sizeRange} />
              <ColorField label="Text color" value={block.mobile?.color ?? block.color} onChange={color => onChange({ ...block, mobile: { ...block.mobile, color } })} />
              {block.mobile && <ResetMobileLink onClick={() => onChange({ ...block, mobile: undefined })} />}
            </>
          )}
          <ColorField label="Link color" value={block.linkColor} onChange={linkColor => onChange({ ...block, linkColor })} />
          <NumberField label="Line height" value={block.lineHeight} onChange={lineHeight => onChange({ ...block, lineHeight })} min={1} max={3} step={0.1} />
          <NumberField label="Letter spacing" value={block.letterSpacing} onChange={letterSpacing => onChange({ ...block, letterSpacing })} min={-5} max={20} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )
    }

    case 'image':
    case 'logo':
      return (
        <div className="space-y-3">
          <ImageUploadField label={block.type === 'logo' ? 'Logo' : 'Image'} src={block.src} onChange={src => onChange({ ...block, src })} />
          <div className="space-y-1.5">
            <Label className="text-xs">Alt text</Label>
            <Input value={block.alt} onChange={e => onChange({ ...block, alt: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Auto width</Label>
            <Switch checked={block.autoWidth} onCheckedChange={autoWidth => onChange({ ...block, autoWidth })} />
          </div>
          {block.autoWidth ? (
            <div className="flex items-center justify-between opacity-50">
              <Label className="text-xs">Full width on mobile</Label>
              <Switch checked={false} disabled />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Full width on mobile</Label>
                <Switch checked={block.fullWidthOnMobile} onCheckedChange={fullWidthOnMobile => onChange({ ...block, fullWidthOnMobile })} />
              </div>
              <NumberField label="Width (%)" value={block.width} onChange={width => onChange({ ...block, width: Math.min(100, Math.max(10, width)) })} min={10} max={100} />
            </>
          )}
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <SectionHeader label="Action" />
          <div className="space-y-1.5">
            <Label className="text-xs">Link (optional)</Label>
            <Input value={block.link ?? ''} onChange={e => onChange({ ...block, link: e.target.value || undefined })} placeholder="https://..." className="h-8 text-sm" />
          </div>
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'video':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Video URL</Label>
            <Input value={block.videoUrl} onChange={e => onChange({ ...block, videoUrl: e.target.value })} placeholder="https://youtube.com/watch?v=..." className="h-8 text-sm" />
            <p className="text-[11px] text-muted-foreground">Emails can&apos;t play video directly — clicking the thumbnail opens this link.</p>
          </div>
          <ImageUploadField label="Thumbnail" src={block.thumbnailSrc} onChange={thumbnailSrc => onChange({ ...block, thumbnailSrc })} />
          <NumberField label="Width (%)" value={block.width} onChange={width => onChange({ ...block, width: Math.min(100, Math.max(10, width)) })} min={10} max={100} />
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'html':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Custom HTML</Label>
            <Textarea value={block.code} onChange={e => onChange({ ...block, code: e.target.value })} rows={8} className="font-mono text-xs" />
            <p className="text-[11px] text-muted-foreground">For advanced use — inserted as-is into the email.</p>
          </div>
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'button':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Textarea
              value={block.label}
              onChange={e => onChange({ ...block, label: e.target.value })}
              rows={2}
              className="text-sm resize-none"
            />
            <p className="text-[11px] text-muted-foreground">Press Enter for a line break — it shows the same way on desktop and mobile.</p>
            {labelBreakWarnings(block.label).map((w, i) => (
              <p key={i} className="flex items-start gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{w}</span>
              </p>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={block.url} onChange={e => onChange({ ...block, url: e.target.value })} placeholder="https://example.com" className="h-8 text-sm" />
          </div>
          <ColorField label="Background" value={block.bgColor} onChange={bgColor => onChange({ ...block, bgColor })} />
          <ColorField label="Text color" value={block.textColor} onChange={textColor => onChange({ ...block, textColor })} />
          <FontField value={block.fontFamily} onChange={fontFamily => onChange({ ...block, fontFamily })} />
          <NumberField label="Line height" value={block.lineHeight} onChange={lineHeight => onChange({ ...block, lineHeight })} min={1} max={3} step={0.1} />
          <SectionHeader label="Size, align & mobile color" />
          <DeviceToggle device={device} onChange={setDevice} />
          {device === 'desktop' ? (
            <>
              <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
              <NumberField label="Font size" value={block.fontSize} onChange={fontSize => onChange({ ...block, fontSize })} min={10} max={30} />
            </>
          ) : (
            <>
              <AlignField value={block.mobile?.align ?? block.align} onChange={align => onChange({ ...block, mobile: { ...block.mobile, align } })} />
              <NumberField label="Font size" value={block.mobile?.fontSize ?? block.fontSize} onChange={fontSize => onChange({ ...block, mobile: { ...block.mobile, fontSize } })} min={10} max={30} />
              <ColorField label="Background" value={block.mobile?.bgColor ?? block.bgColor} onChange={bgColor => onChange({ ...block, mobile: { ...block.mobile, bgColor } })} />
              <ColorField label="Text color" value={block.mobile?.textColor ?? block.textColor} onChange={textColor => onChange({ ...block, mobile: { ...block.mobile, textColor } })} />
              {block.mobile && <ResetMobileLink onClick={() => onChange({ ...block, mobile: undefined })} />}
            </>
          )}
          <NumberField label="Corner radius" value={block.borderRadius} onChange={borderRadius => onChange({ ...block, borderRadius })} min={0} max={40} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'divider':
      return (
        <div className="space-y-3">
          <ColorField label="Color" value={block.color} onChange={color => onChange({ ...block, color })} />
          <NumberField label="Thickness" value={block.thickness} onChange={thickness => onChange({ ...block, thickness })} min={1} max={10} />
          <NumberField label="Width (%)" value={block.width} onChange={width => onChange({ ...block, width: Math.min(100, Math.max(10, width)) })} min={10} max={100} />
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'spacer':
      return (
        <div className="space-y-3">
          <NumberField label="Height" value={block.height} onChange={height => onChange({ ...block, height })} min={4} max={200} />
          <SectionHeader label="Block options" />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'columns': {
      const count = block.columns.length
      const setCount = (n: number) => {
        n = Math.min(6, Math.max(1, n))
        if (n === count) return
        const columns = n > count
          ? [...block.columns, ...Array.from({ length: n - count }, () => [] as EmailBlock[])]
          : (() => {
              const kept = block.columns.slice(0, n)
              const overflow = block.columns.slice(n).flat()
              kept[n - 1] = [...kept[n - 1], ...overflow]
              return kept
            })()
        onChange({ ...block, columns })
      }
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Drag blocks from the palette directly into each column on the canvas.</p>
          <NumberField label="Number of columns" value={count} onChange={setCount} min={1} max={6} />
          <NumberField label="Gap between columns" value={block.gap ?? 24} onChange={gap => onChange({ ...block, gap })} max={80} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )
    }

    case 'section':
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Drag blocks from the palette into the section on the canvas.</p>
          <ColorField label="Background color" value={block.backgroundColor} onChange={backgroundColor => onChange({ ...block, backgroundColor })} />
          <ImageUploadField label="Background image (optional)" src={block.backgroundImage} onChange={backgroundImage => onChange({ ...block, backgroundImage })} />
          {block.backgroundImage && (
            <div className="space-y-1.5">
              <Label className="text-xs">Background fit</Label>
              <Select value={block.backgroundSize} onValueChange={v => onChange({ ...block, backgroundSize: v as typeof block.backgroundSize })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="repeat">Repeat (tile)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'social':
      return (
        <div className="space-y-3">
          {block.links.map((l, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Platform</Label>
                <Input value={l.platform} onChange={e => {
                  const links = [...block.links]; links[i] = { ...l, platform: e.target.value }; onChange({ ...block, links })
                }} className="h-8 text-sm" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">URL</Label>
                <Input value={l.url} onChange={e => {
                  const links = [...block.links]; links[i] = { ...l, url: e.target.value }; onChange({ ...block, links })
                }} placeholder="https://example.com" className="h-8 text-sm" />
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-red-600" onClick={() => onChange({ ...block, links: block.links.filter((_, idx) => idx !== i) })}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onChange({ ...block, links: [...block.links, { platform: 'Website', url: '' }] })}>
            + Add link
          </Button>
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'footer':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input value={block.companyName} onChange={e => onChange({ ...block, companyName: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Input value={block.address} onChange={e => onChange({ ...block, address: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Instagram URL</Label>
            <Input value={block.instagramUrl} onChange={e => onChange({ ...block, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">WhatsApp number</Label>
            <Input value={block.whatsappNumber} onChange={e => onChange({ ...block, whatsappNumber: e.target.value })} placeholder="+62 ..." className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website URL</Label>
            <Input value={block.websiteUrl} onChange={e => onChange({ ...block, websiteUrl: e.target.value })} placeholder="https://..." className="h-8 text-sm" />
          </div>
          <NumberField label="Padding" value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <NumberField label="Line height" value={block.lineHeight} onChange={lineHeight => onChange({ ...block, lineHeight })} min={1} max={3} step={0.1} />
        </div>
      )
  }
}
