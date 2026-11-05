// Cloudflare Worker — public read-only proxy for the R2 bucket, served from our own
// domain (files.samarayachting.com) instead of pub-xxx.r2.dev.
//
// Why: Indonesian ISPs (Biznet confirmed 2026-11-05) hijack DNS for *.r2.dev, so every
// R2 image/file in the ERP showed as broken. The bucket lives in a different Cloudflare
// account than samarayachting.com, so R2's native "Custom Domain" can't be used — this
// Worker runs in the domain's account and reads the bucket over the S3 API (SigV4),
// which isn't blocked and doesn't depend on r2.dev at all.
//
// Deploy: Cloudflare dashboard (account that owns samarayachting.com) → Workers → paste
// this file. Required secrets (Settings → Variables and Secrets):
//   R2_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com
//   R2_BUCKET             media-kit-samara
//   R2_ACCESS_KEY_ID      read-only R2 API token (Object Read, this bucket only)
//   R2_SECRET_ACCESS_KEY
//
// URL shape matches r2PublicUrl(): https://files.samarayachting.com/<percent-encoded key>

const CACHE_SECONDS = 86400

export default {
  async fetch(request, env, ctx) {
    const method = request.method
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 })

    const url = new URL(request.url)
    let key
    try {
      key = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/')
    } catch {
      return new Response('Bad path', { status: 400 })
    }
    // No bucket listing, no path tricks.
    if (!key || key.endsWith('/') || key.split('/').includes('..')) return new Response('Not found', { status: 404 })

    const range = request.headers.get('range')
    const cache = caches.default
    const cacheKey = new Request(url.origin + url.pathname, { method: 'GET' })
    if (!range) {
      const hit = await cache.match(cacheKey)
      if (hit) return method === 'HEAD' ? new Response(null, hit) : hit
    }

    const upstream = await signedFetch(env, method, key, range)
    if (upstream.status === 404 || upstream.status === 403) return new Response('Not found', { status: 404, headers: corsHeaders() })
    if (!upstream.ok && upstream.status !== 206) return new Response('Upstream error', { status: 502, headers: corsHeaders() })

    const headers = new Headers(corsHeaders())
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'content-disposition']) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    headers.set('cache-control', `public, max-age=${CACHE_SECONDS}`)

    const res = new Response(method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers })
    if (method === 'GET' && !range && upstream.status === 200) ctx.waitUntil(cache.put(cacheKey, res.clone()))
    return res
  },
}

function corsHeaders() {
  return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': 'range' }
}

// ---- AWS SigV4 (S3, region "auto") — no npm deps so it pastes straight into the dashboard.

function s3Encode(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

async function signedFetch(env, method, key, range) {
  const endpoint = new URL(env.R2_ENDPOINT)
  const host = endpoint.host
  const path = '/' + [env.R2_BUCKET, ...key.split('/')].map(s3Encode).join('/')

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '') // 20261105T101500Z
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/auto/s3/aws4_request`
  const payloadHash = 'UNSIGNED-PAYLOAD'

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  let k = await hmac(new TextEncoder().encode('AWS4' + env.R2_SECRET_ACCESS_KEY), dateStamp)
  k = await hmac(k, 'auto')
  k = await hmac(k, 's3')
  k = await hmac(k, 'aws4_request')
  const signature = toHex(await hmac(k, stringToSign))

  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${env.R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
  if (range) headers.range = range
  return fetch(`https://${host}${path}`, { method, headers })
}

async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))
}

async function sha256Hex(msg) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))))
}

function toHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}
