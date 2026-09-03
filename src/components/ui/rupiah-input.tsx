'use client'

// Displays a plain numeric string with "Rp" + thousand separators (e.g. "5.000.000")
// so existing parseFloat(...)/Number(...) callers keep working unchanged; only the
// display is formatted. Blank (not "0") shows the placeholder — nothing pre-filled to
// type over.
export function RupiahInput({ value, onChange, onBlur, placeholder = '0', className = '', autoFocus, disabled, title }: {
  value: string; onChange: (digits: string) => void; onBlur?: () => void; placeholder?: string; className?: string; autoFocus?: boolean; disabled?: boolean; title?: string
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">Rp</span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        value={value ? new Intl.NumberFormat('id-ID').format(Number(value)) : ''}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        onBlur={onBlur}
        className={`w-full h-9 border rounded-md pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/40 ${className}`}
      />
    </div>
  )
}
