// Change the Super Admin password in the CENTRAL database.
// Usage: npx tsx --env-file=.env scripts/set-superadmin-password.ts [email]
// The password is typed at a hidden prompt — never passed on the command line.
import { PrismaClient } from '@prisma/central-client'
import bcrypt from 'bcryptjs'

const email = process.argv[2] ?? 'superadmin@samarayachting.com'

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) return reject(new Error('Run this in an interactive terminal'))
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let input = ''
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData)
          process.stdout.write('\n'); return resolve(input)
        }
        if (c === '\u0003') { process.stdout.write('\n'); process.exit(1) } // Ctrl+C
        if (c === '\u007f' || c === '\b') { input = input.slice(0, -1); continue }
        input += c
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  if (!process.env.CENTRAL_DATABASE_URL) throw new Error('CENTRAL_DATABASE_URL not set (use --env-file=.env)')
  const db = new PrismaClient()
  try {
    const user = await db.centralUser.findUnique({ where: { email } })
    if (!user) throw new Error(`No central user ${email}`)
    if (!user.isSuperAdmin) throw new Error(`${email} is not a super admin`)

    const pw = await askHidden(`New password for ${email}: `)
    if (pw.length < 14) throw new Error('Use at least 14 characters')
    const again = await askHidden('Repeat new password: ')
    if (pw !== again) throw new Error('Passwords do not match')

    await db.centralUser.update({ where: { email }, data: { password: await bcrypt.hash(pw, 12) } })
    console.log(`✅ Password updated for ${email}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
