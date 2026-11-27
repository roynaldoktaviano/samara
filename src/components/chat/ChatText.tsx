import { Fragment, type ReactNode } from 'react'
import { htmlToWa } from '@/lib/chat-html'

export { htmlToWa }

const TAG: Record<string, 'strong' | 'em' | 's' | 'code'> = { '*': 'strong', _: 'em', '~': 's', '```': 'code' }
// A marker opens after start/space/punctuation, the inner text doesn't start or end with a space
// and stays on one line (except ```code```), and the closer isn't followed by a word character.
const WA_RE = /(^|[^\p{L}\p{N}*_~`])(```([\s\S]+?)```|([*_~])(?!\s)([^\n]*?\S)\4)(?![\p{L}\p{N}])/gu

function renderWa(text: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(WA_RE.source, WA_RE.flags)
  while ((m = re.exec(text))) {
    const start = m.index + m[1].length
    if (start > last) out.push(text.slice(last, start))
    const code = m[3] !== undefined
    const Tag = TAG[code ? '```' : m[4]]
    const inner = code ? m[3] : m[5]
    out.push(
      <Tag key={`${depth}-${start}`} className={code ? 'font-mono text-[0.9em]' : undefined}>
        {code || depth > 2 ? inner : renderWa(inner, depth + 1)}
      </Tag>,
    )
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Chat bubble text with WhatsApp-style formatting (and Freshchat HTML) rendered — never raw HTML. */
export function ChatText({ text }: { text: string }) {
  return <Fragment>{renderWa(htmlToWa(text))}</Fragment>
}

/** One-line previews (inbox list, quoted reply): no markup at all. */
export function plainChatText(text: string): string {
  return htmlToWa(text).replace(/(^|\s)[*_~](\S[^\n]*?\S|\S)[*_~](?=\s|$|[.,!?:;])/g, '$1$2')
}
