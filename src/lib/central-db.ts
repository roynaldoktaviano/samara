import { PrismaClient } from '@prisma/central-client'

const globalForPrisma = globalThis as unknown as {
  centralPrisma: PrismaClient | undefined
}

export const centralDb =
  globalForPrisma.centralPrisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.centralPrisma = centralDb
