// A "duplicate" agent isn't a real column — it's inferred from a specific note format an
// admin writes by hand when they deactivate an agent that turns out to duplicate an
// existing one. Shared here so the server (notification + delete guard) and the client
// (Agents.tsx table) parse the exact same convention.
export interface DuplicateInfo { originalName: string; date: string; salesperson: string }

const DUPLICATE_NOTE_RE = /duplikat dari agent "([^"]+)" \(dibuat ([\d-]+), salesperson ([^)]+)\)/i

export function parseDuplicateNote(note: string | null | undefined): DuplicateInfo | null {
  if (!note) return null
  const match = note.match(DUPLICATE_NOTE_RE)
  if (!match) return null
  return { originalName: match[1], date: match[2], salesperson: match[3] }
}

export function isDuplicateAgent(agent: { isActive: boolean; note: string | null }): boolean {
  return !agent.isActive && !!parseDuplicateNote(agent.note)
}
