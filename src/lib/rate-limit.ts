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

/** Recent failed-attempt count for `key`, ignoring an expired window. Used to flag a
 *  login as suspicious even when it ultimately succeeds (e.g. several wrong passwords
 *  right before the right one). */
export function getFailedAttemptCount(key: string): number {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < Date.now()) return 0
  return bucket.count
}

// Separate store for request-volume limits (every request counts, not just failures),
// e.g. the public pageview webhook. Same per-process caveat as above.
const volumeBuckets = new Map<string, Bucket>()
let lastPrune = 0

/** Counts one request against `key` and returns true once it exceeds `max` within `windowMs`. */
export function exceedsRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  // Keys are per-IP, so drop expired buckets now and then to keep the map from growing forever.
  if (now - lastPrune > windowMs) {
    for (const [k, b] of volumeBuckets) if (b.resetAt < now) volumeBuckets.delete(k)
    lastPrune = now
  }
  const bucket = volumeBuckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    volumeBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  bucket.count++
  return bucket.count > max
}
