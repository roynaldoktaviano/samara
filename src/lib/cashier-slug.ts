const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }

/**
 * URL slug for a vessel's cashier link: "Samara I" → "samara1", "Samara II" → "samara2", "Mischief" → "mischief".
 * Roman-numeral words become digits, then everything that isn't a letter/digit is dropped.
 */
export function cashierSlug(name: string) {
  return name.toLowerCase().split(/\s+/).map(w => ROMAN[w] ?? w).join('').replace(/[^a-z0-9]/g, '')
}
