import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { env } from '@/lib/env'

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')
  const googleOk = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  const emailOk = Boolean(env.SMTP_USER && env.SMTP_PASS)

  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-br from-background to-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your Email Automator workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailOk ? (
            <form action={async (fd) => { 'use server'; await signIn('nodemailer', { email: String(fd.get('email') ?? '') }) }} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@example.com" required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full">Send magic link</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Configure SMTP to enable magic-link login.</p>
          )}

          {googleOk ? (
            <>
              <div className="relative my-2 text-center text-xs text-muted-foreground">
                <span className="bg-card px-2 relative z-10">or</span>
                <div className="absolute inset-x-0 top-1/2 -z-0 h-px bg-border" />
              </div>
              <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/dashboard' }) }}>
                <Button type="submit" variant="outline" className="w-full">Continue with Google</Button>
              </form>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
