# Flow lead masuk sampai file Google Ads Data Manager (kondisi saat ini)

Per 20 Nov 2026, sebelum go-live ERP. Versi bergambar: [Samara-Flow-Lead-ke-Google-Data-Manager.pdf](Samara-Flow-Lead-ke-Google-Data-Manager.pdf).

Sumber:
- `Deal-Maker.txt` di root repo = WordPress snippet 92 v7.2-store-all (kode deal maker).
- IT handover 17 Nov: detail script box, diambil dari dokumen, bukan dari kode.
- Parity Checklist 19 Nov.

```
Visitor klik iklan ──► website samaraliveaboard.com
                          │  snippet 62: gclid/UTM/consent ke hidden input
                          │  snippet 63: log tap tombol WA (ref SL-XXXXX)
          ┌───────────────┴────────────────┐
     isi FORM (CF7)                  klik tombol WA → chat
          │                                │
   snippet 92 (in-process)          Freshchat ◄── poller 5 menit (snippet 92)
          └──────────► DEAL MAKER (gb_dm_run) ◄──────┘
                          │
                Freshsales: contact + deal (New Enquiry)
                          │
                Sales memindahkan stage (AC → Invoice → Booking → Won)
                          │
                SCRIPT BOX (runner harian)
                ├─ 05:45 Booking feed ──► Google Sheet Booking
                └─ 06:15 Stage feed   ──► Google Sheet Stage (AC/INV, PC/OT)
                          │
                Data Manager import (±06:53 / 06:57 / 17:20)
                          │
                Conversion action Google Ads (secondary)
```

## 1. Website (capture)
- **Snippet 62** menyalin click ID (gclid, gbraid, wbraid, fbclid, msclkid), UTM first-touch (`ft_*`) dan last-touch, landing URL, referrer, dan consent dari banner Complianz ke hidden input setiap form.
  - Nilai consent: `ad_consent` = granted / denied / not_required / unknown, plus `consent_region`.
- **Snippet 68** merapikan telepon ke E.164 (`00` → `+`, kode negara tidak pernah ditebak).
- **Snippet 63** mencatat setiap tap tombol WA ke tabel `gb_wa_taps`, dengan ref `SL-XXXXX` yang juga masuk ke pesan pre-fill.
- **GTM** tag 100 di halaman thank-you menembak konversi browser. Ini **primary**, sinyal bidding utama, dan terpisah dari file Data Manager.
- **Store-all (Marc, 15 Nov):** IP, UA, session, dan semua click ID disimpan untuk semua lead; consent hanya menentukan boleh di-upload atau tidak. Pengecualian: `_fbc`/`_fbp` tidak dibaca kalau consent denied dan region EU/UK/CH atau kosong.

## 2a. Jalur form
1. Submit CF7 (form 22879, 52668, 53463, 84303) memicu hook `wpcf7_mail_sent`.
2. `gb_fs_form_queue` menyusun:
   - **contact**: ±35 field `cf_*`; field kosong tidak dikirim, jadi nilai lama tidak tertimpa;
   - **enquiry** (`$enq`): trip, tanggal, pax, click ID, fbc/fbp, UA, session attributes. `cf_click_id_match = Confident` kalau ada click ID.
3. Setelah halaman selesai (`fastcgi_finish_request`): cek email → upsert contact → tambah 1 note → deal maker.
4. Plugin samara-erp-tracking juga mengirim form mentah ke ERP (belum dipakai untuk upload).

## 2b. Jalur WhatsApp
1. Guest chat ke nomor WA bersama dan masuk ke Freshchat.
2. Poller jalan setiap 5 menit dan mengambil pesan pertama tiap sesi (6 jam tanpa pesan guest sebelumnya).
3. Contact dicari dengan E.164 persis: mobile, lalu nomor WA, lalu work phone. Lebih dari 1 hasil = berhenti.
4. Match confidence:
   - ref **SL-** ditemukan → **Confident**;
   - ref OT-/MV- → skip (brand lain);
   - tanpa ref, tepat 1 tap dalam 30 menit → **Medium**;
   - tanpa ref, 2 tap atau lebih → **Low** (tap terbaru + task cek manual, tidak di-upload);
   - 0 tap → tidak ada deal.
5. Untuk Confident/Medium: consent tap ditulis ke contact (kalau kosong; denied selalu menang) dan data tap disalin ke deal.

Sumber lain: webhook Freshsales (mode log) dan workflow lama 113000001696 (masih membuat deal Otium, Mischief, dan Meta Lead Ads).

## 3. Deal maker (`gb_dm_run`)
1. Kunci per contact. Contact baru ditunggu 3 detik supaya assignment rule sempat mengisi owner.
2. Ambil contact + deal-nya. Abaikan pipeline Old dan Agent Outreach, serta deal Won/Lost. Tentukan tipe PC / OT / ?.
3. Keputusan:
   - deal tipe sama dibuat < 15 menit lalu → dianggap submit yang sama, isi field kosong saja;
   - ada deal open tipe sama → note "RETURNING GUEST" + task 4 jam untuk owner deal itu;
   - selain itu → **deal baru** di New Enquiry:
     - owner = owner contact; kalau kosong → round-robin Efrinda, Laika, Wiwin, Wulan (contact ikut diberi owner yang sama);
     - semua data ditulis ke deal: tanggal, pax, product interest, **click ID, UTM, landing URL, UA, session attributes, fbc/fbp, `cf_click_id_match`**.
4. Owner nonaktif → round-robin. Low → task "check by hand". Gagal → dicoba lagi setelah 2 menit / 10 menit / 1 jam, lalu note "create it by hand".

## 4. Stage → upload
| Stage | Row | Action ID | Nilai |
|---|---|---|---|
| In Active Communication (atau lebih jauh) | AC_PC / AC_OT | 7893494089 / 7893494092 | IDR 18.167.000 / 5.087.000 |
| Send Booking Confirmation (atau lebih jauh, termasuk Deposit Received) | Booking | 7883614721 | nilai booking |
| Send Invoice 1 | INV_PC / INV_OT | 7894047821 / 7894047824 | deal amount |
| Won (lunas) | tidak ada row baru | — | — |
| Lost | tidak pernah di-upload | — | — |

Timestamp perpindahan stage menjadi Conversion Time. Trip type (PC/OT) wajib supaya row bisa dipetakan ke action.

## 5. Script box
- **05:45** `run_nightly_consent.sh` → `fill_sheet_consent.py` (+ `wa_match.py`) → Sheet Booking → Data Manager import ±06:53.
- **06:15** `run_daily_stage.sh` → Sheet Stage → import AC_PC ±06:57, AC_OT ±17:20.
- **Isi row:**
  - GCLID / GBRAID / WBRAID;
  - email (lowercase → SHA-256);
  - telepon (WA dulu, E.164 → SHA-256);
  - Conversion Time (+08:00), value, currency;
  - **Order ID = deal ID Freshsales**;
  - Ad User Data / Ad Personalization;
  - IP dimatikan.
- **Row tidak ditulis kalau:** (1) consent denied; (2) deal ada di `never_upload.json` (113001507993, 113001505078); (3) tamu EU/EEA/UK/CH tanpa grant dari banner; (4) match Low; (5) tidak ada identifier sama sekali.
- Non-EEA dengan consent unknown/not_required tetap dikirim, dengan kolom consent kosong.
- Row yang sudah disiapkan dikirim ulang persis sama sampai 90 hari. Perubahan nilai masuk `value_change_pending_policy`.

## 6. Google dan Meta
- Data Manager membaca Sheet dan memasukkan row ke conversion action secondary (Google Ads 873-186-9919).
- Meta saat ini hanya menerima Lead dari browser (pixel 692165228229735). Feed CRM ke Meta belum pernah live.

## Setelah go-live ERP
| Sekarang | ERP |
|---|---|
| Snippet 92 | webhook CF7 + `src/lib/deal-maker.ts` |
| Poller Freshchat + `gb_wa_taps` | chat WA di ERP + `src/lib/wa-tap.ts` |
| Stage di Freshsales | Deal + `DealStageChange` |
| Script box (2 runner, 2 Sheet) | `src/lib/ad-offline-feed.ts` (1 Sheet tiap 3 jam, tab per brand) |
| `never_upload.json`, `value_change_pending_policy` | `Deal.neverUpload`, `AdUploadLedger` + `AdUploadChange` |

Hari switch:
1. Snippet 92 mode off (`fsdirect`), runner box dan workflow 113000001696 dimatikan.
2. Data Manager diarahkan ke Sheet ERP.
3. Freshsales read-only 30 hari.
