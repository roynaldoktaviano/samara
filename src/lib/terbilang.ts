// Converts a Rupiah amount into its Indonesian words form (e.g. 2906100 →
// "Dua Juta Sembilan Ratus Enam Ribu Seratus Rupiah") — the "Terbilang" line
// conventionally shown under the total on Indonesian payslips/invoices.

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan']

function group(n: number): string {
  if (n === 0) return ''
  if (n < 10) return SATUAN[n]
  if (n < 20) return n === 10 ? 'Sepuluh' : n === 11 ? 'Sebelas' : `${SATUAN[n - 10]} Belas`
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const rest = n % 10
    return `${SATUAN[tens]} Puluh${rest ? ' ' + SATUAN[rest] : ''}`
  }
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const hundredsWord = hundreds === 1 ? 'Seratus' : `${SATUAN[hundreds]} Ratus`
  return rest ? `${hundredsWord} ${group(rest)}` : hundredsWord
}

export function terbilang(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'Nol Rupiah'

  const scales = [
    { value: 1_000_000_000_000, label: 'Triliun' },
    { value: 1_000_000_000, label: 'Miliar' },
    { value: 1_000_000, label: 'Juta' },
    { value: 1_000, label: 'Ribu' },
  ]

  let remaining = n
  const parts: string[] = []
  for (const scale of scales) {
    const count = Math.floor(remaining / scale.value)
    if (count > 0) {
      parts.push(scale.label === 'Ribu' && count === 1 ? 'Seribu' : `${group(count)} ${scale.label}`)
      remaining %= scale.value
    }
  }
  if (remaining > 0) parts.push(group(remaining))

  return `${parts.join(' ')} Rupiah`
}
