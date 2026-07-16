import type { EmailBlock } from '@/lib/email-builder'
import { ImageOff, Play, Code2 } from 'lucide-react'

/**
 * Editor-canvas approximation of a block (plain divs, not the table-based
 * markup used for the real email). The actual sent/saved HTML always comes
 * from `renderBlocksToHtml` — use the builder's "Preview" toggle for exact fidelity.
 */
export default function BlockPreview({ block }: { block: EmailBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <div
          style={{ padding: block.padding, textAlign: block.align, fontSize: block.fontSize, color: block.color, fontFamily: block.fontFamily }}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      )

    case 'heading':
      return (
        <div
          style={{ padding: block.padding, textAlign: block.align, fontSize: block.fontSize, color: block.color, fontFamily: block.fontFamily, fontWeight: 700 }}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      )

    case 'image':
    case 'logo':
      return (
        <div style={{ padding: block.padding, textAlign: block.align }}>
          {block.src ? (
            <img src={block.src} alt={block.alt} style={{ width: `${block.width}%`, maxWidth: '100%', display: 'inline-block' }} />
          ) : (
            <div className="inline-flex flex-col items-center justify-center gap-1 text-muted-foreground bg-muted rounded-md py-8 px-6 w-full">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">{block.type === 'logo' ? 'No logo set' : 'No image set'}</span>
            </div>
          )}
        </div>
      )

    case 'video':
      return (
        <div style={{ padding: block.padding, textAlign: block.align }}>
          {block.thumbnailSrc ? (
            <div className="relative inline-block" style={{ width: `${block.width}%` }}>
              <img src={block.thumbnailSrc} alt="Video thumbnail" style={{ width: '100%', display: 'block' }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-black/60 flex items-center justify-center">
                  <Play className="h-4 w-4 text-white fill-white" />
                </div>
              </div>
            </div>
          ) : (
            <div className="inline-flex flex-col items-center justify-center gap-1 text-muted-foreground bg-muted rounded-md py-8 px-6 w-full">
              <Play className="h-6 w-6" />
              <span className="text-xs">No video thumbnail set</span>
            </div>
          )}
        </div>
      )

    case 'html':
      return (
        <div style={{ padding: block.padding }} className="relative">
          <span className="absolute top-0 right-0 flex items-center gap-1 text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            <Code2 className="h-3 w-3" /> HTML
          </span>
          <div dangerouslySetInnerHTML={{ __html: block.code }} />
        </div>
      )

    case 'button':
      return (
        <div style={{ padding: block.padding, textAlign: block.align }}>
          <span
            style={{
              display: 'inline-block', background: block.bgColor, color: block.textColor, fontFamily: block.fontFamily,
              padding: '10px 24px', borderRadius: block.borderRadius, fontSize: 14, fontWeight: 600,
            }}
          >
            {block.label || 'Button'}
          </span>
        </div>
      )

    case 'divider':
      return (
        <div style={{ padding: block.padding }}>
          <div style={{ borderTop: `${block.thickness}px solid ${block.color}` }} />
        </div>
      )

    case 'spacer':
      return <div style={{ height: block.height }} />

    case 'columns':
      return (
        <div style={{ padding: block.padding, gap: block.gap ?? 24, gridTemplateColumns: `repeat(${block.columns.length}, minmax(0, 1fr))` }} className="grid">
          {block.columns.map((col, i) => (
            <div key={i} className="space-y-1">
              {col.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">Empty</div>
              ) : (
                col.map(child => <BlockPreview key={child.id} block={child} />)
              )}
            </div>
          ))}
        </div>
      )

    case 'section':
      return (
        <div
          style={{
            padding: block.padding,
            backgroundColor: block.backgroundColor,
            backgroundImage: block.backgroundImage ? `url(${block.backgroundImage})` : undefined,
            backgroundSize: block.backgroundImage ? block.backgroundSize : undefined,
            backgroundRepeat: block.backgroundImage ? (block.backgroundSize === 'repeat' ? 'repeat' : 'no-repeat') : undefined,
            backgroundPosition: 'center',
          }}
        >
          {block.blocks.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">Empty section</div>
          ) : (
            block.blocks.map(child => <BlockPreview key={child.id} block={child} />)
          )}
        </div>
      )

    case 'social':
      return (
        <div style={{ padding: block.padding, textAlign: block.align }} className="text-xs space-x-3">
          {block.links.map((l, i) => (
            <span key={i} className="underline text-muted-foreground">{l.platform}</span>
          ))}
        </div>
      )

    case 'footer':
      return (
        <div style={{ padding: block.padding, textAlign: block.align }} className="text-xs text-muted-foreground space-y-1">
          {block.companyName && <div>{block.companyName}</div>}
          {block.address && <div>{block.address}</div>}
          {block.showUnsubscribe && <div className="underline">Unsubscribe</div>}
        </div>
      )
  }
}
