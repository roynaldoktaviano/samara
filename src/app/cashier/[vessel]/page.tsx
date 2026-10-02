import Cashier from '@/components/cashier/Cashier'

// Per-vessel terminal link, e.g. /cashier/samara1 (served as cashier.<domain>/samara1 — see middleware).
export default async function VesselCashierPage({ params }: { params: Promise<{ vessel: string }> }) {
  const { vessel } = await params
  return <Cashier vesselSlug={vessel} />
}
