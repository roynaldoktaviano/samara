// Next.js's official hook to run code once when the server process starts —
// works with the standalone build, needs no custom server file. Used here to
// self-invoke the campaign dispatcher on an interval, since this app runs as a
// self-hosted Node process and vercel.json's cron declaration has no effect.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const intervalMs = 10 * 60 * 1000
  setInterval(async () => {
    try {
      const port = process.env.PORT || 3000
      await fetch(`http://127.0.0.1:${port}/api/marketing/campaigns/dispatch`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    } catch (err) {
      console.error('[scheduler] dispatch tick failed:', err)
    }
  }, intervalMs)
}
