// Where a PO's goods physically are right now — distinct from the static final
// destination. Reuses the server-computed currentLegLabel for routed POs (which already
// tracks the open transit leg, see src/lib/purchasing/transitChain.ts); for a direct PO
// (no transit stops) it's derived from status + dispatchedAt instead, since there's no
// per-leg data to draw from. Shared by the PO list (OrdersPage.tsx) and the PR list
// (RequestsPage.tsx), which shows the same text for each PR's linked PO.
export function currentLocationLabel(o: {
  status: string
  dispatchedAt: string | null
  currentLegLabel?: string | null
  deliveryLocation?: { name: string } | null
}): string {
  if (o.status === 'CANCELLED') return '—'
  if (o.currentLegLabel) return o.currentLegLabel.replace(/^On deliver to/, 'On the way to')
  if (o.status === 'IN_TRANSIT' && o.dispatchedAt) {
    return o.deliveryLocation ? `On the way to ${o.deliveryLocation.name}` : 'On delivery'
  }
  if (o.status === 'PARTIALLY_RECEIVED' || o.status === 'RECEIVED') {
    return o.deliveryLocation?.name ?? '—'
  }
  // DRAFT / ORDERED — ordered but not dispatched yet
  return o.deliveryLocation ? `Not shipped yet (→ ${o.deliveryLocation.name})` : 'Not shipped yet'
}
