import sanitizeHtml from 'sanitize-html'

// Server-side cleanup of the HTML produced by the Chat › Email rich-text composer
// (src/components/email-inbox/EmailComposer.tsx). Only what the toolbar can produce is kept,
// and paragraphs get inline margins so mail clients render it like the editor does.

const P_STYLE = 'margin:0;'
const LIST_STYLE = 'margin:0 0 0 0;padding-left:24px;'

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'span', 'blockquote'],
    // p/ul/ol/blockquote styles are set by transformTags below (overwriting anything sent in)
    allowedAttributes: { a: ['href', 'target', 'rel'], span: ['style'], p: ['style'], ul: ['style'], ol: ['style'], blockquote: ['style'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: {
      span: {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
        'font-size': [/^\d{1,2}px$/],
      },
      '*': {
        margin: [/^[\d\spx]+$/], 'padding-left': [/^\d+px$/], 'border-left': [/^3px solid #d0d7de$/], color: [/^#555$/],
      },
    },
    transformTags: {
      p: (_tag, attribs) => ({ tagName: 'p', attribs: { ...attribs, style: P_STYLE } }),
      ul: (_tag, attribs) => ({ tagName: 'ul', attribs: { ...attribs, style: LIST_STYLE } }),
      ol: (_tag, attribs) => ({ tagName: 'ol', attribs: { ...attribs, style: LIST_STYLE } }),
      blockquote: (_tag, attribs) => ({ tagName: 'blockquote', attribs: { ...attribs, style: 'margin:0 0 0 8px;padding-left:12px;border-left:3px solid #d0d7de;color:#555;' } }),
      a: (_tag, attribs) => ({ tagName: 'a', attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } }),
    },
  })
}

/** Plain-text version of composer HTML, for previews/search and the text/plain part. */
export function emailHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
