import { cookies } from 'next/headers'
import { SALES_PRO_COOKIE, verifySalesProToken } from '@/lib/sales-pro-access'
import SalesProGate from './SalesProGate'
import SalesProContent from './SalesProContent'

export const metadata = { title: 'Samara Yachting — Sales Presentation' }

export default async function SalesProPage() {
  const token = (await cookies()).get(SALES_PRO_COOKIE)?.value
  const authed = await verifySalesProToken(token)
  return authed ? <SalesProContent /> : <SalesProGate />
}
