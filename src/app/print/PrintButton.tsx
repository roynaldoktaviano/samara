'use client'

export function PrintButton({ label = 'Print / Save as PDF' }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="fixed bottom-6 right-6 px-5 py-2.5 bg-[#bdac7e] text-white rounded-lg font-semibold shadow-lg text-sm print:hidden hover:bg-[#a89660] transition-colors"
    >
      🖨 {label}
    </button>
  )
}
