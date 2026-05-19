-- ============================================================
-- Jalankan SATU BLOK per kali di Supabase SQL Editor
-- Tunggu sampai berhasil sebelum lanjut ke blok berikutnya
-- ============================================================


-- ── BLOK 1: Create all enum types ────────────────────────────
CREATE TYPE "BookingStatus"     AS ENUM ('pending', 'partially_paid', 'fully_paid', 'completed', 'cancelled', 'confirmed');
CREATE TYPE "PaymentStatus"     AS ENUM ('pending_confirmation', 'confirmed', 'rejected');
CREATE TYPE "OpenTripStatus"    AS ENUM ('open', 'closed', 'full', 'completed', 'cancelled');
CREATE TYPE "MaintenanceStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE "YachtStatus"       AS ENUM ('available', 'booked', 'maintenance');
CREATE TYPE "VoucherType"       AS ENUM ('PERCENTAGE', 'FIXED');


-- ── BLOK 2: Booking ──────────────────────────────────────────
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus" USING "status"::"BookingStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'pending'::"BookingStatus";


-- ── BLOK 3: Payment ──────────────────────────────────────────
ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'pending_confirmation'::"PaymentStatus";


-- ── BLOK 4: OpenTrip ─────────────────────────────────────────
ALTER TABLE "OpenTrip" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OpenTrip" ALTER COLUMN "status" TYPE "OpenTripStatus" USING "status"::"OpenTripStatus";
ALTER TABLE "OpenTrip" ALTER COLUMN "status" SET DEFAULT 'open'::"OpenTripStatus";


-- ── BLOK 5: Maintenance ──────────────────────────────────────
-- Fix legacy value 'in-progress' → 'in_progress' before type change
UPDATE "Maintenance" SET "status" = 'in_progress' WHERE "status" = 'in-progress';
ALTER TABLE "Maintenance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Maintenance" ALTER COLUMN "status" TYPE "MaintenanceStatus" USING "status"::"MaintenanceStatus";
ALTER TABLE "Maintenance" ALTER COLUMN "status" SET DEFAULT 'scheduled'::"MaintenanceStatus";


-- ── BLOK 6: Yacht ────────────────────────────────────────────
ALTER TABLE "Yacht" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Yacht" ALTER COLUMN "status" TYPE "YachtStatus" USING "status"::"YachtStatus";
ALTER TABLE "Yacht" ALTER COLUMN "status" SET DEFAULT 'available'::"YachtStatus";


-- ── BLOK 7: Voucher ──────────────────────────────────────────
ALTER TABLE "Voucher" ALTER COLUMN "type" TYPE "VoucherType" USING "type"::"VoucherType";
