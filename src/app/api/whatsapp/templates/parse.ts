import { countTemplateParams } from '@/lib/whatsapp-templates'

export interface TemplateInput { name: string; label: string; language: string; bodyText: string; paramLabels: string[] }

// Validates the admin's template form. `name`/`language` must match Meta exactly (Meta
// template names are lowercase letters, digits and underscores), and there must be one
// param label per {{n}} placeholder in the body so the compose form asks for each value.
export function parseTemplateInput(body: Record<string, unknown>): TemplateInput | { error: string } {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const language = typeof body.language === 'string' ? body.language.trim() : ''
  const bodyText = typeof body.bodyText === 'string' ? body.bodyText.trim() : ''
  const rawLabels = Array.isArray(body.paramLabels) ? body.paramLabels : []

  if (!/^[a-z0-9_]+$/.test(name)) return { error: 'Template name must match Meta exactly: lowercase letters, numbers and underscores only' }
  if (!language) return { error: 'Language code is required (e.g. en, en_US, id)' }
  if (!bodyText) return { error: 'Body text is required' }

  const paramCount = countTemplateParams(bodyText)
  const paramLabels = rawLabels.slice(0, paramCount).map((l, i) => (typeof l === 'string' && l.trim()) || `Param {{${i + 1}}}`)
  while (paramLabels.length < paramCount) paramLabels.push(`Param {{${paramLabels.length + 1}}}`)

  return { name, label: label || name, language, bodyText, paramLabels }
}
