import type { Metadata } from 'next'
import Cashier from '@/components/cashier/Cashier'

// The installable (PWA) manifest is per vessel — see /api/cashier/manifest.
export async function generateMetadata({ params }: { params: Promise<{ vessel: string }> }): Promise<Metadata> {
  const { vessel } = await params
  return { manifest: `/api/cashier/manifest?vessel=${encodeURIComponent(vessel)}` }
}

// Per-vessel terminal link, e.g. /cashier/samara1 (served as cashier.<domain>/samara1 — see middleware).
export default async function VesselCashierPage({ params }: { params: Promise<{ vessel: string }> }) {
  const { vessel } = await params
  return <Cashier vesselSlug={vessel} />
}
