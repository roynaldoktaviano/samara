import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Cloudflare R2 — S3-compatible object storage, replacing Vercel Blob (cheaper
// storage, zero egress fees). One shared client/bucket for every upload feature
// in the app (media kit, WhatsApp chat, campaign images).
const BUCKET = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

function client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export function isR2Configured(): boolean {
  return !!(process.env.R2_S3_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && BUCKET && PUBLIC_URL)
}

/**
 * Public, directly-viewable URL for an object key — bucket must have Public Access enabled.
 * Keys are built from raw filenames (spaces, &, #, %, non-ASCII, etc. all pass through
 * unchanged into the S3 key, which S3 itself tolerates fine) so each path segment must be
 * percent-encoded here or the resulting URL is malformed — browsers then fail to load it
 * (this was the cause of some, but not all, media-kit photos showing a broken-image icon:
 * only filenames with spaces/special characters were affected).
 */
export function r2PublicUrl(key: string): string {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${PUBLIC_URL}/${encoded}`
}

/** Server-side upload — for files the server itself fetches/generates (e.g. re-hosting WhatsApp media). */
export async function putToR2(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<string> {
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
  return r2PublicUrl(key)
}

export async function deleteFromR2(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {})
}

/** Reverses r2PublicUrl — needed to delete an object given only the URL stored in the DB. */
export function keyFromR2Url(url: string): string | null {
  if (!PUBLIC_URL || !url.startsWith(`${PUBLIC_URL}/`)) return null
  const encoded = url.slice(PUBLIC_URL.length + 1)
  return encoded.split('/').map(decodeURIComponent).join('/')
}

/**
 * A presigned PUT URL the browser can upload straight to — same reasoning as Vercel
 * Blob's client-token flow: this bypasses the server entirely for the actual bytes,
 * so a large file never has to pass through (and get capped by) our own serverless
 * function's body-size limit.
 *
 * Requires CORS to be configured on the R2 bucket (PutBucketCors, allowing PUT from
 * this app's origin) — without it every one of these uploads fails client-side with
 * a generic "Load failed"/network error, since the browser blocks the cross-origin
 * PUT before it ever reaches R2.
 */
export async function presignUpload(key: string, contentType: string, expiresInSeconds = 300): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType })
  return getSignedUrl(client(), command, { expiresIn: expiresInSeconds })
}
