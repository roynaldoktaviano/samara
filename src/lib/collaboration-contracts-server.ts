import { keyFromR2Url } from '@/lib/r2'
import { COLLAB_CONTRACT_PREFIX, MAX_COLLAB_CONTRACTS } from '@/lib/collaboration-budget'

/** Validates a client-sent contract URL list: only our own R2 uploads, max 3, de-duplicated. */
export function parseContractUrls(raw: unknown): { urls: string[] } | { error: string } {
  if (raw == null) return { urls: [] }
  if (!Array.isArray(raw)) return { error: 'collaborationContracts must be an array' }
  const urls = [...new Set(raw.filter((u): u is string => typeof u === 'string' && !!u))]
  if (urls.length > MAX_COLLAB_CONTRACTS) return { error: `Maximum ${MAX_COLLAB_CONTRACTS} contract files` }
  if (urls.some(u => !keyFromR2Url(u)?.startsWith(COLLAB_CONTRACT_PREFIX))) return { error: 'Invalid contract file' }
  return { urls }
}
