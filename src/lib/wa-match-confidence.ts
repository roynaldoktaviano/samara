// How sure a WhatsApp chat ↔ website-button-tap match is (src/lib/wa-tap.ts). Client-safe.
export const MATCH_CONFIDENCES = ['CONFIDENT', 'MEDIUM', 'LOW'] as const
export type MatchConfidence = typeof MATCH_CONFIDENCES[number]
export const MATCH_CONFIDENCE_LABEL: Record<MatchConfidence, string> = { CONFIDENT: 'Confident', MEDIUM: 'Medium', LOW: 'Low' }
export const isMatchConfidence = (v: unknown): v is MatchConfidence =>
  typeof v === 'string' && (MATCH_CONFIDENCES as readonly string[]).includes(v)
