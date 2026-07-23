const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/**
 * Simple in-memory sliding-window limiter for login attempts — per-process only. Fine for
 * this app's single long-running Node server; if it's ever scaled to multiple instances
 * behind a load balancer, this needs to move to a shared store (DB table, Redis) instead.
 */
export function isRateLimited(key: string): boolean {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < Date.now()) return false
  return bucket.count >= MAX_ATTEMPTS
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
  } else {
    bucket.count++
  }
}

export function clearAttempts(key: string): void {
  buckets.delete(key)
}
