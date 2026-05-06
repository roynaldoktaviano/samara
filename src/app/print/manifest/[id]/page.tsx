import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PrintButton } from '../../PrintButton'

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export default async function ManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await db.openTrip.findUnique({
    where: { id },
    include: {
      yacht: true,
      bookings: {
        where: { status: { not: 'cancelled' } },
        include: {
          customer: true,
          guests: {
            include: {
              customer: true,
              cabin: true,
            },
            orderBy: [{ isLead: 'desc' }, { id: 'asc' }],
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!trip) notFound()

  // Collect all passengers across all bookings
  const passengers: Array<{
    no: number; name: string; phone: string; email: string; cabin: string; bookingCode: string; isLead: boolean
  }> = []
  let no = 1

  trip.bookings.forEach(booking => {
    if (booking.guests.length > 0) {
      booking.guests.forEach(g => {
        passengers.push({
          no: no++,
          name: g.customer.name,
          phone: g.customer.phone ?? '—',
          email: g.customer.email ?? '—',
          cabin: g.cabin?.name ?? '—',
          bookingCode: booking.bookingCode,
          isLead: g.isLead,
        })
      })
    } else {
      passengers.push({
        no: no++,
        name: booking.customer.name,
        phone: booking.customer.phone ?? '—',
        email: booking.customer.email ?? '—',
        cabin: '—',
        bookingCode: booking.bookingCode,
        isLead: true,
      })
    }
  })

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white text-black print:p-4">
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
        }
        @page { margin: 1.5cm; size: A4; }
      `}</style>

      <PrintButton label="Print Manifest" />

      {/* Header */}
      <div className="text-center border-b-2 border-black pb-5 mb-6">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Official Document</p>
        <h1 className="text-2xl font-bold uppercase tracking-widest">Passenger Manifest</h1>
        <h2 className="text-base font-semibold mt-1 text-gray-700">{trip.yacht.name} · {trip.title}</h2>
        <p className="text-xs text-gray-500 mt-1">Issued: {today}</p>
      </div>

      {/* Trip Info Grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Vessel', value: trip.yacht.name },
          { label: 'Voyage', value: trip.title },
          { label: 'Destination', value: trip.destination },
          { label: 'Departure Date', value: `${fmtDate(trip.startDate)}${trip.departurePort ? ` · ${trip.departurePort}` : ''}` },
          { label: 'Arrival Date', value: `${fmtDate(trip.endDate)}${trip.arrivalPort ? ` · ${trip.arrivalPort}` : ''}` },
          { label: 'Region', value: trip.region ?? '—' },
          { label: 'Departure Port', value: trip.departurePort ?? '—' },
          { label: 'Arrival Port', value: trip.arrivalPort ?? '—' },
          { label: 'Total Passengers', value: `${passengers.length} person(s)` },
        ].map(item => (
          <div key={item.label} className="border border-gray-300 rounded p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{item.label}</p>
            <p className="font-semibold text-sm">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Passenger Table */}
      <h3 className="text-xs font-bold uppercase tracking-widest mb-3 text-gray-600">
        Passenger List — {passengers.length} passenger(s)
      </h3>
      <table className="w-full border-collapse text-sm mb-8">
        <thead>
          <tr className="bg-black text-white">
            <th className="py-2 px-3 text-left font-semibold text-xs w-10">No.</th>
            <th className="py-2 px-3 text-left font-semibold text-xs">Passenger Name</th>
            <th className="py-2 px-3 text-left font-semibold text-xs">Phone</th>
            <th className="py-2 px-3 text-left font-semibold text-xs">Email</th>
            <th className="py-2 px-3 text-left font-semibold text-xs">Cabin</th>
            <th className="py-2 px-3 text-left font-semibold text-xs">Booking Ref.</th>
          </tr>
        </thead>
        <tbody>
          {passengers.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                No passengers booked for this trip
              </td>
            </tr>
          ) : (
            passengers.map((p, i) => (
              <tr key={p.no} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="py-2 px-3 border-b border-gray-200 text-gray-500">{p.no}</td>
                <td className="py-2 px-3 border-b border-gray-200 font-semibold">
                  {p.name}
                  {p.isLead && <span className="ml-1.5 text-[10px] bg-gray-200 text-gray-600 rounded px-1 py-0.5">Lead</span>}
                </td>
                <td className="py-2 px-3 border-b border-gray-200 text-gray-700">{p.phone}</td>
                <td className="py-2 px-3 border-b border-gray-200 text-gray-700">{p.email}</td>
                <td className="py-2 px-3 border-b border-gray-200">{p.cabin}</td>
                <td className="py-2 px-3 border-b border-gray-200 font-mono text-xs text-gray-600">{p.bookingCode}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Signature Block */}
      <div className="grid grid-cols-2 gap-16 mt-12">
        {[
          { title: 'Captain / Master', sub: trip.yacht.name },
          { title: 'Harbormaster', sub: trip.departurePort ?? 'Port Authority' },
        ].map(s => (
          <div key={s.title}>
            <div className="border-t border-black pt-2">
              <p className="font-semibold text-sm">{s.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.sub}</p>
              <div className="mt-8 text-xs text-gray-400">
                <p>Name: ___________________________</p>
                <p className="mt-3">Signature & Stamp: ___________________________</p>
                <p className="mt-3">Date: ___________________________</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-400 mt-10 border-t border-gray-200 pt-4">
        This document is generated by Samara Liveaboard ERP · {today}
      </p>
    </div>
  )
}
