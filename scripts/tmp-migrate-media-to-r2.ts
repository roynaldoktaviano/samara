import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { del } from '@vercel/blob'
import sharp from 'sharp'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_S3_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})
const BUCKET = process.env.R2_BUCKET_NAME!
const PUBLIC_URL = process.env.R2_PUBLIC_URL!.replace(/\/$/, '')

async function migrateTenant(label: string, databaseUrl: string, directUrl?: string) {
  process.env.DATABASE_URL = databaseUrl
  if (directUrl) process.env.DIRECT_URL = directUrl
  const db = new PrismaClient()

  const files = await db.mediaFile.findMany({ where: { sizeBytes: { not: null } } })
  const toMigrate = files.filter(f => !f.url.startsWith(PUBLIC_URL))
  console.log(`[${label}] ${toMigrate.length} files to migrate (of ${files.length} total)`)

  let migrated = 0, failed = 0, beforeBytes = 0, afterBytes = 0

  for (const file of toMigrate) {
    try {
      const res = await fetch(file.url)
      if (!res.ok) throw new Error(`Download failed: ${res.status}`)
      const original = Buffer.from(await res.arrayBuffer())

      let output: Buffer = original
      let contentType = file.mimeType ?? 'application/octet-stream'

      if (file.type === 'image' && file.mimeType?.startsWith('image/')) {
        const img = sharp(original).rotate().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true })
        if (file.mimeType === 'image/png') {
          output = await img.png({ quality: 85, compressionLevel: 9 }).toBuffer()
        } else if (file.mimeType === 'image/webp') {
          output = await img.webp({ quality: 85 }).toBuffer()
        } else {
          output = await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
          contentType = 'image/jpeg'
        }
      }

      const key = new URL(file.url).pathname.slice(1)
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: output, ContentType: contentType }))
      const newUrl = `${PUBLIC_URL}/${key}`

      await db.mediaFile.update({ where: { id: file.id }, data: { url: newUrl, sizeBytes: output.length, mimeType: contentType } })
      await del(file.url).catch(e => console.error(`  [warn] couldn't delete old blob for ${file.name}:`, e instanceof Error ? e.message : e))

      beforeBytes += original.length
      afterBytes += output.length
      migrated++
      console.log(`  OK ${file.name}  ${(original.length / 1024 / 1024).toFixed(1)}MB -> ${(output.length / 1024 / 1024).toFixed(1)}MB`)
    } catch (e) {
      failed++
      console.error(`  FAIL ${file.name}:`, e instanceof Error ? e.message : e)
    }
  }

  console.log(`[${label}] done: ${migrated} migrated, ${failed} failed, ${(beforeBytes / 1024 / 1024).toFixed(0)}MB -> ${(afterBytes / 1024 / 1024).toFixed(0)}MB`)
  await db.$disconnect()
}

async function main() {
  await migrateTenant('Samara', process.env.DATABASE_URL!, process.env.DIRECT_URL)
  await migrateTenant(
    'Siloina',
    'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0-pooler.c-2.ap-southeast-1.aws.neon.tech/siloina?sslmode=require&channel_binding=require',
    'postgresql://neondb_owner:npg_ftKp2Abn9gEO@ep-raspy-bird-aor9pld0.c-2.ap-southeast-1.aws.neon.tech/siloina?sslmode=require'
  )
}

main().catch(e => { console.error(e); process.exit(1) })
