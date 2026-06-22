import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.type === 'credentials' && user?.id) {
        const u = user as { id: string; name?: string | null; email?: string | null; role?: string }
        logActivity({
          userId:   u.id,
          userName: u.name || u.email || 'Unknown',
          userRole: u.role || 'UNKNOWN',
          action:   'LOGIN',
          detail:   'Login successful',
        }).catch(() => {})
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: string }).role
        return token
      }
      if (token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { name: true, email: true, role: true },
        })
        if (dbUser) {
          token.name  = dbUser.name
          token.email = dbUser.email
          token.role  = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge:    8 * 60 * 60,  // 8 jam — expired setelah 8 jam tidak aktif
    updateAge: 60 * 60,      // perpanjang token tiap 1 jam jika masih aktif
  },
}
