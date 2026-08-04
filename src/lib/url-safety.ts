// Guards against `javascript:`/`data:`/etc. URIs sneaking into places that get
// rendered as a clickable `href` or `src` — only plain http(s) links are safe there.
export function isHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}
