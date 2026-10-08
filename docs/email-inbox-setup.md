# Email Inbox (Chat › Email) — Setup Penerimaan Email

Penerimaan email memakai **Resend Inbound** di subdomain `reply.samarayachting.com`.
MX root `samarayachting.com` tetap Zoho — jangan diubah.

Kode sudah siap: webhook di `src/app/api/webhooks/email-inbox/route.ts`, helper di `src/lib/email-inbox.ts`.
Yang perlu dilakukan hanya setup di luar kode.

## 1. Tambah domain penerima di Resend
- Resend → **Domains** → Add Domain → `reply.samarayachting.com` → aktifkan **Receiving**.
- Resend akan memberi 1 MX record (mis. `inbound-smtp.<region>.amazonaws.com`, priority 10).

## 2. Pasang MX di Cloudflare
- Type `MX`, Name `reply`, Content + priority sesuai dari Resend.
- Tunggu status Verified di Resend.
- Cek DNS pakai `https://dns.google/resolve?name=reply.samarayachting.com&type=MX` (`dig` lokal pernah kasih hasil kosong palsu).

## 3. Buat webhook di Resend
- Resend → **Webhooks** → Add:
  - URL: `https://erp.samarayachting.com/api/webhooks/email-inbox?tenant=<slug-tenant>` (mis. `samara`)
  - Event: **email.received**
- Salin **Signing Secret** (`whsec_…`).

## 4. Isi tenant secrets (Super Admin → tenant → Secrets)
| Secret | Isi |
|---|---|
| Resend API Key | API key Resend yang **valid** (key di `.env` lokal pernah "API key is invalid") |
| Email Inbox Webhook Secret | `whsec_…` dari langkah 3 |
| Email Inbox From Address | mis. `Samara Yachting <inquiry@samarayachting.com>` |
| Email Inbox Reply-To Address | mis. `inquiry@reply.samarayachting.com` |

## 5. Forward dari Zoho
Email yang dikirim tamu langsung ke `inquiry@samarayachting.com` hanya masuk Zoho. Supaya ikut masuk ERP:
- `inquiry@samarayachting.com` → forward ke `inquiry@reply.samarayachting.com` → dibagi round-robin (pool **Email** di Chat › Leads Distribution).
- Opsional per sales: `wiwin@samarayachting.com` → `wiwin@reply.samarayachting.com` → otomatis masuk thread milik Wiwin.

Alamat `@reply...` tidak perlu dibuat satu per satu — Resend menerima semua alamat di subdomain itu.

## Alur
- Email masuk ke `*@reply.samarayachting.com` → Resend → webhook → muncul di **Chat › Email**.
- Sales balas dari ERP → Reply-To diarahkan ke `@reply...` → balasan tamu kembali ke thread yang sama.
- Routing thread tanpa owner (yang pertama cocok menang):
  1. Dikirim ke `nama@reply...` → user dengan login `nama@samarayachting.com`
  2. Pengirim sudah jadi Lead yang punya owner → owner Lead tersebut
  3. Selain itu → sales berikutnya di pool Email (round-robin)
- SALES hanya melihat thread miliknya sendiri; ADMIN melihat semua.

## Sebelum deploy
- Jalankan `npx prisma db push` (Leads Distribution, channel EMAIL) di **samara_db dan siloina_db** sebelum deploy.
  Kalau deploy duluan sebelum push, query inbox akan error (pernah terjadi: chat WA "hilang").
  Jangan pakai `prisma migrate` — repo ini tidak punya folder migrations.

## Tes
1. Kirim email dari Gmail pribadi ke `inquiry@reply.samarayachting.com`.
2. Resend → Webhooks → cek delivery-nya status 200.
3. Pastikan email muncul di Chat › Email.
