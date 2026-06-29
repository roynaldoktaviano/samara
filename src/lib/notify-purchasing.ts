import { getDb } from '@/lib/get-db'
import { Session } from 'next-auth'

type Db = Awaited<ReturnType<typeof getDb>>

export async function notifyByRole(
  db: Db,
  roles: string[],
  type: string,
  title: string,
  body: string,
  orderId: string,
) {
  const users = await db.user.findMany({
    where: { role: { in: roles as never[] } },
    select: { id: true },
  })
  if (!users.length) return

  await db.notification.createMany({
    data: users.map((u) => ({
      id: crypto.randomUUID(),
      userId: u.id,
      type,
      title,
      body,
      orderId,
    })),
    skipDuplicates: true,
  })
}
