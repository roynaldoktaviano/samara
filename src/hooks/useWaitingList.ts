'use client'

import { useState, useEffect, useCallback } from 'react'

export interface WaitingListEntry {
  id: string
  bookingId: string | null
  yachtId: string | null
  openTripId: string | null
  startDate: string
  endDate: string
  customerId: string | null
  contactName: string
  contactPhone: string | null
  contactEmail: string | null
  notes: string | null
  priority: number
  status: 'waiting' | 'promoted' | 'cancelled'
  salespersonId: string | null
  promotedBookingId: string | null
  createdAt: string
  customer: { id: string; name: string; email?: string; phone?: string } | null
  salesperson: { id: string; name: string } | null
}

export interface WaitingListHistoryEntry {
  id: string
  bookingId: string
  holderName: string
  customerId: string | null
  cancelledAt: string
  cancelReason: string | null
}

export function useWaitingList(bookingId?: string, yachtId?: string, openTripId?: string) {
  const [items,   setItems]   = useState<WaitingListEntry[]>([])
  const [history, setHistory] = useState<WaitingListHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetch_ = useCallback(async () => {
    if (!bookingId && !yachtId && !openTripId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (bookingId)  params.set('bookingId',  bookingId)
      if (yachtId)    params.set('yachtId',    yachtId)
      if (openTripId) params.set('openTripId', openTripId)
      const res = await fetch(`/api/waiting-lists?${params}`)
      if (res.ok) {
        const data = await res.json()
        // Support both old (array) and new ({ items, history }) shape
        if (Array.isArray(data)) {
          setItems(data)
        } else {
          setItems(data.items ?? [])
          setHistory(data.history ?? [])
        }
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [bookingId, yachtId, openTripId])

  useEffect(() => { fetch_() }, [fetch_])

  const add = useCallback(async (data: {
    contactName: string; contactPhone?: string; contactEmail?: string
    notes?: string; customerId?: string; startDate: string; endDate: string
    bookingId?: string; yachtId?: string; openTripId?: string
  }) => {
    const res = await fetch('/api/waiting-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(await res.text())
    const item: WaitingListEntry = await res.json()
    setItems(prev => [...prev, item])
    return item
  }, [])

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/waiting-lists/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    setItems(prev => prev.filter(i => i.id !== id))
  }, [])

  const promote = useCallback(async (id: string) => {
    const res = await fetch(`/api/waiting-lists/${id}/promote`, { method: 'POST' })
    if (!res.ok) throw new Error(await res.text())
    await fetch_()
  }, [fetch_])

  const cancel = useCallback(async (id: string) => {
    const res = await fetch(`/api/waiting-lists/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    if (!res.ok) throw new Error(await res.text())
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i))
  }, [])

  return { items, history, loading, refetch: fetch_, add, remove, promote, cancel }
}
