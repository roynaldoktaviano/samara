'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

const GOLD = '#bdac7e'
const GOLD_DARK = '#a89860'

export default function SalesProGate() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sales-pro/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? 'Gagal masuk'); return }
      router.refresh()
    } catch {
      setError('Gagal terhubung ke server')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'radial-gradient(circle at 50% 0%, #16211f 0%, #0a0f0e 60%)',
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#101615',
          border: '1px solid rgba(189,172,126,0.25)',
          borderRadius: 20,
          padding: '40px 32px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 14, margin: '0 auto 18px',
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DARK} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Lock size={22} color="#101615" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f4f1ea', letterSpacing: '0.01em' }}>Samara Yachting</div>
          <div style={{ fontSize: 12, color: GOLD, letterSpacing: '0.18em', marginTop: 6, textTransform: 'uppercase' }}>
            Sales Presentation
          </div>
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: '#8b9490', display: 'block', marginBottom: 8 }}>
          Masukkan password akses
        </label>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)', background: '#0a0f0e', color: '#f4f1ea',
            fontSize: 14, outline: 'none',
          }}
        />
        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: '100%', marginTop: 20, padding: '13px', borderRadius: 10, border: 'none',
            background: loading || !password ? 'rgba(189,172,126,0.3)' : `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_DARK} 100%)`,
            color: '#101615', fontWeight: 700, fontSize: 14, cursor: loading || !password ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          Masuk
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#5a635f', marginTop: 20 }}>
          Halaman internal — khusus tim sales Samara Yachting
        </div>
      </form>
    </div>
  )
}
