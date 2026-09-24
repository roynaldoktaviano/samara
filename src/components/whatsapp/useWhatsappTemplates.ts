'use client'

import { useEffect, useState } from 'react'
import type { WhatsappBrand } from '@/lib/whatsapp-brands'
import type { WhatsappTemplateDef } from '@/lib/whatsapp-templates'

// A template is identified by name + language (the same name can be approved in several
// languages) — this key is what the compose forms use as the <Select> value.
export const templateKey = (t: Pick<WhatsappTemplateDef, 'name' | 'language'>) => `${t.name}|${t.language}`

// Templates offered for one brand's number (admin-registered at Chat > WhatsApp Templates,
// plus the built-in hello_world sample) — see GET /api/whatsapp/templates.
export function useWhatsappTemplates(brand: WhatsappBrand | null | undefined): WhatsappTemplateDef[] {
  const [templates, setTemplates] = useState<WhatsappTemplateDef[]>([])
  useEffect(() => {
    if (!brand) return
    let cancelled = false
    fetch(`/api/whatsapp/templates?brand=${brand}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: WhatsappTemplateDef[]) => { if (!cancelled) setTemplates(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [brand])
  return templates
}
