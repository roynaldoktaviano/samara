import { PrismaClient } from '@prisma/central-client'

const globalForPrisma = globalThis as unknown as {
  centralPrisma: PrismaClient | undefined
}

function makeCentralPrisma() {
  const url = process.env.CENTRAL_DATABASE_URL
  if (!url) throw new Error('CENTRAL_DATABASE_URL is not set')
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const centralDb = globalForPrisma.centralPrisma ?? makeCentralPrisma()

if (process.env.NODE_ENV !== 'production') globalForPrisma.centralPrisma = centralDb
