'use client'

import { useRef, useState } from 'react'
import { FONT_OPTIONS, uniformPadding, type EmailBlock, type BlockAlign, type Padding, type HideOn } from '@/lib/email-builder'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Bold, Italic, Link as LinkIcon, Loader2, Upload, Monitor, Smartphone, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { toast } from 'sonner'
import { useFileDrop } from '@/hooks/useFileDrop'

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
        onChange={e => onChange(Number(e.target.value) || 0)}
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

function RichTextField({ html, onChange, linkColor }: { html: string; onChange: (html: string) => void; linkColor?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    if (ref.current) onChange(ref.current.innerHTML)
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Text</Label>
      <div className="flex items-center gap-1 border rounded-md p-1 bg-muted/40">
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')}><Bold className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')}><Italic className="h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onMouseDown={e => e.preventDefault()} onClick={() => {
          const url = window.prompt('Link URL')
          if (url) exec('createLink', url)
        }}><LinkIcon className="h-3.5 w-3.5" /></Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="email-rich-text min-h-[80px] border rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#bdac7e]"
        style={linkColor ? ({ '--link-color': linkColor } as React.CSSProperties) : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
        onBlur={e => onChange(e.currentTarget.innerHTML)}
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
  switch (block.type) {
    case 'text':
      return (
        <div className="space-y-3">
          <RichTextField html={block.html} onChange={html => onChange({ ...block, html })} linkColor={block.linkColor} />
          <FontField value={block.fontFamily} onChange={fontFamily => onChange({ ...block, fontFamily })} />
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <NumberField label="Font size" value={block.fontSize} onChange={fontSize => onChange({ ...block, fontSize })} min={10} max={48} />
          <ColorField label="Text color" value={block.color} onChange={color => onChange({ ...block, color })} />
          <ColorField label="Link color" value={block.linkColor} onChange={linkColor => onChange({ ...block, linkColor })} />
          <NumberField label="Line height" value={block.lineHeight} onChange={lineHeight => onChange({ ...block, lineHeight })} min={1} max={3} step={0.1} />
          <NumberField label="Letter spacing" value={block.letterSpacing} onChange={letterSpacing => onChange({ ...block, letterSpacing })} min={-5} max={20} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

    case 'heading':
      return (
        <div className="space-y-3">
          <RichTextField html={block.html} onChange={html => onChange({ ...block, html })} linkColor={block.linkColor} />
          <FontField value={block.fontFamily} onChange={fontFamily => onChange({ ...block, fontFamily })} />
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <NumberField label="Font size" value={block.fontSize} onChange={fontSize => onChange({ ...block, fontSize })} min={14} max={60} />
          <ColorField label="Text color" value={block.color} onChange={color => onChange({ ...block, color })} />
          <ColorField label="Link color" value={block.linkColor} onChange={linkColor => onChange({ ...block, linkColor })} />
          <NumberField label="Line height" value={block.lineHeight} onChange={lineHeight => onChange({ ...block, lineHeight })} min={1} max={3} step={0.1} />
          <NumberField label="Letter spacing" value={block.letterSpacing} onChange={letterSpacing => onChange({ ...block, letterSpacing })} min={-5} max={20} />
          <SectionHeader label="Block options" />
          <PaddingField value={block.padding} onChange={padding => onChange({ ...block, padding })} />
          <HideOnField value={block.hideOn} onChange={hideOn => onChange({ ...block, hideOn })} />
        </div>
      )

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
            <Input value={block.label} onChange={e => onChange({ ...block, label: e.target.value })} className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={block.url} onChange={e => onChange({ ...block, url: e.target.value })} className="h-8 text-sm" />
          </div>
          <ColorField label="Background" value={block.bgColor} onChange={bgColor => onChange({ ...block, bgColor })} />
          <ColorField label="Text color" value={block.textColor} onChange={textColor => onChange({ ...block, textColor })} />
          <FontField value={block.fontFamily} onChange={fontFamily => onChange({ ...block, fontFamily })} />
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
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
                }} className="h-8 text-sm" />
              </div>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-red-600" onClick={() => onChange({ ...block, links: block.links.filter((_, idx) => idx !== i) })}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => onChange({ ...block, links: [...block.links, { platform: 'Website', url: 'https://' }] })}>
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
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={block.showUnsubscribe} onChange={e => onChange({ ...block, showUnsubscribe: e.target.checked })} />
            Show unsubscribe link
          </label>
          <AlignField value={block.align} onChange={align => onChange({ ...block, align })} />
          <NumberField label="Padding" value={block.padding} onChange={padding => onChange({ ...block, padding })} />
        </div>
      )
  }
}
