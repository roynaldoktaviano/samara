#!/usr/bin/env node
// MCP server for the Samara ERP — a thin stdio wrapper over the BOT API (/api/bot/*).
// All guardrails (field whitelist, sensitive-field stripping, rate limits, call logging,
// read-only except create-only talent pool) are enforced server-side by the ERP, not here.
//
// Config (env, or a .env file next to this script):
//   ERP_BOT_API_KEY  required — the sbk_… key (= BOT_API_KEY on the ERP server)
//   ERP_BASE_URL     optional — default https://erp.samarayachting.com
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = join(here, '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const BASE_URL = (process.env.ERP_BASE_URL || 'https://erp.samarayachting.com').replace(/\/+$/, '')
const API_KEY = process.env.ERP_BOT_API_KEY

async function erp(path, init = {}) {
  if (!API_KEY) throw new Error('ERP_BOT_API_KEY is not set — put it in mini-services/erp-mcp/.env')
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  if (!res.ok) {
    const retry = res.headers.get('retry-after')
    const msg = typeof body === 'object' && body?.error ? body.error : String(body).slice(0, 300)
    throw new Error(`ERP ${res.status}: ${msg}${retry ? ` (retry after ${retry}s)` : ''}`)
  }
  return body
}

const ok = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = e => ({ isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] })

function listQuery({ limit, cursor, from, to, filters }) {
  const sp = new URLSearchParams()
  if (limit) sp.set('limit', String(limit))
  if (cursor) sp.set('cursor', cursor)
  if (from) sp.set('from', from)
  if (to) sp.set('to', to)
  for (const [k, v] of Object.entries(filters || {})) sp.set(k, v === null ? 'null' : String(v))
  const q = sp.toString()
  return q ? `?${q}` : ''
}

const resourceName = z.string().regex(/^[a-z0-9-]+$/).describe('Resource name from erp_catalog, e.g. "bookings"')
const filterArgs = {
  from: z.string().optional().describe('YYYY-MM-DD — lower bound on the resource\'s main date column'),
  to: z.string().optional().describe('YYYY-MM-DD — upper bound on the main date column'),
  filters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
    .describe('Exact-match filters, field → value. Only fields listed in erp_catalog are allowed.'),
}

const server = new McpServer({ name: 'samara-erp', version: '1.0.0' })

server.registerTool('erp_catalog', {
  title: 'ERP catalog',
  description: 'List every ERP resource the bot can read, with its description and fields. Call this first to discover resource names and filterable fields.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => {
  try { return ok(await erp('/api/bot')) } catch (e) { return fail(e) }
})

server.registerTool('erp_list', {
  title: 'List ERP records',
  description: 'List records of one ERP resource, newest first, one page at a time. Returns { count, nextCursor, data }; pass nextCursor back as cursor for the next page. Rate limit: 60 requests/min and 10,000 rows/hour.',
  inputSchema: {
    resource: resourceName,
    limit: z.number().int().min(1).max(500).optional().describe('Page size, default 100, max 500'),
    cursor: z.string().optional().describe('nextCursor from the previous page'),
    ...filterArgs,
  },
  annotations: { readOnlyHint: true },
}, async ({ resource, ...rest }) => {
  try { return ok(await erp(`/api/bot/${resource}${listQuery(rest)}`)) } catch (e) { return fail(e) }
})

server.registerTool('erp_list_all', {
  title: 'List all ERP records',
  description: 'Fetch several pages of one resource in one call (follows nextCursor) — use for totals/aggregation over a date range. Stops at max_rows. Counts against the 10,000 rows/hour limit, so narrow with from/to/filters first.',
  inputSchema: {
    resource: resourceName,
    max_rows: z.number().int().min(1).max(5000).optional().describe('Stop after this many rows, default 1000'),
    ...filterArgs,
  },
  annotations: { readOnlyHint: true },
}, async ({ resource, max_rows = 1000, ...rest }) => {
  try {
    const data = []
    let cursor = null
    do {
      const page = await erp(`/api/bot/${resource}${listQuery({ ...rest, cursor, limit: Math.min(500, max_rows - data.length) })}`)
      data.push(...page.data)
      cursor = page.nextCursor
    } while (cursor && data.length < max_rows)
    return ok({ resource, count: data.length, truncated: Boolean(cursor), nextCursor: cursor, data })
  } catch (e) { return fail(e) }
})

server.registerTool('erp_get', {
  title: 'Get ERP record',
  description: 'Get one record of a resource by id.',
  inputSchema: { resource: resourceName, id: z.string().min(1) },
  annotations: { readOnlyHint: true },
}, async ({ resource, id }) => {
  try { return ok(await erp(`/api/bot/${resource}/${encodeURIComponent(id)}`)) } catch (e) { return fail(e) }
})

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
function fileFromPath(p) {
  const contentType = MIME[extname(p).toLowerCase()]
  if (!contentType) throw new Error(`Unsupported file type: ${basename(p)} (PDF/JPEG/PNG/WEBP only)`)
  return { contentType, base64: readFileSync(p).toString('base64') }
}

server.registerTool('erp_create_talent_pool_candidate', {
  title: 'Add Talent Pool candidate',
  description: 'Create a new candidate in HR › Talent Pool. Create only — cannot edit or delete, and cannot read candidates back. Files are local paths (PDF/JPEG/PNG/WEBP, max 5 MB each, 15 MB total, 10 files).',
  inputSchema: {
    fullName: z.string().min(1),
    appliedRole: z.string().optional().describe('Job title, matched case-insensitively against HR roles'),
    phone: z.string().optional(),
    email: z.string().optional(),
    source: z.string().optional().describe('Defaults to "Bot (<bot name>)"'),
    expectedSalary: z.number().nonnegative().optional(),
    location: z.string().optional(),
    readyJoinDate: z.string().optional().describe('YYYY-MM-DD'),
    notes: z.string().optional(),
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    cvPaths: z.array(z.string()).optional().describe('Absolute local paths of CV files'),
    documents: z.array(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      path: z.string().describe('Absolute local path'),
    })).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false },
}, async ({ cvPaths, documents, ...fields }) => {
  try {
    const body = {
      ...fields,
      cv: (cvPaths || []).map(fileFromPath),
      documents: (documents || []).map(d => ({ name: d.name, description: d.description, file: fileFromPath(d.path) })),
    }
    return ok(await erp('/api/bot/talent-pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }))
  } catch (e) { return fail(e) }
})

await server.connect(new StdioServerTransport())
