// A PR item with `itemId: null` is a "custom request" — not tied to any catalog/stock
// item, so Warehouse has nothing to physically check for it (see warehouse-forward's own
// `undecided` filter, which already excludes these). When every item on a PR is custom,
// the whole "Cek Gudang" stage is pointless and the PR should go straight to Purchasing.
export function allItemsCustom(items: { itemId: string | null }[]): boolean {
  return items.length > 0 && items.every(i => !i.itemId)
}
