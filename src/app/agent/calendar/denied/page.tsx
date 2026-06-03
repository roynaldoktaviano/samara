'use client'

export default function CalendarDeniedPage() {
  return (
    <div
      style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: '24px',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      <img
        src="https://samaraliveaboard.com/wp-content/uploads/2020/07/Element-1Samara-logo-72ppi-.png.webp"
        alt="Samara Liveaboard"
        style={{ height: 40, marginBottom: 32, objectFit: 'contain' }}
      />
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: '32px 40px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: 380,
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
          Access Required
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
          This page is only accessible via a personal invite link.
          Please contact Samara Liveaboard to get your access link.
        </p>
      </div>
    </div>
  )
}
