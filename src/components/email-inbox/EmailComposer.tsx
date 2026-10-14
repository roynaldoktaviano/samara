'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Link2, Link2Off,
  RemoveFormatting, Undo2, Redo2, Palette, PenLine,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import EmailSignatureDialog from '@/components/profile/EmailSignatureDialog'
import { renderEmailSignatureHtml, normalizeEmailSignature, type EmailSignature } from '@/lib/email-signature'

// Rich-text body for Chat › Email (reply panel + Leads "Follow up by Email"). The HTML it
// produces is re-sanitized on the server (src/lib/email-html.ts) before it's stored/sent, so
// keep the toolbar in step with what that allows.

export interface ComposerValue { html: string; text: string; isEmpty: boolean }

const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '' },
  { label: 'Large', value: '18px' },
  { label: 'Huge', value: '24px' },
]
const COLORS = ['#222222', '#5f6368', '#2c4f5e', '#1a73e8', '#188038', '#b3955c', '#e37400', '#d93025', '#a142f4']

/** Matches what sanitizeEmailHtml + the email wrapper render, so the editor is WYSIWYG. */
export const EMAIL_BODY_CLASSES =
  'text-sm leading-relaxed text-[#222] [&_p]:m-0 [&_p]:min-h-[1.5em] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_blockquote]:ml-2 [&_blockquote]:pl-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#d0d7de] [&_blockquote]:text-[#555] ' +
  '[&_a]:text-[#1a73e8] [&_a]:underline'

function editorToValue(editor: Editor): ComposerValue {
  return { html: editor.getHTML(), text: editor.getText({ blockSeparator: '\n' }).trim(), isEmpty: editor.isEmpty }
}

export default function EmailComposer({ initialHtml = '', placeholder, onChange, onSubmit, disabled, minHeight = 120, maxHeight = '40vh', resetKey, autoFocus }: {
  initialHtml?: string
  placeholder?: string
  onChange: (value: ComposerValue) => void
  /** Cmd/Ctrl+Enter */
  onSubmit?: () => void
  disabled?: boolean
  minHeight?: number
  /** Editor scrolls past this height; null = grows with the content (the page scrolls instead). */
  maxHeight?: string | null
  /** Change this to clear the editor back to initialHtml (e.g. after sending). */
  resetKey?: string | number
  autoFocus?: boolean
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false, code: false, codeBlock: false, horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TextStyle, Color, FontSize,
      Placeholder.configure({ placeholder: placeholder ?? 'Write your message...' }),
    ],
    content: initialHtml,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: `${EMAIL_BODY_CLASSES} px-4 py-3 focus:outline-none`, style: `min-height:${minHeight}px` },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { onSubmit?.(); return true }
        return false
      },
    },
    // Report pre-filled content (e.g. Forward) right away, not only after the first keystroke
    onCreate: ({ editor }) => onChange(editorToValue(editor)),
    onUpdate: ({ editor }) => onChange(editorToValue(editor)),
  })

  useEffect(() => {
    if (!editor || resetKey === undefined) return
    editor.commands.setContent(initialHtml)
    onChange(editorToValue(editor))
  }, [resetKey, editor])

  useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])

  return (
    <div className="flex flex-col">
      {editor && <Toolbar editor={editor} sticky={maxHeight === null} />}
      <div style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined} className="[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:text-muted-foreground [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor, sticky }: { editor: Editor; sticky?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'), link: e.isActive('link'),
      fontSize: (e.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      color: (e.getAttributes('textStyle').color as string | undefined) ?? '',
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  })
  const chain = () => editor.chain().focus()

  function toggleLink() {
    if (s.link) { chain().extendMarkRange('link').unsetLink().run(); return }
    const url = window.prompt('Link URL', 'https://')
    if (!url || url === 'https://') return
    chain().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className={`flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b ${sticky ? 'sticky top-0 z-10 bg-white' : 'bg-muted/10'}`}>
      <Btn title="Undo" onClick={() => chain().undo().run()} disabled={!s.canUndo}><Undo2 /></Btn>
      <Btn title="Redo" onClick={() => chain().redo().run()} disabled={!s.canRedo}><Redo2 /></Btn>
      <Sep />
      <select
        title="Text size"
        value={s.fontSize}
        onChange={e => e.target.value ? chain().setFontSize(e.target.value).run() : chain().unsetFontSize().run()}
        className="h-7 rounded-md border bg-white px-1.5 text-xs focus:outline-none"
      >
        {FONT_SIZES.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
      </select>
      <Sep />
      <Btn title="Bold (⌘B)" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold /></Btn>
      <Btn title="Italic (⌘I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic /></Btn>
      <Btn title="Underline (⌘U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline /></Btn>
      <Btn title="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough /></Btn>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" title="Text color" className="h-7 w-7 rounded-md flex flex-col items-center justify-center text-muted-foreground hover:bg-muted">
            <Palette className="h-3.5 w-3.5" />
            <span className="h-0.5 w-3.5 rounded-full mt-0.5" style={{ backgroundColor: s.color || '#222222' }} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-5 gap-1.5">
            {COLORS.map(c => (
              <button key={c} type="button" title={c} onClick={() => chain().setColor(c).run()}
                className={`h-6 w-6 rounded-full border ${s.color === c ? 'ring-2 ring-offset-1 ring-[#1a73e8]' : ''}`} style={{ backgroundColor: c }} />
            ))}
            <button type="button" title="Default color" onClick={() => chain().unsetColor().run()}
              className="h-6 w-6 rounded-full border text-[10px] text-muted-foreground">✕</button>
          </div>
        </PopoverContent>
      </Popover>
      <Sep />
      <Btn title="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List /></Btn>
      <Btn title="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered /></Btn>
      <Btn title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote /></Btn>
      <Btn title={s.link ? 'Remove link' : 'Insert link'} active={s.link} onClick={toggleLink}>{s.link ? <Link2Off /> : <Link2 />}</Btn>
      <Sep />
      <Btn title="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting /></Btn>
    </div>
  )
}

function Btn({ title, onClick, active, disabled, children }: {
  title: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick} disabled={disabled}
      className={`h-7 w-7 rounded-md flex items-center justify-center [&_svg]:h-3.5 [&_svg]:w-3.5 disabled:opacity-30 transition-colors ${active ? 'bg-[#1a73e8]/10 text-[#1a73e8]' : 'text-muted-foreground hover:bg-muted'}`}>
      {children}
    </button>
  )
}
const Sep = () => <span className="mx-1 h-4 w-px bg-border" />

/**
 * The signed-in user's signature exactly as it will be appended to the email,
 * with a shortcut to edit it.
 */
export function SignaturePreview() {
  const { data: session } = useSession()
  const [sig, setSig] = useState<EmailSignature | null>(null)
  const [ctx, setCtx] = useState<{ email: string; company: string | null }>({ email: '', company: null })
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    fetch('/api/profile/email-signature')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        setSig(normalizeEmailSignature(data.signature))
        setCtx({ email: data.defaults?.email ?? '', company: data.defaults?.company ?? null })
      })
      .finally(() => setLoaded(true))
  }, [])
  useEffect(() => { load() }, [load])

  if (!loaded) return null
  const html = renderEmailSignatureHtml(sig, ctx)

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Signature</span>
        <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] text-[#1a73e8] hover:underline">
          <PenLine className="h-3 w-3" /> {html ? 'Edit signature' : 'Set up signature'}
        </button>
      </div>
      {html ? (
        <div className="pointer-events-none select-none opacity-90 [&>table]:!mt-2" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-xs text-muted-foreground mt-1">{sig && !sig.enabled ? 'Signature is turned off — this email will be sent without one.' : 'No signature yet — this email will be sent without one.'}</p>
      )}
      {session?.user?.id && (
        <EmailSignatureDialog open={editing} userId={session.user.id}
          onOpenChange={open => { setEditing(open); if (!open) load() }} />
      )}
    </div>
  )
}
