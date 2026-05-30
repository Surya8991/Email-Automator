import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Nodemailer from 'next-auth/providers/nodemailer'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from './server/db/client'
import { adminEmails, env } from './lib/env'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database', maxAge: 60 * 60 * 24 * 7 },
  trustHost: true,
  providers: [
    ...(env.SMTP_USER && env.SMTP_PASS
      ? [
          Nodemailer({
            server: {
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
            },
            from: env.EMAIL_FROM ?? env.SMTP_USER,
          }),
        ]
      : []),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope:
                  'openid email profile https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
                access_type: 'offline',
                prompt: 'consent',
              },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        ;(session.user as { id?: string }).id = user.id
        ;(session.user as { isAdmin?: boolean }).isAdmin =
          adminEmails.includes((user.email ?? '').toLowerCase())
      }
      return session
    },
  },
  pages: { signIn: '/login' },
})

/** Throws if the request is unauthenticated. Use in every Server Action. */
export async function requireUser() {
  const session = await auth()
  if (!session?.user || !(session.user as { id?: string }).id) {
    throw new Error('Unauthorized')
  }
  return session.user as { id: string; email: string; name?: string; image?: string; isAdmin?: boolean }
}

export async function requireAdmin() {
  const u = await requireUser()
  if (!u.isAdmin) throw new Error('Forbidden')
  return u
}
