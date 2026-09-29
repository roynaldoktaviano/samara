'use client'

import { useState, useEffect } from 'react'
import { fontFaceCss, type EmailFontFace } from '@/lib/email-builder'

// One shared fetch for every builder/inspector/preview on the page, plus a single <style>
// tag in document.head holding every uploaded face — so the builder canvas and the font
// picker itself render in the real font, not just the exported HTML.
const STYLE_ID = 'email-custom-fonts'
let cache: EmailFontFace[] | null = null
let inflight: Promise<EmailFontFace[]> | null = null
const listeners = new Set<(fonts: EmailFontFace[]) => void>()

function applyStyle(fonts: EmailFontFace[]) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = fontFaceCss(fonts)
}

function load(): Promise<EmailFontFace[]> {
  if (!inflight) {
    inflight = fetch('/api/marketing/fonts')
      .then(res => (res.ok ? res.json() : []))
      .catch(() => [])
      .then((fonts: EmailFontFace[]) => {
        cache = fonts
        applyStyle(fonts)
        listeners.forEach(l => l(fonts))
        return fonts
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

/** Re-fetch after the library changes (upload/edit/delete) so every mounted builder picks it up. */
export function refreshEmailFonts() {
  return load()
}

export function useEmailFonts(): EmailFontFace[] {
  const [fonts, setFonts] = useState<EmailFontFace[]>(cache ?? [])

  useEffect(() => {
    listeners.add(setFonts)
    if (cache) setFonts(cache)
    else load()
    return () => { listeners.delete(setFonts) }
  }, [])

  return fonts
}
