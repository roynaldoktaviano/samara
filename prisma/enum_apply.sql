-- Idempotent: skips tables that are already converted
-- Run via: npx prisma db execute --file ./prisma/enum_apply.sql --schema ./prisma/schema.prisma

SET statement_timeout = 0;

DO $$
BEGIN

  -- Booking
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Booking' AND column_name='status') <> 'BookingStatus' THEN
    ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus" USING "status"::"BookingStatus";
    ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'pending'::"BookingStatus";
    RAISE NOTICE 'Booking.status converted';
  ELSE
    RAISE NOTICE 'Booking.status already BookingStatus, skipped';
  END IF;

  -- Payment
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Payment' AND column_name='status') <> 'PaymentStatus' THEN
    ALTER TABLE "Payment" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Payment" ALTER COLUMN "status" TYPE "PaymentStatus" USING "status"::"PaymentStatus";
    ALTER TABLE "Payment" ALTER COLUMN "status" SET DEFAULT 'pending_confirmation'::"PaymentStatus";
    RAISE NOTICE 'Payment.status converted';
  ELSE
    RAISE NOTICE 'Payment.status already PaymentStatus, skipped';
  END IF;

  -- OpenTrip
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='OpenTrip' AND column_name='status') <> 'OpenTripStatus' THEN
    ALTER TABLE "OpenTrip" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "OpenTrip" ALTER COLUMN "status" TYPE "OpenTripStatus" USING "status"::"OpenTripStatus";
    ALTER TABLE "OpenTrip" ALTER COLUMN "status" SET DEFAULT 'open'::"OpenTripStatus";
    RAISE NOTICE 'OpenTrip.status converted';
  ELSE
    RAISE NOTICE 'OpenTrip.status already OpenTripStatus, skipped';
  END IF;

  -- Maintenance (fix legacy 'in-progress' first)
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Maintenance' AND column_name='status') <> 'MaintenanceStatus' THEN
    UPDATE "Maintenance" SET "status" = 'in_progress' WHERE "status" = 'in-progress';
    ALTER TABLE "Maintenance" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Maintenance" ALTER COLUMN "status" TYPE "MaintenanceStatus" USING "status"::"MaintenanceStatus";
    ALTER TABLE "Maintenance" ALTER COLUMN "status" SET DEFAULT 'scheduled'::"MaintenanceStatus";
    RAISE NOTICE 'Maintenance.status converted';
  ELSE
    RAISE NOTICE 'Maintenance.status already MaintenanceStatus, skipped';
  END IF;

  -- Yacht
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Yacht' AND column_name='status') <> 'YachtStatus' THEN
    ALTER TABLE "Yacht" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Yacht" ALTER COLUMN "status" TYPE "YachtStatus" USING "status"::"YachtStatus";
    ALTER TABLE "Yacht" ALTER COLUMN "status" SET DEFAULT 'available'::"YachtStatus";
    RAISE NOTICE 'Yacht.status converted';
  ELSE
    RAISE NOTICE 'Yacht.status already YachtStatus, skipped';
  END IF;

  -- Voucher
  IF (SELECT udt_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='Voucher' AND column_name='type') <> 'VoucherType' THEN
    ALTER TABLE "Voucher" ALTER COLUMN "type" TYPE "VoucherType" USING "type"::"VoucherType";
    RAISE NOTICE 'Voucher.type converted';
  ELSE
    RAISE NOTICE 'Voucher.type already VoucherType, skipped';
  END IF;

END $$;
