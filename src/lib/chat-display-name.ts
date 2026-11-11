// A chat linked to a Lead shows the Lead's name, so renaming the Lead (Leads page or the chat's
// "Edit lead" button) renames every WA/IG/Messenger thread of that person. Webhooks keep
// overwriting the chat's own contactName/displayName from the platform profile, so the Lead is
// the only place a sales rep's correction sticks. Auto-created leads start with a placeholder
// name (see whatsapp-lead.ts / lead-contact.ts) — those defer to the platform name.
export function isPlaceholderLeadName(name: string | null | undefined) {
  const n = name?.trim() ?? ''
  return !n || /^\+?[\d\s-]+$/.test(n) || /^@\S+$/.test(n) || /^(Instagram|Messenger|Facebook) user$/i.test(n)
}

export function chatDisplayName(leadName: string | null | undefined, fallback: string) {
  return leadName && !isPlaceholderLeadName(leadName) ? leadName.trim() : fallback
}
