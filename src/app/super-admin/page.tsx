'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { TENANT_FEATURE_DEFINITIONS, type TenantFeatures } from '@/lib/tenant-features'
import { TENANT_SECRET_DEFINITIONS, type TenantSecretKey } from '@/lib/tenant-secrets-definitions'

interface Tenant {
  id: string
  name: string
  slug: string
  domain: string | null
  databaseUrl: string
  logoUrl: string | null
  isActive: boolean
  features: TenantFeatures | null
  createdAt: string
  _count?: { users: number }
  secretsStatus?: Record<TenantSecretKey, boolean>
  requestOrderToken?: string | null
}

interface TenantUser {
  id: string
  email: string
  name: string | null
  isActive: boolean
  role: string | null
}

// Super admin can only assign ADMIN role to tenant; admins manage their own staff
const ROLES = ['ADMIN']

function LogoUrlEditor({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(tenant.logoUrl ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/super-admin/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tenant.id, logoUrl: val || null }),
    })
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  if (!editing) return (
    <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-[#1e3a5f] transition-colors">
      {tenant.logoUrl ? 'Change Logo' : 'Set Logo URL'}
    </button>
  )

  return (
    <div className="flex items-center gap-2">
      <input
        className="border border-gray-200 rounded px-2 py-1 text-xs w-52 outline-none focus:border-[#1e3a5f]"
        placeholder="https://..."
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
      />
      <button onClick={save} disabled={saving} className="text-xs bg-[#1e3a5f] text-white px-2 py-1 rounded disabled:opacity-50">
        {saving ? '...' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
    </div>
  )
}

function TenantFeaturesEditor({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const features: TenantFeatures = tenant.features ?? {}
  const [saving, setSaving] = useState<string | null>(null)

  async function toggle(key: keyof TenantFeatures) {
    setSaving(key)
    await fetch('/api/super-admin/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tenant.id, features: { ...features, [key]: !features[key] } }),
    })
    setSaving(null)
    onUpdate()
  }

  return (
    <div className="space-y-2">
      {TENANT_FEATURE_DEFINITIONS.map(f => (
        <div key={f.key} className="flex items-center justify-between py-2">
          <div>
            <div className="text-sm font-medium text-gray-700">{f.label}</div>
            <div className="text-xs text-gray-400">{f.description}</div>
          </div>
          <button
            onClick={() => toggle(f.key)}
            disabled={saving === f.key}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              features[f.key] ? 'bg-[#1e3a5f]' : 'bg-gray-200'
            } ${saving === f.key ? 'opacity-50' : ''}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              features[f.key] ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>
      ))}
    </div>
  )
}

function TenantSecretsEditor({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const [drafts, setDrafts] = useState<Partial<Record<TenantSecretKey, string>>>({})
  const [saving, setSaving] = useState<TenantSecretKey | null>(null)
  const status = tenant.secretsStatus

  async function save(key: TenantSecretKey) {
    const value = drafts[key]?.trim()
    if (!value) return
    setSaving(key)
    try {
      const res = await fetch('/api/super-admin/tenants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenant.id, secrets: { [key]: value } }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || `Failed to save (${res.status})`)
        return
      }
      setDrafts(d => ({ ...d, [key]: '' }))
      onUpdate()
    } catch {
      alert('Failed to save — network error')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Leave blank to keep using the shared default credential. Set a value here to override it for this tenant only. Values are encrypted at rest and never shown again once saved.
      </p>
      {TENANT_SECRET_DEFINITIONS.map(s => (
        <div key={s.key} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
              {s.label}
              {status?.[s.key] ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Configured</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Using default</span>
              )}
            </div>
            <div className="text-xs text-gray-400">{s.description}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="password"
              autoComplete="off"
              className="border border-gray-200 rounded px-2 py-1 text-xs w-48 outline-none focus:border-[#1e3a5f]"
              placeholder={status?.[s.key] ? '••••••••••' : 'Not set'}
              value={drafts[s.key] ?? ''}
              onChange={e => setDrafts(d => ({ ...d, [s.key]: e.target.value }))}
            />
            <button
              onClick={() => save(s.key)}
              disabled={saving === s.key || !drafts[s.key]?.trim()}
              className="text-xs bg-[#1e3a5f] text-white px-2 py-1 rounded disabled:opacity-40"
            >
              {saving === s.key ? '...' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function RequestOrderLinkPanel({ tenant, onUpdate }: { tenant: Tenant; onUpdate: () => void }) {
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = tenant.requestOrderToken && typeof window !== 'undefined'
    ? `${window.location.origin}/request-order?token=${tenant.requestOrderToken}`
    : ''

  async function regenerate() {
    if (!confirm('Regenerate this link? The old link will stop working immediately.')) return
    setRegenerating(true)
    await fetch('/api/super-admin/tenants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tenant.id, regenerateRequestOrderToken: true }),
    })
    setRegenerating(false)
    onUpdate()
  }

  function copyLink() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-700">Request Order Link</div>
        <div className="text-xs text-gray-400">Shared with staff without an ERP login to submit purchase requests.</div>
        {link && <div className="text-xs font-mono text-gray-500 mt-1 truncate max-w-md">{link}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={copyLink} disabled={!link} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={regenerate} disabled={regenerating} className="text-xs bg-[#1e3a5f] text-white px-2 py-1 rounded disabled:opacity-40">
          {regenerating ? '...' : 'Regenerate'}
        </button>
      </div>
    </div>
  )
}

export default function SuperAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Add tenant form
  const [showAddTenant, setShowAddTenant] = useState(false)
  const [tenantForm, setTenantForm] = useState({ name: '', slug: '', databaseUrl: '', directUrl: '', domain: '', logoUrl: '' })
  const [savingTenant, setSavingTenant] = useState(false)

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [userForm, setUserForm] = useState({ email: '', name: '', password: '', role: 'ADMIN' })
  const [savingUser, setSavingUser] = useState(false)

  const isSuperAdmin = session?.user?.isSuperAdmin

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'authenticated' && !isSuperAdmin) { router.push('/'); return }
    if (status === 'authenticated' && isSuperAdmin) fetchTenants()
  }, [status, isSuperAdmin])

  async function fetchTenants() {
    setLoadingTenants(true)
    const res = await fetch('/api/super-admin/tenants')
    if (res.ok) setTenants(await res.json())
    setLoadingTenants(false)
  }

  async function fetchUsers(tenantId: string) {
    setLoadingUsers(true)
    const res = await fetch(`/api/super-admin/users?tenantId=${tenantId}`)
    if (res.ok) setUsers(await res.json())
    setLoadingUsers(false)
  }

  function selectTenant(t: Tenant) {
    setSelectedTenant(t)
    setShowAddUser(false)
    fetchUsers(t.id)
  }

  async function addTenant() {
    if (!tenantForm.name || !tenantForm.slug || !tenantForm.databaseUrl) return
    setSavingTenant(true)
    const res = await fetch('/api/super-admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tenantForm),
    })
    if (res.ok) {
      setShowAddTenant(false)
      setTenantForm({ name: '', slug: '', databaseUrl: '', directUrl: '', domain: '', logoUrl: '' })
      fetchTenants()
    }
    setSavingTenant(false)
  }

  async function addUser() {
    if (!selectedTenant || !userForm.email || !userForm.password) return
    setSavingUser(true)
    const res = await fetch('/api/super-admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: selectedTenant.id, ...userForm }),
    })
    if (res.ok) {
      setShowAddUser(false)
      setUserForm({ email: '', name: '', password: '', role: 'ADMIN' })
      fetchUsers(selectedTenant.id)
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to create user')
    }
    setSavingUser(false)
  }

  async function deleteUser(email: string) {
    if (!selectedTenant || !confirm(`Remove ${email} from ${selectedTenant.name}?`)) return
    await fetch('/api/super-admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, tenantId: selectedTenant.id }),
    })
    fetchUsers(selectedTenant.id)
  }

  if (status === 'loading') return (
    <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center">
      <div className="text-[#1e3a5f] font-medium">Loading...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f0f4f8]">
      {/* Header */}
      <header className="bg-[#1e3a5f] text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-xs text-white/60 uppercase tracking-wider">System Administration</div>
            <div className="text-sm font-bold tracking-wide">Super Admin Dashboard</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/70">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-60px)]">
        {/* Sidebar — Tenant list */}
        <aside className="w-72 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#1e3a5f] uppercase tracking-wider">Tenants</h2>
            <button
              onClick={() => setShowAddTenant(true)}
              className="text-xs bg-[#1e3a5f] text-white px-2.5 py-1 rounded hover:bg-[#162d4a] transition-colors"
            >
              + Add
            </button>
          </div>

          {loadingTenants ? (
            <div className="p-4 text-sm text-gray-400">Loading...</div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {tenants.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTenant(t)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                    selectedTenant?.id === t.id ? 'bg-blue-50 border-l-4 border-l-[#1e3a5f]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{t.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">/{t.slug}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        t.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {t.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-[10px] text-gray-400">{t._count?.users ?? 0} users</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedTenant ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Select a tenant to manage users
            </div>
          ) : (
            <div>
              {/* Tenant header */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {selectedTenant.logoUrl && (
                      <img src={selectedTenant.logoUrl} alt={selectedTenant.name} className="h-12 w-auto object-contain shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h1 className="text-lg font-bold text-[#1e3a5f]">{selectedTenant.name}</h1>
                      <p className="text-xs text-gray-400 mt-0.5">Slug: {selectedTenant.slug}{selectedTenant.domain ? ` · ${selectedTenant.domain}` : ''}</p>
                      <p className="text-xs text-gray-300 mt-1 font-mono truncate max-w-xl">{selectedTenant.databaseUrl}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${selectedTenant.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                      {selectedTenant.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <LogoUrlEditor tenant={selectedTenant} onUpdate={fetchTenants} />
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 p-5">
                <h2 className="text-sm font-bold text-[#1e3a5f] mb-3">Feature Flags</h2>
                <TenantFeaturesEditor tenant={selectedTenant} onUpdate={fetchTenants} />
              </div>

              {/* Integrations */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5 p-5">
                <h2 className="text-sm font-bold text-[#1e3a5f] mb-3">Integrations</h2>
                <TenantSecretsEditor tenant={selectedTenant} onUpdate={fetchTenants} />
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <RequestOrderLinkPanel tenant={selectedTenant} onUpdate={fetchTenants} />
                </div>
              </div>

              {/* Users table */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#1e3a5f]">Users</h2>
                  <button
                    onClick={() => setShowAddUser(true)}
                    className="text-xs bg-[#1e3a5f] text-white px-3 py-1.5 rounded hover:bg-[#162d4a] transition-colors"
                  >
                    + Add User
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="p-6 text-sm text-gray-400 text-center">Loading users...</div>
                ) : users.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400 text-center">No users yet</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                        <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                        <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                        <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                        <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-5 py-3.5 text-sm font-medium text-gray-800">{u.name || '—'}</td>
                          <td className="px-5 py-3.5 text-sm text-gray-600">{u.email}</td>
                          <td className="px-5 py-3.5">
                            {u.role && (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                u.role === 'FINANCE' ? 'bg-emerald-100 text-emerald-700' :
                                u.role === 'SALES' ? 'bg-blue-100 text-blue-700' :
                                u.role === 'MARKETING' ? 'bg-orange-100 text-orange-700' :
                                u.role === 'SALES_MARKETING' ? 'bg-indigo-100 text-indigo-700' :
                                u.role === 'FINANCE_DIRECTOR' ? 'bg-cyan-100 text-cyan-700' :
                                'bg-gray-100 text-gray-600'
                              }`}>{u.role}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              u.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {u.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <button
                              onClick={() => deleteUser(u.email)}
                              className="text-xs text-red-400 hover:text-red-600 transition-colors"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Add Tenant */}
      {showAddTenant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-[#1e3a5f] mb-4">Add New Tenant</h3>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'Company Name', placeholder: 'e.g. Samara Yachting' },
                { key: 'slug', label: 'Slug', placeholder: 'e.g. samara (no spaces)' },
                { key: 'logoUrl', label: 'Logo URL (optional)', placeholder: 'https://...' },
                { key: 'domain', label: 'Domain (optional)', placeholder: 'e.g. samara.yourapp.com' },
                { key: 'databaseUrl', label: 'Database URL', placeholder: 'postgresql://...' },
                { key: 'directUrl', label: 'Direct URL (optional)', placeholder: 'postgresql://... (no pooler)' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1e3a5f] transition-colors"
                    placeholder={f.placeholder}
                    value={tenantForm[f.key as keyof typeof tenantForm]}
                    onChange={e => setTenantForm(p => ({ ...p, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddTenant(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addTenant}
                disabled={savingTenant}
                className="flex-1 bg-[#1e3a5f] text-white text-sm py-2 rounded-lg hover:bg-[#162d4a] disabled:opacity-50"
              >
                {savingTenant ? 'Saving...' : 'Add Tenant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add User */}
      {showAddUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[#1e3a5f] mb-1">Add User</h3>
            <p className="text-xs text-gray-400 mb-4">Tenant: {selectedTenant?.name}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
                  placeholder="user@company.com"
                  value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
                  placeholder="Full name"
                  value={userForm.name}
                  onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
                  placeholder="Temporary password"
                  value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Role</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1e3a5f]"
                  value={userForm.role}
                  onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddUser(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addUser}
                disabled={savingUser}
                className="flex-1 bg-[#1e3a5f] text-white text-sm py-2 rounded-lg hover:bg-[#162d4a] disabled:opacity-50"
              >
                {savingUser ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
