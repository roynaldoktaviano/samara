'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, LogIn, Plus, Pencil, Trash2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Log {
  id:        string
  userId:    string
  userName:  string
  userRole:  string
  action:    string
  entity:    string | null
  entityId:  string | null
  detail:    string | null
  createdAt: string
}

const ACTION_ICON: Record<string, React.ElementType> = {
  LOGIN:   LogIn,
  CREATE:  Plus,
  UPDATE:  Pencil,
  DELETE:  Trash2,
  CONFIRM: CheckCircle2,
  REJECT:  XCircle,
}

const ACTION_COLOR: Record<string, string> = {
  LOGIN:   'bg-blue-100 text-blue-700',
  CREATE:  'bg-emerald-100 text-emerald-700',
  UPDATE:  'bg-amber-100 text-amber-700',
  DELETE:  'bg-red-100 text-red-700',
  CONFIRM: 'bg-green-100 text-green-700',
  REJECT:  'bg-red-100 text-red-700',
}

const ROLE_COLOR: Record<string, string> = {
  ADMIN:     'bg-purple-100 text-purple-700',
  SALES:     'bg-blue-100 text-blue-700',
  FINANCE:   'bg-emerald-100 text-emerald-700',
  MARKETING: 'bg-orange-100 text-orange-700',
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

export default function ActivityLog() {
  const [logs, setLogs]       = useState<Log[]>([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)

  const [filterAction, setFilterAction] = useState('')
  const [filterEntity, setFilterEntity] = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [search,       setSearch]       = useState('')

  const LIMIT = 10

  const fetchLogs = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (filterAction) params.set('action', filterAction)
      if (filterEntity) params.set('entity', filterEntity)
      if (filterFrom)   params.set('from',   filterFrom)
      if (filterTo)     params.set('to',     filterTo)
      const res = await fetch(`/api/activity-logs?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setLogs(data.logs)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [filterAction, filterEntity, filterFrom, filterTo])

  useEffect(() => {
    setPage(1)
    fetchLogs(1)
  }, [fetchLogs])

  const displayed = search
    ? logs.filter(l =>
        l.userName.toLowerCase().includes(search.toLowerCase()) ||
        l.detail?.toLowerCase().includes(search.toLowerCase()) ||
        l.entity?.toLowerCase().includes(search.toLowerCase())
      )
    : logs

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
          <Shield className="h-5 w-5 text-purple-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Activity Log</h2>
          <p className="text-xs text-muted-foreground">{total.toLocaleString()} entries recorded · visible to admins only</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name, detail…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <Select value={filterAction} onValueChange={v => setFilterAction(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-36 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            <SelectItem value="LOGIN">Login</SelectItem>
            <SelectItem value="CREATE">Create</SelectItem>
            <SelectItem value="UPDATE">Update</SelectItem>
            <SelectItem value="DELETE">Delete</SelectItem>
            <SelectItem value="CONFIRM">Confirm</SelectItem>
            <SelectItem value="REJECT">Reject</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterEntity} onValueChange={v => setFilterEntity(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All entities</SelectItem>
            <SelectItem value="Booking">Booking</SelectItem>
            <SelectItem value="Customer">Customer</SelectItem>
            <SelectItem value="Payment">Payment</SelectItem>
            <SelectItem value="Yacht">Yacht</SelectItem>
            <SelectItem value="Agent">Agent</SelectItem>
            <SelectItem value="User">User</SelectItem>
            <SelectItem value="Voucher">Voucher</SelectItem>
            <SelectItem value="Maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="h-9 w-36 text-sm"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <Input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="h-9 w-36 text-sm"
          />
        </div>

        {(filterAction || filterEntity || filterFrom || filterTo) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => {
              setFilterAction('')
              setFilterEntity('')
              setFilterFrom('')
              setFilterTo('')
            }}
          >
            Reset filter
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide w-44">Time</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide w-36">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide w-20">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide w-24">Action</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide w-28">Entity</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">Detail</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="wait">
                {loading ? (
                  <tr key="loading">
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-center"
                      >
                        <div className="h-5 w-5 rounded-full border-2 border-[#bdac7e] border-t-transparent animate-spin" />
                      </motion.div>
                    </td>
                  </tr>
                ) : displayed.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">
                      No logs found
                    </td>
                  </tr>
                ) : (
                  displayed.map((log, i) => {
                    const Icon = ACTION_ICON[log.action] ?? Pencil
                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.015 }}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                          {fmtDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium truncate max-w-[9rem]" title={log.userName}>
                          {log.userName}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_COLOR[log.userRole] ?? 'bg-gray-100 text-gray-600'}`}>
                            {log.userRole}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_COLOR[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                            <Icon className="h-3 w-3" />
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {log.entity ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground/80 max-w-xs truncate" title={log.detail ?? ''}>
                          {log.detail ?? '—'}
                        </td>
                      </motion.tr>
                    )
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground text-xs">
            Page {page} of {totalPages} · {total} entries
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => { setPage(1); fetchLogs(1) }}
            >
              <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-2" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => { setPage(p => p - 1); fetchLogs(page - 1) }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-xs">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={page === p ? 'default' : 'outline'}
                    size="icon" className="h-8 w-8 text-xs"
                    style={page === p ? { backgroundColor: '#bdac7e', borderColor: '#bdac7e' } : {}}
                    onClick={() => { setPage(p as number); fetchLogs(p as number) }}
                  >
                    {p}
                  </Button>
                )
              )}
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => { setPage(p => p + 1); fetchLogs(page + 1) }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline" size="icon" className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => { setPage(totalPages); fetchLogs(totalPages) }}
            >
              <ChevronRight className="h-3 w-3" /><ChevronRight className="h-3 w-3 -ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
