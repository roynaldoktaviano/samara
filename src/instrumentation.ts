// Next.js's official hook to run code once when the server process starts —
// works with the standalone build, needs no custom server file. The actual
// Node-only logic (startup recovery + the campaign-dispatch scheduler) lives in
// a separate module, dynamically imported only on the nodejs runtime — keeping
// this file free of Node-only imports so it stays safe to also compile for the
// Edge Runtime, per Next.js's recommended instrumentation.ts pattern.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startNodeInstrumentation } = await import('./instrumentation-node')
    await startNodeInstrumentation()
  }
}
