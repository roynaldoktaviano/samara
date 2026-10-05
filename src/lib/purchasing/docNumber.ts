/**
 * Next monthly sequence for document numbers like PR-202610-007 / PO- / TR- / GR-.
 * Takes the numeric max of existing suffixes — sorting the strings instead put
 * "…-1000" below "…-999", so past 999 a month it regenerated an existing number and
 * every create failed on the unique constraint. Past 999 numbers simply grow to 4 digits.
 */
export function nextSeq(numbers: string[]): number {
  return numbers.reduce((max, n) => Math.max(max, parseInt(n.split('-').pop() ?? '0') || 0), 0) + 1
}
