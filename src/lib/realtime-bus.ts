import { EventEmitter } from 'events'

export const REALTIME_TOPICS = [
  'purchasing-requests', 'purchasing-transfers', 'purchasing-orders', 'my-approvals', 'payments', 'purchasing-finance', 'chat',
] as const
export type RealtimeTopic = typeof REALTIME_TOPICS[number]

// Cached on globalThis, same reasoning as tenant-db.ts — Next.js dev mode re-evaluates
// this module on hot reload, which would otherwise silently drop all live SSE
// subscriptions (a fresh EventEmitter with no listeners) until the page is reloaded.
const globalForBus = globalThis as unknown as { realtimeBus: EventEmitter | undefined }
const bus = globalForBus.realtimeBus ?? new EventEmitter()
if (process.env.NODE_ENV !== 'production') globalForBus.realtimeBus = bus
// One listener per open SSE connection per tenant — a normal team easily exceeds Node's
// default warning threshold of 10.
bus.setMaxListeners(200)

// In-process pub/sub — this only works because the app runs as a single Node process
// (see .zscripts/start.sh). If it's ever split across multiple instances/load balancer,
// this needs to move to Redis pub/sub or similar, since events would otherwise only
// reach the instance that received the mutation.
export function emitTenantEvent(tenantId: string | undefined | null, topic: RealtimeTopic) {
  if (!tenantId) return
  bus.emit(`tenant:${tenantId}`, topic)
}

export function subscribeTenant(tenantId: string, listener: (topic: RealtimeTopic) => void) {
  const event = `tenant:${tenantId}`
  bus.on(event, listener)
  return () => bus.off(event, listener)
}
