import dynamic from 'next/dynamic'

const LalaClient = dynamic(() => import('./LalaClient'), { ssr: false })

export default function LalaPage() {
  return <LalaClient />
}
