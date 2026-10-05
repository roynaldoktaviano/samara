'use client'

// Offline support for the cashier terminal (one tablet per vessel, often out of signal at sea).
//
// - Reference data (vessels, trips, menu, staff, recent sales) is cached in localStorage after
//   every successful fetch and served from there when the network is gone.
// - Every sale action (open tab, add items, settle, direct sale) goes into an outbox first and is
//   sent to the server in order — immediately when online, otherwise once signal returns. Ids are
//   generated on the tablet, and the API treats a repeated send as a no-op, so a retry after a
//   dropped connection never double-books a sale or double-deducts stock.
// - The PIN is remembered as a salted PBKDF2 hash so a locked terminal can be unlocked offline.

const OUTBOX_KEY = 'cashier:outbox'
const SESSION_KEY = 'cashier:session'
const OUTBOX_EVENT = 'cashier-outbox'
/** Consecutive server errors (5xx) before an op is parked for manual retry instead of blocking the queue. */
const MAX_SERVER_ERRORS = 5

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full / blocked — keep running on memory */ }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ─── Reference data cache ────────────────────────────────────────────────────

export const cacheKey = (name: string, yachtId?: string) => yachtId ? `cashier:${yachtId}:${name}` : `cashier:${name}`
export const readCache = <T,>(key: string, fallback: T) => read<T>(key, fallback)
export const writeCache = (key: string, value: unknown) => write(key, value)

export class CashierAuthError extends Error {}

/**
 * GET a cashier API url, caching the JSON on success. Returns the cached copy (fromCache: true)
 * when offline; throws CashierAuthError on 401 so the caller can send the terminal back to the PIN.
 */
export async function fetchCached<T>(url: string, key: string, fallback: T): Promise<{ data: T; fromCache: boolean }> {
  let res: Response
  try {
    res = await fetch(url, { cache: 'no-store' })
  } catch {
    return { data: read<T>(key, fallback), fromCache: true }
  }
  if (res.status === 401) throw new CashierAuthError('Unauthorized')
  if (!res.ok) return { data: read<T>(key, fallback), fromCache: true }
  const data = (await res.json()) as T
  write(key, data)
  return { data, fromCache: false }
}

// ─── Terminal session (survives reloads / app restarts) ─────────────────────

export interface StoredSession<V, T> { vessel: V; trip: T | null; tripChosen: boolean; locked: boolean }
export const loadSession = <V, T>() => read<StoredSession<V, T> | null>(SESSION_KEY, null)
export const saveSession = <V, T>(s: StoredSession<V, T> | null) => {
  if (s) write(SESSION_KEY, s)
  else try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

// ─── Offline PIN ─────────────────────────────────────────────────────────────

interface PinRecord<V> { salt: string; hash: string; vessel: V }

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: 150_000 }, key, 256)
  return toB64(bits)
}

/** After a successful online PIN login: remember the PIN (hashed) + vessel for offline unlocks. */
export async function rememberPin<V>(yachtId: string, pin: string, vessel: V) {
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    write(cacheKey('pin', yachtId), { salt: toB64(salt), hash: await derive(pin, salt), vessel } satisfies PinRecord<V>)
  } catch { /* no WebCrypto (insecure origin) — offline unlock just isn't available */ }
}

export const hasOfflinePin = (yachtId: string) => !!read<PinRecord<unknown> | null>(cacheKey('pin', yachtId), null)

/** Offline unlock — the vessel stored at the last online login when the PIN matches, else null. */
export async function checkPinOffline<V>(yachtId: string, pin: string): Promise<V | null> {
  const rec = read<PinRecord<V> | null>(cacheKey('pin', yachtId), null)
  if (!rec) return null
  try {
    return (await derive(pin, fromB64(rec.salt))) === rec.hash ? rec.vessel : null
  } catch { return null }
}

// ─── Outbox ──────────────────────────────────────────────────────────────────

export type OutboxKind = 'create' | 'add_items' | 'close'
export interface OutboxOp {
  opId: string
  yachtId: string
  saleId: string
  kind: OutboxKind
  /** When it happened on the terminal (ISO) — becomes the sale's createdAt / closedAt server-side. */
  at: string
  body: Record<string, unknown>
  serverErrors?: number
  /** Set when the server rejected it — parked until the cashier retries or discards it. */
  error?: string
}

export const readOutbox = () => read<OutboxOp[]>(OUTBOX_KEY, [])

function writeOutbox(ops: OutboxOp[]) {
  write(OUTBOX_KEY, ops)
  window.dispatchEvent(new Event(OUTBOX_EVENT))
}

export function subscribeOutbox(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === OUTBOX_KEY) cb() }
  window.addEventListener(OUTBOX_EVENT, cb)
  window.addEventListener('storage', onStorage)
  return () => { window.removeEventListener(OUTBOX_EVENT, cb); window.removeEventListener('storage', onStorage) }
}

export function enqueue(op: Omit<OutboxOp, 'opId' | 'at'> & { at?: string }): OutboxOp {
  const full: OutboxOp = { ...op, opId: newId(), at: op.at ?? new Date().toISOString() }
  writeOutbox([...readOutbox(), full])
  return full
}

export const discardOp = (opId: string) => writeOutbox(readOutbox().filter(o => o.opId !== opId))
export const retryOp = (opId: string) => writeOutbox(readOutbox().map(o => o.opId === opId ? { ...o, error: undefined, serverErrors: 0 } : o))

function requestFor(op: OutboxOp): { url: string; method: string; body: Record<string, unknown> } {
  if (op.kind === 'create') return { url: '/api/cashier/sales', method: 'POST', body: { ...op.body, id: op.saleId, at: op.at } }
  return { url: `/api/cashier/sales/${op.saleId}`, method: 'PATCH', body: { ...op.body, action: op.kind, at: op.at } }
}

export type FlushResult = { status: 'ok' | 'offline' | 'unauthorized'; synced: number }

let flushing: Promise<FlushResult> | null = null

/**
 * Sends queued ops to the server one at a time, oldest first. Stops at the first network failure
 * (still offline) or 401 (needs the PIN again); a server rejection parks that op — and every later
 * op of the same sale, which would depend on it — without blocking other sales. Only the signed-in
 * vessel's ops are sent: the terminal cookie is scoped to that one yacht.
 */
export function flushOutbox(yachtId: string, onSynced: (sale: unknown) => void): Promise<FlushResult> {
  if (flushing) return flushing
  flushing = (async (): Promise<FlushResult> => {
    let synced = 0
    try {
      for (;;) {
        const ops = readOutbox().filter(o => o.yachtId === yachtId)
        const blocked = new Set<string>()
        const next = ops.find(o => {
          if (o.error) { blocked.add(o.saleId); return false }
          return !blocked.has(o.saleId)
        })
        if (!next) return { status: 'ok', synced }

        const { url, method, body } = requestFor(next)
        let res: Response
        try {
          res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        } catch {
          return { status: 'offline', synced }
        }
        if (res.status === 401) return { status: 'unauthorized', synced }

        if (res.ok) {
          onSynced(await res.json().catch(() => null))
          writeOutbox(readOutbox().filter(o => o.opId !== next.opId))
          synced++
          continue
        }

        const data = await res.json().catch(() => ({} as { error?: string }))
        if (res.status >= 500 || res.status === 429) {
          const serverErrors = (next.serverErrors ?? 0) + 1
          const park = serverErrors >= MAX_SERVER_ERRORS
          writeOutbox(readOutbox().map(o => o.opId === next.opId ? { ...o, serverErrors, ...(park ? { error: data.error ?? `Server error ${res.status}` } : {}) } : o))
          if (!park) return { status: 'offline', synced }
          continue
        }
        writeOutbox(readOutbox().map(o => o.opId === next.opId ? { ...o, error: data.error ?? `Rejected (${res.status})` } : o))
      }
    } finally {
      flushing = null
    }
  })()
  return flushing
}
