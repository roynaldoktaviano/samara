/**
 * Freshchat (and some canned replies) store formatting as HTML — `<b>SAMARA I</b>`, `<i>…</i>`,
 * `<br>`. WhatsApp itself uses `*bold*`, `_italic_`, `~strike~`, ```mono```. Turn the HTML into
 * WhatsApp markers and drop any other markup tags, so both kinds of message read the same.
 */
export function htmlToWa(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => wrap(t, '*'))
    .replace(/<(i|em)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => wrap(t, '_'))
    .replace(/<(s|strike|del)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, t: string) => wrap(t, '~'))
    .replace(/<\/?(b|strong|i|em|s|strike|del|u|p|div|span|font|a|ul|ol|li|br)\b[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
}
// Keep surrounding spaces outside the markers — `* bold *` isn't bold in WhatsApp.
function wrap(t: string, m: string) {
  const [, lead, core, tail] = t.match(/^(\s*)([\s\S]*?)(\s*)$/)!
  return core ? `${lead}${m}${core}${m}${tail}` : t
}
