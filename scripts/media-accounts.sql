-- Agent Portal: press/media accounts (MediaAccount + MediaAccountVisibleCategory).
-- Run on EACH tenant DB (Samara + Siloina). Additive only — no existing tables change.
CREATE TABLE IF NOT EXISTS "MediaAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organization" TEXT,
    "note" TEXT,
    "portalPasswordHash" TEXT,
    "portalPasswordSetAt" TIMESTAMP(3),
    "portalPasswordSetById" TEXT,
    "portalActive" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MediaAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAccount_email_key" ON "MediaAccount"("email");

CREATE TABLE IF NOT EXISTS "MediaAccountVisibleCategory" (
    "id" TEXT NOT NULL,
    "mediaAccountId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAccountVisibleCategory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaAccountVisibleCategory_mediaAccountId_fkey" FOREIGN KEY ("mediaAccountId") REFERENCES "MediaAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAccountVisibleCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MediaCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MediaAccountVisibleCategory_mediaAccountId_categoryId_key" ON "MediaAccountVisibleCategory"("mediaAccountId", "categoryId");
