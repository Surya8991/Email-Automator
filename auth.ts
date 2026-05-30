import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Nodemailer from 'next-auth/providers/nodemailer'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { redirect } from 'next/navigation'
import { db } from './server/db/client'
import { accounts, sessions, users, verificationTokens } from './server/db/schema'
import { adminEmails, env } from './lib/env'

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Pass our plural-named tables explicitly — without this the adapter
  // defines its own SINGULAR-named tables (user/session/account/...) and
  // queries those instead of ours, so every session lookup returns null.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
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

// Redirects to /login when the request is unauthenticated. We use redirect()
// rather than throw because Next.js App Router runs layouts and pages in
// parallel during streaming — a throw in the page would render a 500 even
// though the layout has already issued its own redirect.
export async function requireUser() {
  const session = await auth()
  const id = (session?.user as { id?: string } | undefined)?.id
  if (!session?.user || !id) redirect('/login')
  return session.user as { id: string; email: string; name?: string; image?: string; isAdmin?: boolean }
}

export async function requireAdmin() {
  const u = await requireUser()
  if (!u.isAdmin) redirect('/dashboard')
  return u
}
